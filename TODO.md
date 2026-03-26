# ValuScope TODO

## Bugs
- [x] PEG Fair Value 重新设计 — 改用 forward EPS CAGR + dividend yield + NTM EPS，growth floor 8%，AAPL $37→$108

## Features
- [ ] Stripe Price IDs configuration, domain setup

## Refactoring Backlog (do when touching the file)

### File Splits (>300 lines)
- [x] `dcf-cards.tsx` — evaluated: 474 lines, single responsibility, tightly coupled state; split would add complexity without benefit
- [x] `types/index.ts` → split into `types/company.ts`, `types/valuation.ts`, `types/financial.ts`
- [x] `fmp.ts` → split into `fmp-core.ts`, `fmp-financials.ts`, `fmp-prices.ts`, `fmp-estimates.ts`, `fmp-multiples.ts`
- [ ] `trading-multiples.ts` (417 lines) → consider splitting P/E and EV/EBITDA if adding new models (deferred: shared helpers make split counterproductive)
- [x] `queries.ts` → split into `queries-company.ts`, `queries-valuation.ts`, `queries-financial.ts`, `queries-prices.ts`, `queries-queue.ts`
- [x] `estimate-chart.tsx` → extracted `estimate-kpi-row.tsx`, `estimate-beat-miss-table.tsx`

### Unused Code Cleanup
- [x] `fred.ts` — removed `getTreasuryYieldHistory()`
- [x] `fmp.ts` — removed `getEnterpriseValue()`
- [x] `dcf-legacy.ts` — deleted entire file (deprecated `DCFInputs`, `calculateDCFGrowthExit`, `calculateDCFEBITDAExit`)
- [x] Deleted 6 unused components: `wacc-card.tsx`, `tv-breakdown.tsx`, `dcf-tabs.tsx`, `football-field-chart.tsx`, `analyst-estimates-table.tsx`, `multiples-history-chart.tsx`

## Performance Optimizations

### P0 — Parallelization (High Impact, Low Risk)
- [ ] Parallelize peer data fetching — `api/valuation/[ticker]/route.ts`, `api/provision/[ticker]/route.ts`, `api/cron/daily-update/route.ts` use sequential `for...of` loop for peer metrics; change to `Promise.all(peers.map(...))`; impact: 5-15 calls × ~300ms → ~600ms total
- [ ] Parallelize valuation upserts — same 3 files; sequential `for (model) { await upsertValuation() }` → `Promise.all(models.map(...))`
- [ ] Parallelize seed FMP API calls — `lib/data/seed.ts`; sequential await + sleep × 3 → `Promise.all()` + single sleep; ~2x faster per ticker
- [ ] Parallelize cron batch price updates — `api/cron/daily-update/route.ts`; sequential `await db.update()` per quote → `Promise.all()` or bulk upsert

### P1 — Reduce Redundant Queries (Medium Impact)
- [ ] Eliminate redundant getCompany() in getIndustryPeers() — `lib/db/queries-company.ts`; callers already have company data, add `getPeersByIndustry(industry, excludeTicker, limit)` variant; saves 1 DB query (~50-100ms)
- [ ] Parallelize watchlist API DB queries — `api/watchlist/route.ts`; two sequential queries (companies, valuations) → `Promise.all()`
- [ ] Extract shared MODEL_NAMES constant — duplicated in `model-card.tsx`, `summary-card.tsx`, `model-card-compact.tsx`; extract to `lib/valuation/model-names.ts`

### P2 — Frontend Optimization (Nice-to-have)
- [ ] Dynamic import for Recharts components — `price-value-chart.tsx`, `estimate-chart.tsx`, `price-targets-summary.tsx`; use `next/dynamic` to defer ~80KB from initial bundle
