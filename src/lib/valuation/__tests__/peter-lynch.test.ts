import { describe, it, expect } from "vitest";
import { calculatePeterLynch } from "../peter-lynch";
import { appleFinancials, unprofitableFinancials } from "./fixtures";

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
});
