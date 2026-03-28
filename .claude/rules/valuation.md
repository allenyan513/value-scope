---
paths:
  - "src/lib/valuation/**"
  - "src/components/valuation/**"
---

# Valuation Models

9 models in `src/lib/valuation/`, organized in 4 pillars:

### DCF (4 models — all FCFF-based)
1. **FCFF Growth Exit 5Y** — 5Y FCFF projection, Gordon Growth TV.
2. **FCFF Growth Exit 10Y** — 10Y FCFF projection, Gordon Growth TV.
3. **FCFF EBITDA Exit 5Y** — 5Y FCFF projection, peer EV/EBITDA exit multiple TV.
4. **FCFF EBITDA Exit 10Y** — 10Y FCFF projection, peer EV/EBITDA exit multiple TV.

### Trading Multiples (2 models)
5. **P/E** — Historical 5Y avg P/E × TTM EPS (falls back to peer median when < 100 data points)
6. **EV/EBITDA** — Historical 5Y avg EV/EBITDA × EBITDA → equity per share (same fallback)

### PEG (1 model)
7. **PEG Fair Value** (`src/lib/valuation/peg.ts`) — Fair Value = (EPS Growth + Div Yield) × 100 × NTM EPS. Growth: forward analyst EPS CAGR (≥3 analysts), fallback historical EPS CAGR. Clamped 8%–25%.

### EPV (1 model)
8. **Earnings Power Value** (`src/lib/valuation/epv.ts`) — Normalized earnings / WACC, adjusted for excess returns.

## Fair Value
FCFF Growth Exit 5Y is the single source of truth for the headline fair value. All other models are shown on the summary page for reference and cross-validation. No strategy switcher — the approach is fixed.

## DCF Pipeline
- **Revenue**: analyst estimates (5Y) → fade to historical CAGR → fade to 3% GDP growth
- **Net Margin**: derived from analyst EPS × shares / revenue; fades to 5Y historical avg
- **CapEx**: Maintenance (≈ D&A, 20% of revenue growth) + Growth (intensity × revenue increase)
- **Terminal Value**: Gordon Growth or peer EV/EBITDA exit multiple, rate by archetype (profitable_growth=3.5%, mature_stable=3.0%)
- **Sensitivity**: 5×5 matrix of Discount Rate × Terminal Growth (or Exit Multiple)

## WACC
- Cost of Equity = Risk-free rate (10Y Treasury from FRED) + Beta × ERP (4.5% default)
- Cost of Debt = Interest Expense / Total Debt
- Terminal Growth Rate: dynamic by archetype (2.5%–4.0%), defined in `company-classifier.ts`

## Trading Multiples
- Both multiples (P/E, EV/EBITDA) use the same pattern: historical self-comparison (5Y avg), peer fallback (<100 data points)
- Shared logic in `historical-multiples.ts`
- Low/High estimates use p25/p75 of historical distribution
- Trading Multiples detail page (`trading-multiples/data.ts`) computes its own consensus independently
