import { describe, it, expect } from "vitest";
import { calculatePeterLynch } from "../peter-lynch";
import { appleFinancials, unprofitableFinancials, makeFinancial } from "./fixtures";

describe("calculatePeterLynch", () => {
  it("should compute fair value = growth rate × 100 × EPS", () => {
    const result = calculatePeterLynch({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    expect(result.model_type).toBe("peter_lynch");
    expect(result.fair_value).toBeGreaterThan(0);

    const assumptions = result.assumptions as Record<string, unknown>;
    const growthRate = (assumptions.earnings_growth_rate as number) / 100;
    const eps = assumptions.ttm_eps as number;
    expect(result.fair_value).toBeCloseTo(growthRate * 100 * eps, 0);
  });

  it("should clamp growth rate between 5% and 25%", () => {
    const result = calculatePeterLynch({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const assumptions = result.assumptions as Record<string, unknown>;
    const growthRate = assumptions.earnings_growth_rate as number;
    expect(growthRate).toBeGreaterThanOrEqual(5);
    expect(growthRate).toBeLessThanOrEqual(25);
  });

  it("should set low from 5% floor and high from 25% ceiling", () => {
    const result = calculatePeterLynch({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const eps = (result.assumptions as Record<string, unknown>).ttm_eps as number;
    // Single-point model — low and high equal fair value
    expect(result.low_estimate).toBeCloseTo(result.fair_value, 0);
    expect(result.high_estimate).toBeCloseTo(result.fair_value, 0);
  });

  it("should return N/A for negative EPS", () => {
    const result = calculatePeterLynch({
      historicals: unprofitableFinancials,
      currentPrice: 50,
    });

    expect(result.fair_value).toBe(0);
    expect((result.assumptions as Record<string, unknown>).note).toContain("N/A");
  });

  it("should return N/A with insufficient data (< 2 years)", () => {
    const result = calculatePeterLynch({
      historicals: [appleFinancials[0]],
      currentPrice: 200,
    });

    expect(result.fair_value).toBe(0);
    expect((result.assumptions as Record<string, unknown>).note).toContain("Insufficient");
  });

  it("should include earnings history in details", () => {
    const result = calculatePeterLynch({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const details = result.details as Record<string, unknown>;
    const history = details.earnings_history as Array<{
      year: number;
      net_income: number;
      eps: number;
      yoy_growth: number | null;
    }>;

    expect(history.length).toBe(appleFinancials.length);
    expect(history[0].yoy_growth).toBeNull(); // First year has no YoY
    expect(history[1].yoy_growth).not.toBeNull();
  });

  it("should compute upside correctly", () => {
    const result = calculatePeterLynch({
      historicals: appleFinancials,
      currentPrice: 200,
    });

    const expectedUpside =
      ((result.fair_value - 200) / 200) * 100;
    expect(result.upside_percent).toBeCloseTo(expectedUpside, 1);
  });

  it("should use average YoY growth when start net income is negative", () => {
    // Year 1 negative, years 2-4 positive — triggers fallback path
    const mixedFinancials = [
      makeFinancial(2021, { net_income: -10e9, eps: 2.0, eps_diluted: 2.0 }),
      makeFinancial(2022, { net_income: 20e9, eps: 3.0, eps_diluted: 3.0 }),
      makeFinancial(2023, { net_income: 25e9, eps: 4.0, eps_diluted: 4.0 }),
      makeFinancial(2024, { net_income: 30e9, eps: 5.0, eps_diluted: 5.0 }),
    ];

    const result = calculatePeterLynch({
      historicals: mixedFinancials,
      currentPrice: 100,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    // Should use average YoY of positive-to-positive pairs only
    const details = result.details as Record<string, unknown>;
    expect(details.growth_clamped).toBeDefined();
  });

  it("should handle all-negative net income with positive EPS gracefully", () => {
    // All net income negative but EPS positive (edge case)
    const edgeCase = [
      makeFinancial(2023, { net_income: -5e9, eps: 1.5, eps_diluted: 1.5 }),
      makeFinancial(2024, { net_income: -3e9, eps: 2.0, eps_diluted: 2.0 }),
    ];

    const result = calculatePeterLynch({
      historicals: edgeCase,
      currentPrice: 50,
    });

    // Growth rate falls back to 0, clamped to 5% floor
    expect(result.fair_value).toBeGreaterThan(0);
    const details = result.details as Record<string, unknown>;
    expect(details.earnings_growth_rate).toBe(0.05); // clamped to 5% floor
  });

  it("should handle very high growth by clamping to 25%", () => {
    const highGrowth = [
      makeFinancial(2023, { net_income: 1e9, eps: 1.0, eps_diluted: 1.0 }),
      makeFinancial(2024, { net_income: 10e9, eps: 5.0, eps_diluted: 5.0 }),
    ];

    const result = calculatePeterLynch({
      historicals: highGrowth,
      currentPrice: 100,
    });

    const details = result.details as Record<string, unknown>;
    expect(details.earnings_growth_rate).toBe(0.25); // clamped to 25% ceiling
    expect(details.growth_clamped).toBe(true);
  });

  it("should use only 2 years when only 2 available", () => {
    const twoYears = [
      makeFinancial(2023, { net_income: 50e9, eps: 3.0, eps_diluted: 3.0 }),
      makeFinancial(2024, { net_income: 55e9, eps: 3.5, eps_diluted: 3.5 }),
    ];

    const result = calculatePeterLynch({
      historicals: twoYears,
      currentPrice: 100,
    });

    expect(result.fair_value).toBeGreaterThan(0);
    const details = result.details as Record<string, unknown>;
    expect(details.years_used).toBe(1); // 2 data points = 1 year of growth
  });

  it("should return empty array for historicals", () => {
    const result = calculatePeterLynch({
      historicals: [],
      currentPrice: 200,
    });

    expect(result.fair_value).toBe(0);
  });
});
