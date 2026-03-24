# ValuScope TODO

## Features
- [ ] Stripe Price IDs configuration, domain setup
- [ ] Summary card redesign
- [ ] Relative Valuation: populate Forward P/E + Forward EV/EBITDA columns from analyst estimates
- [ ] Terminal value improvement: normalize terminal FCFE, two-stage terminal, exit multiple cross-check

## Refactoring Backlog (do when touching the file)

### File Splits (>300 lines)
- [ ] `types/index.ts` (328 lines) → split into `types/company.ts`, `types/valuation.ts`, `types/financial.ts`
- [ ] `fmp.ts` (433 lines) → split by domain: `fmp-financials.ts`, `fmp-prices.ts`, `fmp-estimates.ts`
- [ ] `trading-multiples.ts` (417 lines) → consider splitting P/E and EV/EBITDA if adding new models
- [ ] `queries.ts` (330 lines) → split by domain: `queries-company.ts`, `queries-valuation.ts`, `queries-prices.ts`
- [ ] `estimate-chart.tsx` (366 lines) → extract sub-components (revenue chart, EPS chart, accuracy section)

### Unused Code Cleanup
- [ ] `fred.ts` — `getTreasuryYieldHistory()` exported but never called
- [ ] `fmp.ts` — `getEnterpriseValue()` exported but never called
- [ ] `dcf.ts` / `dcf-legacy.ts` — deprecated `DCFInputs`, `calculateDCFGrowthExit`, `calculateDCFEBITDAExit` (remove when confirmed no DB references)
- [ ] 6 unused components: `wacc-card.tsx`, `tv-breakdown.tsx`, `dcf-tabs.tsx`, `football-field-chart.tsx`, `analyst-estimates-table.tsx`, `multiples-history-chart.tsx`
