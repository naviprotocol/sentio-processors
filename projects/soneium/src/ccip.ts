import { network, startBlock, getTokenInfo } from './utils.js'
import { CcipSendCallTrace, RouterContext, RouterProcessor } from './types/eth/router.js'
import { scaleDown } from '@sentio/sdk'
import { EthChainId } from '@sentio/sdk/eth'
import { EVM2EVMOnRampProcessor } from './types/eth/evm2evmonramp.js'
import { ethers } from 'ethers'

async function emitBridgeEvent(type: string, call: CcipSendCallTrace, ctx: RouterContext, fromChain?: string) {
  const { destinationChainSelector, message } = call.args
  const { receiver, tokenAmounts } = message
  ctx.trace
  ctx.transactionReceipt
  const from = ctx.transaction?.from
  for (const { token, amount } of tokenAmounts) {
    const tokenInfo = await getTokenInfo('', token, ctx)
    const payload: Record<string, any> = {
      distinctId: from,
      type,
      name: 'CCIP',
      from,
      to: receiver,
      symbol: tokenInfo?.symbol,
      amount: tokenInfo ? scaleDown(amount, tokenInfo.decimal) : amount
    }
    if (type == 'out') {
      payload.to_chain_selector = destinationChainSelector
    } else {
      payload.from_chain = fromChain
    }
    ctx.eventLogger.emit('bridge', payload)
  }
}

async function parseLog(log: any) {
  const Erc20Abi = [
    'event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address sender, address token, uint256 tokenAmount, address receiver)'
  ]
  const interfce = new ethers.Interface(Erc20Abi)
  return interfce.parseLog(log)
}

RouterProcessor.bind({
  network,
  startBlock,
  address: '0x8C8B88d827Fe14Df2bc6392947d513C86afD6977'
}).onEventMessageExecuted(
  async (evt, ctx) => {
    const logs = ctx.transactionReceipt?.logs || []
    for (const log of logs) {
      const parsed = await parseLog(log)
      if (parsed?.args.messageId == evt.args.messageId) {
        const { sourceChainSelector, sender, token, tokenAmount, receiver } = parsed.args
        const tokenInfo = await getTokenInfo('', token, ctx)
        ctx.eventLogger.emit('bridge', {
          distinctId: sender,
          type: 'in',
          name: 'CCIP',
          from: sender,
          to: receiver,
          symbol: tokenInfo?.symbol,
          amount: tokenInfo ? scaleDown(tokenAmount, tokenInfo.decimal) : tokenAmount
        })
        return
      }
    }
  },
  undefined,
  {
    transaction: true,
    transactionReceipt: true,
    transactionReceiptLogs: true
  }
)

EVM2EVMOnRampProcessor.bind({
  network,
  startBlock,
  address: '0xEb9E93ca8047DD64BE46D249BD1E01E9473eBB58'
}).onEventCCIPSendRequested(async (evt, ctx) => {
  const { sender, receiver, tokenAmounts } = evt.args.message
  const from = sender
  for (const { token, amount } of tokenAmounts) {
    const tokenInfo = await getTokenInfo('', token, ctx)
    const payload: Record<string, any> = {
      distinctId: from,
      type: 'out',
      name: 'CCIP',
      from,
      to: receiver,
      symbol: tokenInfo?.symbol,
      amount: tokenInfo ? scaleDown(amount, tokenInfo.decimal) : amount
    }
    ctx.eventLogger.emit('bridge', payload)
  }
})

const soneiumChainSelector = 12505351618335765396n

// RouterProcessor.bind({
//   network: EthChainId.ETHEREUM,
//   // startBlock: 21640000,
//   address: '0x80226fc0ee2b096224eeac085bb9a8cba1146f7d'
// }).onCallCcipSend(async (call, ctx) => {
//   const { destinationChainSelector } = call.args
//   if (destinationChainSelector == soneiumChainSelector) {
//     return emitBridgeEvent('in', call, ctx, 'Ethereum')
//   }
// })

// RouterProcessor.bind({
//   network: EthChainId.ASTAR,
//   startBlock: 7890000,
//   address: '0x8D5c5CB8ec58285B424C93436189fB865e437feF'
// }).onCallCcipSend(async (call, ctx) => {
//   const { destinationChainSelector } = call.args
//   if (destinationChainSelector == soneiumChainSelector) {
//     return emitBridgeEvent('in', call, ctx, 'Astar')
//   }
// })
