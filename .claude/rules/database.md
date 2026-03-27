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
- `valuation_history` snapshots are written fire-and-forget on each page visit
- ISR caches the rendered page for 1 hour; crons bust the cache after updating prices/estimates
