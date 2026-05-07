import { CoinMap } from "./interfaces.js";
import { ADDRESSES_PRODUCTION } from "./config/addresses.js";

// Consolidated coin metadata; derived maps below keep lookups O(1).
type CoinDefinition = {
  id: number;
  symbol: string;
  decimals: number;
  coinType: string;
};

const COIN_DEFINITIONS: CoinDefinition[] = [
  { id: 0, symbol: "SUI", decimals: 9, coinType: "0x2::sui::SUI" },
  { id: 1, symbol: "wUSDC", decimals: 6, coinType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN" },
  { id: 2, symbol: "wUSDT", decimals: 6, coinType: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN" },
  { id: 3, symbol: "wETH", decimals: 8, coinType: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN" },
  { id: 4, symbol: "CETUS", decimals: 9, coinType: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS" },
  { id: 5, symbol: "vSui", decimals: 9, coinType: "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT" },
  { id: 6, symbol: "haSui", decimals: 9, coinType: "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI" },
  { id: 7, symbol: "NAVX", decimals: 9, coinType: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX" },
  { id: 8, symbol: "wBTC", decimals: 8, coinType: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN" },
  { id: 9, symbol: "AUSD", decimals: 6, coinType: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD" },
  { id: 10, symbol: "nUSDC", decimals: 6, coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC" },
  { id: 11, symbol: "nbETH", decimals: 8, coinType: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH" },
  { id: 12, symbol: "USDY", decimals: 6, coinType: "0x960b531667636f39e85867775f52f6b1f220a058c4de786905bdf761e06a56bb::usdy::USDY" },
  { id: 13, symbol: "NS", decimals: 6, coinType: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS" },
  { id: 14, symbol: "stBTC", decimals: 8, coinType: "0x5f496ed5d9d045c5b788dc1bb85f54100f2ede11e46f6a232c29daada4c5bdb6::coin::COIN" },
  { id: 15, symbol: "DEEP", decimals: 6, coinType: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP" },
  { id: 16, symbol: "FDUSD", decimals: 6, coinType: "0xf16e6b723f242ec745dfd7634ad072c42d5c1d9ac9d62a39c381303eaa57693a::fdusd::FDUSD" },
  { id: 17, symbol: "BLUE", decimals: 9, coinType: "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE" },
  { id: 18, symbol: "BUCK", decimals: 9, coinType: "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK" },
  { id: 19, symbol: "nUSDT", decimals: 6, coinType: "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT" },
  { id: 20, symbol: "stSUI", decimals: 9, coinType: "0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI" },
  { id: 21, symbol: "suiBTC", decimals: 8, coinType: "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC" },
  { id: 22, symbol: "SOL", decimals: 8, coinType: "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN" },
  { id: 23, symbol: "LBTC", decimals: 8, coinType: "0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC" },
  { id: 24, symbol: "WAL", decimals: 9, coinType: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL" },
  { id: 25, symbol: "HAEDAL", decimals: 9, coinType: "0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL" },
  { id: 26, symbol: "XBTC", decimals: 8, coinType: "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC" },
  { id: 27, symbol: "IKA", decimals: 9, coinType: "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA" },
  { id: 30, symbol: "YBTC", decimals: 8, coinType: "0xa03ab7eee2c8e97111977b77374eaf6324ba617e7027382228350db08469189e::ybtc::YBTC" },
  { id: 31, symbol: "XAUM", decimals: 9, coinType: "0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM" },
  { id: 32, symbol: "LZWBTC", decimals: 8, coinType: "0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC" },
  { id: 100, symbol: "SLP", decimals: 9, coinType: "0xc44d97a4bc4e5a33ca847b72b123172c88a6328196b71414f32c3070233604b2::slp::SLP" },
];

const COIN_BY_SYMBOL = new Map<string, CoinDefinition>();
const COIN_BY_TYPE = new Map<string, CoinDefinition>();
const COIN_BY_ID = new Map<number, CoinDefinition>();

for (const definition of COIN_DEFINITIONS) {
  COIN_BY_SYMBOL.set(definition.symbol, definition);
  COIN_BY_TYPE.set(definition.coinType, definition);
  COIN_BY_ID.set(definition.id, definition);
}

// Symbol aliases used by the on-chain config (uppercase / capitalized variants).
// These are mapped to the canonical symbol used in COIN_BY_SYMBOL.
const SYMBOL_ALIASES: Record<string, string> = {
  SUIBTC: "suiBTC",
  VSUI: "vSui",
  HASUI: "haSui",
  STSUI: "stSUI",
};

function resolveCoinSymbol(symbol: string): string {
  if (COIN_BY_SYMBOL.has(symbol)) return symbol;
  return SYMBOL_ALIASES[symbol] ?? symbol;
}

// Indexed by navi oracle asset id (sparse). Use COIN[id] to look up the
// symbol — do NOT treat this as a dense array.
export const COIN: Record<number, string> = Object.fromEntries(
  COIN_DEFINITIONS.map(({ id, symbol }) => [id, symbol] as const)
);

export const DECIMAL_MAP = Object.fromEntries(
  COIN_DEFINITIONS.map(({ id, decimals }) => [id, decimals] as const)
) as Record<number, number>;

export const SYMBOL_MAP = Object.fromEntries(
  COIN_DEFINITIONS.map(({ id, symbol }) => [id, symbol] as const)
) as Record<number, string>;

export const COIN_MAP = Object.fromEntries(
  COIN_DEFINITIONS.map(({ coinType, symbol }) => [coinType, symbol] as const)
) as CoinMap;

export const DECIMAL_RAY = 27;
export const DEFAULT_COIN_DECIMAL = 9;

export function getDecimalBySymbol(coinSymbol: string): number | undefined {
  return COIN_BY_SYMBOL.get(resolveCoinSymbol(coinSymbol))?.decimals;
}

export function getIdBySymbol(coinSymbol: string): number | undefined {
  return COIN_BY_SYMBOL.get(resolveCoinSymbol(coinSymbol))?.id;
}

// ---------------------------------------------------------------------------
// Vault configuration: derived from src/config/addresses.ts (mirrors ref/).
// ---------------------------------------------------------------------------

// The vault module's events keep the original (defining) package address even
// after upgrades, so binding always uses package_id_old.
export const VAULT_PACKAGE_PROD = ADDRESSES_PRODUCTION.package_id_old;

// Preserve historical vault_type labels for the four vaults that already had
// dashboards / metrics, then auto-derive labels for newer vaults from their
// config keys (e.g. "ybtc_strategy_loop_0").
const LEGACY_VAULT_TYPE_BY_CONFIG_KEY: Record<string, string> = {
  suibtc_strategy_loop_0: "wBTC_VAULT",
  xbtc_strategy_loop_0: "xBTC_VAULT",
  usdc_strategy_supply_0: "Stable_MMT#1_VAULT",
  usdc_strategy_supply_1: "Stable_MMT#2_VAULT",
};

type VaultConfig = (typeof ADDRESSES_PRODUCTION.vaults)[keyof typeof ADDRESSES_PRODUCTION.vaults];

type VaultEntry = {
  configKey: string;
  vaultType: string;
  vaultId: string;
  coinSymbol: string;
  coinType: string;
  vaultStructType: string;
  rewardManager: string;
  receiptsId: string;
  strategyType: string;
  naviAccountCaps: string[];
};

function buildVaultEntries(): VaultEntry[] {
  const entries: VaultEntry[] = [];
  for (const [configKey, raw] of Object.entries(
    ADDRESSES_PRODUCTION.vaults
  ) as Array<[string, VaultConfig]>) {
    const coinSymbol = resolveCoinSymbol(raw.coinSymbol);
    const vaultStructType = `${VAULT_PACKAGE_PROD}::vault::Vault<${raw.coinType}>`;
    const defiAssets = ("defiAssets" in raw ? raw.defiAssets : {}) as Record<
      string,
      string
    >;
    const naviAccountCaps = Object.entries(defiAssets)
      .filter(([key]) => key.startsWith("naviAccountCap"))
      .map(([, value]) => value)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    entries.push({
      configKey,
      vaultType: LEGACY_VAULT_TYPE_BY_CONFIG_KEY[configKey] ?? configKey,
      vaultId: raw.vaultId,
      coinSymbol,
      coinType: raw.coinType,
      vaultStructType,
      rewardManager: raw.rewardManager,
      receiptsId: raw.receiptsId,
      strategyType: raw.type,
      naviAccountCaps,
    });
  }
  return entries;
}

const VAULT_ENTRIES: VaultEntry[] = buildVaultEntries();

// VAULT_ADDRESSES: vault_type label -> vault struct type string.
// Keeps the four legacy keys plus VAULT_PACKAGE_PROD that the rest of the
// codebase relies on, and adds new vault_type labels for newer vaults.
export const VAULT_ADDRESSES = (() => {
  const out: Record<string, string> = {
    VAULT_PACKAGE_PROD,
  };
  for (const entry of VAULT_ENTRIES) {
    out[entry.vaultType] = entry.vaultStructType;
  }
  // Backwards-compatible aliases for the four original vaults.
  out.wBTC_VAULT =
    out.wBTC_VAULT ??
    `${VAULT_PACKAGE_PROD}::vault::Vault<0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC>`;
  out.xBTC_VAULT =
    out.xBTC_VAULT ??
    `${VAULT_PACKAGE_PROD}::vault::Vault<0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC>`;
  return out;
})();

// Helpers: parse vault type string and get coin symbol from it.
export function parseVaultType(vaultTypeString: string): {
  packageAddress: string;
  moduleName: string;
  structName: string;
  coinType: string;
} | null {
  const regex = /^(0x[a-f0-9]+)::([^:]+)::([^<]+)<(.+)>$/;
  const match = vaultTypeString.match(regex);
  if (!match) return null;
  return {
    packageAddress: match[1],
    moduleName: match[2],
    structName: match[3],
    coinType: match[4],
  };
}

export function getCoinSymbolFromVaultType(vaultTypeString: string): string {
  const parsed = parseVaultType(vaultTypeString);
  if (!parsed) return "UNKNOWN";
  const coinSymbol = COIN_MAP[parsed.coinType];
  if (coinSymbol) return coinSymbol;
  const coinTypeMatch = parsed.coinType.match(/::([^:]+)::([^>]+)$/);
  if (coinTypeMatch) return coinTypeMatch[2];
  return "UNKNOWN";
}

// VAULT_ID_TO_TYPE: vault object id -> vault_type label.
const VAULT_ID_TO_TYPE: Record<string, string> = Object.fromEntries(
  VAULT_ENTRIES.map((e) => [e.vaultId, e.vaultType] as const)
);

export { VAULT_ID_TO_TYPE };

type VaultIdInfo = {
  vaultType: string;
  coinSymbol: string;
};

const VAULT_ID_ENTRIES: Array<[string, VaultIdInfo]> = VAULT_ENTRIES.map(
  (e) => [e.vaultId, { vaultType: e.vaultType, coinSymbol: e.coinSymbol }] as const
);

export const VAULT_ID_MAPPING = Object.fromEntries(VAULT_ID_ENTRIES) as Record<
  string,
  VaultIdInfo
>;

const VAULT_INFO_BY_ID = new Map<string, VaultIdInfo>(VAULT_ID_ENTRIES);
const VAULT_INFO_BY_TYPE = new Map<string, VaultIdInfo>();
const VAULT_ID_BY_TYPE = new Map<string, string>();
const VAULT_ID_BY_COIN_SYMBOL = new Map<string, string>();

for (const [vaultId, info] of VAULT_ID_ENTRIES) {
  if (!VAULT_ID_BY_TYPE.has(info.vaultType)) {
    VAULT_ID_BY_TYPE.set(info.vaultType, vaultId);
  }
  if (!VAULT_ID_BY_COIN_SYMBOL.has(info.coinSymbol)) {
    VAULT_ID_BY_COIN_SYMBOL.set(info.coinSymbol, vaultId);
  }
  if (!VAULT_INFO_BY_TYPE.has(info.vaultType)) {
    VAULT_INFO_BY_TYPE.set(info.vaultType, info);
  }
}

export function getVaultInfoById(vaultId: string): {
  vaultType: string;
  coinSymbol: string;
} | null {
  return VAULT_INFO_BY_ID.get(vaultId) || null;
}

export function getVaultInfoByType(vaultType: string): VaultIdInfo | null {
  return VAULT_INFO_BY_TYPE.get(vaultType) || null;
}

export function getVaultIdByType(vaultType: string): string | null {
  return VAULT_ID_BY_TYPE.get(vaultType) || null;
}

export function getVaultIdByCoinSymbol(coinSymbol: string): string | null {
  return VAULT_ID_BY_COIN_SYMBOL.get(coinSymbol) || null;
}

// All vault PerformanceFeeRecords are stored as dynamic fields under this
// central object id (record_object from the on-chain config).
export const PERFORMANCE_FEE_RECORD_ADDRESS =
  ADDRESSES_PRODUCTION.vault_performance_fee_record.record_object;

// NAVI account caps: vault_type -> array of cap addresses (derived from config).
export const NAVI_ACCOUNT_CAPS: Record<string, string[]> = Object.fromEntries(
  VAULT_ENTRIES.filter((e) => e.naviAccountCaps.length > 0).map(
    (e) => [e.vaultType, e.naviAccountCaps] as const
  )
);

const NAVI_ACCOUNT_CAP_SET = new Set<string>();
const NAVI_ACCOUNT_CAP_TO_VAULT = new Map<string, string>();

for (const [vaultType, caps] of Object.entries(NAVI_ACCOUNT_CAPS)) {
  for (const cap of caps) {
    NAVI_ACCOUNT_CAP_SET.add(cap);
    NAVI_ACCOUNT_CAP_TO_VAULT.set(cap, vaultType);
  }
}

// Mapping from RewardsClaimed sender (account cap) to vault_type label.
export const REWARDS_SENDER_TO_VAULT_MAPPING: Record<string, string> =
  Object.fromEntries(NAVI_ACCOUNT_CAP_TO_VAULT.entries());

const REWARDS_SENDER_TO_VAULT_MAP = new Map<string, string>(
  Array.from(NAVI_ACCOUNT_CAP_TO_VAULT.entries()).map(([address, vaultType]) => [
    address.toLowerCase(),
    vaultType,
  ])
);

export function getVaultTypeFromRewardsSender(senderAddress: string): string {
  return (
    REWARDS_SENDER_TO_VAULT_MAP.get(senderAddress.toLowerCase()) ||
    "UNKNOWN_VAULT"
  );
}

export function getNaviAccountCaps(vaultType: string): string[] {
  return NAVI_ACCOUNT_CAPS[vaultType] || [];
}

export function isNaviAccountCap(address: string): boolean {
  return NAVI_ACCOUNT_CAP_SET.has(address);
}

export function getVaultTypeByAccountCap(address: string): string | null {
  return NAVI_ACCOUNT_CAP_TO_VAULT.get(address) || null;
}

export function getCoinSymbolByVaultType(vaultType: string): string | null {
  return VAULT_INFO_BY_TYPE.get(vaultType)?.coinSymbol || null;
}

// Event type identifiers used for monitoring vault activities.
export const EVENT_TYPES = {
  DEPOSIT_EXECUTED: `${VAULT_PACKAGE_PROD}::vault::DepositExecuted`,
  WITHDRAW_EXECUTED: `${VAULT_PACKAGE_PROD}::vault::WithdrawExecuted`,
  REWARD_CLAIMED:
    "0xd899cf7d2b5db716bd2cf55599fb0d5ee38a3061e7b6bb6eebf73fa5bc4c81ca::incentive_v3::RewardClaimed",
} as const;

// Vault metrics calculation constants.
export const VAULT_METRICS = {
  VAULT_DECIMALS: 1_000_000_000,
  ORACLE_DECIMALS: 1e18,
  RATE_SCALING: 10_000,
  DAILY_SETTLEMENT_HOUR: 20,
} as const;

export function isVaultTypeString(address: string): boolean {
  return address.includes("::");
}

export function getCurrentDateUTC(): string {
  return new Date().toISOString().split("T")[0];
}

export function isDaily8PMUTC(timestamp: Date): boolean {
  const utc = new Date(timestamp.toISOString());
  return (
    utc.getUTCHours() === VAULT_METRICS.DAILY_SETTLEMENT_HOUR &&
    utc.getUTCMinutes() === 0
  );
}

export function getNextDaily8PMUTC(): Date {
  const now = new Date();
  const next8PM = new Date(now);
  next8PM.setUTCHours(VAULT_METRICS.DAILY_SETTLEMENT_HOUR, 0, 0, 0);
  if (next8PM <= now) {
    next8PM.setUTCDate(next8PM.getUTCDate() + 1);
  }
  return next8PM;
}

export function applyVaultPrecision(amount: number | bigint | string): number {
  const numAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return numAmount / VAULT_METRICS.VAULT_DECIMALS;
}

export function applyOraclePrecision(price: number | bigint | string): number {
  const numPrice =
    typeof price === "string" ? parseFloat(price) : Number(price);
  return numPrice / VAULT_METRICS.ORACLE_DECIMALS;
}

export function applyTokenDecimalPrecision(
  amount: number | bigint | string,
  decimals: number
): number {
  const numAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return numAmount / Math.pow(10, decimals);
}

export const PRICE_ORACLE_CONFIG = {
  ORACLE_ADDRESS:
    "0xc0601facd3b98d1e82905e660bf9f5998097dedcf86ed802cf485865e3e3667c",
  START_CHECKPOINT: 172000000n,
  UPDATE_INTERVAL: 10,
  UPDATE_OFFSET: 5,
} as const;

const latestPriceData = new Map<
  string,
  {
    price: number;
    decimal: number;
    timestamp: Date;
    coinSymbol: string;
  }
>();

export function updatePriceCache(
  coinId: string,
  price: number,
  decimal: number,
  coinSymbol: string,
  timestamp: Date
): void {
  latestPriceData.set(coinId, {
    price: price,
    decimal: decimal,
    timestamp: timestamp,
    coinSymbol: coinSymbol,
  });
}
