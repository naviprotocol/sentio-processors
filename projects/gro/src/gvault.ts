import { GVaultProcessor, GVaultContext, WithdrawEvent, DepositEvent } from "./types/eth/gvault.js";
import {BigDecimal, CHAIN_IDS, Counter, Gauge, scaleDown} from "@sentio/sdk"

const DECIMAL = 18
export const volOptions = {
    sparse: false,
    aggregationConfig: {
        intervalInMinutes: [60],
    }
}

const withdraw_shares_cume = Counter.register("withdraw_shares_cume", volOptions)
const deposit_shares_cume = Counter.register("deposit_shares_cume", volOptions)
const withdraw_assets_cume = Counter.register("withdraw_assets_cume", volOptions)
const deposit_assets_cume = Counter.register("deposit_assets_cume", volOptions)

async function withdrawHandler(evt: WithdrawEvent, ctx: GVaultContext) {
    const shares = scaleDown(evt.args.shares, DECIMAL)
    const assets = scaleDown(evt.args.assets, DECIMAL)
    const owner = evt.args.owner

    ctx.meter.Gauge("withdraw_shares").record(shares)
    ctx.meter.Gauge("withdraw_assets").record(assets)
    withdraw_shares_cume.add(ctx, shares)
    withdraw_assets_cume.add(ctx, assets)

    ctx.eventLogger.emit("Withdraw", {
        distinctId: owner,
        assets: assets,
        shares: shares,
        message: owner + " withdraw " + assets + " assets, " + shares + " shares"
      })
}


async function depositHandler(evt: DepositEvent, ctx: GVaultContext) {
    const shares = scaleDown(evt.args.shares, DECIMAL)
    const assets = scaleDown(evt.args.assets, DECIMAL)
    const owner = evt.args.owner

    ctx.meter.Gauge("deposit_shares").record(shares)
    ctx.meter.Gauge("deposit_assets").record(assets)
    deposit_shares_cume.add(ctx, shares)
    deposit_assets_cume.add(ctx, assets)

    ctx.eventLogger.emit("Deposit", {
        distinctId: owner,
        assets: assets,
        shares: shares,
        message: owner + " deposit " + assets + " assets, " + shares + " shares"
    })
}

async function blockHandler(_:any, ctx: GVaultContext) {
    const totalSupply = scaleDown(await ctx.contract.totalSupply(), DECIMAL)
    const totalAssets = scaleDown(await ctx.contract.totalAssets(), DECIMAL)

    ctx.meter.Gauge("totalSupply").record(totalSupply)
    ctx.meter.Gauge("totalAssets").record(totalAssets)
}

GVaultProcessor.bind({address: "0x1402c1cAa002354fC2C4a4cD2b4045A5b9625EF3"})
.onEventWithdraw(withdrawHandler)
.onEventDeposit(depositHandler)
.onBlockInterval(blockHandler)