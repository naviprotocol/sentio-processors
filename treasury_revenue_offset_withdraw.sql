/* =============================================================
   Daily treasury revenue (USD) – withdraw offset version
   -------------------------------------------------------------
   Key change: Offset withdrawal dates by +1 day to match
   balance changes that occur the following day
   ============================================================ */

/* ---------- 1) Daily treasury balance changes ------ */
WITH day_start AS (
    SELECT
        toDate(timestamp) AS date,
        lowerUTF8(trimBoth(token)) AS token,
        argMin(treasuryBalance * currentSupplyIndex, timestamp) AS start_bal
    FROM indexNumberEventV2
    WHERE env = 'mainnet'
      AND timestamp >= now() - INTERVAL 50 DAY
      AND timestamp < now()
      AND treasuryBalance IS NOT NULL
    GROUP BY date, token
),

/* ---------- 2) Day-over-day balance changes ------ */
day_delta AS (
    SELECT
        date,
        token,
        start_bal - lag(start_bal, 1, start_bal) 
            OVER (PARTITION BY token ORDER BY date) AS delta_token
    FROM day_start
),

/* ---------- 3) Withdrawals with +1 day offset ------ */
daily_withdrawals AS (
    SELECT
        toDate(timestamp) + INTERVAL 1 DAY AS date,  -- 关键改动：+1天
        lowerUTF8(trimBoth(coin_symbol)) AS token,
        sumDistinct(amount_normalized) AS withdrawal_token
    FROM WithdrawTreasuryV2
    WHERE env = 'mainnet'
      AND timestamp >= now() - INTERVAL 51 DAY  -- 扩大范围以覆盖偏移
      AND timestamp < now() - INTERVAL 1 DAY    -- 排除最后一天避免未来日期
    GROUP BY date, token
),

/* ---------- 4) Merge balance changes and offset withdrawals ------ */
daily_net_income AS (
    SELECT
        coalesce(d.date, w.date) AS date,
        coalesce(d.token, w.token) AS token,
        ifNull(d.delta_token, 0) + ifNull(w.withdrawal_token, 0) AS net_daily_income
    FROM day_delta d
    FULL JOIN daily_withdrawals w
           ON d.date = w.date
          AND d.token = w.token
),

/* ---------- 5) Latest token prices ------ */
latest_token_prices AS (
    SELECT
        lowerUTF8(trimBoth(symbol)) AS token,
        argMax(price, updated_at) AS latest_price
    FROM token.prices
    WHERE updated_at >= now() - INTERVAL 50 DAY
    GROUP BY token
)

/* ---------- 6) Final result ------ */
SELECT
    n.date,
    round(sum(n.net_daily_income * ifNull(p.latest_price, 0)), 6) AS total_revenue_usd
FROM daily_net_income n
LEFT JOIN latest_token_prices p USING (token)
GROUP BY n.date
ORDER BY n.date DESC; 