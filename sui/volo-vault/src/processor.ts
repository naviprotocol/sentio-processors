import {
  SuiContext,
  SuiWrappedObjectProcessor,
  SuiObjectProcessor,
} from "@sentio/sdk/sui";
import { vault_event_recorder } from "./types/sui/0xc667544f9d0262d24e6d7f2160437d1aa5bcc90a9830772577404ec30c356763.js";
import { ChainId } from "@sentio/chain";
import { Gauge, Counter } from "@sentio/sdk";
import { dynamic_field } from "@sentio/sdk/sui/builtin/0x2";
import { TypeDescriptor, BUILTIN_TYPES } from "@sentio/sdk/move";
// Package v12 (published-at 0x7518aa0d, 2026-08-26). The generated module is named
// by published-at, but every processor below still binds to the ORIGINAL package id
// via VAULT_ADDRESS — event type tags carry the original id and do not move on an
// upgrade, so the bindings survive this one and the next one untouched.
import {
  vault,
  navi_adaptor,
  curator_position,
  operation,
  swap_request,
  user_entry,
} from "./types/sui/0x7518aa0d909c44c66db3f7e3881d812e7339aa16efe0de37205873e444fa83cf.js";
import { vault_fee_record } from "./types/sui/0xcecac1d9cafdc922a8974675c32a53473e43f227d34c8695a94413c723832633.js";

// import { VoloApiProcessor } from "./backend.js";
// Add Navi incentive imports for RewardsClaimed events
import { incentive_v3 } from "./types/sui/0x81c408448d0d57b3e371ea94de1d40bf852784d3e225de1e74acab3e8395c18f.js";
import {
  VAULT_ADDRESSES,
  getDecimalBySymbol,
  COIN_MAP,
  getCurrentDateUTC,
  applyVaultPrecision,
  applyOraclePrecision,
  applyTokenDecimalPrecision,
  getVaultInfoById,
  DEFAULT_COIN_DECIMAL,
  getVaultTypeFromRewardsSender,
  VAULT_ID_TO_TYPE,
  getVaultInfoByType,
  PERFORMANCE_FEE_RECORD_ADDRESS,
} from "./utils.js";
import { NaviRewardsProcessor } from "./navi-rewards-processor.js";
import { OracleProcessor } from "./oracle-processor.js";

// Use the production package address for binding the processor
const VAULT_ADDRESS = VAULT_ADDRESSES.VAULT_PACKAGE_PROD;

// Specific vault type strings for metrics and logging
const wBTC_VAULT_TYPE = VAULT_ADDRESSES.wBTC_VAULT;
const XBTC_VAULT_TYPE = VAULT_ADDRESSES.xBTC_VAULT;

// Performance fee metrics from dynamic fields
const performanceFeeMetrics = {
  performanceFeeActiveCumulated: Gauge.register(
    "vault_performance_fee_active_cumulated"
  ),
  performanceFeeClaimed: Gauge.register("vault_performance_fee_claimed"),
  performanceFeeUnclaimed: Gauge.register("vault_performance_fee_unclaimed"),
} as const;

// Simplified tracking for basic statistics
let basicStats = {
  lastUpdateDate: "",
};

// Depositor statistics data structure
interface VaultDepositorStats {
  uniqueDepositors: Set<string>;
  totalDepositors: number;
  dailyNewDepositors: Set<string>;
  lastUpdateDate: string;
}

// Depositor statistics for each vault
const vaultDepositorStats: Map<string, VaultDepositorStats> = new Map();

// Initialize or get vault depositor statistics
function getOrCreateVaultDepositorStats(vaultId: string): VaultDepositorStats {
  if (!vaultDepositorStats.has(vaultId)) {
    vaultDepositorStats.set(vaultId, {
      uniqueDepositors: new Set<string>(),
      totalDepositors: 0,
      dailyNewDepositors: new Set<string>(),
      lastUpdateDate: getCurrentDateUTC(),
    });
  }
  return vaultDepositorStats.get(vaultId)!;
}

// Helper function to get default coin symbol
/**
 * What to call a vault whose id is not in the mapping.
 *
 * This used to return "suiBTC", "as it's the most common vault". That is a guess,
 * and a guess here does not stay a label: the symbol picks the decimals, and the
 * decimals scale the amount. An unmapped USDC vault was recorded as suiBTC at 8
 * decimals, turning 173,860 USDC of flow into "1,738.6 suiBTC" — a number that
 * reads as nine figures of BTC and is wrong in both the asset and the scale.
 *
 * An unknown asset is now called unknown, and its amounts are left unscaled rather
 * than scaled by somebody else's decimals. Add the vault to ADDRESSES_PRODUCTION
 * .vaults and the labels come back.
 */
const UNRESOLVED_COIN_SYMBOL = "UNKNOWN";

/**
 * Coin symbol and decimals for a vault, or nulls when the vault is not mapped.
 * `decimals: null` means "do not normalise" — never "use the default".
 */
function resolveCoinForVault(vaultId: string): {
  coinSymbol: string;
  tokenDecimals: number | null;
} {
  const info = getVaultInfoById(vaultId);
  if (!info?.coinSymbol) {
    return { coinSymbol: UNRESOLVED_COIN_SYMBOL, tokenDecimals: null };
  }
  const decimals = getDecimalBySymbol(info.coinSymbol);
  return {
    coinSymbol: info.coinSymbol,
    tokenDecimals: decimals === undefined ? null : decimals,
  };
}

export function VoloVaultProcessor() {
  vault
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    // Basic operation events
    .onEventDepositRequested(handleDepositRequested)
    .onEventDepositExecuted(handleDepositExecuted)
    .onEventDepositCancelled(handleDepositCancelled)
    .onEventWithdrawRequested(handleWithdrawRequested)
    .onEventWithdrawExecuted(handleWithdrawExecuted)
    .onEventWithdrawCancelled(handleWithdrawCancelled)
    // Asset-related events
    .onEventNewAssetTypeAdded(handleNewAssetTypeAdded)
    .onEventDefiAssetRemoved(handleDefiAssetRemoved)
    .onEventCoinTypeAssetRemoved(handleCoinTypeAssetRemoved)
    .onEventAssetValueUpdated(handleAssetValueUpdated)
    .onEventTotalUSDValueUpdated(handleTotalUSDValueUpdated)
    .onEventShareRatioUpdated(handleShareRatioUpdated)
    // Fee-related events
    .onEventDepositFeeChanged(handleDepositFeeChanged)
    .onEventWithdrawFeeChanged(handleWithdrawFeeChanged)
    .onEventDepositWithdrawFeeRetrieved(handleDepositWithdrawFeeRetrieved)
    // Operation-related events
    .onEventOperatorDeposited(handleOperatorDeposited)
    .onEventOperatorFreezed(handleOperatorFreezed)
    .onEventVaultStatusChanged(handleVaultStatusChanged)
    // Other important events
    .onEventFreePrincipalBorrowed(handleFreePrincipalBorrowed)
    .onEventFreePrincipalReturned(handleFreePrincipalReturned)
    .onEventClaimablePrincipalAdded(handleClaimablePrincipalAdded)
    .onEventClaimablePrincipalClaimed(handleClaimablePrincipalClaimed)
    .onEventToleranceChanged(handleToleranceChanged)
    .onEventLossToleranceUpdated(handleLossToleranceUpdated);

  // Note: Daily snapshot logic is integrated into event handlers
  // to check for UTC 8 PM timing. RewardClaimed event exists in ABI
  // but may need types regeneration
}

function updateBasicStats(ctx: SuiContext) {
  const currentDate = getCurrentDateUTC();

  // Reset daily stats if it's a new day
  if (basicStats.lastUpdateDate !== currentDate) {
    basicStats.lastUpdateDate = currentDate;

    resetDailyDepositorStats(currentDate);

    performDailyDepositorStatsRecording(ctx, currentDate);
  }
}

// Reset daily depositor statistics
function resetDailyDepositorStats(currentDate: string) {
  for (const [vaultId, stats] of vaultDepositorStats.entries()) {
    if (stats.lastUpdateDate !== currentDate) {
      stats.dailyNewDepositors.clear();
      stats.lastUpdateDate = currentDate;
    }
  }
}

// Record daily depositor statistics
function performDailyDepositorStatsRecording(
  ctx: SuiContext,
  currentDate: string
) {
  for (const [vaultId, stats] of vaultDepositorStats.entries()) {
    const vaultInfo = getVaultInfoById(vaultId);
    const vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";
    const coinSymbol = vaultInfo?.coinSymbol || "UNKNOWN";

    ctx.eventLogger.emit("depositorStats", {
      event_type: "DailyDepositorStats",
      vault_id: vaultId,
      vault_type: vaultType,
      coin_symbol: coinSymbol,
      total_unique_depositors: stats.totalDepositors,
      daily_new_depositors_count: stats.dailyNewDepositors.size,
      daily_new_depositors_list: Array.from(stats.dailyNewDepositors).join(","),
      date: currentDate,
      timestamp: ctx.timestamp,
      data_source: "vault_depositor_tracking",
    });
  }
}

// Simplified daily processing - removed reconciliation logic
async function handleDepositRequested(
  event: vault.DepositRequestedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const amount = Number(data.amount);

  const vaultInfo = getVaultInfoById(data.vault_id);
  const { coinSymbol, tokenDecimals } = resolveCoinForVault(data.vault_id);
  let vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";

  // Normalise only when the decimals are known. null, not a default: a wrongly
  // scaled amount is indistinguishable from a real one downstream.
  const amountNormalized =
    tokenDecimals === null
      ? null
      : applyTokenDecimalPrecision(amount, tokenDecimals);
  const expectedSharesNormalized = applyVaultPrecision(data.expected_shares);

  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DepositRequested",
    request_id: data.request_id,
    recipient: data.recipient,
    amount: data.amount, // Raw amount
    expected_shares: data.expected_shares, // Raw expected shares
    amount_normalized: amountNormalized, // Precision-adjusted amount
    expected_shares_normalized: expectedSharesNormalized, // Precision-adjusted expected shares

    vault_type: vaultType,
    coin_symbol: coinSymbol,
    token_decimals: tokenDecimals,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleDepositExecuted(
  event: vault.DepositExecutedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const amount = Number(data.amount);

  const vaultInfo = getVaultInfoById(data.vault_id);
  const { coinSymbol, tokenDecimals } = resolveCoinForVault(data.vault_id);
  let vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";

  // Normalise only when the decimals are known. null, not a default: a wrongly
  // scaled amount is indistinguishable from a real one downstream.
  const amountNormalized =
    tokenDecimals === null
      ? null
      : applyTokenDecimalPrecision(amount, tokenDecimals);
  const sharesNormalized = applyVaultPrecision(data.shares);

  // Update basic statistics
  updateBasicStats(ctx);

  const depositorStats = getOrCreateVaultDepositorStats(data.vault_id);
  const currentDate = getCurrentDateUTC();
  const recipientAddress = data.recipient;

  const isNewDepositor = !depositorStats.uniqueDepositors.has(recipientAddress);

  if (isNewDepositor) {
    depositorStats.uniqueDepositors.add(recipientAddress);
    depositorStats.totalDepositors = depositorStats.uniqueDepositors.size;

    if (depositorStats.lastUpdateDate !== currentDate) {
      depositorStats.dailyNewDepositors.clear();
      depositorStats.lastUpdateDate = currentDate;
    }

    depositorStats.dailyNewDepositors.add(recipientAddress);
  }

  // Emit enhanced event log with both raw and normalized values
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DepositExecuted",
    request_id: data.request_id,
    recipient: data.recipient,
    amount: data.amount, // Raw amount
    shares: data.shares, // Raw shares
    amount_normalized: amountNormalized, // Precision-adjusted amount
    shares_normalized: sharesNormalized, // Precision-adjusted shares

    vault_type: vaultType,
    coin_symbol: coinSymbol,
    token_decimals: tokenDecimals,
    is_new_depositor: isNewDepositor,
    total_unique_depositors: depositorStats.totalDepositors,
    daily_new_depositors_count: depositorStats.dailyNewDepositors.size,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleDepositCancelled(
  event: vault.DepositCancelledInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const vaultInfo = getVaultInfoById(data.vault_id);

  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DepositCancelled",
    request_id: data.request_id,
    recipient: data.recipient,
    amount: data.amount,

    vault_type: vaultInfo?.vaultType || "UNKNOWN_VAULT",
    coin_symbol: vaultInfo?.coinSymbol || UNRESOLVED_COIN_SYMBOL,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleWithdrawRequested(
  event: vault.WithdrawRequestedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "WithdrawRequested",
    request_id: data.request_id,
    recipient: data.recipient,
    shares: data.shares,
    expected_amount: data.expected_amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleWithdrawExecuted(
  event: vault.WithdrawExecutedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const amount = Number(data.amount);

  const vaultInfo = getVaultInfoById(data.vault_id);
  const { coinSymbol, tokenDecimals } = resolveCoinForVault(data.vault_id);
  let vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";

  // Normalise only when the decimals are known. null, not a default: a wrongly
  // scaled amount is indistinguishable from a real one downstream.
  const amountNormalized =
    tokenDecimals === null
      ? null
      : applyTokenDecimalPrecision(amount, tokenDecimals);
  const sharesNormalized = applyVaultPrecision(data.shares);

  // Update basic statistics
  updateBasicStats(ctx);

  // Emit enhanced event log
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "WithdrawExecuted",
    request_id: data.request_id,
    recipient: data.recipient,
    amount: data.amount, // Raw amount
    shares: data.shares, // Raw shares
    amount_normalized: amountNormalized, // Precision-adjusted amount
    shares_normalized: sharesNormalized, // Precision-adjusted shares

    vault_type: vaultType,
    coin_symbol: coinSymbol,
    token_decimals: tokenDecimals,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleWithdrawCancelled(
  event: vault.WithdrawCancelledInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const vaultInfo = getVaultInfoById(data.vault_id);

  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "WithdrawCancelled",
    request_id: data.request_id,
    recipient: data.recipient,
    shares: data.shares,

    vault_type: vaultInfo?.vaultType || "UNKNOWN_VAULT",
    coin_symbol: vaultInfo?.coinSymbol || UNRESOLVED_COIN_SYMBOL,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleNewAssetTypeAdded(
  event: vault.NewAssetTypeAddedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "NewAssetTypeAdded",
    asset_type: data.asset_type,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleDefiAssetRemoved(
  event: vault.DefiAssetRemovedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DefiAssetRemoved",
    asset_type: data.asset_type,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleCoinTypeAssetRemoved(
  event: vault.CoinTypeAssetRemovedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "CoinTypeAssetRemoved",
    asset_type: data.asset_type,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleAssetValueUpdated(
  event: vault.AssetValueUpdatedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "AssetValueUpdated",
    asset_type: data.asset_type,
    usd_value: data.usd_value,
    event_timestamp: data.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleTotalUSDValueUpdated(
  event: vault.TotalUSDValueUpdatedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;

  const totalUsdValueNormalized = applyOraclePrecision(
    Number(data.total_usd_value)
  );

  const vaultInfo = getVaultInfoById(data.vault_id);

  // Update basic statistics
  updateBasicStats(ctx);

  // Emit enhanced event log with normalized values only
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "TotalUSDValueUpdated",
    total_usd_value_raw: data.total_usd_value.toString(),
    total_usd_value: totalUsdValueNormalized,

    vault_type: vaultInfo?.vaultType || "UNKNOWN_VAULT",
    coin_symbol: vaultInfo?.coinSymbol || UNRESOLVED_COIN_SYMBOL,
    oracle_precision: 18,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleShareRatioUpdated(
  event: vault.ShareRatioUpdatedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "ShareRatioUpdated",
    share_ratio: data.share_ratio,
    event_timestamp: data.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleDepositFeeChanged(
  event: vault.DepositFeeChangedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DepositFeeChanged",
    fee: data.fee,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleWithdrawFeeChanged(
  event: vault.WithdrawFeeChangedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "WithdrawFeeChanged",
    fee: data.fee,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleDepositWithdrawFeeRetrieved(
  event: vault.DepositWithdrawFeeRetrievedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "DepositWithdrawFeeRetrieved",
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleOperatorDeposited(
  event: vault.OperatorDepositedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "OperatorDeposited",
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleOperatorFreezed(
  event: vault.OperatorFreezedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    operator_id: data.operator_id,
    event_type: "OperatorFreezed",
    freezed: data.freezed,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleVaultStatusChanged(
  event: vault.VaultStatusChangedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "VaultStatusChanged",
    status: data.status,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}
async function handleFreePrincipalBorrowed(
  event: vault.FreePrincipalBorrowedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "FreePrincipalBorrowed",
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleFreePrincipalReturned(
  event: vault.FreePrincipalReturnedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "FreePrincipalReturned",
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleClaimablePrincipalAdded(
  event: vault.ClaimablePrincipalAddedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "ClaimablePrincipalAdded",
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleClaimablePrincipalClaimed(
  event: vault.ClaimablePrincipalClaimedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "ClaimablePrincipalClaimed",
    receipt_id: data.receipt_id,
    amount: data.amount,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleToleranceChanged(
  event: vault.ToleranceChangedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "ToleranceChanged",
    tolerance: data.tolerance,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

async function handleLossToleranceUpdated(
  event: vault.LossToleranceUpdatedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  ctx.eventLogger.emit("vaultEvent", {
    vault_id: data.vault_id,
    event_type: "LossToleranceUpdated",
    current_loss: data.current_loss,
    loss_limit: data.loss_limit,
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
  });
}

// Vault internal RewardClaimed event handler (verified from ABI)
// Note: Requires types regeneration to enable event binding
async function handleRewardClaimed(
  event: any, // vault.RewardClaimedInstance when types are available
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const rewardAmount = Number(data.reward_amount);

  // Update basic statistics
  updateBasicStats(ctx);
}

async function onRewardsClaimedEventV3(
  event: any, // incentive_v3.RewardClaimedInstance,
  ctx: SuiContext
) {
  const rawAmount = event.data_decoded.total_claimed;
  const coinType = event.data_decoded.coin_type;

  const normalizedCoinType = coinType.startsWith("0x")
    ? coinType
    : `0x${coinType}`;
  const coinSymbol = COIN_MAP[normalizedCoinType] || "UNKNOWN";
  const decimal = getDecimalBySymbol(coinSymbol) || 9;
  const normalizedAmount = applyTokenDecimalPrecision(
    Number(rawAmount),
    decimal
  );

  // RewardsClaimed V3 processing

  const vaultType = getVaultTypeFromRewardsSender(event.data_decoded.user);

  ctx.eventLogger.emit("RewardsClaimed", {
    sender: event.data_decoded.user,
    amount: rawAmount,
    amount_normalized: normalizedAmount,
    pool: null,
    coin_type: coinType,
    coin_symbol: coinSymbol,
    vault_type: vaultType,
    decimal: decimal,
    rule_ids: event.data_decoded.rule_ids,
    rule_indices: event.data_decoded.rule_indices.map((index: any) =>
      index.toString()
    ),
    env: "mainnet",
  });
}

export function getDepositorStatsSummary(): Array<{
  vault_id: string;
  vault_type: string;
  coin_symbol: string;
  total_unique_depositors: number;
  daily_new_depositors: number;
  lastUpdateDate: string;
}> {
  const summary: Array<{
    vault_id: string;
    vault_type: string;
    coin_symbol: string;
    total_unique_depositors: number;
    daily_new_depositors: number;
    lastUpdateDate: string;
  }> = [];

  for (const [vaultId, stats] of vaultDepositorStats.entries()) {
    const vaultInfo = getVaultInfoById(vaultId);
    summary.push({
      vault_id: vaultId,
      vault_type: vaultInfo?.vaultType || "UNKNOWN_VAULT",
      coin_symbol: vaultInfo?.coinSymbol || "UNKNOWN",
      total_unique_depositors: stats.totalDepositors,
      daily_new_depositors: stats.dailyNewDepositors.size,
      lastUpdateDate: stats.lastUpdateDate,
    });
  }

  return summary;
}

// Bind RewardsClaimed event handlers to respective contracts
incentive_v3
  .bind({
    address:
      "0x81c408448d0d57b3e371ea94de1d40bf852784d3e225de1e74acab3e8395c18f",
    network: ChainId.SUI_MAINNET,
    startCheckpoint: 175000000n,
  })
  .onEventRewardClaimed(onRewardsClaimedEventV3);

// VaultStatusRecorded event handler for vault status monitoring
async function handleVaultStatusRecorded(
  event: vault_event_recorder.VaultStatusRecordedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;

  const vaultId = data.vault_id;
  const vaultInfo = getVaultInfoById(vaultId);
  const vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";
  const coinSymbol = vaultInfo?.coinSymbol || "UNKNOWN";

  // Record vault status count for monitoring
  ctx.meter.Counter("vaultStatusRecord").add(1, { vaultType });

  // Apply precision normalization for metrics recording
  // principal_price: 116804186207420000000000 (22 digits) = 116804.186207420000000000 (10^18 precision)
  const principalPriceNormalized = applyOraclePrecision(
    Number(data.principal_price)
  );
  // share_ratio: 999715627 (9 digits) = 0.999715627 (10^9 precision)
  const shareRatioNormalized = applyVaultPrecision(Number(data.share_ratio));
  // total_shares: 764791982576184 (15 digits) = 764791.982576184 (10^9 precision)
  const totalSharesNormalized = applyVaultPrecision(Number(data.total_shares));
  // total_usd_value: 764574496682453 (15 digits) - use vault precision instead of oracle precision
  const totalUsdValueNormalized = applyVaultPrecision(
    Number(data.total_usd_value)
  );

  const metricsLabels = {
    env: "mainnet",
    vault_type: vaultType,
    vault_id: vaultId,
    coin_symbol: coinSymbol,
    identification_method: "EVENT_VAULT_ID",
  };

  ctx.meter
    .Gauge("vault_total_shares")
    .record(totalSharesNormalized, metricsLabels);
  ctx.meter
    .Gauge("vault_total_usd_value")
    .record(totalUsdValueNormalized, metricsLabels);
  ctx.meter
    .Gauge("vault_principal_price")
    .record(principalPriceNormalized, metricsLabels);
  ctx.meter
    .Gauge("vault_share_ratio")
    .record(shareRatioNormalized, metricsLabels);

  const sharePrice =
    totalSharesNormalized > 0
      ? totalUsdValueNormalized / totalSharesNormalized
      : 0;
  ctx.meter.Gauge("vault_share_price").record(sharePrice, metricsLabels);

  // RPC enhancement removed - using event data only

  // Vault status updated

  // Emit structured event log for SQL recording
  ctx.eventLogger.emit("vaultStatusRecord", {
    event_type: "VaultStatusRecorded",
    vault_type: vaultType,
    vault_id: vaultId,
    // identification_method: "EVENT_VAULT_ID",
    coin_symbol: coinSymbol,
    principal_price_raw: data.principal_price.toString(),
    share_ratio_raw: data.share_ratio.toString(),
    total_shares_raw: data.total_shares.toString(),
    total_usd_value_raw: data.total_usd_value.toString(),
    principal_price: principalPriceNormalized,
    share_ratio: shareRatioNormalized,
    total_shares: totalSharesNormalized,
    total_usd_value: totalUsdValueNormalized,
    // Metadata
    timestamp: ctx.timestamp,
    tx_hash: ctx.transaction.digest,
    block_number: ctx.checkpoint,
    share_price: sharePrice,
    vault_package:
      "0xc667544f9d0262d24e6d7f2160437d1aa5bcc90a9830772577404ec30c356763",
    data_source: "vault_event_recorder",
  });

  // Update daily statistics for reconciliation
  updateBasicStats(ctx);
}

// Bind VaultStatusRecorded events
vault_event_recorder
  .bind({
    address:
      "0xc667544f9d0262d24e6d7f2160437d1aa5bcc90a9830772577404ec30c356763",
    network: ChainId.SUI_MAINNET,
    startCheckpoint: 175000000n,
  })
  .onEventVaultStatusRecorded(handleVaultStatusRecorded);

// Initialize all processors
// ---------------------------------------------------------------------------
// Package v12 events: the NAVI multi-market registry, and withdraw-with-swap.
//
// Before v12 the vault was pinned to NAVI market 0 by a hot-fix. It can now hold
// positions across several markets at once, and NaviMarketAdded / NaviMarketRemoved
// are the only on-chain record of which. Nothing else says where the vault's NAVI
// exposure sits, so these are the highest-value events in this release.
//
// The withdraw-with-swap path does NOT replace WithdrawExecuted: finish_execute_
// withdraw_with_swap calls vault::execute_withdraw internally, so principal
// accounting above is unaffected and is not double counted here. What was missing
// is the swap leg — what the principal was turned into, at what slippage, and
// whether execution landed near the floor it was allowed to accept.
// ---------------------------------------------------------------------------

/**
 * Resolve a Move `type_name` string to a known coin symbol.
 *
 * `type_name::into_string()` omits the `0x`, while COIN_MAP is keyed with it, so a
 * naive lookup misses every asset. Returns null rather than a guess when the type
 * is not one we know: an unrecognised asset must not be silently normalised with
 * some default decimal count, which is how this repo has produced plausible wrong
 * numbers before.
 */
function resolveAssetSymbol(assetType: string): string | null {
  const raw = String(assetType);
  const candidates = raw.startsWith("0x") ? [raw, raw.slice(2)] : [raw, "0x" + raw];
  for (const c of candidates) {
    const symbol = (COIN_MAP as Record<string, string | undefined>)[c];
    if (symbol) return symbol;
  }
  return null;
}

function vaultLabels(vaultId: string) {
  const info = getVaultInfoById(vaultId);
  return {
    vault_id: vaultId,
    vault_type: info?.vaultType || "UNKNOWN_VAULT",
    coin_symbol: info?.coinSymbol || "UNKNOWN",
  };
}

async function handleNaviMarketRegistryInitialized(
  event: navi_adaptor.NaviMarketRegistryInitializedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);

  ctx.meter.Counter("navi_market_registry_initialized").add(1, {
    vault_type: labels.vault_type,
    migration: String(data.migration),
  });

  ctx.eventLogger.emit("naviMarketEvent", {
    ...labels,
    event_type: "NaviMarketRegistryInitialized",
    // True when installed through the migration path, which also emits one
    // NaviMarketAdded per existing account cap.
    migration: data.migration,
    timestamp: ctx.timestamp,
  });
}

async function handleNaviMarketAdded(
  event: navi_adaptor.NaviMarketAddedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);
  const assetSymbol = resolveAssetSymbol(data.asset_type);

  ctx.meter.Counter("navi_market_binding_changed").add(1, {
    vault_type: labels.vault_type,
    direction: "added",
    market_id: String(data.market_id),
  });

  ctx.eventLogger.emit("naviMarketEvent", {
    ...labels,
    event_type: "NaviMarketAdded",
    market_id: Number(data.market_id),
    asset_type: String(data.asset_type),
    asset_symbol: assetSymbol ?? "UNKNOWN",
    timestamp: ctx.timestamp,
  });
}

async function handleNaviMarketRemoved(
  event: navi_adaptor.NaviMarketRemovedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);
  const assetSymbol = resolveAssetSymbol(data.asset_type);

  ctx.meter.Counter("navi_market_binding_changed").add(1, {
    vault_type: labels.vault_type,
    direction: "removed",
    market_id: String(data.market_id),
  });

  ctx.eventLogger.emit("naviMarketEvent", {
    ...labels,
    event_type: "NaviMarketRemoved",
    market_id: Number(data.market_id),
    asset_type: String(data.asset_type),
    asset_symbol: assetSymbol ?? "UNKNOWN",
    timestamp: ctx.timestamp,
  });
}

async function handleVaultCuratorPositionBound(
  event: curator_position.VaultCuratorPositionBoundInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);

  ctx.meter.Counter("vault_curator_position_bound").add(1, {
    vault_type: labels.vault_type,
  });

  ctx.eventLogger.emit("naviMarketEvent", {
    ...labels,
    event_type: "VaultCuratorPositionBound",
    curator_position_id: data.curator_position_id,
    timestamp: ctx.timestamp,
  });
}

async function handleWithdrawSwapRequested(
  event: user_entry.WithdrawSwapRequestedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);
  const targetSymbol = resolveAssetSymbol(data.target_asset_type);

  ctx.meter.Counter("withdraw_swap_requested").add(1, {
    vault_type: labels.vault_type,
    target_asset: targetSymbol ?? "UNKNOWN",
  });

  ctx.eventLogger.emit("withdrawSwapEvent", {
    ...labels,
    event_type: "WithdrawSwapRequested",
    request_id: Number(data.request_id),
    recipient: data.recipient,
    target_asset_type: String(data.target_asset_type),
    target_asset_symbol: targetSymbol ?? "UNKNOWN",
    slippage_bps: Number(data.slippage_bps),
    shares: data.shares,
    shares_normalized: applyVaultPrecision(Number(data.shares)),
    timestamp: ctx.timestamp,
  });
}

async function handleWithdrawWithSwapExecuted(
  event: operation.WithdrawWithSwapExecutedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);
  const targetSymbol = resolveAssetSymbol(data.target_asset_type);

  const received = Number(data.target_asset_amount);
  const minOut = Number(data.target_asset_min_amount_out);

  // How much room execution left above the floor it was allowed to accept. Zero
  // means it filled exactly at the limit; the contract aborts below it, so this is
  // never negative. Expressed against minOut because the two are the same asset
  // and the same scale, whatever that scale is.
  const headroomBps = minOut > 0 ? ((received - minOut) / minOut) * 10000 : 0;

  ctx.meter.Counter("withdraw_swap_executed").add(1, {
    vault_type: labels.vault_type,
    target_asset: targetSymbol ?? "UNKNOWN",
  });
  ctx.meter.Gauge("withdraw_swap_allowed_slippage_bps").record(
    Number(data.slippage_bps),
    { vault_type: labels.vault_type, target_asset: targetSymbol ?? "UNKNOWN" }
  );
  ctx.meter.Gauge("withdraw_swap_headroom_bps").record(headroomBps, {
    vault_type: labels.vault_type,
    target_asset: targetSymbol ?? "UNKNOWN",
  });

  ctx.eventLogger.emit("withdrawSwapEvent", {
    ...labels,
    event_type: "WithdrawWithSwapExecuted",
    request_id: Number(data.request_id),
    recipient: data.recipient,
    target_asset_type: String(data.target_asset_type),
    target_asset_symbol: targetSymbol ?? "UNKNOWN",
    // Raw only. The target asset's decimals are not known for an asset outside
    // COIN_MAP, and a wrongly scaled amount is worse than an unscaled one.
    target_asset_amount: data.target_asset_amount,
    target_asset_min_amount_out: data.target_asset_min_amount_out,
    slippage_bps: Number(data.slippage_bps),
    headroom_bps: headroomBps,
    timestamp: ctx.timestamp,
  });
}

async function handleWithdrawSwapRequestDropped(
  event: swap_request.WithdrawSwapRequestDroppedInstance,
  ctx: SuiContext
) {
  const data = event.data_decoded;
  const labels = vaultLabels(data.vault_id);
  const targetSymbol = resolveAssetSymbol(data.target_asset_type);

  // A dropped request is the swap leg being abandoned after the principal side
  // already resolved, so it is worth counting separately rather than folding into
  // the executed counter.
  ctx.meter.Counter("withdraw_swap_request_dropped").add(1, {
    vault_type: labels.vault_type,
    target_asset: targetSymbol ?? "UNKNOWN",
  });

  ctx.eventLogger.emit("withdrawSwapEvent", {
    ...labels,
    event_type: "WithdrawSwapRequestDropped",
    request_id: Number(data.request_id),
    recipient: data.recipient,
    target_asset_type: String(data.target_asset_type),
    target_asset_symbol: targetSymbol ?? "UNKNOWN",
    timestamp: ctx.timestamp,
  });
}

/**
 * NAVI multi-market registry, and the curator position binding that came with it.
 *
 * startCheckpoint matches every other binding in this file. These event types did
 * not exist before v12 so there is nothing to find earlier, and the processor
 * already walks this range for the handlers above — a later start would not save a
 * scan, only make the numbers harder to line up.
 */
export function NaviMultiMarketProcessor() {
  navi_adaptor
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    .onEventNaviMarketRegistryInitialized(handleNaviMarketRegistryInitialized)
    .onEventNaviMarketAdded(handleNaviMarketAdded)
    .onEventNaviMarketRemoved(handleNaviMarketRemoved);

  curator_position
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    .onEventVaultCuratorPositionBound(handleVaultCuratorPositionBound);
}

/** The withdraw-with-swap (zap-out) legs, request through execution or drop. */
export function WithdrawSwapProcessor() {
  user_entry
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    .onEventWithdrawSwapRequested(handleWithdrawSwapRequested);

  operation
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    .onEventWithdrawWithSwapExecuted(handleWithdrawWithSwapExecuted);

  swap_request
    .bind({
      address: VAULT_ADDRESS,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    })
    .onEventWithdrawSwapRequestDropped(handleWithdrawSwapRequestDropped);
}

VoloVaultProcessor();
NaviMultiMarketProcessor();
WithdrawSwapProcessor();
NaviRewardsProcessor();
OracleProcessor();
VaultStateMonitorProcessor();
DynamicFieldPerformanceFeeRecordProcessor();

// VoloApiProcessor();

// Vault addresses to monitor - auto-generated from VAULT_ID_TO_TYPE
const VAULT_ADDRESSES_TO_MONITOR = Object.entries(VAULT_ID_TO_TYPE).map(
  ([vault_id, vault_type]) => {
    const vaultInfo = getVaultInfoByType(vault_type);
    return {
      vault_id,
      vault_type,
      coin_symbol: vaultInfo?.coinSymbol || "UNKNOWN",
    };
  }
);

// Vault addresses validation

// Vault state cache for storing vault data
let vaultStateCache = new Map<
  string,
  {
    deposit_withdraw_fee_collected: number;
    claimable_principal: number;
    cur_epoch: number;
    cur_epoch_loss: number;
    cur_epoch_loss_base_usd_value: number;
    total_shares: number;
    deposit_fee_rate: number;
    free_principal: number;
    coin_symbol: string;
    coin_decimal: number;
    last_updated: Date;
  }
>();

export function VaultStateMonitorProcessor() {
  if (
    !VAULT_ADDRESSES_TO_MONITOR ||
    !Array.isArray(VAULT_ADDRESSES_TO_MONITOR) ||
    VAULT_ADDRESSES_TO_MONITOR.length < 1
  ) {
    return;
  }

  VAULT_ADDRESSES_TO_MONITOR.forEach((vault) => {
    SuiObjectProcessor.bind({
      objectId: vault.vault_id,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    }).onTimeInterval(
      async (self, data, ctx) => {
        const fieldsMap = (self?.fields as Record<string, any>) || {};

        const coinDecimal =
          getDecimalBySymbol(vault.coin_symbol) || DEFAULT_COIN_DECIMAL;

        const depositWithdrawFeeCollected = applyTokenDecimalPrecision(
          Number(fieldsMap?.deposit_withdraw_fee_collected || 0),
          coinDecimal
        );
        const claimablePrincipal = applyTokenDecimalPrecision(
          Number(fieldsMap?.claimable_principal || 0),
          coinDecimal
        );
        const curEpochLoss = applyTokenDecimalPrecision(
          Number(fieldsMap?.cur_epoch_loss || 0),
          coinDecimal
        );
        const curEpochLossBaseUsdValue = applyOraclePrecision(
          Number(fieldsMap?.cur_epoch_loss_base_usd_value || 0)
        );
        const totalShares = applyVaultPrecision(
          Number(fieldsMap?.total_shares || 0)
        );
        const freePrincipal = applyTokenDecimalPrecision(
          Number(fieldsMap?.free_principal || 0),
          coinDecimal
        );
        const curEpoch = Number(fieldsMap?.cur_epoch || 0);
        const depositFeeRate = Number(fieldsMap?.deposit_fee_rate || 0);

        vaultStateCache.set(vault.vault_id, {
          deposit_withdraw_fee_collected: depositWithdrawFeeCollected,
          claimable_principal: claimablePrincipal,
          cur_epoch: curEpoch,
          cur_epoch_loss: curEpochLoss,
          cur_epoch_loss_base_usd_value: curEpochLossBaseUsdValue,
          total_shares: totalShares,
          deposit_fee_rate: depositFeeRate,
          free_principal: freePrincipal,
          coin_symbol: vault.coin_symbol,
          coin_decimal: coinDecimal,
          last_updated: new Date(),
        });

        ctx.eventLogger.emit("vaultStateCache", {
          event_type: "VaultStateCache",
          vault_id: vault.vault_id,
          vault_type: vault.vault_type,
          coin_symbol: vault.coin_symbol,
          coin_decimal: coinDecimal,
          deposit_withdraw_fee_raw:
            fieldsMap?.deposit_withdraw_fee_collected || 0,
          claimable_principal_raw: fieldsMap?.claimable_principal || 0,
          cur_epoch_loss_raw: fieldsMap?.cur_epoch_loss || 0,
          total_shares_raw: fieldsMap?.total_shares || 0,
          free_principal_raw: fieldsMap?.free_principal || 0,
          deposit_withdraw_fee_collected: depositWithdrawFeeCollected,
          claimable_principal: claimablePrincipal,
          cur_epoch_loss: curEpochLoss,
          cur_epoch_loss_base_usd_value: curEpochLossBaseUsdValue,
          total_shares: totalShares,
          free_principal: freePrincipal,
          cur_epoch: curEpoch,
          deposit_fee_rate: depositFeeRate,
          objects_count: self ? 1 : 0,
          has_object_fields: !!self?.fields,
          checkpoint: ctx.checkpoint,
          block_number: ctx.checkpoint,
          timestamp: ctx.timestamp,
          data_source: "vault_state_cache",
          cache_update_time: new Date().toISOString(),
        });
        ctx.eventLogger.emit("vaultStateMonitor", {
          event_type: "VaultStateMonitor",
          vault_id: vault.vault_id,
          vault_type: vault.vault_type,
          coin_symbol: vault.coin_symbol,
          deposit_withdraw_fee_collected: depositWithdrawFeeCollected,
          claimable_principal: claimablePrincipal,
          cur_epoch_loss: curEpochLoss,
          cur_epoch_loss_base_usd_value: curEpochLossBaseUsdValue,
          total_shares: totalShares,
          free_principal: freePrincipal,
          cur_epoch: curEpoch,
          deposit_fee_rate: depositFeeRate,
          timestamp: ctx.timestamp,
          data_source: "vault_object_monitoring",
        });

        // VaultStateCache processed
      },
      600,
      600,
      undefined,
      { owned: false }
    );
  });
}

export function VaultFeeStateProcessor() {
  if (
    !VAULT_ADDRESSES_TO_MONITOR ||
    !Array.isArray(VAULT_ADDRESSES_TO_MONITOR) ||
    VAULT_ADDRESSES_TO_MONITOR.length < 1
  ) {
    return;
  }

  VAULT_ADDRESSES_TO_MONITOR.forEach((vault) => {
    SuiObjectProcessor.bind({
      objectId: vault.vault_id,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 175000000n,
    }).onTimeInterval(
      async (self, data, ctx) => {
        const fieldsMap = (self?.fields as Record<string, any>) || {};
        const coinDecimal =
          getDecimalBySymbol(vault.coin_symbol) || DEFAULT_COIN_DECIMAL;
        const depositWithdrawFeeRaw =
          fieldsMap?.deposit_withdraw_fee_collected || 0;
        const claimablePrincipalRaw = fieldsMap?.claimable_principal || 0;
        const freePrincipalRaw = fieldsMap?.free_principal || 0;
        const curEpochLossRaw = fieldsMap?.cur_epoch_loss || 0;
        const totalSharesRaw = fieldsMap?.total_shares || 0;
        const curEpochRaw = fieldsMap?.cur_epoch || 0;
        const depositWithdrawFeeNormalized = applyTokenDecimalPrecision(
          Number(depositWithdrawFeeRaw),
          coinDecimal
        );
        const claimablePrincipalNormalized = applyTokenDecimalPrecision(
          Number(claimablePrincipalRaw),
          coinDecimal
        );
        const freePrincipalNormalized = applyTokenDecimalPrecision(
          Number(freePrincipalRaw),
          coinDecimal
        );
        const curEpochLossNormalized = applyTokenDecimalPrecision(
          Number(curEpochLossRaw),
          coinDecimal
        );
        const totalSharesNormalized = applyVaultPrecision(
          Number(totalSharesRaw)
        );
        ctx.eventLogger.emit("vaultFeeState", {
          event_type: "VaultFeeState",
          env: "mainnet",
          vault_id: vault.vault_id,
          vault_type: vault.vault_type,
          coin_symbol: vault.coin_symbol,
          coin_decimal: coinDecimal,
          deposit_withdraw_fee_raw: String(depositWithdrawFeeRaw),
          claimable_principal_raw: String(claimablePrincipalRaw),
          free_principal_raw: String(freePrincipalRaw),
          cur_epoch_loss_raw: String(curEpochLossRaw),
          total_shares_raw: String(totalSharesRaw),
          cur_epoch_raw: String(curEpochRaw),
          deposit_withdraw_fee_collected: depositWithdrawFeeNormalized,
          claimable_principal: claimablePrincipalNormalized,
          free_principal: freePrincipalNormalized,
          cur_epoch_loss: curEpochLossNormalized,
          total_shares: totalSharesNormalized,
          cur_epoch: Number(curEpochRaw),
          checkpoint: ctx.checkpoint,
          timestamp: ctx.timestamp,
          data_source: "vault_fee_state_object_processor",
          object_available: !!self,
        });
        // VaultFeeState processed
      },
      1200,
      1200,
      undefined,
      { owned: false }
    );
  });
}

export function DynamicFieldPerformanceFeeRecordProcessor() {
  // Monitor the central PerformanceFeeRecord address for all vaults
  SuiWrappedObjectProcessor.bind({
    objectId: PERFORMANCE_FEE_RECORD_ADDRESS,
    network: ChainId.SUI_MAINNET,
    startCheckpoint: 175000000n,
  }).onTimeInterval(
    async (dynamicFieldObjects, ctx) => {
      const fieldType: TypeDescriptor<
        dynamic_field.Field<string, vault_fee_record.PerformanceFeeRecord>
      > = dynamic_field.Field.type(
        BUILTIN_TYPES.ADDRESS_TYPE,
        vault_fee_record.PerformanceFeeRecord.type()
      );

      const fields = await ctx.coder.filterAndDecodeObjects(
        fieldType,
        dynamicFieldObjects
      );

      for (const field of fields) {
        const fieldDecoded = field.data_decoded;
        const vaultAddress = fieldDecoded.name;
        const performanceFeeData = fieldDecoded.value;
        const vaultInfo = getVaultInfoById(vaultAddress);
        const vaultType = vaultInfo?.vaultType || "UNKNOWN_VAULT";
        const coinSymbol = vaultInfo?.coinSymbol || "UNKNOWN";
        const coinDecimal = getDecimalBySymbol(coinSymbol) || 9;

        const totalActiveCumulatedRaw = Number(
          performanceFeeData.total_active_cumulated
        );
        const totalClaimedRaw = Number(performanceFeeData.total_claimed);

        const totalActiveCumulated = applyTokenDecimalPrecision(
          totalActiveCumulatedRaw,
          coinDecimal
        );
        const totalClaimed = applyTokenDecimalPrecision(
          totalClaimedRaw,
          coinDecimal
        );
        const unclaimed = totalActiveCumulated - totalClaimed;
        ctx.eventLogger.emit("PerformanceFeeRecord", {
          vault_address: vaultAddress,
          vault_type: vaultType,
          coin_symbol: coinSymbol,
          coin_decimal: coinDecimal,
          total_active_cumulated_raw: totalActiveCumulatedRaw,
          total_claimed_raw: totalClaimedRaw,
          total_active_cumulated: totalActiveCumulated,
          total_claimed: totalClaimed,
          unclaimed: unclaimed,
          timestamp: ctx.timestamp,
        });
        performanceFeeMetrics.performanceFeeActiveCumulated.record(
          ctx,
          totalActiveCumulated,
          {
            vault_type: vaultType,
            coin_symbol: coinSymbol,
          }
        );
        performanceFeeMetrics.performanceFeeClaimed.record(ctx, totalClaimed, {
          vault_type: vaultType,
          coin_symbol: coinSymbol,
        });
        performanceFeeMetrics.performanceFeeUnclaimed.record(ctx, unclaimed, {
          vault_type: vaultType,
          coin_symbol: coinSymbol,
        });
      }
    },
    300,
    300,
    undefined,
    { owned: true }
  );
}

export function getVaultState(vaultId: string) {
  return vaultStateCache.get(vaultId);
}

export function getAllVaultStates(): Map<string, any> {
  return new Map(vaultStateCache);
}

VaultFeeStateProcessor();
