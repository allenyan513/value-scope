# ValuScope TODO

## Data Quality Audit (2026-03-26)

> Scope: 503 S&P 500 tickers × 9 models. 502/503 have valuations. 73 model-level extreme outliers.

### Bug #1: DCF 3-Stage Double Debt Subtraction (CRITICAL) ✅
- [x] **22 tickers** with near-zero DCF fair values
- **Root cause**: `dcf-3stage.ts:452` — `calculateDCF3StageEBITDAExit()` subtracts net debt twice:
  1. Line 445: `terminalEquity = terminalEV - netDebt` (EV→Equity, correct)
  2. Line 452: `equityValue = pvFCFETotal + pvTerminalValue + cashAndEquivalents - totalDebt` (double-counts!)
- Effect: `equityValue = pvFCFE + terminalEV + 2×cash - 2×debt` → negative → clamped to 0
- Examples: TSN ($0.10 vs $63), DIS ($0.52 vs $95), MCHP ($0.80 vs $65), CVNA ($4 vs $301)
- **Fix**: Line 452 → `equityValue = pvFCFETotal + pvTerminalValue` (debt already in terminal equity)

### Bug #2: ADR Currency Mismatch in DCF/PEG (CRITICAL) ✅
- [x] TSM (TWD) and NVO (DKK) DCF/PEG fair values appear in local currency
- **Root cause found**: On-demand estimate fallback in `/api/valuation/[ticker]/route.ts` was NOT applying FX conversion (unlike daily-update and refresh-estimates crons). Fixed.
- **Note**: DB financials/estimates are correctly FX-converted. Stored valuations are stale and will auto-fix on next cron run or `?refresh=true`.
- Examples: TSM dcf_3stage=$10,063 (expect ~$312), NVO peg=$520 (expect ~$75)

### Bug #3: Trading Multiples Extreme Overvaluations (HIGH) ✅
- [x] ~16 tickers with P/S or P/B fair value >10x price
- **Root cause**: Both crons didn't pass `historicalMultiples` → ALL tickers fell to peer-based. Tiny peer groups (2 for "Auto-Manufacturers") dominated by TSLA's P/S ~15.
- **Fix**: Added `getPriceHistory()` + `computeHistoricalMultiples()` to both crons. DB-only.

### Bug #4: Growth Stock Systematic Undervaluation (MEDIUM)
- [ ] Our median FV is 0.07x–0.48x of analyst consensus for mega-cap tech
- Likely model calibration, not code bug. Growth clamping (MAX_GROWTH_RATE=30%), conservative terminal values.
- Examples: TSLA 0.07x, PLTR 0.11x, NVDA 0.32x, AAPL 0.44x vs analyst targets

### Bug #5: Orphaned Model Types in DB (LOW)
- [ ] 17 stale rows from deprecated models (dcf_growth_exit_5y, forward_pe, ev_ebit, etc.)
- Fix: DELETE FROM valuations WHERE model_type NOT IN (9 current models)

### Bug #6: ASML Missing All Valuations (LOW)
- [ ] EUR-reporting ADR, $512B market cap, no valuations/financials/estimates in DB
- Likely ingestion pipeline failure

---

## Previous Bugs
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
