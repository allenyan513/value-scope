import { describe, it, expect } from "vitest";
import {
  calculatePEMultiples,
  calculatePSMultiples,
  calculatePBMultiples,
} from "../trading-multiples";
import {
  appleCompany,
  appleFinancials,
  testPeers,
  unprofitableCompany,
  unprofitableFinancials,
  generateHistoricalMultiples,
} from "./fixtures";

describe("calculatePEMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should use historical self-comparison when enough data points", () => {
    const history = generateHistoricalMultiples(500, 25, 8, 10);
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("pe_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });

  it("should fall back to peer-based when insufficient history", () => {
    const history = generateHistoricalMultiples(50, 25, 8, 10); // < 100 points
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
  });

  it("should fall back to peer-based when no history provided", () => {
    const result = calculatePEMultiples(baseInputs);

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for negative EPS", () => {
    const result = calculatePEMultiples({
      ...baseInputs,
      financials: unprofitableFinancials[0],
      company: unprofitableCompany,
    });

    expect(result.fair_value).toBe(0);
    expect((result.assumptions as Record<string, unknown>).note).toContain("N/A");
  });

  it("should compute low/high from historical percentiles", () => {
    const history = generateHistoricalMultiples(500, 25, 8, 10);
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
    // Range should be meaningfully different
    expect(result.high_estimate - result.low_estimate).toBeGreaterThan(0);
  });

  it("should include percentile in assumptions when using historical", () => {
    const history = generateHistoricalMultiples(500, 25, 8, 10);
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });
    const assumptions = result.assumptions as Record<string, unknown>;

    expect(assumptions.percentile).toBeDefined();
    expect(assumptions.percentile).toBeGreaterThanOrEqual(0);
    expect(assumptions.percentile).toBeLessThanOrEqual(100);
  });

  it("should use peer median as fallback for industry_median", () => {
    const result = calculatePEMultiples(baseInputs);
    const assumptions = result.assumptions as Record<string, unknown>;

    // Peer trailing PEs: 25, 30, 22 → median = 25
    expect(assumptions.industry_median).toBe(25);
  });
});

describe("calculatePSMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should compute P/S fair value from revenue per share", () => {
    const result = calculatePSMultiples(baseInputs);

    expect(result.model_type).toBe("ps_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A when revenue is zero", () => {
    const noRevenue = { ...appleFinancials[0], revenue: 0 };
    const result = calculatePSMultiples({
      ...baseInputs,
      financials: noRevenue,
    });
    expect(result.fair_value).toBe(0);
  });

  it("should use historical when available", () => {
    const history = generateHistoricalMultiples(500, 25, 8, 10);
    const result = calculatePSMultiples({ ...baseInputs, historicalMultiples: history });

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });
});

describe("calculatePBMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should compute P/B fair value from book value per share", () => {
    const result = calculatePBMultiples(baseInputs);

    expect(result.model_type).toBe("pb_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for negative equity", () => {
    const negEquity = { ...appleFinancials[0], total_equity: -10e9 };
    const result = calculatePBMultiples({
      ...baseInputs,
      financials: negEquity,
    });
    expect(result.fair_value).toBe(0);
  });

  it("should use historical when available", () => {
    const history = generateHistoricalMultiples(500, 25, 8, 10);
    const result = calculatePBMultiples({ ...baseInputs, historicalMultiples: history });

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });
});
