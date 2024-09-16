import { ERC20Processor } from "@sentio/sdk/eth/builtin";
import { MISC_CONSTS, PENDLE_POOL_ADDRESSES, CONFIG } from "./consts.ts";
import { handleSYTransfer } from "./handlers/SY.ts";
import { PendleYieldTokenProcessor } from "./types/eth/pendleyieldtoken.ts";
import {
  handleYTRedeemInterest,
  handleYTTransfer,
  processAllYTAccounts,
} from "./handlers/YT.ts";
import { PendleMarketProcessor } from "./types/eth/pendlemarket.ts";
import {
  handleLPTransfer,
  handleMarketRedeemReward,
  handleMarketSwap,
  processAllLPAccounts,
} from "./handlers/LP.ts";
import { GLOBAL_CONFIG } from "@sentio/runtime";
import { EQBBaseRewardProcessor } from "./types/eth/eqbbasereward.ts";

GLOBAL_CONFIG.execution = {
  sequential: true,
};

// ERC20Processor.bind({
//   address: PENDLE_POOL_ADDRESSES.SY,
//   startBlock: PENDLE_POOL_ADDRESSES.SY_START_BLOCK,
//   name: "Pendle Pool SY",
//   network: CONFIG.BLOCKCHAIN,
// }).onEventTransfer(async (evt, ctx) => {
//   await handleSYTransfer(evt, ctx);
// });

PendleYieldTokenProcessor.bind({
  address: PENDLE_POOL_ADDRESSES.YT,
  startBlock: 20742122,
  //PENDLE_POOL_ADDRESSES.START_BLOCK,
  name: "Pendle Pool YT",
  network: CONFIG.BLOCKCHAIN,
})
  .onEventTransfer(async (evt, ctx) => {
    //debug
    if (ctx.transactionHash?.toLowerCase() != "0xfca77e12dc94a7716e84f105957e0909b68aa15ff157f1eca25c8ff87e7f13e4") return
    // console.log("event log before handle", evt.args)
    ctx.eventLogger.emit("before transfer handler", {
      message: JSON.stringify(evt.args)
    })

    await handleYTTransfer(evt, ctx);
  })
  // .onEventRedeemInterest(async (evt, ctx) => {
  //   await handleYTRedeemInterest(evt, ctx);
  // })
  .onTimeInterval(async (_, ctx) => {
    await processAllYTAccounts(ctx);
  }, 1
    // MISC_CONSTS.ONE_DAY_IN_MINUTE 
  );

// PendleMarketProcessor.bind({
//   address: PENDLE_POOL_ADDRESSES.LP,
//   startBlock: PENDLE_POOL_ADDRESSES.START_BLOCK,
//   name: "Pendle Pool LP",
//   network: CONFIG.BLOCKCHAIN,
// })
//   .onEventTransfer(async (evt, ctx) => {
//     await handleLPTransfer(evt, ctx);
//   })
//   .onEventRedeemRewards(async (evt, ctx) => {
//     await handleMarketRedeemReward(evt, ctx);
//   })
//   .onEventSwap(async (evt, ctx) => {
//     await handleMarketSwap(evt, ctx);
//   });

// EQBBaseRewardProcessor.bind({
//   address: PENDLE_POOL_ADDRESSES.EQB_STAKING,
//   startBlock: PENDLE_POOL_ADDRESSES.EQB_START_BLOCK,
//   name: "Equilibria Base Reward",
//   network: CONFIG.BLOCKCHAIN
// }).onEventStaked(async (evt, ctx) => {
//   await processAllLPAccounts(ctx, [evt.args._user.toLowerCase()]);
// }).onEventWithdrawn(async (evt, ctx) => {
//   await processAllLPAccounts(ctx, [evt.args._user.toLowerCase()]);
// })