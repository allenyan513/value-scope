// ============================================================
// WACC (Weighted Average Cost of Capital) Calculator
// ============================================================

import type { WACCResult, FinancialStatement } from "@/types";

// Default Equity Risk Premium (Damodaran implied ERP, updated 2025-01)
// Source: https://pages.stern.nyu.edu/~adamodar/
// Review annually — Damodaran publishes updated estimates each January
const DEFAULT_ERP = 0.045;

export interface WACCInputs {
  /** Company beta (from FMP or calculated) */
  beta: number;
  /** Risk-free rate (10Y Treasury yield, decimal) */
  riskFreeRate: number;
  /** Equity Risk Premium (decimal, default 5.5%) */
  erp?: number;
  /** Additional risk premium for small cap, etc. (decimal) */
  additionalRiskPremium?: number;
  /** Total debt */
  totalDebt: number;
  /** Market cap (equity value) */
  marketCap: number;
  /** Interest expense (annual) */
  interestExpense: number;
  /** Effective tax rate (decimal, e.g., 0.21) */
  taxRate: number;
}

/**
 * Build WACC inputs from financial data and market data
 */
export function buildWACCInputs(
  financials: FinancialStatement,
  beta: number,
  riskFreeRate: number,
  marketCap: number
): WACCInputs {
  // Effective tax rate: use actual, with fallback and bounds
  let taxRate = financials.tax_rate;
  if (!taxRate || taxRate <= 0 || taxRate > 0.5) {
    // Try computing from financials
    if (financials.income_before_tax > 0 && financials.income_tax > 0) {
      taxRate = financials.income_tax / financials.income_before_tax;
    } else {
      taxRate = 0.21; // US corporate default
    }
  }
  // Clamp to reasonable range
  taxRate = Math.max(0.05, Math.min(0.45, taxRate));

  // Bloomberg Adjusted Beta: mean-reversion toward 1.0 (Blume, 1971)
  // Improves forward-looking beta prediction for DCF discount rates
  const adjustedBeta = 0.67 * beta + 0.33 * 1.0;

  return {
    beta: Math.max(0.3, adjustedBeta),
    riskFreeRate,
    totalDebt: Math.max(0, financials.total_debt || 0),
    marketCap,
    interestExpense: Math.abs(financials.interest_expense || 0),
    taxRate,
  };
}

/**
 * Calculate WACC
 */
export function calculateWACC(inputs: WACCInputs): WACCResult {
  const {
    beta,
    riskFreeRate,
    erp = DEFAULT_ERP,
    additionalRiskPremium = 0,
    totalDebt,
    marketCap,
    interestExpense,
    taxRate,
  } = inputs;

  // Cost of Equity (CAPM)
  const costOfEquity = riskFreeRate + beta * erp + additionalRiskPremium;

  // Cost of Debt
  let costOfDebt = 0;
  if (totalDebt > 0 && interestExpense > 0) {
    costOfDebt = interestExpense / totalDebt;
    // Cap at reasonable range
    costOfDebt = Math.min(costOfDebt, 0.15);
  } else if (totalDebt > 0) {
    // No interest expense data — assume investment grade rate
    costOfDebt = riskFreeRate + 0.015;
  }

  // Capital structure weights
  const totalCapital = totalDebt + marketCap;
  const debtWeight = totalCapital > 0 ? totalDebt / totalCapital : 0;
  const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 1;

  // WACC
  const wacc =
    costOfEquity * equityWeight +
    costOfDebt * (1 - taxRate) * debtWeight;

  // Floor at 5%, cap at 25%
  const clampedWACC = Math.max(0.05, Math.min(0.25, wacc));

  return {
    wacc: clampedWACC,
    cost_of_equity: costOfEquity,
    cost_of_debt: costOfDebt,
    risk_free_rate: riskFreeRate,
    beta,
    erp,
    additional_risk_premium: additionalRiskPremium,
    tax_rate: taxRate,
    debt_weight: debtWeight,
    equity_weight: equityWeight,
    total_debt: totalDebt,
    total_equity: marketCap,
  };
}
