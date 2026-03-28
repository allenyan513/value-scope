import { describe, it, expect } from "vitest";
import { computeFullValuation } from "../summary";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  testPeers,
  generateHistoricalMultiples,
} from "./fixtures";

const BASE_INPUTS = {
  company: appleCompany,
  historicals: appleFinancials,
  estimates: testEstimates,
  peers: testPeers,
  currentPrice: 200,
  riskFreeRate: 0.04,
  historicalMultiples: generateHistoricalMultiples(500, 28, 20, 40, 8, 25),
};

const MEDIAN_INPUTS = { ...BASE_INPUTS, consensusStrategy: "median" as const };

describe("computeFullValuation — dcf_primary strategy (default)", () => {
  it("should default to dcf_primary strategy", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.consensus_strategy).toBe("dcf_primary");
  });

  it("should use FCFF Growth Exit 5Y fair value as consensus", () => {
    const result = computeFullValuation(BASE_INPUTS);
    const fcffModel = result.models.find(m => m.model_type === "dcf_fcff_growth_5y");
    expect(fcffModel).toBeDefined();
    expect(result.consensus_fair_value).toBe(fcffModel!.fair_value);
  });

  it("should use FCFF Growth Exit 5Y range as consensus range", () => {
    const result = computeFullValuation(BASE_INPUTS);
    const fcffModel = result.models.find(m => m.model_type === "dcf_fcff_growth_5y");
    expect(result.consensus_low).toBe(fcffModel!.low_estimate);
    expect(result.consensus_high).toBe(fcffModel!.high_estimate);
  });

  it("should set primary model to dcf_fcff_growth_5y", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.consensus_primary_model).toBe("dcf_fcff_growth_5y");
  });

  it("should have no consensus_adjustments", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.consensus_adjustments).toEqual([]);
  });

  it("should still populate pillars for display", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.pillars.dcf.models.length).toBeGreaterThanOrEqual(1);
    expect(result.pillars.tradingMultiples.models.length).toBe(2);
    expect(result.pillars.peg.models.length).toBe(1);
  });
});

describe("computeFullValuation — median strategy", () => {
  it("should use median strategy when specified", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    expect(result.consensus_strategy).toBe("median");
  });

  it("should populate pillars with DCF, Trading Multiples, and PEG", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    const { pillars } = result;

    expect(pillars.dcf.models.length).toBeGreaterThanOrEqual(1);
    expect(pillars.dcf.models.length).toBeLessThanOrEqual(5);
    pillars.dcf.models.forEach(m => {
      expect(m.model_type).toMatch(/^dcf_/);
    });

    expect(pillars.tradingMultiples.models.length).toBe(2);

    expect(pillars.peg.models.length).toBe(1);
    expect(pillars.peg.models[0].model_type).toBe("peg");
  });

  it("should compute pillar fair values as median of child models", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    const { pillars } = result;

    const dcfValues = pillars.dcf.models
      .filter(m => m.fair_value > 0)
      .map(m => m.fair_value)
      .sort((a, b) => a - b);

    if (dcfValues.length > 0) {
      const mid = Math.floor(dcfValues.length / 2);
      const expectedMedian = dcfValues.length % 2 !== 0
        ? dcfValues[mid]
        : (dcfValues[mid - 1] + dcfValues[mid]) / 2;
      expect(pillars.dcf.fairValue).toBeCloseTo(expectedMedian, 0);
    }
  });

  it("should compute final consensus as median of pillar fair values", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    const { pillars } = result;

    const pillarValues = [
      pillars.dcf.fairValue,
      pillars.tradingMultiples.fairValue,
      pillars.peg.fairValue,
    ].filter(v => v > 0).sort((a, b) => a - b);

    expect(pillarValues.length).toBeGreaterThanOrEqual(1);

    const mid = Math.floor(pillarValues.length / 2);
    const expectedMedian = pillarValues.length % 2 !== 0
      ? pillarValues[mid]
      : (pillarValues[mid - 1] + pillarValues[mid]) / 2;

    expect(result.consensus_fair_value).toBeCloseTo(expectedMedian, 0);
  });

  it("should have no consensus_adjustments in median mode", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    expect(result.consensus_adjustments).toEqual([]);
  });

  it("should have empty consensus_primary_model in median mode", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    expect(result.consensus_primary_model).toBe("");
  });

  it("should compute correct upside values for pillars", () => {
    const result = computeFullValuation(MEDIAN_INPUTS);
    const { pillars, current_price } = result;

    for (const key of ["dcf", "tradingMultiples", "peg"] as const) {
      const pillar = pillars[key];
      if (pillar.fairValue > 0) {
        const expectedUpside = ((pillar.fairValue - current_price) / current_price) * 100;
        expect(pillar.upside).toBeCloseTo(expectedUpside, 1);
      }
    }
  });
});

describe("computeFullValuation — weighted strategy", () => {
  it("should use weighted consensus when strategy is set", () => {
    const result = computeFullValuation({
      ...BASE_INPUTS,
      consensusStrategy: "weighted",
    });
    expect(result.consensus_strategy).toBe("weighted");
  });

  it("should have non-empty consensus_primary_model in weighted mode", () => {
    const result = computeFullValuation({
      ...BASE_INPUTS,
      consensusStrategy: "weighted",
    });
    expect(result.consensus_primary_model).toBeTruthy();
  });

  it("should still populate pillars in weighted mode", () => {
    const result = computeFullValuation({
      ...BASE_INPUTS,
      consensusStrategy: "weighted",
    });
    expect(result.pillars.dcf.models.length).toBeGreaterThanOrEqual(1);
    expect(result.pillars.tradingMultiples.models.length).toBe(2);
    expect(result.pillars.peg.models.length).toBe(1);
  });
});

describe("computeFullValuation — cross-strategy comparison", () => {
  it("all three strategies should produce valid positive fair values", () => {
    const dcf = computeFullValuation(BASE_INPUTS);
    const median = computeFullValuation(MEDIAN_INPUTS);
    const weighted = computeFullValuation({ ...BASE_INPUTS, consensusStrategy: "weighted" });

    expect(dcf.consensus_fair_value).toBeGreaterThan(0);
    expect(median.consensus_fair_value).toBeGreaterThan(0);
    expect(weighted.consensus_fair_value).toBeGreaterThan(0);
  });

  it("dcf_primary and median may differ but both should be reasonable", () => {
    const dcf = computeFullValuation(BASE_INPUTS);
    const median = computeFullValuation(MEDIAN_INPUTS);

    // Both should be within 3x of each other
    const ratio = dcf.consensus_fair_value / median.consensus_fair_value;
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(3.0);
  });
});

describe("computeFullValuation — shared behavior", () => {
  it("should run all 7 models (4 DCF + 2 multiples + PEG — some may be N/A)", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.models.length).toBeGreaterThanOrEqual(4);
  });

  it("should set verdict based on consensus upside", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(["undervalued", "fairly_valued", "overvalued"]).toContain(result.verdict);
    expect(result.verdict_text).toBeTruthy();
  });

  it("should include classification in all strategies", () => {
    const result = computeFullValuation(BASE_INPUTS);
    expect(result.classification.archetype).toBeTruthy();
    expect(result.classification.label).toBeTruthy();
  });
});
