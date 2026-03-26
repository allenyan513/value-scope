---
paths:
  - "src/lib/data/**"
---

# FMP API Notes

- Uses `/stable/` endpoints (legacy `/api/v3` deprecated after 2025-08-31)
- **Plan**: Starter ($19/mo) — 300 req/min, 5 years historical, US coverage, annual fundamentals
- `limit=5` for all financial statement and analyst estimate endpoints
- Ticker passed as `?symbol=` query param (not path param)

## Field Name Gotchas
- `/stable/key-metrics` uses `earningsYield`/`evToEBITDA` (NOT `peRatio`/`enterpriseValueOverEBITDA`)
- Use `/stable/ratios` for `priceToEarningsRatio`, `priceToSalesRatio`, `priceToBookRatio`
- `/stable/search` returns empty on Starter plan — use `/stable/profile` with exact ticker as fallback
- `/stable/sector-pe-ratio` returns empty array (not available on stable API)

## Rate Limiting
- `seedSingleCompany()` uses sequential calls with 300ms delay
- Cron adds 3s between companies

## ADR Currency Conversion
- `seedSingleCompany()` detects `reportedCurrency` from FMP income statements
- Non-USD financials are converted to USD at ingestion via `getFXRateToUSD()` + `convertFinancialToUSD()`
- FX rate stored on `companies.fx_rate_to_usd` for auditability
- Fallback rates in `fmp-fx.ts` cover 23 currencies; FMP live forex is primary source

## Analyst Estimates
- Daily cron fetches from FMP `getAnalystEstimates()` → `analyst_estimates` table
- Real-time fallback: if empty when computing valuation, fetches on demand and persists

## Starter Plan Endpoint Limitations
These endpoints exist in the stable API but return **empty arrays** on the Starter plan:
- `/analyst-stock-recommendations` — buy/hold/sell ratings (empty `[]`)
- `/upgrades-downgrades` — analyst rating changes (empty `[]`)
- `/earnings-calendar?symbol=X` — returns ALL companies, not filtered by symbol on Starter
- `/sector-pe-ratio` — not available on stable API

Code handles all of these with `.catch(() => null)` fallbacks. Components check for null/empty and skip rendering. No user-visible errors.
