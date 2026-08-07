// Navi price oracle — USD price per asset, sampled on an interval.
//
// This exists so vault TVL can be expressed in USD. It deliberately does NOT do
// the multiplication: the snapshot handler has no access to a price at its own
// timestamp, and caching prices in a module-level Map (as sui/volo-vault does)
// is unsafe — handlers are not guaranteed to share a process, and the cache is
// empty after every restart and during backfill. Emitting price as its own
// series and multiplying in the dashboard keeps the processor stateless and
// makes historical USD values fall out of the backfill for free.
//
// The prices live in PriceOracle.price_oracles, a Table<u8, Price> whose own
// object id is the bind target below — the table, not the PriceOracle wrapper.

import { SuiWrappedObjectProcessor } from "@sentio/sdk/sui";
import { ChainId } from "@sentio/chain";
import { Gauge } from "@sentio/sdk";
import { BUILTIN_TYPES } from "@sentio/sdk/move";
import { oracle } from "./types/sui/0xca441b44943c16be0e6e23c5a955bb971537ea3289ae8016fbf33fffe1fd210f.js";
import {
  PRICE_TABLE_ID,
  PRICE_TABLE_START_CHECKPOINT,
  getAssetSymbol,
} from "./config.js";
import { scaleAmount } from "./utils.js";

// USD price per asset. Labelled by symbol so a dashboard formula can pair it
// with vault_tvl, and by asset_id so an unmapped asset is still identifiable.
const oraclePrice = Gauge.register("oracle_price");

const PRICE_INTERVAL_MIN = 10;
const PRICE_BACKFILL_INTERVAL_MIN = 180;

export function OraclePriceProcessor() {
  SuiWrappedObjectProcessor.bind({
    objectId: PRICE_TABLE_ID,
    network: ChainId.SUI_MAINNET,
    startCheckpoint: PRICE_TABLE_START_CHECKPOINT,
  }).onTimeInterval(
    async (dynamicFieldObjects, ctx) => {
      const entries = await ctx.coder.getDynamicFields(
        dynamicFieldObjects,
        BUILTIN_TYPES.U8_TYPE,
        oracle.Price.type(),
      );

      for (const entry of entries) {
        const assetId = Number(entry.name);
        const price = entry.value as oracle.Price;
        if (!price || price.value === undefined) continue;

        // Price is an integer scaled by its own `decimal`, independent of the
        // token's decimals: asset 0 is 674420210 at decimal 9 => $0.674420210.
        const usd = scaleAmount(price.value, Number(price.decimal));
        if (!Number.isFinite(usd) || usd <= 0) continue;

        oraclePrice.record(ctx, usd, {
          coin_symbol: getAssetSymbol(assetId),
          asset_id: String(assetId),
        });
      }
    },
    PRICE_INTERVAL_MIN,
    PRICE_BACKFILL_INTERVAL_MIN,
    "",
    { owned: true },
  );
}
