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

  it("should assign model weights for all 6 models", () => {
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);

    expect(result.model_weights).toBeDefined();
    // All 6 active models should have weight keys
    expect(result.model_weights).toHaveProperty("dcf_3stage");
    expect(result.model_weights).toHaveProperty("dcf_pe_exit_10y");
    expect(result.model_weights).toHaveProperty("dcf_ebitda_exit_fcfe_10y");
    expect(result.model_weights).toHaveProperty("pe_multiples");
    expect(result.model_weights).toHaveProperty("ev_ebitda_multiples");
    expect(result.model_weights).toHaveProperty("peg");
    // Weights should sum to 1.0
    const total = Object.values(result.model_weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
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
    { model_type: "dcf_3stage", fair_value: 100, low_estimate: 80, high_estimate: 120 },
    { model_type: "dcf_pe_exit_10y", fair_value: 110, low_estimate: 90, high_estimate: 130 },
    { model_type: "dcf_ebitda_exit_fcfe_10y", fair_value: 105, low_estimate: 85, high_estimate: 125 },
    { model_type: "pe_multiples", fair_value: 150, low_estimate: 130, high_estimate: 170 },
    { model_type: "ev_ebitda_multiples", fair_value: 120, low_estimate: 100, high_estimate: 140 },
    { model_type: "peg", fair_value: 80, low_estimate: 60, high_estimate: 100 },
  ];

  it("should compute weighted average consensus across all 6 models", () => {
    const weights = {
      dcf_3stage: 0.20,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.20,
      ev_ebitda_multiples: 0.15,
      peg: 0.25,
    };

    const result = computeWeightedConsensus(models, weights);

    // (100×0.20 + 110×0.10 + 105×0.10 + 150×0.20 + 120×0.15 + 80×0.25) = 20+11+10.5+30+18+20 = 109.5
    expect(result.consensus).toBeCloseTo(109.5, 0);
    expect(result.modelContributions).toHaveLength(6);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(0);
  });

  it("should skip models with fair_value <= 0 (N/A)", () => {
    const modelsWithNA = [
      ...models.slice(0, 5),
      { model_type: "peg", fair_value: 0, low_estimate: 0, high_estimate: 0 },
    ];
    const weights = {
      dcf_3stage: 0.20,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.20,
      ev_ebitda_multiples: 0.15,
      peg: 0.25,
    };

    const result = computeWeightedConsensus(modelsWithNA, weights);

    // peg should be skipped, weights renormalized
    expect(result.modelContributions).toHaveLength(5);
    expect(result.consensus).toBeGreaterThan(0);
  });

  it("should return zero consensus when all models are N/A", () => {
    const naModels = [
      { model_type: "dcf_3stage", fair_value: 0, low_estimate: 0, high_estimate: 0 },
      { model_type: "pe_multiples", fair_value: 0, low_estimate: 0, high_estimate: 0 },
    ];

    const result = computeWeightedConsensus(naModels, {
      dcf_3stage: 0.5,
      pe_multiples: 0.5,
    });

    expect(result.consensus).toBe(0);
    expect(result.modelContributions).toHaveLength(0);
  });

  it("should normalize weights when some models are skipped", () => {
    const weights = {
      dcf_3stage: 0.5,
      pe_multiples: 0.5,
      ev_ebitda_multiples: 0, // zero weight
    };

    const result = computeWeightedConsensus(models, weights);

    // Only dcf_3stage and PE contribute
    expect(result.modelContributions).toHaveLength(2);
    const totalNormalizedWeight = result.modelContributions.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    expect(totalNormalizedWeight).toBeCloseTo(1, 5);
  });

  it("should handle empty models array", () => {
    const result = computeWeightedConsensus([], { dcf_3stage: 1 });
    expect(result.consensus).toBe(0);
  });
});
