---
paths:
  - "src/lib/valuation/**"
  - "src/components/valuation/**"
---

# Valuation Models

6 models in `src/lib/valuation/`, organized in 3 pillars:

### DCF (3 models)
1. **DCF 3-Stage Perpetual Growth 10Y** — 10Y projection (Y1–5 analyst, Y6–10 fade), Gordon Growth TV. Primary DCF model.
2. **DCF P/E Exit 10Y** — TV = Year 10 Net Income × 5Y avg P/E.
3. **DCF EV/EBITDA Exit 10Y** — TV = Year 10 EBITDA × 5Y avg EV/EBITDA − net debt.

### Trading Multiples (2 models)
4. **P/E** — Historical 5Y avg P/E × TTM EPS (falls back to peer median when < 100 data points)
5. **EV/EBITDA** — Historical 5Y avg EV/EBITDA × EBITDA → equity per share (same fallback)

### PEG (1 model)
6. **PEG Fair Value** (`src/lib/valuation/peg.ts`) — Fair Value = (EPS Growth + Div Yield) × 100 × NTM EPS. Growth: forward analyst EPS CAGR (≥3 analysts), fallback historical EPS CAGR. Clamped 8%–25%.

## Consensus Strategies

Three switchable strategies in `src/lib/valuation/summary.ts`, controlled by `DEFAULT_CONSENSUS_STRATEGY` in `constants.ts`:

| Strategy | Default | How it works |
|---|---|---|
| `dcf_primary` | **Yes** | Uses DCF Perpetual Growth 10Y fair value directly. Other models shown for reference. |
| `median` | | Three-tier: median within each pillar, then median of 3 pillar values. |
| `weighted` | | Archetype-based weights from `company-classifier.ts` with outlier penalties. |

Users can switch strategies via `?strategy=median` query param on the summary page. The `StrategySwitcher` dropdown is rendered in the page header.

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

## Trading Multiples
- Both multiples (P/E, EV/EBITDA) use the same pattern: historical self-comparison (5Y avg), peer fallback (<100 data points)
- Shared logic in `historical-multiples.ts`
- Low/High estimates use p25/p75 of historical distribution
- Trading Multiples detail page (`trading-multiples/data.ts`) computes its own consensus independently
