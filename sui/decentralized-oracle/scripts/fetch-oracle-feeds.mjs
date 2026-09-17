// Generate src/mainnet/generated/oracle-feeds.ts — the object id of every
// PriceFeed entry in OracleConfig.feeds.
//
// Why this exists: `minimum_effective_price` / `maximum_effective_price` decide
// whether a price update is accepted at all. A price outside them is rejected,
// the feed stops advancing, and every lending operation that reads it fails. NS
// met that on 2026-09-16 and was unusable for fourteen hours; nothing could see
// it coming, because the configured range is not in the warehouse. The only
// event that carries it, InvalidOraclePrice, fires once the price is ALREADY
// outside — an outage report, not a warning.
//
// So the feeds are snapshotted on a timer, the same shape sui/navi already uses
// for every lending reserve. That needs each PriceFeed's object id, which is
// what this writes.
//
// The generated file is committed. Regenerate with `yarn config:gen` whenever a
// feed is added to the oracle, and review the diff — that diff IS the change log.
//
// Nothing here depends on a deprecated surface. Sui removed JSON-RPC from its
// public fullnodes on 2026-08-03, so `suix_getDynamicFields` is not available to
// enumerate the table. It is not needed: a dynamic field's object id is a pure
// function of (parent, key type, key bytes), so the ids are DERIVED offline and
// the only thing fetched is the OracleConfig object itself, over gRPC
// LedgerService/GetObject. Same reasoning as sui/navi/scripts/fetch-navi-config.mjs.

import fs from "node:fs";
import path from "node:path";

const SUI_GRPC = process.env.SUI_GRPC ?? "https://fullnode.mainnet.sui.io";
const ORACLE_CONFIG =
  process.env.ORACLE_CONFIG ??
  "0x1afe1cb83634f581606cc73c4487ddd8cc39a944b951283af23f7d69d5589478";
const OUT = path.resolve("src", "mainnet", "generated", "oracle-feeds.ts");

let grpcClient;
async function suiGrpc() {
  if (!grpcClient) {
    const { SuiGrpcClient, GrpcWebFetchTransport } = await import("mysten-sui-grpc/grpc");
    grpcClient = new SuiGrpcClient({
      network: "mainnet",
      transport: new GrpcWebFetchTransport({ baseUrl: SUI_GRPC, format: "binary" }),
    });
  }
  return grpcClient;
}

function unwrapValue(v) {
  const kind = v?.kind;
  if (!kind) return undefined;
  switch (kind.oneofKind) {
    case "structValue": {
      const out = {};
      for (const [k, x] of Object.entries(kind.structValue.fields)) out[k] = unwrapValue(x);
      return out;
    }
    case "listValue":
      return kind.listValue.values.map(unwrapValue);
    case "stringValue":
      return kind.stringValue;
    case "numberValue":
      return kind.numberValue;
    case "boolValue":
      return kind.boolValue;
    case "nullValue":
      return null;
    default:
      return undefined;
  }
}

async function getObjectJson(objectId) {
  const client = await suiGrpc();
  const { response } = await client.ledgerService.getObject({
    objectId,
    readMask: { paths: ["object_id", "object_type", "json"] },
  });
  if (!response?.object) throw new Error(`object ${objectId} not found`);
  return unwrapValue(response.object.json);
}

function normalizeAddress(address) {
  const body = String(address).trim().replace(/^0x/, "").toLowerCase();
  return `0x${body.padStart(64, "0")}`;
}

async function main() {
  const cfg = await getObjectJson(ORACLE_CONFIG);

  const table = cfg?.feeds?.id;
  if (!table) throw new Error(`OracleConfig ${ORACLE_CONFIG} has no feeds table`);

  const addresses = cfg?.vec_feeds;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("OracleConfig has no vec_feeds; cannot enumerate the table");
  }

  // `feeds.size` is the table's own count. If it disagrees with vec_feeds, one
  // of the two was updated without the other and the roster here would be
  // silently incomplete — which is precisely the failure this snapshot exists to
  // prevent, so it is an error rather than a warning.
  const size = Number(cfg?.feeds?.size);
  if (Number.isFinite(size) && size !== addresses.length) {
    throw new Error(
      `OracleConfig.feeds holds ${size} entries but vec_feeds lists ${addresses.length}. ` +
        `One of them is stale; do not generate from this state.`,
    );
  }

  if (cfg?.paused === true) console.warn("WARNING: OracleConfig reports paused: true");

  const { deriveDynamicFieldID } = await import("mysten-sui-grpc/utils");
  const { bcs } = await import("mysten-sui-grpc/bcs");

  const feeds = addresses.map((raw) => {
    const feedAddress = normalizeAddress(raw);
    return {
      feedAddress,
      fieldId: deriveDynamicFieldID(table, "address", bcs.Address.serialize(feedAddress).toBytes()),
    };
  });

  const seen = new Set();
  for (const f of feeds) {
    if (seen.has(f.fieldId)) throw new Error(`derived a duplicate field id for ${f.feedAddress}`);
    seen.add(f.fieldId);
  }

  // `--check` compares the committed roster to chain and fails on any
  // difference. A feed added to the oracle without regenerating is not a
  // cosmetic staleness: that feed gets no snapshot rows at all, and a feed
  // nobody is watching is the exact failure this table was built to prevent.
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    const missing = feeds.filter((f) => !current.includes(f.fieldId));
    const extra = [...current.matchAll(/fieldId: "(0x[0-9a-f]+)"/g)]
      .map((m) => m[1])
      .filter((id) => !seen.has(id));
    if (!current) {
      console.error(`${OUT} does not exist — run \`yarn config:gen\``);
      process.exit(1);
    }
    if (missing.length || extra.length) {
      console.error(`DRIFT: the committed feed roster does not match chain.`);
      for (const f of missing) console.error(`  · on chain but not generated: ${f.feedAddress}`);
      for (const id of extra) console.error(`  · generated but not on chain: ${id}`);
      console.error(`\nRun \`yarn config:gen\` and review the diff.`);
      process.exit(1);
    }
    console.log(`feed roster matches chain — ${feeds.length} feeds`);
    return;
  }

  const body = `// GENERATED by scripts/fetch-oracle-feeds.mjs — do not edit by hand.
//
// One entry per PriceFeed in OracleConfig.feeds. \`fieldId\` is the dynamic
// field's object id, derived offline from (table, "address", feed address), and
// is what SuiObjectProcessor binds to in ../feed-config.ts.
//
// Regenerate with \`yarn config:gen\` when a feed is added, and review the diff.

/** OracleConfig object these were read from. */
export const ORACLE_CONFIG = "${ORACLE_CONFIG}";

/** The \`feeds: Table<address, PriceFeed>\` inside it. */
export const FEEDS_TABLE = "${table}";

export interface OracleFeedEntry {
  /** The address used as the table key, and what every oracle event carries. */
  feedAddress: string;
  /** The dynamic field object holding the PriceFeed. */
  fieldId: string;
}

export const ORACLE_FEEDS: OracleFeedEntry[] = [
${feeds.map((f) => `  { feedAddress: "${f.feedAddress}", fieldId: "${f.fieldId}" },`).join("\n")}
];
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`wrote ${OUT} — ${feeds.length} feeds`);
}

await main();
