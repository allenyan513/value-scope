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
- `revalidatePath("/${ticker}", "layout")` called from: update-prices cron, refresh-estimates cron, valuation API
- Ensures pages reflect DB updates immediately (no 1-hour stale wait)

## Valuation Computation
- Valuations are computed **lazily on page visit** via `getCoreTickerData()` → `computeFullValuation()`, NOT by a batch cron
- No `valuations` or `valuation_history` tables — results are ephemeral, cached only as ISR HTML (1 hour)
- Crons bust the ISR cache after updating prices/estimates → next visitor triggers fresh computation
- Chart history uses daily_prices + EMA synthetic intrinsic value (no stored valuation snapshots)
