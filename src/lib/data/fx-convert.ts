// Currency conversion helpers for ADR financial data
// Converts monetary fields from reporting currency to USD at ingestion time.

import type { FinancialStatement } from "@/types";

/**
 * Monetary fields in FinancialStatement that need currency conversion.
 * Excludes: ratios (margins, tax_rate), counts (shares_outstanding),
 * and identifiers (ticker, period, fiscal_year, etc.)
 */
const MONETARY_FIELDS: (keyof FinancialStatement)[] = [
  // Income Statement
  "revenue",
  "cost_of_revenue",
  "gross_profit",
  "sga_expense",
  "rnd_expense",
  "operating_income",
  "interest_expense",
  "income_before_tax",
  "income_tax",
  "net_income",
  "ebitda",
  "eps",
  "eps_diluted",
  // Balance Sheet
  "total_assets",
  "total_liabilities",
  "total_equity",
  "total_debt",
  "cash_and_equivalents",
  "net_debt",
  "accounts_receivable",
  "accounts_payable",
  "inventory",
  // Cash Flow
  "operating_cash_flow",
  "capital_expenditure",
  "free_cash_flow",
  "depreciation_amortization",
  "dividends_paid",
];

/**
 * Convert all monetary fields in a financial statement row from reporting currency to USD.
 * Ratios (margins, tax_rate) and counts (shares_outstanding) are preserved as-is.
 * Returns unchanged if fxRate === 1.0.
 */
export function convertFinancialToUSD<T extends Partial<FinancialStatement>>(
  row: T,
  fxRate: number
): T {
  if (fxRate === 1.0) return row;

  const converted = { ...row };
  for (const field of MONETARY_FIELDS) {
    const value = converted[field];
    if (typeof value === "number" && value !== 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (converted as any)[field] = value * fxRate;
    }
  }
  return converted;
}

/** Estimate fields that need currency conversion */
const ESTIMATE_MONETARY_FIELDS = [
  "revenue_estimate",
  "eps_estimate",
  "revenue_low",
  "revenue_high",
  "eps_low",
  "eps_high",
] as const;

/**
 * Convert monetary fields in an analyst estimate row from reporting currency to USD.
 * Returns unchanged if fxRate === 1.0.
 */
export function convertEstimateToUSD<
  T extends Record<string, unknown>
>(row: T, fxRate: number): T {
  if (fxRate === 1.0) return row;

  const converted = { ...row };
  for (const field of ESTIMATE_MONETARY_FIELDS) {
    const value = converted[field];
    if (typeof value === "number" && value !== 0) {
      (converted as Record<string, unknown>)[field] = value * fxRate;
    }
  }
  return converted;
}
