/**
 * Performance regression tests for ticker data fetching.
 *
 * Strategy: mock all external dependencies (DB, FMP, FRED) with a fixed
 * 100ms delay. If queries run in parallel, total time ≈ 100-150ms.
 * If someone breaks parallelism (sequential awaits), total time > 300ms → test fails.
 *
 * Also guards against over-fetching: ensures getCoreTickerData does NOT
 * call analyst-only functions (getPriceTargets, getEarningsSurprises).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  appleCompany,
  appleFinancials,
  testEstimates,
  testPeers,
} from "@/lib/valuation/__tests__/fixtures";

// ---- Helpers ----

const MOCK_DELAY = 100; // ms — simulates network latency

/** Returns a promise that resolves after MOCK_DELAY ms with the given value */
function delayed<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY));
}

// ---- Mocks ----

// React cache() — passthrough in test environment
vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

const mockGetPriceTargets = vi.fn();
const mockGetEarningsSurprises = vi.fn();

vi.mock("@/lib/db/queries", () => ({
  getCompany: vi.fn(() => delayed(appleCompany)),
  getFinancials: vi.fn(() => delayed(appleFinancials)),
  getEstimates: vi.fn(() => delayed(testEstimates)),
  getLatestPrice: vi.fn(() => delayed(200)),
  computePeerMetricsFromDB: vi.fn(() => delayed(testPeers)),
  getPriceTargets: mockGetPriceTargets.mockImplementation(() =>
    delayed({ average: 250, high: 300, low: 200, current: 200, number_of_analysts: 20 })
  ),
  getPriceHistory: vi.fn(() =>
    delayed([
      { date: "2024-01-01", close: 190 },
      { date: "2024-06-01", close: 200 },
      { date: "2025-01-01", close: 210 },
    ])
  ),
  getValuationSnapshot: vi.fn(() => delayed(null)),
}));

vi.mock("@/lib/data/fred", () => ({
  getTenYearTreasuryYield: vi.fn(() => delayed(0.0425)),
}));

vi.mock("@/lib/data/sector-beta", () => ({
  getSectorBeta: vi.fn(() => delayed(1.1)),
}));

vi.mock("@/lib/data/fmp", () => ({
  getEarningsSurprises: mockGetEarningsSurprises.mockImplementation(() =>
    delayed([
      { date: "2025-01-01", actualEarningResult: 7.0, estimatedEarning: 6.8 },
    ])
  ),
  getHistoricalPrices: vi.fn(() => delayed([])),
  getAnalystRecommendations: vi.fn(() =>
    delayed({ strongBuy: 10, buy: 8, hold: 5, sell: 1, strongSell: 0, consensus: "Buy" })
  ),
  getUpgradesDowngrades: vi.fn(() =>
    delayed([{ publishedDate: "2025-03-01", gradingCompany: "Morgan Stanley", previousGrade: "Hold", newGrade: "Buy", action: "upgrade" }])
  ),
  getEarningsCalendar: vi.fn(() =>
    delayed({ date: "2025-04-24", symbol: "TEST", eps: null, epsEstimated: 1.5, revenue: null, revenueEstimated: 95000000000 })
  ),
}));

vi.mock("@/lib/valuation/summary", () => ({
  computeFullValuation: vi.fn(() => ({
    ticker: "TEST",
    company_name: "Test Corp",
    current_price: 200,
    fair_value: 167,
    upside_percent: -16.5,
    verdict: "Overvalued",
    wacc: 0.1,
    computed_at: new Date().toISOString(),
    models: [],
  })),
}));

vi.mock("@/lib/valuation/historical-multiples", () => ({
  computeHistoricalMultiples: vi.fn(() => []),
}));

// ---- Tests ----

// Import AFTER mocks are set up
const { getCoreTickerData, getAnalystData } = await import("../data");

describe("getCoreTickerData — parallelism", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes within 300ms (6 parallel L1 queries + parallel L2 peers/FRED/beta)", async () => {
    const start = performance.now();
    const result = await getCoreTickerData("TEST");
    const duration = performance.now() - start;

    // Level 1: 6 parallel queries ~100ms (snapshot returns null → fallback)
    // Level 2: computePeerMetricsFromDB + FRED + sectorBeta ~100ms (all parallel)
    // If any level became fully sequential: 100 * 8 = 800ms minimum
    expect(duration).toBeLessThan(300);
    expect(result.company).toBeTruthy();
    expect(result.summary).toBeTruthy();
  });

  it("returns company, summary, estimates, historicals, historicalMultiples", async () => {
    const result = await getCoreTickerData("TEST");

    expect(result).toHaveProperty("company");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("estimates");
    expect(result).toHaveProperty("historicals");
    expect(result).toHaveProperty("historicalMultiples");
  });

  it("does NOT call getPriceTargets (analyst-only data)", async () => {
    await getCoreTickerData("TEST");
    expect(mockGetPriceTargets).not.toHaveBeenCalled();
  });

  it("does NOT call getEarningsSurprises (analyst-only data)", async () => {
    await getCoreTickerData("TEST");
    expect(mockGetEarningsSurprises).not.toHaveBeenCalled();
  });
});

describe("getAnalystData — parallelism", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes within 200ms (6 parallel 100ms queries)", async () => {
    const start = performance.now();
    const result = await getAnalystData("TEST");
    const duration = performance.now() - start;

    // If parallel: ~100ms. If sequential: 600ms
    expect(duration).toBeLessThan(200);
    expect(result).toHaveProperty("priceTargets");
    expect(result).toHaveProperty("earningsSurprises");
    expect(result).toHaveProperty("priceHistory");
    expect(result).toHaveProperty("recommendations");
    expect(result).toHaveProperty("upgradesDowngrades");
    expect(result).toHaveProperty("nextEarningsDate");
  });

  it("normalizes earnings surprises correctly", async () => {
    const result = await getAnalystData("TEST");
    expect(result.earningsSurprises[0]).toHaveProperty("actual_eps");
    expect(result.earningsSurprises[0]).toHaveProperty("estimated_eps");
    expect(result.earningsSurprises[0]).toHaveProperty("surprise_percent");
  });
});
