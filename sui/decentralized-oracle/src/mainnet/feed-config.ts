import { SuiObjectProcessor } from "@sentio/sdk/sui";
import { ChainId } from "@sentio/chain";
import { ORACLE_FEEDS } from "./generated/oracle-feeds.js";

// A periodic snapshot of every PriceFeed's configuration.
//
// Why this exists. `minimum_effective_price` / `maximum_effective_price` decide
// whether a price update is accepted at all: a price outside them is rejected by
// the contract, the feed stops advancing, and every operation that reads it
// fails. NS met its $0.01 floor on 2026-09-16 and was unusable for fourteen
// hours.
//
// Nothing could warn about it, because the configured range was not in the
// warehouse at any point before the failure. The only event carrying it is
// `InvalidOraclePrice`, which fires once a price is ALREADY outside the range —
// an outage report, not a warning. `priceUpdated` carries no configuration at
// all. So the alert that watches for this had to keep its own harvested copy of
// the bounds in another repository, which goes stale exactly when it matters:
// the response to an outage like NS's is to change one of these very numbers.
//
// With these rows the check is a plain join of live price to live bound.
//
// The shape is deliberately the one sui/navi already uses for lending reserves —
// SuiObjectProcessor bound per object, `self` being that object at the snapshot
// point, so backfilled rows carry the configuration as it was rather than as it
// is now. That is the property a client-side read inside the handler would lose.
//
// Values are emitted RAW, exactly as stored on chain, with no decimal scaling.
// Each feed has its own `priceDecimal` which is not in this object, so scaling
// here would mean carrying a second table that can disagree with the first; a
// consumer comparing a price to a bound is taking a ratio anyway, where the
// scale cancels. Note the field is spelled `minimum_effective_price` here — the
// `minmum_effective_price` column on `invalidOraclePrice` preserves a typo in
// the event, and this is not that event.
//
// Numbers go out as BIGINT, not as strings, and that is not a style choice.
// **A Sentio project's event schema is shared across event types by field
// name.** `price`, `maximum_effective_price`, `updated_time`,
// `price_diff_threshold1` / `2` and `historical_price_ttl` already exist on the
// three event handlers in main.ts, which pass `event.data_decoded.*` straight
// through as bigints and therefore typed those columns `decimal`. A first
// version of this file emitted them as strings, which is what a raw value looks
// like when you are worrying about precision — and the processor refused the
// whole upload at runtime:
//
//     the emitted event data is not compatible with the schema
//     (reason: schema field [price] not equal, have: decimal, new: string)
//
// It went to ERROR and stopped indexing the project entirely — no priceUpdated
// rows for sixteen hours, so every oracle alert was querying an empty window
// and reporting nothing wrong. Match the existing column type. BigInt is exact,
// so nothing is lost by doing so.

const INTERVAL_MINUTES = 10;

// Deliberately NOT the 39539450n the event handlers in main.ts start from.
//
// A timer snapshot backfills from its start checkpoint, so that number would
// mean roughly two years of ten-minute ticks across 38 objects — on the order of
// four million object reads — for a value that changes a handful of times a
// year. This project's analytics tier is already rejecting alert evaluations on
// queue depth, so that backfill is not free to anybody.
//
// Configuration has no interesting history here: what a rule needs is the bound
// as it is now, and the one historical question worth asking (what was NS's
// floor during the outage) is already answered by the InvalidOraclePrice rows.
//
// 322800000 is about three days before this was written (mainnet was at
// 323857103, running near 4 checkpoints/second), which backfills a few hundred
// ticks and gives the table usable rows the moment it deploys. It also stays
// well clear of the node's object pruning horizon, 320772155 at the same
// moment — an object snapshot cannot read further back than that at all.
const START_CHECKPOINT = 322800000n;

export function FeedConfigProcessor() {
  for (const { feedAddress, fieldId } of ORACLE_FEEDS) {
    SuiObjectProcessor.bind({
      objectId: fieldId,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: START_CHECKPOINT,
    }).onTimeInterval(
      async (self, _, ctx) => {
        try {
          const value = (self.fields as any)?.value?.fields;
          if (!value) return;

          const history = value.history?.fields ?? {};

          ctx.eventLogger.emit("oracleFeedConfig", {
            feed_address: feedAddress,
            oracle_id: String(value.oracle_id),
            coin_type: String(value.coin_type),
            enable: value.enable === true,

            // The pair this exists for.
            minimum_effective_price: BigInt(value.minimum_effective_price),
            maximum_effective_price: BigInt(value.maximum_effective_price),

            // The rest of the feed's guard rails, so a rule that needs one of
            // them does not require another processor change to get it.
            maximum_allowed_span_percentage: BigInt(value.maximum_allowed_span_percentage),
            price_diff_threshold1: BigInt(value.price_diff_threshold1),
            price_diff_threshold2: BigInt(value.price_diff_threshold2),
            max_duration_within_thresholds: BigInt(value.max_duration_within_thresholds),
            max_timestamp_diff: BigInt(value.max_timestamp_diff),
            historical_price_ttl: BigInt(value.historical_price_ttl),

            // The feed's own last accepted price, from the same object and the
            // same instant as the bounds. A consumer comparing the two never has
            // to join across tables or worry about the two being from different
            // moments.
            price: BigInt(history.price ?? 0),
            updated_time: BigInt(history.updated_time ?? 0),

            env: "mainnet",
          });
        } catch (e) {
          // Loud, unlike the sibling processors. A snapshot that silently stops
          // producing rows for one feed is indistinguishable from a feed that is
          // fine, and this table exists precisely to be trusted when a feed is
          // not fine.
          console.error(`oracleFeedConfig: feed ${feedAddress} (${fieldId}) failed:`, e);
        }
      },
      INTERVAL_MINUTES,
      INTERVAL_MINUTES,
    );
  }
}
