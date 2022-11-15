import {
  EUROC_PROXY,
  USDC_PROXY,
  USDC_PROXY_POLYGON
} from "./constant"
import { MintEvent, BurnEvent } from "./types/fiattokenv2"
import { FiatTokenV2Context, FiatTokenV2Processor } from "./types/fiattokenv2"
import { UChildAdministrableERC20Processor, UChildAdministrableERC20Context } from "./types/uchildadministrableerc20"
import { token } from "@sentio/sdk/lib/utils"
import { scaleDown } from "@sentio/sdk/lib/utils/token";
const DECIMAL = 6

const totalSupplyHandler = async function(_:any, ctx: FiatTokenV2Context) {
  const tokenInfo = await token.getERC20TokenInfo(ctx.contract.rawContract.address)
  const totalSupply = scaleDown(await ctx.contract.totalSupply(), DECIMAL)
  ctx.meter.Gauge("total_supply").record(totalSupply, {labels: tokenInfo.symbol})
}

const mintEventHandler = async function(event: MintEvent, ctx: FiatTokenV2Context) {
  const tokenInfo = await token.getERC20TokenInfo(ctx.contract.rawContract.address)
  const amount = scaleDown(event.args.amount, DECIMAL)
  ctx.meter.Gauge("mint").record(amount, {labels: tokenInfo.symbol})
  ctx.meter.Counter("mint_acc").add(amount, {labels: tokenInfo.symbol})
}

const burnEventHandler = async function(event: BurnEvent, ctx: FiatTokenV2Context) {
  const tokenInfo = await token.getERC20TokenInfo(ctx.contract.rawContract.address)
  const amount = scaleDown(event.args.amount, DECIMAL)
  ctx.meter.Gauge("burn").record(amount, {labels: tokenInfo.symbol})
  ctx.meter.Counter("burn_acc").add(amount, {labels: tokenInfo.symbol})
}

const totalSupplyHandlerPolygon = async function(_:any, ctx: UChildAdministrableERC20Context) {
  const totalSupply = scaleDown(await ctx.contract.totalSupply(), DECIMAL)
  ctx.meter.Gauge("total_supply_polygon").record(totalSupply)
}

FiatTokenV2Processor.bind({address: USDC_PROXY})
  .onBlock(totalSupplyHandler)
  .onEventMint(mintEventHandler)
  .onEventBurn(burnEventHandler)

FiatTokenV2Processor.bind({address: EUROC_PROXY})
  .onBlock(totalSupplyHandler)
  .onEventMint(mintEventHandler)
  .onEventBurn(burnEventHandler)

UChildAdministrableERC20Processor.bind({address: USDC_PROXY_POLYGON, network: 137})
  .onBlock(totalSupplyHandlerPolygon)