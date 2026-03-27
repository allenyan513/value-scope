/**
 * Data Quality Guard Tests
 *
 * Regression tests for edge cases discovered during the 2026-03-26 audit.
 * These use fixtures (no DB) to verify valuation logic handles tricky inputs.
 */
import { describe, it, expect } from "vitest";
import {
  calculatePSMultiples,
  calculatePBMultiples,
  calculatePEMultiples,
} from "../trading-multiples";
import { calculatePEG } from "../peg";
import {
  appleFinancials,
  testEstimates,
  testPeers,
  makeFinancial,
  generateHistoricalMultiples,
} from "./fixtures";
import type { TradingMultiplesInputs } from "../trading-multiples";
import type { Company } from "@/types";

// ============================================================
// Bug #3 Guard: Trading multiples with historical data should
// prefer self-comparison over peer-based
// ============================================================
describe("Bug #3 Guard: Trading multiples prefer historical self-comparison", () => {
  const company: Company = {
    ticker: "AUTO",
    name: "Auto Co",
    sector: "Consumer Cyclical",
    industry: "Auto - Manufacturers",
    market_cap: 50e9,
    beta: 1.1,
    price: 12,
    shares_outstanding: 4_000_000_000,
    exchange: "NYSE",
    description: "",
    logo_url: "",
    updated_at: "",
  };

  const autoFinancials = makeFinancial(2025, {
    revenue: 185e9,   // High revenue (like Ford)
    net_income: -5e9,  // Loss-making
    ebitda: 10e9,
    eps: -1.25,
    eps_diluted: -1.25,
  });

  // High-growth peers (like TSLA) with extreme P/S
  const extremePeers = [
    { ...testPeers[0], price_to_sales: 15, trailing_pe: 100 },
    { ...testPeers[1], price_to_sales: 12, trailing_pe: 80 },
  ];

  // 500 days of historical data with low P/S (like Ford's actual 0.2-0.4)
  const lowPSHistory = generateHistoricalMultiples(500, 15, 8, 1.5, 0.3, 10);

  it("P/S should use historical avg (~0.3) not peer median (~13.5) when history available", () => {
    const inputs: TradingMultiplesInputs = {
      financials: autoFinancials,
      company,
      currentPrice: 12,
      peers: extremePeers,
      historicalMultiples: lowPSHistory,
    };

    const result = calculatePSMultiples(inputs);
    if (result.fair_value > 0) {
      // With historical P/S ~0.3 and revenue/share ~$46, fair value should be ~$14
      // NOT ~$600+ from peer P/S of 13.5
      expect(result.fair_value).toBeLessThan(100);
      expect(result.assumptions.method).toBe("historical_self_comparison");
    }
  });

  it("P/S should fall back to peer-based when no historical data", () => {
    const inputs: TradingMultiplesInputs = {
      financials: autoFinancials,
      company,
      currentPrice: 12,
      peers: extremePeers,
      // No historicalMultiples → forces peer-based
    };

    const result = calculatePSMultiples(inputs);
    if (result.fair_value > 0) {
      expect(result.assumptions.method).toBe("peer_comparison");
    }
  });
});

// ============================================================
// PEG model edge cases
// ============================================================
describe("PEG model edge cases", () => {
  it("should handle loss-making companies gracefully (N/A)", () => {
    const result = calculatePEG({
      historicals: [
        makeFinancial(2025, { eps: -2, eps_diluted: -2 }),
        makeFinancial(2024, { eps: -1, eps_diluted: -1 }),
      ],
      currentPrice: 50,
      estimates: [],
    });

    expect(result.fair_value).toBe(0);
    expect(result.model_type).toBe("peg");
  });

  it("fair value should be proportional to EPS (not inflated by currency)", () => {
    // Simulate correctly-converted ADR EPS (~$10 USD, not TWD 334)
    const result = calculatePEG({
      historicals: appleFinancials,
      currentPrice: 200,
      estimates: testEstimates,
      marketCap: 3e12,
    });

    // PEG fair value should be in the same order of magnitude as price
    // Not 30x+ higher (which would indicate currency mismatch)
    expect(result.fair_value).toBeLessThan(200 * 10);
    expect(result.fair_value).toBeGreaterThan(0);
  });
});
