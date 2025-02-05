import { swap } from './types/aptos/pancake-swap.js'
import { Gauge } from "@sentio/sdk";
import { GLOBAL_CONFIG } from "@sentio/runtime";

import { AptosDex, getTokenInfoWithFallback, getPairValue, TokenInfo }
  from "@sentio/sdk/aptos/ext"
  // from "@sentio-processor/common/aptos"

import {  AptosResourcesProcessor } from "@sentio/sdk/aptos";
import { IFO } from "./types/aptos/movecoin.js";

const commonOptions = { sparse:  true }
export const volOptions = {
  sparse: true,
  aggregationConfig: {
    intervalInMinutes: [60],
  }
}

const tvlAll = Gauge.register("tvl_all", commonOptions)
const tvl = Gauge.register("tvl", commonOptions)
const tvlByPool = Gauge.register("tvl_by_pool", commonOptions)
const volume = Gauge.register("vol", volOptions)
const volumeByCoin = Gauge.register("vol_by_coin", volOptions)

// const accountTracker = AccountEventTracker.register("users")

IFO.bind()
    .onEventDepositEvent(async (evt, ctx)=>{
      // console.log(JSON.stringify(evt))
      ctx.eventLogger.emit("Deposit", {
        distinctId: evt.data_decoded.user,
        amount: evt.data_decoded.amount,
        pid: evt.data_decoded.pid,
      })
    })
    .onEventHarvestEvent(async (evt, ctx) => {
      ctx.eventLogger.emit("Harvest", {
        distinctId: evt.data_decoded.user,
        amount: evt.data_decoded.offering_amount,
        pid: evt.data_decoded.pid
      })
    })

swap.bind({startVersion: 10463608})
  .onEventPairCreatedEvent(async (evt, ctx) => {
    ctx.meter.Counter("num_pools").add(1)
    const coinx = evt.data_decoded.token_x
    const coiny = evt.data_decoded.token_y
    const pair = await PANCAKE_SWAP_APTOS.getPair(coinx, coiny)
    ctx.eventLogger.emit("Create Pair", {
      distinctId: ctx.transaction.sender,
      pair,
      message: `Created ${pair}`
    })
  })
  .onEventAddLiquidityEvent(async (evt, ctx) => {
    ctx.meter.Counter("event_liquidity_add").add(1)
    const coinx = evt.type_arguments[0]
    const coiny = evt.type_arguments[1]
    const value = await getPairValue(ctx, coinx, coiny, evt.data_decoded.amount_x, evt.data_decoded.amount_y)
    ctx.eventLogger.emit("Add Liquidity", {
      distinctId: ctx.transaction.sender,
      pair: await PANCAKE_SWAP_APTOS.getPair(coinx, coiny),
      value,
    })
  })
  .onEventRemoveLiquidityEvent(async (evt, ctx) => {
    ctx.meter.Counter("event_liquidity_removed").add(1)
    const coinx = evt.type_arguments[0]
    const coiny = evt.type_arguments[1]
    const value = await getPairValue(ctx, coinx, coiny, evt.data_decoded.amount_x, evt.data_decoded.amount_y)
    ctx.eventLogger.emit("Remove Liquidity", {
      distinctId: ctx.transaction.sender,
      pair: await PANCAKE_SWAP_APTOS.getPair(coinx, coiny),
      value
    })
  })
  .onEventSwapEvent(async (evt, ctx) => {
    const coinx = evt.type_arguments[0]
    const coiny = evt.type_arguments[1]

    const amountx = evt.data_decoded.amount_x_in + evt.data_decoded.amount_x_out
    const amounty = evt.data_decoded.amount_y_in + evt.data_decoded.amount_y_out
    const value = await PANCAKE_SWAP_APTOS.recordTradingVolume(ctx, coinx, coiny, amountx, amounty)

    // console.log(JSON.stringify(ctx.transaction))
    // console.log(JSON.stringify(evt))
    const coinXInfo = await getTokenInfoWithFallback(coinx)
    const coinYInfo = await getTokenInfoWithFallback(coiny)
    ctx.meter.Counter("event_swap_by_bridge").add(1, { bridge: coinXInfo.bridge })
    ctx.meter.Counter("event_swap_by_bridge").add(1, { bridge: coinYInfo.bridge })

    let message: string
    const summaryX = `${amountx.scaleDown(coinXInfo.decimals).toNumber()} ${coinXInfo.symbol}`
    const summaryY = `${amounty.scaleDown(coinYInfo.decimals).toNumber()} ${coinYInfo.symbol}`
    if (evt.data_decoded.amount_x_in) {
      message = `Swap ${summaryX} to ${summaryY}`
    } else {
      message = `Swap ${summaryY} to ${summaryX}`
    }

    ctx.eventLogger.emit("Swap", {
      distinctId: ctx.transaction.sender,
      pair: await PANCAKE_SWAP_APTOS.getPair(coinx, coiny),
      value: value,
      message
    })
  })

const PANCAKE_SWAP_APTOS = new AptosDex<swap.TokenPairReserve<any, any>>(
    volume, volumeByCoin,tvlAll, tvl, tvlByPool,{
  getXReserve: pool => pool.reserve_x,
  getYReserve: pool => pool.reserve_y,
  getExtraPoolTags: _ => {},
  poolType: swap.TokenPairReserve.type()
  },
)

AptosResourcesProcessor.bind({address: swap.DEFAULT_OPTIONS.address, startVersion: 10463608})
    .onVersionInterval((rs, ctx) => PANCAKE_SWAP_APTOS.syncPools(rs, ctx))
