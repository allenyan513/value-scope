import { describe, it, expect } from "vitest";
import {
  calculateDCF3StagePEExit,
  calculateDCF3StageEBITDAExit,
  type DCFExitMultipleInputs,
} from "../dcf";
import { appleFinancials, testEstimates } from "./fixtures";

const baseInputs: DCFExitMultipleInputs = {
  historicals: appleFinancials,
  estimates: testEstimates,
  costOfEquity: 0.10,
  currentPrice: 200,
  sharesOutstanding: 15_000_000_000,
  cashAndEquivalents: 50e9,
  totalDebt: 100e9,
  terminalGrowthRate: 0.035,
};

describe("calculateDCF3StagePEExit", () => {
  it("should return a valid result with positive fair value when exitPE is provided", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 25 });

    expect(result.model_type).toBe("dcf_pe_exit_10y");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.computed_at).toBeTruthy();
  });

  it("should return zero fair value when no exitPE provided", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs });

    expect(result.model_type).toBe("dcf_pe_exit_10y");
    expect(result.fair_value).toBe(0);
  });

  it("should return zero when exitPE is 0", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 0 });
    expect(result.fair_value).toBe(0);
  });

  it("should produce 10 projection years (3-stage)", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 25 });
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<Record<string, unknown>>;

    expect(projections).toHaveLength(10);
    // First 5 should be stage 1, last 5 stage 2
    expect(projections[0].stage).toBe(1);
    expect(projections[4].stage).toBe(1);
    expect(projections[5].stage).toBe(2);
    expect(projections[9].stage).toBe(2);
  });

  it("should include exit PE in assumptions", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 25 });
    expect(result.assumptions.terminal_method).toBe("pe_exit");
    expect(result.assumptions.exit_pe).toBe(25);
  });

  it("should include sensitivity matrix (Ke × Exit PE)", () => {
    const result = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 25 });
    const details = result.details as Record<string, unknown>;
    const matrix = details.sensitivity_matrix as {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };

    expect(matrix.discount_rate_values).toHaveLength(5);
    expect(matrix.growth_values).toHaveLength(5);
    expect(matrix.prices).toHaveLength(5);
    // Growth values should be exit multiples (around 25), not percentages
    matrix.growth_values.forEach((v) => {
      expect(v).toBeGreaterThan(10);
      expect(v).toBeLessThan(50);
    });
  });

  it("should have higher fair value with higher exit PE", () => {
    const lowPE = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 15 });
    const highPE = calculateDCF3StagePEExit({ ...baseInputs, exitPE: 35 });

    expect(highPE.fair_value).toBeGreaterThan(lowPE.fair_value);
  });
});

describe("calculateDCF3StageEBITDAExit", () => {
  it("should return a valid result with positive fair value when exitEVEBITDA is provided", () => {
    const result = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 15 });

    expect(result.model_type).toBe("dcf_ebitda_exit_fcfe_10y");
    expect(result.fair_value).toBeGreaterThan(0);
    expect(result.computed_at).toBeTruthy();
  });

  it("should return zero fair value when no exitEVEBITDA provided", () => {
    const result = calculateDCF3StageEBITDAExit({ ...baseInputs });
    expect(result.fair_value).toBe(0);
  });

  it("should include ebitda in projections", () => {
    const result = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 15 });
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<{ ebitda?: number }>;

    projections.forEach((p) => {
      expect(p.ebitda).toBeGreaterThan(0);
    });
  });

  it("should include EBITDA margin and exit multiple in assumptions", () => {
    const result = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 15 });
    expect(result.assumptions.terminal_method).toBe("ebitda_exit");
    expect(result.assumptions.exit_ev_ebitda).toBe(15);
    expect(result.assumptions.ebitda_margin).toBeGreaterThan(0);
  });

  it("should have higher fair value with higher exit EV/EBITDA", () => {
    const lowMult = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 10 });
    const highMult = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 20 });

    expect(highMult.fair_value).toBeGreaterThan(lowMult.fair_value);
  });

  it("should produce 10 projection years (3-stage)", () => {
    const result = calculateDCF3StageEBITDAExit({ ...baseInputs, exitEVEBITDA: 15 });
    const projections = (result.details as Record<string, unknown>)
      .projections as Array<Record<string, unknown>>;

    expect(projections).toHaveLength(10);
  });

  it("should clamp fair value at 0 with extreme debt", () => {
    const result = calculateDCF3StageEBITDAExit({
      ...baseInputs,
      exitEVEBITDA: 5,
      totalDebt: 5000e9,
      cashAndEquivalents: 0,
    });
    expect(result.fair_value).toBeGreaterThanOrEqual(0);
  });
});
