# ValuScope TODO

## Bugs
- [ ] Peter Lynch Fair Value 数据异常 — AAPL 算出 $37.30（Growth 4.3% 被 clamp 到 5%），GOOGL 算出 $160.25。需要排查：1) Net Income CAGR 计算是否正确（AAPL 近年 net income 波动大，4Y CAGR 仅 4.3% 是否合理）；2) 公式是否应该用 EPS growth 而非 Net Income growth；3) Clamp 范围 5%-25% 是否合理（导致 AAPL 这种低增长高利润公司结果失真）

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
