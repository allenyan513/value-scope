import { describe, it, expect } from "vitest";
import { classifyCompany, computeWeightedConsensus, PRIMARY_MODEL_MAP } from "../company-classifier";
import type { CompanyArchetype } from "../company-classifier";
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

  it("should assign 0.40 weight to primary model for each archetype", () => {
    // Verify the weight table matches PRIMARY_MODEL_MAP
    const result = classifyCompany(appleCompany, appleFinancials, testEstimates);
    const primaryModel = PRIMARY_MODEL_MAP[result.archetype as CompanyArchetype];
    expect(result.model_weights[primaryModel]).toBe(0.40);
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

  const weights = {
    dcf_3stage: 0.15,
    dcf_pe_exit_10y: 0.08,
    dcf_ebitda_exit_fcfe_10y: 0.07,
    pe_multiples: 0.15,
    ev_ebitda_multiples: 0.15,
    peg: 0.40,
  };

  it("should compute weighted average consensus across all 6 models", () => {
    const result = computeWeightedConsensus(models, weights, "profitable_growth");

    expect(result.consensus).toBeGreaterThan(0);
    expect(result.modelContributions).toHaveLength(6);
    expect(result.low).toBeGreaterThan(0);
    expect(result.high).toBeGreaterThan(0);
    expect(result.primaryModel).toBe("peg");
    expect(result.adjustments).toBeDefined();
  });

  it("should return correct primaryModel for each archetype", () => {
    const archetypes: CompanyArchetype[] = [
      "high_growth", "profitable_growth", "mature_stable", "dividend_payer",
      "cyclical", "turnaround", "asset_heavy", "loss_making",
    ];
    for (const arch of archetypes) {
      const result = computeWeightedConsensus(models, weights, arch);
      expect(result.primaryModel).toBe(PRIMARY_MODEL_MAP[arch]);
    }
  });

  it("should skip models with fair_value <= 0 (N/A)", () => {
    const modelsWithNA = [
      ...models.slice(0, 5),
      { model_type: "peg", fair_value: 0, low_estimate: 0, high_estimate: 0 },
    ];

    const result = computeWeightedConsensus(modelsWithNA, weights, "mature_stable");

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
    }, "mature_stable");

    expect(result.consensus).toBe(0);
    expect(result.modelContributions).toHaveLength(0);
  });

  it("should normalize weights when some models are skipped", () => {
    const sparseWeights = {
      dcf_3stage: 0.5,
      pe_multiples: 0.5,
      ev_ebitda_multiples: 0, // zero weight
    };

    const result = computeWeightedConsensus(models, sparseWeights, "mature_stable");

    // Only dcf_3stage and PE contribute
    expect(result.modelContributions).toHaveLength(2);
    const totalNormalizedWeight = result.modelContributions.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    expect(totalNormalizedWeight).toBeCloseTo(1, 5);
  });

  it("should handle empty models array", () => {
    const result = computeWeightedConsensus([], { dcf_3stage: 1 }, "mature_stable");
    expect(result.consensus).toBe(0);
  });

  // --- Outlier penalty tests ---

  it("should halve weight when model deviates >50% from median", () => {
    // Models clustered around 100, one outlier at 170 (70% above median ~105)
    const modelsWithOutlier = [
      { model_type: "dcf_3stage", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "dcf_pe_exit_10y", fair_value: 105, low_estimate: 85, high_estimate: 125 },
      { model_type: "dcf_ebitda_exit_fcfe_10y", fair_value: 110, low_estimate: 90, high_estimate: 130 },
      { model_type: "pe_multiples", fair_value: 170, low_estimate: 150, high_estimate: 190 },
      { model_type: "ev_ebitda_multiples", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "peg", fair_value: 95, low_estimate: 75, high_estimate: 115 },
    ];

    const evenWeights = {
      dcf_3stage: 0.15, dcf_pe_exit_10y: 0.15, dcf_ebitda_exit_fcfe_10y: 0.15,
      pe_multiples: 0.15, ev_ebitda_multiples: 0.15, peg: 0.25,
    };

    const result = computeWeightedConsensus(modelsWithOutlier, evenWeights, "mature_stable");

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].model).toBe("pe_multiples");
    expect(result.adjustments[0].adjustedWeight).toBeCloseTo(0.15 * 0.5, 5);
    expect(result.adjustments[0].reason).toContain("halved");
  });

  it("should quarter weight when model deviates >100% from median", () => {
    // Models clustered around 100, one extreme outlier at 220 (>100% above median)
    const modelsWithExtreme = [
      { model_type: "dcf_3stage", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "dcf_pe_exit_10y", fair_value: 105, low_estimate: 85, high_estimate: 125 },
      { model_type: "dcf_ebitda_exit_fcfe_10y", fair_value: 95, low_estimate: 75, high_estimate: 115 },
      { model_type: "pe_multiples", fair_value: 220, low_estimate: 200, high_estimate: 240 },
      { model_type: "ev_ebitda_multiples", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "peg", fair_value: 110, low_estimate: 90, high_estimate: 130 },
    ];

    const evenWeights = {
      dcf_3stage: 0.15, dcf_pe_exit_10y: 0.15, dcf_ebitda_exit_fcfe_10y: 0.15,
      pe_multiples: 0.15, ev_ebitda_multiples: 0.15, peg: 0.25,
    };

    const result = computeWeightedConsensus(modelsWithExtreme, evenWeights, "mature_stable");

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].model).toBe("pe_multiples");
    expect(result.adjustments[0].adjustedWeight).toBeCloseTo(0.15 * 0.25, 5);
    expect(result.adjustments[0].reason).toContain("quartered");
  });

  it("should not penalize models within 50% of median", () => {
    // All models between 80 and 120 — all within 50% of median (~100)
    const tightModels = [
      { model_type: "dcf_3stage", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "dcf_pe_exit_10y", fair_value: 110, low_estimate: 90, high_estimate: 130 },
      { model_type: "dcf_ebitda_exit_fcfe_10y", fair_value: 95, low_estimate: 75, high_estimate: 115 },
      { model_type: "pe_multiples", fair_value: 120, low_estimate: 100, high_estimate: 140 },
      { model_type: "ev_ebitda_multiples", fair_value: 105, low_estimate: 85, high_estimate: 125 },
      { model_type: "peg", fair_value: 90, low_estimate: 70, high_estimate: 110 },
    ];

    const result = computeWeightedConsensus(tightModels, weights, "mature_stable");

    expect(result.adjustments).toHaveLength(0);
  });

  it("should not apply outlier penalty with fewer than 3 valid models", () => {
    // Only 2 models — outlier detection not meaningful
    const twoModels = [
      { model_type: "dcf_3stage", fair_value: 100, low_estimate: 80, high_estimate: 120 },
      { model_type: "pe_multiples", fair_value: 300, low_estimate: 250, high_estimate: 350 },
    ];

    const result = computeWeightedConsensus(twoModels, {
      dcf_3stage: 0.5,
      pe_multiples: 0.5,
    }, "mature_stable");

    expect(result.adjustments).toHaveLength(0);
    expect(result.consensus).toBeCloseTo(200, 0);
  });

  it("should work without archetype parameter (backwards compatibility)", () => {
    const result = computeWeightedConsensus(models, weights);

    expect(result.consensus).toBeGreaterThan(0);
    expect(result.primaryModel).toBe("");
  });
});
