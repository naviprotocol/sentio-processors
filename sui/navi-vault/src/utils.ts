// Pure helpers: address / coin-type normalization and numeric scaling.
// The vault + market registry lives in config.ts (loaded from vaults.mainnet.json).

// ---------------------------------------------------------------------------
// Scaling constants
// ---------------------------------------------------------------------------
// Fee rates / penalties are WAD-scaled (1e18) on-chain. Reward rate is RAY (1e27).
export const WAD = 1e18;
export const RAY = 1e27;
export const DEFAULT_COIN_DECIMAL = 9;

// Inflation-attack offset baked into the share math (navi_vault::VIRTUAL_SHARES).
// share_price = (total_assets + VIRTUAL_SHARES) / (total_shares + VIRTUAL_SHARES),
// both in native units, so the offset cancels out of the ratio's units.
export const VIRTUAL_SHARES = 1_000_000;

export const UNKNOWN_COIN = "unknown";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
function normalizeAddress(address: string): string {
  let addr = address.trim();
  if (!addr.startsWith("0x")) {
    addr = `0x${addr}`;
  }
  let body = addr.slice(2).replace(/^0+/, "");
  if (body === "") {
    body = "0";
  }
  return `0x${body.toLowerCase()}`;
}

// Normalize an address (vault id, pool id, cap id, ...) to canonical short form
// (lowercase, no leading zeros). Used as the join key for both event values and
// config so that 0x000..02 and 0x2 compare equal.
export function normalizeId(address: string): string {
  if (!address) return "";
  return normalizeAddress(address);
}

// Normalize a coin type. Reward coin types arrive as ascii::String type names
// WITHOUT a leading 0x (e.g. "549e...::cert::CERT"); this canonicalizes them.
export function normalizeCoinType(coinType: string): string {
  if (!coinType) return "";
  let type = coinType.trim();
  if (type === "" || type === UNKNOWN_COIN) return type;
  if (!type.startsWith("0x")) type = `0x${type}`;

  const sep = type.indexOf("::");
  if (sep === -1) return normalizeAddress(type);

  const addressPart = type.slice(0, sep);
  const rest = type.slice(sep + 2);
  return `${normalizeAddress(addressPart)}::${rest}`;
}

// ---------------------------------------------------------------------------
// Numeric scaling helpers
// ---------------------------------------------------------------------------
// Scale a raw integer amount down by its token decimals.
export function scaleAmount(raw: bigint | string | number, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

// Scale a WAD-scaled (1e18) rate down to a plain fraction (e.g. 0.05 for 5%).
export function scaleWad(raw: bigint | string | number): number {
  return Number(raw) / WAD;
}

// Scale a RAY-scaled (1e27) rate down to a plain fraction.
export function scaleRay(raw: bigint | string | number): number {
  return Number(raw) / RAY;
}
