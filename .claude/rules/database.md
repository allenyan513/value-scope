---
paths:
  - "src/lib/db/**"
  - "src/app/api/**"
---

# Database & API Notes

## On-Demand Stock Provisioning
- Unknown ticker → `<TickerPending>` component → `/api/provision/[ticker]`
- Provision: `seedSingleCompany()` (~3s) → `computeFullValuation()` → `revalidatePath()`
- Client polls every 3s, on "ready" calls `router.refresh()`
- Only tickers matching `TICKER_REGEX` accepted (supports BRK-B style)
- `data_requests` table enqueued as cron backup

## ISR Cache Invalidation
- `revalidatePath("/${ticker}", "layout")` called from: provision API, daily cron, valuation API
- Ensures pages reflect DB updates immediately (no 1-hour stale wait)
