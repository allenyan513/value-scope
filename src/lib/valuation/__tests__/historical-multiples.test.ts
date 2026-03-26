import { describe, it, expect } from "vitest";
import {
  computeHistoricalMultiples,
  computeMultiplesStats,
  sampleData,
} from "../historical-multiples";
import { appleFinancials, generateHistoricalMultiples } from "./fixtures";

describe("computeHistoricalMultiples", () => {
  // Build mock prices aligned with financial years
  const mockPrices = Array.from({ length: 300 }, (_, i) => ({
    date: new Date(2024, 3, 1 + i).toISOString().split("T")[0], // Start April 2024
    close: 180 + Math.sin(i / 20) * 20,
  }));

  it("should compute P/E and EV/EBITDA for each price point", () => {
    const result = computeHistoricalMultiples(appleFinancials, mockPrices);

    expect(result.length).toBeGreaterThan(0);
    const point = result[0];
    expect(point.date).toBeTruthy();
    expect(point.pe).not.toBeNull();
    expect(point.ev_ebitda).not.toBeNull();
  });

  it("should return empty when no financials", () => {
    const result = computeHistoricalMultiples([], mockPrices);
    expect(result).toHaveLength(0);
  });

  it("should return empty when no prices", () => {
    const result = computeHistoricalMultiples(appleFinancials, []);
    expect(result).toHaveLength(0);
  });

  it("should compute P/E = price / EPS", () => {
    const result = computeHistoricalMultiples(appleFinancials, mockPrices);
    const point = result[0];
    if (point.pe !== null) {
      // P/E should be reasonable (price ~180 / EPS ~6 = ~30)
      expect(point.pe).toBeGreaterThan(15);
      expect(point.pe).toBeLessThan(50);
    }
  });

  it("should compute P/B, P/S, and P/FCF multiples", () => {
    const result = computeHistoricalMultiples(appleFinancials, mockPrices);
    const point = result[0];

    // P/B: price / (total_equity / shares) — total_equity = revenue * 1.5, shares = 15e9
    expect(point.pb).not.toBeNull();
    if (point.pb !== null) {
      expect(point.pb).toBeGreaterThan(0);
      expect(point.pb).toBeLessThan(50);
    }

    // P/S: price / (revenue / shares)
    expect(point.ps).not.toBeNull();
    if (point.ps !== null) {
      expect(point.ps).toBeGreaterThan(0);
      expect(point.ps).toBeLessThan(100);
    }

    // P/FCF: price / (free_cash_flow / shares)
    expect(point.p_fcf).not.toBeNull();
    if (point.p_fcf !== null) {
      expect(point.p_fcf).toBeGreaterThan(0);
      expect(point.p_fcf).toBeLessThan(200);
    }
  });

  it("should skip prices where no applicable financial exists", () => {
    // Prices from 2018 — no financials available that old
    const oldPrices = [
      { date: "2018-06-01", close: 100 },
      { date: "2018-07-01", close: 105 },
    ];
    const result = computeHistoricalMultiples(appleFinancials, oldPrices);
    expect(result).toHaveLength(0);
  });
});

describe("computeMultiplesStats", () => {
  it("should compute avg, p25, p75, percentile", () => {
    const data = generateHistoricalMultiples(500, 25);
    const stats = computeMultiplesStats(data);

    expect(stats.pe).not.toBeNull();
    expect(stats.pe!.avg5y).toBeGreaterThan(20);
    expect(stats.pe!.avg5y).toBeLessThan(30);
    expect(stats.pe!.p25).toBeLessThanOrEqual(stats.pe!.avg5y);
    expect(stats.pe!.p75).toBeGreaterThanOrEqual(stats.pe!.avg5y);
    expect(stats.pe!.percentile).toBeGreaterThanOrEqual(0);
    expect(stats.pe!.percentile).toBeLessThanOrEqual(100);
    expect(stats.pe!.dataPoints).toBe(500);
  });

  it("should compute stats for P/B, P/S, and P/FCF", () => {
    const data = generateHistoricalMultiples(500, 25, 20, 10, 7, 30);
    const stats = computeMultiplesStats(data);

    expect(stats.pb).not.toBeNull();
    expect(stats.pb!.avg5y).toBeGreaterThan(5);
    expect(stats.pb!.avg5y).toBeLessThan(15);
    expect(stats.pb!.dataPoints).toBe(500);

    expect(stats.ps).not.toBeNull();
    expect(stats.ps!.avg5y).toBeGreaterThan(4);
    expect(stats.ps!.avg5y).toBeLessThan(12);

    expect(stats.p_fcf).not.toBeNull();
    expect(stats.p_fcf!.avg5y).toBeGreaterThan(20);
    expect(stats.p_fcf!.avg5y).toBeLessThan(40);
  });

  it("should return null for new multiples when not provided", () => {
    const data = generateHistoricalMultiples(500, 25); // no pb/ps/p_fcf bases
    const stats = computeMultiplesStats(data);

    expect(stats.pb).toBeNull();
    expect(stats.ps).toBeNull();
    expect(stats.p_fcf).toBeNull();
  });

  it("should return null when fewer than 10 data points", () => {
    const data = generateHistoricalMultiples(5, 25);
    const stats = computeMultiplesStats(data);

    expect(stats.pe).toBeNull();
  });

  it("should filter out values above cap", () => {
    const data = generateHistoricalMultiples(200, 25);
    // Inject extreme values
    data[0] = { ...data[0], pe: 500 };
    data[1] = { ...data[1], pe: -10 };

    const stats = computeMultiplesStats(data);
    // Extreme values should be filtered, stats should still be valid
    expect(stats.pe).not.toBeNull();
    expect(stats.pe!.avg5y).toBeGreaterThan(0);
    expect(stats.pe!.avg5y).toBeLessThan(50);
  });
});

describe("sampleData", () => {
  it("should return original data when under limit", () => {
    const data = generateHistoricalMultiples(50, 25);
    const sampled = sampleData(data, 250);
    expect(sampled).toHaveLength(50);
  });

  it("should downsample to target size", () => {
    const data = generateHistoricalMultiples(1000, 25);
    const sampled = sampleData(data, 250);
    expect(sampled).toHaveLength(250);
  });

  it("should preserve first and last points", () => {
    const data = generateHistoricalMultiples(1000, 25);
    const sampled = sampleData(data, 100);
    expect(sampled[0].date).toBe(data[0].date);
    expect(sampled[sampled.length - 1].date).toBe(data[data.length - 1].date);
  });
});
