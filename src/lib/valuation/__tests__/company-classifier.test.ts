import { describe, it, expect } from "vitest";
import { classifyCompany, computeWeightedConsensus } from "../company-classifier";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  unprofitableCompany,
  unprofitableFinancials,
} from "./fixtures";

describe("classifyCompany", () => {
  it("should return a valid classification for a profitable growth company", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.archetype).toBeTruthy();
    expect(result.label).toBeTruthy();
    expect(result.description).toBeTruthy();
    expect(result.traits.length).toBeGreaterThan(0);
  });

  it("should assign model weights", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.model_weights).toBeDefined();
    // At least DCF and PE should have weights
    const weights = Object.values(result.model_weights);
    expect(weights.some((w) => w > 0)).toBe(true);
  });

  it("should assign model applicability", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.model_applicability.length).toBeGreaterThan(0);
    result.model_applicability.forEach((ma) => {
      expect(ma.model_type).toBeTruthy();
      expect(typeof ma.applicable).toBe("boolean");
      expect(["high", "medium", "low"]).toContain(ma.confidence);
      expect(["primary", "cross_check", "sanity_check", "not_applicable"]).toContain(ma.role);
    });
  });

  it("should handle unprofitable company", () => {
    const result = classifyCompany(
      unprofitableCompany,
      unprofitableFinancials,
      []
    );

    expect(result.archetype).toBeTruthy();
    // Should classify as loss_making, turnaround, or high_growth
    expect(["loss_making", "turnaround", "high_growth"]).toContain(
      result.archetype
    );
  });

  it("should handle single year of data", () => {
    const result = classifyCompany(
      appleCompany,
      [appleFinancials[0]],
      testEstimates
    );

    expect(result.archetype).toBeTruthy();
    expect(result.model_weights).toBeDefined();
  });
});

describe("computeWeightedConsensus", () => {
  const models = [
    { model_type: "dcf_growth_exit_5y", fair_value: 100, low_estimate: 80, high_estimate: 120 },
    { model_type: "pe_multiples", fair_value: 150, low_estimate: 130, high_estimate: 170 },
    { model_type: "ev_ebitda_multiples", fair_value: 120, low_estimate: 100, high_estimate: 140 },
  ];

  it("should compute weighted average consensus", () => {
    const weights = {
      dcf_growth_exit_5y: 0.5,
      pe_multiples: 0.3,
      ev_ebitda_multiples: 0.2,
    };

    const result = computeWeightedConsensus(models, weights);

    // (100×0.5 + 150×0.3 + 120×0.2) / (0.5+0.3+0.2) = (50+45+24)/1.0 = 119
    expect(result.consensus).toBeCloseTo(119, 0);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(0);
  });

  it("should skip models with fair_value <= 0 (N/A)", () => {
    const modelsWithNA = [
      ...models,
      { model_type: "peter_lynch", fair_value: 0, low_estimate: 0, high_estimate: 0 },
    ];
    const weights = {
      dcf_growth_exit_5y: 0.4,
      pe_multiples: 0.3,
      ev_ebitda_multiples: 0.2,
      peter_lynch: 0.1,
    };

    const result = computeWeightedConsensus(modelsWithNA, weights);

    // peter_lynch should be skipped, weights renormalized
    expect(result.modelContributions).toHaveLength(3);
    expect(result.consensus).toBeGreaterThan(0);
  });

  it("should return zero consensus when all models are N/A", () => {
    const naModels = [
      { model_type: "dcf_growth_exit_5y", fair_value: 0, low_estimate: 0, high_estimate: 0 },
      { model_type: "pe_multiples", fair_value: 0, low_estimate: 0, high_estimate: 0 },
    ];

    const result = computeWeightedConsensus(naModels, {
      dcf_growth_exit_5y: 0.5,
      pe_multiples: 0.5,
    });

    expect(result.consensus).toBe(0);
    expect(result.modelContributions).toHaveLength(0);
  });

  it("should normalize weights when some models are skipped", () => {
    const weights = {
      dcf_growth_exit_5y: 0.5,
      pe_multiples: 0.5,
      ev_ebitda_multiples: 0, // zero weight
    };

    const result = computeWeightedConsensus(models, weights);

    // Only DCF and PE contribute
    expect(result.modelContributions).toHaveLength(2);
    const totalNormalizedWeight = result.modelContributions.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    expect(totalNormalizedWeight).toBeCloseTo(1, 5);
  });

  it("should handle empty models array", () => {
    const result = computeWeightedConsensus([], { dcf_growth_exit_5y: 1 });
    expect(result.consensus).toBe(0);
  });
});
