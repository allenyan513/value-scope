/**
 * Shared test fixtures for valuation module tests.
 * Modeled after real Mag 7 data patterns.
 */
import type { FinancialStatement, Company, AnalystEstimate, PeerComparison, HistoricalMultiplesPoint } from "@/types";

// --- Apple-like company ---
export const appleCompany: Company = {
  ticker: "TEST",
  name: "Test Corp",
  sector: "Technology",
  industry: "Consumer Electronics",
  market_cap: 3_000_000_000_000,
  beta: 1.2,
  price: 200,
  shares_outstanding: 15_000_000_000,
  exchange: "NASDAQ",
  description: "Test company",
  logo_url: "",
  updated_at: "2025-01-01T00:00:00Z",
};

export const appleFinancials: FinancialStatement[] = [
  makeFinancial(2025, { revenue: 400e9, net_income: 100e9, ebitda: 140e9, eps: 6.67, eps_diluted: 6.67 }),
  makeFinancial(2024, { revenue: 380e9, net_income: 95e9, ebitda: 135e9, eps: 6.33, eps_diluted: 6.33 }),
  makeFinancial(2023, { revenue: 360e9, net_income: 90e9, ebitda: 128e9, eps: 6.00, eps_diluted: 6.00 }),
  makeFinancial(2022, { revenue: 350e9, net_income: 85e9, ebitda: 120e9, eps: 5.67, eps_diluted: 5.67 }),
  makeFinancial(2021, { revenue: 320e9, net_income: 75e9, ebitda: 110e9, eps: 5.00, eps_diluted: 5.00 }),
];

export const testEstimates: AnalystEstimate[] = [
  { ticker: "TEST", period: "2026", revenue_estimate: 420e9, eps_estimate: 7.0, revenue_low: 400e9, revenue_high: 440e9, eps_low: 6.5, eps_high: 7.5, number_of_analysts: 30 },
  { ticker: "TEST", period: "2027", revenue_estimate: 445e9, eps_estimate: 7.4, revenue_low: 420e9, revenue_high: 470e9, eps_low: 6.8, eps_high: 8.0, number_of_analysts: 25 },
];

export const testPeers: PeerComparison[] = [
  { ticker: "PEER1", name: "Peer One", market_cap: 2e12, trailing_pe: 25, forward_pe: 22, ev_ebitda: 20, price_to_book: 12, price_to_sales: 8, revenue_growth: 0.08, net_margin: 0.22, roe: 0.35 },
  { ticker: "PEER2", name: "Peer Two", market_cap: 1.5e12, trailing_pe: 30, forward_pe: 27, ev_ebitda: 25, price_to_book: 15, price_to_sales: 10, revenue_growth: 0.12, net_margin: 0.18, roe: 0.28 },
  { ticker: "PEER3", name: "Peer Three", market_cap: 1e12, trailing_pe: 22, forward_pe: 20, ev_ebitda: 18, price_to_book: 8, price_to_sales: 6, revenue_growth: 0.05, net_margin: 0.25, roe: 0.40 },
];

// --- Company with negative earnings ---
export const unprofitableCompany: Company = {
  ...appleCompany,
  ticker: "LOSS",
  name: "Loss Corp",
  industry: "Software",
};

export const unprofitableFinancials: FinancialStatement[] = [
  makeFinancial(2025, { revenue: 50e9, net_income: -5e9, ebitda: -2e9, eps: -0.5, eps_diluted: -0.5 }),
  makeFinancial(2024, { revenue: 40e9, net_income: -8e9, ebitda: -5e9, eps: -0.8, eps_diluted: -0.8 }),
];

// --- Historical multiples for 2 years of daily data ---
export function generateHistoricalMultiples(
  days: number,
  basePE: number,
  baseEVEBITDA?: number,
): HistoricalMultiplesPoint[] {
  const result: HistoricalMultiplesPoint[] = [];
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Add some variance
    const noise = Math.sin(i / 30) * 0.15 + Math.cos(i / 60) * 0.1;
    result.push({
      date: date.toISOString().split("T")[0],
      pe: Math.round((basePE * (1 + noise)) * 100) / 100,
      ev_ebitda: baseEVEBITDA ? Math.round((baseEVEBITDA * (1 + noise * 0.7)) * 100) / 100 : null,
    });
  }
  return result;
}

// --- Helper to build FinancialStatement ---
export function makeFinancial(
  year: number,
  overrides: Partial<FinancialStatement>
): FinancialStatement {
  const revenue = overrides.revenue ?? 100e9;
  const netIncome = overrides.net_income ?? 20e9;

  return {
    ticker: "TEST",
    period: `FY${year}`,
    period_type: "annual",
    fiscal_year: year,
    fiscal_quarter: null,
    revenue,
    cost_of_revenue: revenue * 0.55,
    gross_profit: revenue * 0.45,
    sga_expense: revenue * 0.1,
    rnd_expense: revenue * 0.08,
    operating_income: revenue * 0.25,
    interest_expense: 2e9,
    income_before_tax: netIncome * 1.25,
    income_tax: netIncome * 0.25,
    net_income: netIncome,
    ebitda: overrides.ebitda ?? revenue * 0.3,
    eps: overrides.eps ?? netIncome / 15e9,
    eps_diluted: overrides.eps_diluted ?? netIncome / 15e9,
    total_assets: revenue * 3,
    total_liabilities: revenue * 1.5,
    total_equity: revenue * 1.5,
    total_debt: 100e9,
    cash_and_equivalents: 50e9,
    net_debt: 50e9,
    accounts_receivable: revenue * 0.1,
    accounts_payable: revenue * 0.08,
    inventory: revenue * 0.03,
    operating_cash_flow: netIncome * 1.3,
    capital_expenditure: -revenue * 0.04,
    free_cash_flow: netIncome * 1.1,
    depreciation_amortization: revenue * 0.05,
    dividends_paid: -netIncome * 0.2,
    tax_rate: 0.21,
    gross_margin: 0.45,
    operating_margin: 0.25,
    net_margin: netIncome / revenue,
    shares_outstanding: 15_000_000_000,
  };
}
