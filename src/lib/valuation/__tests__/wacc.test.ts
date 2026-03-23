import { describe, it, expect } from "vitest";
import { calculateWACC, buildWACCInputs, type WACCInputs } from "../wacc";
import { appleFinancials } from "./fixtures";

describe("calculateWACC", () => {
  const baseInputs: WACCInputs = {
    beta: 1.2,
    riskFreeRate: 0.0425,
    totalDebt: 100e9,
    marketCap: 3000e9,
    interestExpense: 3e9,
    taxRate: 0.21,
  };

  it("should compute CAPM cost of equity correctly", () => {
    const result = calculateWACC(baseInputs);
    // Ke = Rf + β × ERP = 0.0425 + 1.2 × 0.055 = 0.1085
    expect(result.cost_of_equity).toBeCloseTo(0.1085, 4);
  });

  it("should compute cost of debt as interest/debt", () => {
    const result = calculateWACC(baseInputs);
    // Kd = 3B / 100B = 0.03
    expect(result.cost_of_debt).toBeCloseTo(0.03, 4);
  });

  it("should compute capital structure weights", () => {
    const result = calculateWACC(baseInputs);
    // D = 100B, E = 3000B, Total = 3100B
    expect(result.debt_weight).toBeCloseTo(100 / 3100, 4);
    expect(result.equity_weight).toBeCloseTo(3000 / 3100, 4);
    expect(result.debt_weight + result.equity_weight).toBeCloseTo(1, 10);
  });

  it("should compute WACC correctly", () => {
    const result = calculateWACC(baseInputs);
    // WACC = Ke × E_w + Kd × (1-tax) × D_w
    const expected =
      0.1085 * (3000 / 3100) + 0.03 * (1 - 0.21) * (100 / 3100);
    expect(result.wacc).toBeCloseTo(expected, 4);
  });

  it("should cap cost of debt at 15%", () => {
    const result = calculateWACC({
      ...baseInputs,
      interestExpense: 50e9, // 50B / 100B = 50% → capped at 15%
    });
    expect(result.cost_of_debt).toBe(0.15);
  });

  it("should floor WACC at 5%", () => {
    const result = calculateWACC({
      ...baseInputs,
      beta: 0.3,
      riskFreeRate: 0.01,
      totalDebt: 0,
      marketCap: 1000e9,
    });
    expect(result.wacc).toBeGreaterThanOrEqual(0.05);
  });

  it("should cap WACC at 25%", () => {
    const result = calculateWACC({
      ...baseInputs,
      beta: 5.0,
      riskFreeRate: 0.15,
      additionalRiskPremium: 0.1,
    });
    expect(result.wacc).toBeLessThanOrEqual(0.25);
  });

  it("should handle zero debt (all-equity company)", () => {
    const result = calculateWACC({
      ...baseInputs,
      totalDebt: 0,
      interestExpense: 0,
    });
    expect(result.cost_of_debt).toBe(0);
    expect(result.debt_weight).toBe(0);
    expect(result.equity_weight).toBe(1);
    // WACC should equal cost of equity
    expect(result.wacc).toBeCloseTo(result.cost_of_equity, 4);
  });

  it("should use investment grade fallback when debt exists but no interest", () => {
    const result = calculateWACC({
      ...baseInputs,
      interestExpense: 0,
    });
    // Fallback = Rf + 1.5% = 0.0425 + 0.015 = 0.0575
    expect(result.cost_of_debt).toBeCloseTo(0.0575, 4);
  });

  it("should include additional risk premium", () => {
    const result = calculateWACC({
      ...baseInputs,
      additionalRiskPremium: 0.02,
    });
    // Ke = 0.0425 + 1.2 × 0.055 + 0.02 = 0.1285
    expect(result.cost_of_equity).toBeCloseTo(0.1285, 4);
  });
});

describe("buildWACCInputs", () => {
  it("should extract inputs from financial statements", () => {
    const fin = appleFinancials[0]; // FY2025
    const inputs = buildWACCInputs(fin, 1.2, 0.0425, 3000e9);

    expect(inputs.beta).toBe(1.2);
    expect(inputs.riskFreeRate).toBe(0.0425);
    expect(inputs.marketCap).toBe(3000e9);
    expect(inputs.totalDebt).toBe(100e9);
    expect(inputs.interestExpense).toBe(2e9);
    expect(inputs.taxRate).toBe(0.21);
  });

  it("should floor beta at 0.3", () => {
    const fin = appleFinancials[0];
    const inputs = buildWACCInputs(fin, 0.1, 0.04, 1000e9);
    expect(inputs.beta).toBe(0.3);
  });

  it("should clamp tax rate to [0.05, 0.45]", () => {
    const fin = { ...appleFinancials[0], tax_rate: 0.8 };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    // tax_rate 0.8 is > 0.5 so it tries to compute from financials
    // income_tax / income_before_tax = 25e9 / 125e9 = 0.2
    expect(inputs.taxRate).toBeGreaterThanOrEqual(0.05);
    expect(inputs.taxRate).toBeLessThanOrEqual(0.45);
  });

  it("should default to 21% tax when data is unavailable", () => {
    const fin = {
      ...appleFinancials[0],
      tax_rate: 0,
      income_before_tax: 0,
      income_tax: 0,
    };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    expect(inputs.taxRate).toBe(0.21);
  });

  it("should handle negative total debt gracefully", () => {
    const fin = { ...appleFinancials[0], total_debt: -50e9 };
    const inputs = buildWACCInputs(fin, 1.0, 0.04, 1000e9);
    expect(inputs.totalDebt).toBe(0);
  });
});
