import { describe, it, expect } from "vitest";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  calculatePBMultiples,
  calculatePSMultiples,
  calculatePFCFMultiples,
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
    const history = generateHistoricalMultiples(500, 25);
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("pe_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });

  it("should fall back to peer-based when insufficient history", () => {
    const history = generateHistoricalMultiples(50, 25); // < 100 points
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
    const history = generateHistoricalMultiples(500, 25);
    const result = calculatePEMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
    expect(result.high_estimate - result.low_estimate).toBeGreaterThan(0);
  });

  it("should include percentile in assumptions when using historical", () => {
    const history = generateHistoricalMultiples(500, 25);
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

// ============================================================
// EV/EBITDA Multiples
// ============================================================

describe("calculateEVEBITDAMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should compute EV-based fair value with historical data", () => {
    const history = generateHistoricalMultiples(500, 25, 20);
    const result = calculateEVEBITDAMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("ev_ebitda_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
    expect((result.assumptions as Record<string, unknown>).net_debt).toBeDefined();
    expect((result.assumptions as Record<string, unknown>).shares_outstanding).toBeDefined();
  });

  it("should fall back to peer-based when insufficient history", () => {
    const result = calculateEVEBITDAMultiples(baseInputs);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for zero EBITDA", () => {
    const noEbitda = { ...appleFinancials[0], ebitda: 0 };
    const result = calculateEVEBITDAMultiples({ ...baseInputs, financials: noEbitda });
    expect(result.fair_value).toBe(0);
  });

  it("should compute low/high from EV → equity → price path", () => {
    const history = generateHistoricalMultiples(500, 25, 20);
    const result = calculateEVEBITDAMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
    expect(result.high_estimate - result.low_estimate).toBeGreaterThan(0);
  });
});

// ============================================================
// P/B Multiples
// ============================================================

describe("calculatePBMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should use historical self-comparison when enough data points", () => {
    const history = generateHistoricalMultiples(500, 25, 20, 10);
    const result = calculatePBMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("pb_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });

  it("should fall back to peer-based when insufficient history", () => {
    const result = calculatePBMultiples(baseInputs);

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for negative equity", () => {
    const negEquity = { ...appleFinancials[0], total_equity: -100e9 };
    const result = calculatePBMultiples({ ...baseInputs, financials: negEquity });
    expect(result.fair_value).toBe(0);
  });

  it("should compute low/high from percentiles", () => {
    const history = generateHistoricalMultiples(500, 25, 20, 10);
    const result = calculatePBMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.low_estimate).toBeLessThanOrEqual(result.fair_value);
    expect(result.high_estimate).toBeGreaterThanOrEqual(result.fair_value);
  });
});

// ============================================================
// P/S Multiples
// ============================================================

describe("calculatePSMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should use historical self-comparison when enough data points", () => {
    const history = generateHistoricalMultiples(500, 25, 20, 10, 7);
    const result = calculatePSMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("ps_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });

  it("should fall back to peer-based when insufficient history", () => {
    const result = calculatePSMultiples(baseInputs);

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for zero revenue", () => {
    const noRevenue = { ...appleFinancials[0], revenue: 0 };
    const result = calculatePSMultiples({ ...baseInputs, financials: noRevenue });
    expect(result.fair_value).toBe(0);
  });
});

// ============================================================
// P/FCF Multiples
// ============================================================

describe("calculatePFCFMultiples", () => {
  const baseInputs = {
    financials: appleFinancials[0],
    company: appleCompany,
    currentPrice: 200,
    peers: testPeers,
  };

  it("should use historical self-comparison when enough data points", () => {
    const history = generateHistoricalMultiples(500, 25, 20, 10, 7, 30);
    const result = calculatePFCFMultiples({ ...baseInputs, historicalMultiples: history });

    expect(result.model_type).toBe("p_fcf_multiples");
    expect(result.fair_value).toBeGreaterThan(0);
    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "historical_self_comparison"
    );
  });

  it("should fall back to peer-based (default multiple) when insufficient history", () => {
    const result = calculatePFCFMultiples(baseInputs);

    expect((result.assumptions as Record<string, unknown>).method).toBe(
      "peer_comparison"
    );
    expect(result.fair_value).toBeGreaterThan(0);
  });

  it("should return N/A for negative FCF", () => {
    const negFcf = { ...appleFinancials[0], free_cash_flow: -5e9 };
    const result = calculatePFCFMultiples({ ...baseInputs, financials: negFcf });
    expect(result.fair_value).toBe(0);
  });
});
