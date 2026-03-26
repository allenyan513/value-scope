import { describe, it, expect } from "vitest";
import { convertFinancialToUSD, convertEstimateToUSD } from "@/lib/data/fx-convert";

describe("convertFinancialToUSD", () => {
  const baseRow = {
    ticker: "NVO",
    period: "2024",
    period_type: "annual" as const,
    fiscal_year: 2024,
    fiscal_quarter: null,
    revenue: 290_403_000_000, // DKK
    cost_of_revenue: 70_000_000_000,
    gross_profit: 220_403_000_000,
    sga_expense: 50_000_000_000,
    rnd_expense: 30_000_000_000,
    operating_income: 140_000_000_000,
    interest_expense: 5_000_000_000,
    income_before_tax: 135_000_000_000,
    income_tax: 34_000_000_000,
    net_income: 100_988_000_000,
    ebitda: 150_000_000_000,
    eps: 22.63,
    eps_diluted: 22.63,
    shares_outstanding: 4_460_000_000,
    total_assets: 400_000_000_000,
    total_liabilities: 200_000_000_000,
    total_equity: 200_000_000_000,
    total_debt: 80_000_000_000,
    cash_and_equivalents: 50_000_000_000,
    net_debt: 30_000_000_000,
    accounts_receivable: 40_000_000_000,
    accounts_payable: 30_000_000_000,
    inventory: 60_000_000_000,
    operating_cash_flow: 120_000_000_000,
    capital_expenditure: -20_000_000_000,
    free_cash_flow: 100_000_000_000,
    depreciation_amortization: 10_000_000_000,
    dividends_paid: -40_000_000_000,
    tax_rate: 0.252,
    gross_margin: 0.759,
    operating_margin: 0.482,
    net_margin: 0.348,
  };

  it("returns unchanged row when fxRate is 1.0", () => {
    const result = convertFinancialToUSD(baseRow, 1.0);
    expect(result).toEqual(baseRow);
  });

  it("converts monetary fields by fxRate", () => {
    const fxRate = 0.145; // 1 DKK = $0.145
    const result = convertFinancialToUSD(baseRow, fxRate);

    // Monetary fields should be multiplied
    expect(result.revenue).toBeCloseTo(290_403_000_000 * fxRate);
    expect(result.net_income).toBeCloseTo(100_988_000_000 * fxRate);
    expect(result.eps).toBeCloseTo(22.63 * fxRate);
    expect(result.eps_diluted).toBeCloseTo(22.63 * fxRate);
    expect(result.total_assets).toBeCloseTo(400_000_000_000 * fxRate);
    expect(result.free_cash_flow).toBeCloseTo(100_000_000_000 * fxRate);
    expect(result.capital_expenditure).toBeCloseTo(-20_000_000_000 * fxRate);
    expect(result.dividends_paid).toBeCloseTo(-40_000_000_000 * fxRate);
  });

  it("preserves ratio fields (margins, tax_rate)", () => {
    const result = convertFinancialToUSD(baseRow, 0.145);

    expect(result.tax_rate).toBe(0.252);
    expect(result.gross_margin).toBe(0.759);
    expect(result.operating_margin).toBe(0.482);
    expect(result.net_margin).toBe(0.348);
  });

  it("preserves share counts", () => {
    const result = convertFinancialToUSD(baseRow, 0.145);
    expect(result.shares_outstanding).toBe(4_460_000_000);
  });

  it("preserves non-financial fields", () => {
    const result = convertFinancialToUSD(baseRow, 0.145);
    expect(result.ticker).toBe("NVO");
    expect(result.period).toBe("2024");
    expect(result.fiscal_year).toBe(2024);
  });

  it("handles zero values without conversion", () => {
    const rowWithZeros = { ...baseRow, inventory: 0, rnd_expense: 0 };
    const result = convertFinancialToUSD(rowWithZeros, 0.145);
    expect(result.inventory).toBe(0);
    expect(result.rnd_expense).toBe(0);
  });

  it("handles partial rows (Partial<FinancialStatement>)", () => {
    const partial = { ticker: "NVO", revenue: 1000, net_income: 500 };
    const result = convertFinancialToUSD(partial, 2.0);
    expect(result.revenue).toBe(2000);
    expect(result.net_income).toBe(1000);
    expect(result.ticker).toBe("NVO");
  });
});

describe("convertEstimateToUSD", () => {
  const baseEstimate = {
    ticker: "NVO",
    period: "2025",
    revenue_estimate: 350_000_000_000,
    eps_estimate: 25.0,
    revenue_low: 320_000_000_000,
    revenue_high: 380_000_000_000,
    eps_low: 22.0,
    eps_high: 28.0,
    number_of_analysts: 30,
  };

  it("returns unchanged when fxRate is 1.0", () => {
    const result = convertEstimateToUSD(baseEstimate, 1.0);
    expect(result).toEqual(baseEstimate);
  });

  it("converts monetary estimate fields", () => {
    const fxRate = 0.145;
    const result = convertEstimateToUSD(baseEstimate, fxRate);

    expect(result.revenue_estimate).toBeCloseTo(350_000_000_000 * fxRate);
    expect(result.eps_estimate).toBeCloseTo(25.0 * fxRate);
    expect(result.revenue_low).toBeCloseTo(320_000_000_000 * fxRate);
    expect(result.revenue_high).toBeCloseTo(380_000_000_000 * fxRate);
    expect(result.eps_low).toBeCloseTo(22.0 * fxRate);
    expect(result.eps_high).toBeCloseTo(28.0 * fxRate);
  });

  it("preserves non-monetary fields", () => {
    const result = convertEstimateToUSD(baseEstimate, 0.145);
    expect(result.ticker).toBe("NVO");
    expect(result.period).toBe("2025");
    expect(result.number_of_analysts).toBe(30);
  });
});
