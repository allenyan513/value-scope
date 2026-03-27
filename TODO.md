# ValuScope TODO

## Bugs

### Bug #4: Growth Stock Systematic Undervaluation (MEDIUM) — Known Limitation
- [ ] Our median FV is 0.07x–0.48x of analyst consensus for mega-cap tech
- **Root cause**: NOT a code bug — intentional conservative model choices:
  1. **PEG ceiling**: `GROWTH_CEILING = 25%` → max fair P/E = 25x. TSLA trades at P/E 100x.
  2. **DCF Stage 2 fade**: Growth fades linearly from Y5 to terminal over 5 years. Aggressive for NVDA 100%+ growers.
  3. **High growth capex**: TSLA factory-building capex consumes most net income, leaving tiny FCFE.
- Possible future calibration:
  - Archetype-aware PEG ceiling (35% for high_growth vs 25% for mature)
  - Slower Stage 2 fade for high-growth archetype (10 years instead of 5)
- Examples: TSLA 0.07x, PLTR 0.11x, NVDA 0.32x, AAPL 0.44x vs analyst targets

### Bug #6: ASML Missing All Valuations (LOW)
- [ ] EUR-reporting ADR, $512B market cap, no valuations/financials/estimates in DB
- Likely ingestion pipeline failure

---

## Features
- [ ] Stripe Price IDs configuration, domain setup

---

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
