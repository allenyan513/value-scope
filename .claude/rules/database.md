---
paths:
  - "src/lib/db/**"
  - "src/app/api/**"
---

# Database & API Notes

## Data Ingestion
- All S&P 500 data is **pre-seeded** via `seedSingleCompany()` — no on-demand provisioning
- Unknown tickers show a static "not currently covered" message (no FMP calls from user visits)
- `seedSingleCompany()` detects `reportedCurrency` from FMP and converts non-USD financials to USD at ingestion

## ISR Cache Invalidation
- `revalidatePath("/${ticker}", "layout")` called from: update-prices cron, refresh-after-earnings cron, valuation API
- Ensures pages reflect DB updates immediately (no 1-hour stale wait)

## Valuation Computation
- Valuations are **pre-computed** by `recomputeValuationsForTickers()` (targeted) or `recomputeAllValuations()` (full) and stored in `valuation_snapshots` table (1 row per ticker, JSONB summary)
- `getCoreTickerData()` and `computeValuationForTicker()` read snapshots first (single DB query, ~5ms), falling back to live computation if snapshot is missing or stale (>25 hours / `SNAPSHOT_MAX_AGE_MS`)
- **Dynamic upside%**: Fair Value is stable (stored in snapshot). Upside% and verdict are recalculated at read time from live `companies.price` via `refreshSummaryWithLivePrice()`. Recompute only runs when financial data changes (after earnings), not daily.
- **Targeted recompute**: `refresh-after-earnings` (7 PM ET) triggers recompute for only earnings-reporting tickers + their peers — not all stocks. Peer expansion reads from `valuation_snapshots.peers` JSONB.
- Chart history uses daily_prices + EMA synthetic intrinsic value (no stored valuation snapshots for charts)
