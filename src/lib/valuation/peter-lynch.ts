// ============================================================
// Peter Lynch Fair Value Model
// Fair Value = Earnings Growth Rate × TTM EPS
// Growth Rate = 5Y Net Income CAGR (clamped 5%–25%)
// ============================================================

import type { FinancialStatement, ValuationResult } from "@/types";

export interface PeterLynchInputs {
  historicals: FinancialStatement[];
  currentPrice: number;
}

/**
 * Calculate Peter Lynch Fair Value.
 *
 * If TTM EPS is negative, returns N/A result.
 */
export function calculatePeterLynch(
  inputs: PeterLynchInputs
): ValuationResult {
  const { historicals, currentPrice } = inputs;

  // Sort ascending by fiscal year
  const sorted = [...historicals]
    .filter((f) => f.period_type === "annual")
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  // Need at least 2 years of data
  if (sorted.length < 2) {
    return naResult("Insufficient data — need at least 2 years of financials");
  }

  const latestEPS = sorted[sorted.length - 1].eps_diluted || sorted[sorted.length - 1].eps;

  if (!latestEPS || latestEPS <= 0) {
    return naResult("N/A — Negative or zero TTM EPS");
  }

  // Calculate growth rate: CAGR of net income over available years (up to 5)
  const yearsAvailable = Math.min(sorted.length - 1, 5);
  const startIdx = sorted.length - 1 - yearsAvailable;
  const startNetIncome = sorted[startIdx].net_income;
  const endNetIncome = sorted[sorted.length - 1].net_income;

  let growthRate: number;
  if (startNetIncome > 0 && endNetIncome > 0) {
    growthRate = Math.pow(endNetIncome / startNetIncome, 1 / yearsAvailable) - 1;
  } else {
    // Can't compute meaningful CAGR with negative values
    // Use average YoY growth of positive years instead
    const yoyGrowths: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].net_income > 0 && sorted[i - 1].net_income > 0) {
        yoyGrowths.push(
          (sorted[i].net_income - sorted[i - 1].net_income) / sorted[i - 1].net_income
        );
      }
    }
    growthRate = yoyGrowths.length > 0
      ? yoyGrowths.reduce((a, b) => a + b, 0) / yoyGrowths.length
      : 0;
  }

  // Clamp growth rate: 5% minimum, 25% maximum (per Peter Lynch methodology)
  const clampedGrowthRate = Math.max(0.05, Math.min(0.25, growthRate));

  // Fair Value = Growth Rate (as whole number) × EPS
  // Peter Lynch convention: growth rate of 15% means multiply EPS by 15
  const fairPE = clampedGrowthRate * 100;
  const fairValue = fairPE * latestEPS;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Build historical earnings table for display
  const earningsHistory = sorted.map((f, i) => ({
    year: f.fiscal_year,
    net_income: f.net_income,
    eps: f.eps_diluted || f.eps,
    yoy_growth:
      i > 0 && sorted[i - 1].net_income > 0
        ? ((f.net_income - sorted[i - 1].net_income) / sorted[i - 1].net_income) * 100
        : null,
  }));

  return {
    model_type: "peter_lynch",
    fair_value: fairValue,
    upside_percent: upside,
    // Single-point model — no range
    low_estimate: fairValue,
    high_estimate: fairValue,
    assumptions: {
      earnings_growth_rate: Math.round(clampedGrowthRate * 10000) / 100,
      raw_growth_rate: Math.round(growthRate * 10000) / 100,
      ttm_eps: Math.round(latestEPS * 100) / 100,
      years_used: yearsAvailable,
      growth_rate_clamped: growthRate !== clampedGrowthRate,
    },
    details: {
      earnings_growth_rate: clampedGrowthRate,
      raw_growth_rate: growthRate,
      ttm_eps: latestEPS,
      fair_pe: fairPE,
      growth_clamped: growthRate !== clampedGrowthRate,
      years_used: yearsAvailable,
      earnings_history: earningsHistory,
    } as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  };
}

function naResult(note: string): ValuationResult {
  return {
    model_type: "peter_lynch",
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}
