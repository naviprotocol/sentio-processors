import { SuiNetwork, SuiWrappedObjectProcessor } from "@sentio/sdk/sui";
import { typus_dov_single, tails_staking, tds_authorized_entry } from "./types/sui/typus_dov_single.js";
import { tails_exp } from "./types/sui/exp_dice.js";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const startCheckpoint = BigInt(15970051);

tails_exp
    .bind({ network: SuiNetwork.MAIN_NET, startCheckpoint })
    .onEventNewGame((event, ctx) => {
        let token = parse_token(event.type_arguments[0]);
        let stake_amount = Number(event.data_decoded.stake_amount) / 10 ** token_decimal(token);
        ctx.eventLogger.emit("NewGame", {
            distinctId: event.data_decoded.signer,
            game_id: event.data_decoded.game_id,
            stake_amount: stake_amount,
        });
    })
    .onEventPlayGuess((event, ctx) => {
        ctx.eventLogger.emit("PlayGuess", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            game_id: event.data_decoded.game_id,
            guess_1: event.data_decoded.guess_1,
            guess_2: event.data_decoded.guess_2,
            larger_than_1: event.data_decoded.larger_than_1,
            larger_than_2: event.data_decoded.larger_than_2,
        });
    })
    .onEventDraw((event, ctx) => {
        ctx.eventLogger.emit("Draw", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            game_id: event.data_decoded.game_id,
            // guess_1: event.data_decoded.guess_1,
            // guess_2: event.data_decoded.guess_2,
            // larger_than_1: event.data_decoded.larger_than_1,
            // larger_than_2: event.data_decoded.larger_than_2,
            answer_1: event.data_decoded.answer_1,
            answer_2: event.data_decoded.answer_2,
            result_1: event.data_decoded.result_1,
            result_2: event.data_decoded.result_2,
            // stake_amount: event.data_decoded.stake_amount,
            exp: event.data_decoded.exp,
        });
    });

tails_staking
    .bind({ network: SuiNetwork.MAIN_NET, startCheckpoint })
    .onEventDailyAttendEvent((event, ctx) => {
        ctx.eventLogger.emit("DailyAttend", {
            distinctId: event.data_decoded.sender,
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
            exp_earn: event.data_decoded.exp_earn,
        });
    })
    .onEventLevelUpEvent((event, ctx) => {
        ctx.eventLogger.emit("LevelUp", {
            distinctId: event.data_decoded.sender,
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
            level: event.data_decoded.level,
        });
    })
    .onEventUpdateUrlEvent((event, ctx) => {
        ctx.eventLogger.emit("UpdateUrl", {
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
            level: event.data_decoded.level,
            url: event.data_decoded.url,
        });
    })
    .onEventStakeNftEvent((event, ctx) => {
        ctx.eventLogger.emit("StakeNft", {
            distinctId: event.data_decoded.sender,
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
        });
    })
    .onEventUnstakeNftEvent((event, ctx) => {
        ctx.eventLogger.emit("UnstakeNft", {
            distinctId: event.data_decoded.sender,
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
        });
    })
    .onEventTransferNftEvent((event, ctx) => {
        ctx.eventLogger.emit("TransferNft", {
            distinctId: event.data_decoded.sender,
            nft_id: event.data_decoded.nft_id,
            number: event.data_decoded.number,
            receiver: event.data_decoded.receiver,
        });
    });

tds_authorized_entry.bind({ network: SuiNetwork.MAIN_NET, startCheckpoint: BigInt(1651870) }).onEventUpdateStrikeEvent((event, ctx) => {
    ctx.eventLogger.emit("UpdateStrike", {
        distinctId: event.data_decoded.signer,
        index: event.data_decoded.index,
        oracle_price: event.data_decoded.oracle_price,
        oracle_price_decimal: event.data_decoded.oracle_price_decimal,
        strikes: event.data_decoded.vault_config.payoff_configs.map((config) => config.strike?.toString()).join("   "),
    });
});

typus_dov_single
    .bind({ network: SuiNetwork.MAIN_NET, startCheckpoint: BigInt(1651870) })
    .onEventDepositEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);
        let amount = Number(event.data_decoded.amount) / 10 ** Number(event.data_decoded.decimal);

        ctx.meter.Counter("totalDeposit").add(amount, {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Deposit", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: amount,
        });
    })
    .onEventWithdrawEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);
        let amount = Number(event.data_decoded.amount) / 10 ** token_decimal(token);

        ctx.meter.Counter("totalWithdraw").add(amount, {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Withdraw", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: amount,
        });
    })
    .onEventUnsubscribeEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);
        let amount = Number(event.data_decoded.amount) / 10 ** token_decimal(token);

        ctx.meter.Counter("totalUnsubscribe").add(amount, {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Unsubscribe", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: amount,
        });
    })
    .onEventClaimEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);
        let amount = Number(event.data_decoded.amount) / 10 ** token_decimal(token);

        ctx.meter.Counter("totalClaim").add(amount, {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Claim", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: amount,
        });
    })
    .onEventHarvestEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);

        ctx.meter.Counter("harvestFee").add(Number(event.data_decoded.fee_amount) / 10 ** token_decimal(token), {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.meter.Counter("totalHarvest").add(Number(event.data_decoded.amount) / 10 ** token_decimal(token), {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Harvest", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: Number(event.data_decoded.amount) / 10 ** token_decimal(token),
        });
    })
    .onEventCompoundEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);

        let temp = event.data_decoded.u64_padding.at(0);
        let fee = Number(temp ? temp : 0) / 10 ** token_decimal(token);
        ctx.meter.Counter("compoundFee").add(fee, {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });

        ctx.meter.Counter("totalCompound").add(Number(event.data_decoded.amount) / 10 ** token_decimal(token), {
            index: event.data_decoded.index.toString(),
            coin_symbol: token,
        });
        ctx.eventLogger.emit("Compound", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: Number(event.data_decoded.amount) / 10 ** token_decimal(token),
            fee,
        });
    })
    .onEventExerciseEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);

        ctx.eventLogger.emit("Exercise", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            coin_symbol: token,
            amount: Number(event.data_decoded.amount) / 10 ** token_decimal(token),
            raw_share: event.data_decoded.u64_padding.pop(),
        });
    })
    .onEventRefundEvent((event, ctx) => {
        let token = parse_token(event.data_decoded.token.name);

        ctx.eventLogger.emit("Refund", {
            distinctId: event.data_decoded.signer,
            coin_symbol: token,
            amount: Number(event.data_decoded.amount) / 10 ** token_decimal(token),
        });
    })
    .onEventDeliveryEvent(async (event, ctx) => {
        let b_token = parse_token(event.data_decoded.b_token.name);
        let o_token = parse_token(event.data_decoded.o_token.name);

        let bidder_bid_value = Number(event.data_decoded.bidder_bid_value) / 10 ** token_decimal(b_token);
        let bidder_fee = Number(event.data_decoded.bidder_fee) / 10 ** token_decimal(b_token);
        let delivery_price = Number(event.data_decoded.delivery_price) / 10 ** token_decimal(b_token);
        let delivery_size = Number(event.data_decoded.delivery_size) / 10 ** token_decimal(o_token);
        let incentive_bid_value = Number(event.data_decoded.incentive_bid_value) / 10 ** token_decimal(b_token);
        let incentive_fee = Number(event.data_decoded.incentive_fee) / 10 ** token_decimal(b_token);
        let depositor_incentive_value = Number(event.data_decoded.depositor_incentive_value) / 10 ** token_decimal(b_token);

        ctx.meter.Counter("totalBidderFee").add(bidder_fee + incentive_fee, {
            index: event.data_decoded.index.toString(),
            coin_symbol: b_token,
        });
        ctx.meter.Gauge("deliveryPremium").record(bidder_bid_value + bidder_fee + incentive_bid_value + incentive_fee, {
            index: event.data_decoded.index.toString(),
            coin_symbol: b_token,
        });
        ctx.meter.Gauge("deliveryPrice").record(delivery_price, {
            index: event.data_decoded.index.toString(),
            coin_symbol: b_token,
        });
        ctx.meter.Gauge("deliverySize").record(delivery_size, {
            index: event.data_decoded.index.toString(),
            coin_symbol: o_token,
        });

        // const price_o_token = await getPriceByType(ChainId.SUI_MAINNET, "0x" + event.data_decoded.o_token.name, ctx.timestamp);

        // if (price_o_token) {
        //     ctx.meter
        //         .Gauge("deliverySizeUSD")
        //         .record((Number(event.data_decoded.delivery_size) * price_o_token) / 10 ** token_decimal(o_token), {
        //             index: event.data_decoded.index.toString(),
        //             coin_symbol: o_token,
        //         });
        // }

        // const price_b_token = await getPriceByType(ChainId.SUI_MAINNET, "0x" + event.data_decoded.b_token.name, ctx.timestamp);

        // if (price_b_token) {
        //     ctx.meter.Gauge("premiumUSD").record((bidder_bid_value + bidder_fee + incentive_bid_value + incentive_fee) * price_b_token, {
        //         index: event.data_decoded.index.toString(),
        //         coin_symbol: b_token,
        //     });
        // }

        ctx.eventLogger.emit("Delivery", {
            index: event.data_decoded.index,
            b_token: b_token,
            o_token: o_token,
            distinctId: event.data_decoded.signer,
            round: event.data_decoded.round,
            delivery_price: delivery_price,
            delivery_size: delivery_size,
            bidder_bid_value: bidder_bid_value,
            bidder_fee: bidder_fee,
            incentive_bid_value: incentive_bid_value,
            incentive_fee: incentive_fee,
            depositor_incentive_value: depositor_incentive_value,
        });
    })
    .onEventNewBidEvent((event, ctx) => {
        let b_token = parse_token(event.data_decoded.b_token.name);
        let o_token = parse_token(event.data_decoded.o_token.name);

        ctx.meter.Counter("totalNewBid").add(Number(event.data_decoded.size) / 10 ** token_decimal(o_token), {
            index: event.data_decoded.index.toString(),
            coin_symbol: o_token,
        });

        ctx.eventLogger.emit("NewBid", {
            distinctId: event.data_decoded.signer,
            index: event.data_decoded.index,
            b_token,
            o_token,
            bid_index: event.data_decoded.bid_index,
            price: Number(event.data_decoded.price) / 10 ** token_decimal(b_token),
            size: Number(event.data_decoded.size) / 10 ** token_decimal(o_token),
            bidder_balance: Number(event.data_decoded.bidder_balance) / 10 ** token_decimal(b_token),
            incentive_balance: Number(event.data_decoded.incentive_balance) / 10 ** token_decimal(b_token),
            ts_ms: event.data_decoded.ts_ms,
        });
    })
    .onEventSettleEvent((event, ctx) => {
        let d_token = parse_token(event.data_decoded.d_token.name);

        ctx.eventLogger.emit("Settle", {
            index: event.data_decoded.index,
            d_token,
            distinctId: event.data_decoded.signer,
            round: event.data_decoded.round,
            oracle_price: Number(event.data_decoded.oracle_price) / 10 ** Number(event.data_decoded.oracle_price_decimal),
            share_price: Number(event.data_decoded.share_price) / 10 ** 8,
            settle_balance: Number(event.data_decoded.settle_balance) / 10 ** Number(event.data_decoded.d_token_decimal),
            settled_balance: Number(event.data_decoded.settled_balance) / 10 ** Number(event.data_decoded.d_token_decimal),
        });
    })
    .onEventNewAuctionEvent((event, ctx) => {
        ctx.eventLogger.emit("NewAuction", {
            index: event.data_decoded.index,
            distinctId: event.data_decoded.signer,
            round: event.data_decoded.round,
            start_ts_ms: event.data_decoded.start_ts_ms,
            end_ts_ms: event.data_decoded.end_ts_ms,
            size: event.data_decoded.size,
            oracle_info: event.data_decoded.oracle_info,
            strike_bps: event.data_decoded.vault_config.payoff_configs.map((config) => config.strike_bp?.toString()).join("   "),
            strikes: event.data_decoded.vault_config.payoff_configs.map((config) => config.strike?.toString()).join("   "),
            weights: event.data_decoded.vault_config.payoff_configs.map((config) => config.weight).join("   "),
            is_buyers: event.data_decoded.vault_config.payoff_configs.map((config) => config.is_buyer).join("   "),
            strike_increment: event.data_decoded.vault_config.strike_increment,
            decay_speed: event.data_decoded.vault_config.decay_speed,
            initial_price: event.data_decoded.vault_config.initial_price,
            final_price: event.data_decoded.vault_config.final_price,
        });
    });

function parse_token(name: string): string {
    let typeArgs = name.split("::");
    switch (normalizeSuiAddress(typeArgs[0])) {
        case "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881":
            return "BTC";
        case "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5":
            return "ETH";
        case "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf":
            return "USDC";
        case "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c":
            return "USDT";
        case "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8":
            return "SOL";
        case "0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a":
            return "TURBOS";
        case "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37":
            return "APT";
        default:
            return typeArgs[2];
    }
}

function token_decimal(token: string): number {
    switch (token) {
        case "SUI":
            return 9;
        case "BTC":
            return 8;
        case "ETH":
            return 8;
        case "USDC":
            return 6;
        case "USDT":
            return 6;
        case "CETUS":
            return 9;
        case "SOL":
            return 8;
        case "TURBOS":
            return 9;
        case "APT":
            return 8;
        default:
            return 9;
    }
}

const SINGLE_DEPOSIT_VAULT_REGISTRY = "0xd67cf93a0df61b4b3bbf6170511e0b28b21578d9b87a8f4adafec96322dd284d";

SuiWrappedObjectProcessor.bind({
    network: SuiNetwork.MAIN_NET,
    startCheckpoint,
    objectId: SINGLE_DEPOSIT_VAULT_REGISTRY,
}).onTimeInterval(
    async (objects, ctx) => {
        ctx.meter.Gauge("num_of_vaults").record(objects.length);

        // @ts-ignore
        const ids = objects.map((object) => object.fields.value);

        if (ids.length > 0) {
            const res = await ctx.client.multiGetObjects({
                ids,
                options: { showType: true, showContent: true },
            });

            for (const object of res) {
                // @ts-ignore
                const fields = object.data?.content?.fields;
                const index = fields.index.toString();
                const deposit_token = parse_token("0x" + fields.deposit_token.fields.name);
                const bid_token = parse_token("0x" + fields.bid_token.fields.name);

                ctx.meter.Gauge("active_share_supply").record(Number(fields.active_share_supply) / 10 ** token_decimal(deposit_token), {
                    index,
                    coin_symbol: deposit_token,
                });
                ctx.meter
                    .Gauge("deactivating_share_supply")
                    .record(Number(fields.deactivating_share_supply) / 10 ** token_decimal(deposit_token), {
                        index,
                        coin_symbol: deposit_token,
                    });
                ctx.meter.Gauge("inactive_share_supply").record(Number(fields.inactive_share_supply) / 10 ** token_decimal(deposit_token), {
                    index,
                    coin_symbol: deposit_token,
                });
                ctx.meter.Gauge("warmup_share_supply").record(Number(fields.warmup_share_supply) / 10 ** token_decimal(deposit_token), {
                    index,
                    coin_symbol: deposit_token,
                });
                ctx.meter.Gauge("premium_share_supply").record(Number(fields.premium_share_supply) / 10 ** token_decimal(bid_token), {
                    index,
                    coin_symbol: deposit_token,
                });
            }
        }
    },
    60,
    60,
    undefined,
    { owned: true }
);
