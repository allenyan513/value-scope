---
paths:
  - "src/lib/valuation/**"
  - "src/components/valuation/**"
---

# Valuation Models

7 models in `src/lib/valuation/`:

1. **DCF FCFE 5Y** — Revenue → Net Margin → FCFE, discounted by Cost of Equity, Gordon Growth terminal value
2. **DCF 3-Stage Perpetual Growth 10Y** — 10Y projection (Y1–5 analyst, Y6–10 fade), Gordon Growth TV. Primary DCF model.
3. **DCF P/E Exit 10Y** — TV = Year 10 Net Income × 5Y avg P/E. Cross-validation only (not in consensus).
4. **DCF EV/EBITDA Exit 10Y** — TV = Year 10 EBITDA × 5Y avg EV/EBITDA − net debt. Cross-validation only.
5. **P/E Multiples** — Historical 5Y avg P/E × TTM EPS (falls back to peer median when < 100 data points)
6. **EV/EBITDA Multiples** — Historical 5Y avg EV/EBITDA × EBITDA → equity per share (same fallback)
7. **Peter Lynch Fair Value** — PEG-based (Growth Rate × 100 × EPS, growth clamped 5%–25%)

## DCF Pipeline
- **Revenue**: analyst estimates (5Y) → fade to historical CAGR → fade to 3% GDP growth
- **Net Margin**: derived from analyst EPS × shares / revenue; fades to 5Y historical avg
- **CapEx**: Maintenance (≈ D&A, 20% of revenue growth) + Growth (intensity × revenue increase)
- **Terminal Value**: Gordon Growth, rate by archetype (profitable_growth=3.5%, mature_stable=3.0%)
- **Sensitivity**: 5×5 matrix of Discount Rate × Terminal Growth

## WACC
- Cost of Equity = Risk-free rate (10Y Treasury from FRED) + Beta × ERP (4.5% default)
- Cost of Debt = Interest Expense / Total Debt
- Terminal Growth Rate: dynamic by archetype (2.5%–4.0%), defined in `company-classifier.ts`

## Relative Valuation
- Only P/E and EV/EBITDA — historical self-comparison (5Y avg), peer fallback (<100 data points)
- Shared logic in `historical-multiples.ts`
- Low/High estimates use p25/p75 of historical distribution
