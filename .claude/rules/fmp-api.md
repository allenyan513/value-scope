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
- Seed Mag 7 only: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config src/lib/data/seed-mag7.ts`

## Analyst Estimates
- Daily cron fetches from FMP `getAnalystEstimates()` → `analyst_estimates` table
- Real-time fallback: if empty when computing valuation, fetches on demand and persists
