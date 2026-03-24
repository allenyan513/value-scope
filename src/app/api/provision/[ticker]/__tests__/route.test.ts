import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const mockSupabaseFrom = vi.fn();
const mockEnqueueDataRequest = vi.fn();
const mockUpdateDataRequestStatus = vi.fn();
const mockGetCompany = vi.fn();
const mockGetFinancials = vi.fn();
const mockGetEstimates = vi.fn();
const mockGetLatestPrice = vi.fn();
const mockGetIndustryPeers = vi.fn();
const mockGetPriceHistory = vi.fn();
const mockUpsertValuation = vi.fn();
const mockSeedSingleCompany = vi.fn();
const mockComputeFullValuation = vi.fn();
const mockComputeHistoricalMultiples = vi.fn();
const mockGetTenYearTreasuryYield = vi.fn();
const mockGetKeyMetrics = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

vi.mock("@/lib/db/queries", () => ({
  enqueueDataRequest: (...args: unknown[]) => mockEnqueueDataRequest(...args),
  updateDataRequestStatus: (...args: unknown[]) => mockUpdateDataRequestStatus(...args),
  getCompany: (...args: unknown[]) => mockGetCompany(...args),
  getFinancials: (...args: unknown[]) => mockGetFinancials(...args),
  getEstimates: (...args: unknown[]) => mockGetEstimates(...args),
  getLatestPrice: (...args: unknown[]) => mockGetLatestPrice(...args),
  getIndustryPeers: (...args: unknown[]) => mockGetIndustryPeers(...args),
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
  upsertValuation: (...args: unknown[]) => mockUpsertValuation(...args),
}));

vi.mock("@/lib/data/seed", () => ({
  seedSingleCompany: (...args: unknown[]) => mockSeedSingleCompany(...args),
}));

vi.mock("@/lib/valuation/summary", () => ({
  computeFullValuation: (...args: unknown[]) => mockComputeFullValuation(...args),
}));

vi.mock("@/lib/valuation/historical-multiples", () => ({
  computeHistoricalMultiples: (...args: unknown[]) => mockComputeHistoricalMultiples(...args),
}));

vi.mock("@/lib/data/fred", () => ({
  getTenYearTreasuryYield: (...args: unknown[]) => mockGetTenYearTreasuryYield(...args),
}));

vi.mock("@/lib/data/fmp", () => ({
  getKeyMetrics: (...args: unknown[]) => mockGetKeyMetrics(...args),
}));

import { POST } from "../route";

function makeRequest(ticker: string) {
  return new NextRequest(`http://localhost/api/provision/${ticker}`, {
    method: "POST",
  });
}

function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

// Helper to set up Supabase data_requests query mock
function mockDataRequestStatus(status: string | null) {
  if (status === null) {
    // No existing row
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
    });
  } else {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { ticker: "TEST", status } }),
        }),
      }),
    });
  }
}

describe("POST /api/provision/[ticker]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueDataRequest.mockResolvedValue(undefined);
    mockUpdateDataRequestStatus.mockResolvedValue(undefined);
    mockGetFinancials.mockResolvedValue([]);
    mockGetEstimates.mockResolvedValue([]);
    mockGetLatestPrice.mockResolvedValue(0);
    mockGetIndustryPeers.mockResolvedValue([]);
    mockGetPriceHistory.mockResolvedValue([]);
    mockGetTenYearTreasuryYield.mockResolvedValue(0.0425);
    mockComputeHistoricalMultiples.mockReturnValue([]);
    mockUpsertValuation.mockResolvedValue(undefined);
  });

  it("should return 400 for invalid ticker format", async () => {
    const res = await POST(makeRequest("invalid-ticker"), makeParams("invalid-ticker"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("failed");
    expect(json.error).toContain("Invalid ticker format");
  });

  it("should return 400 for ticker with numbers", async () => {
    const res = await POST(makeRequest("ABC123"), makeParams("ABC123"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.status).toBe("failed");
  });

  it("should return ready immediately if already completed and company exists", async () => {
    mockDataRequestStatus("completed");
    mockGetCompany.mockResolvedValue({ ticker: "SQ", name: "Block, Inc.", price: 57 });

    const res = await POST(makeRequest("SQ"), makeParams("SQ"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    // Should NOT call seed
    expect(mockSeedSingleCompany).not.toHaveBeenCalled();
  });

  it("should return processing if another request is already seeding", async () => {
    mockDataRequestStatus("processing");

    const res = await POST(makeRequest("SQ"), makeParams("SQ"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("processing");
    expect(mockSeedSingleCompany).not.toHaveBeenCalled();
  });

  it("should seed and return ready for pending ticker", async () => {
    mockDataRequestStatus("pending");
    mockSeedSingleCompany.mockResolvedValue({ success: true });
    mockGetCompany.mockResolvedValue({ ticker: "SQ", name: "Block, Inc.", price: 57, market_cap: 50e9 });
    mockGetFinancials.mockResolvedValue([{ year: 2025, revenue: 10e9 }]);
    mockComputeFullValuation.mockReturnValue({ models: [{ model_type: "dcf", fair_value: 70 }] });

    const res = await POST(makeRequest("SQ"), makeParams("SQ"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(mockSeedSingleCompany).toHaveBeenCalledWith("SQ");
    expect(mockUpdateDataRequestStatus).toHaveBeenCalledWith("SQ", "processing");
    expect(mockUpdateDataRequestStatus).toHaveBeenCalledWith("SQ", "completed");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/SQ", "layout");
  });

  it("should seed and return ready for new ticker (not in data_requests)", async () => {
    mockDataRequestStatus(null);
    mockSeedSingleCompany.mockResolvedValue({ success: true });
    mockGetCompany.mockResolvedValue({ ticker: "UBER", name: "Uber", price: 70, market_cap: 140e9 });
    mockGetFinancials.mockResolvedValue([{ year: 2025, revenue: 40e9 }]);
    mockComputeFullValuation.mockReturnValue({ models: [] });

    const res = await POST(makeRequest("UBER"), makeParams("UBER"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(mockEnqueueDataRequest).toHaveBeenCalledWith("UBER");
    expect(mockSeedSingleCompany).toHaveBeenCalledWith("UBER");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/UBER", "layout");
  });

  it("should return failed with 422 if seed fails", async () => {
    mockDataRequestStatus("pending");
    mockSeedSingleCompany.mockResolvedValue({ success: false, error: "No profile found — ticker may not exist" });

    const res = await POST(makeRequest("ZZZZ"), makeParams("ZZZZ"));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.status).toBe("failed");
    expect(json.error).toContain("No profile found");
    expect(mockUpdateDataRequestStatus).toHaveBeenCalledWith("ZZZZ", "failed", "No profile found — ticker may not exist");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("should still complete if valuation compute fails after successful seed", async () => {
    mockDataRequestStatus("pending");
    mockSeedSingleCompany.mockResolvedValue({ success: true });
    mockGetCompany.mockResolvedValue({ ticker: "SQ", name: "Block", price: 57, market_cap: 50e9 });
    mockGetFinancials.mockResolvedValue([{ year: 2025, revenue: 10e9 }]);
    mockComputeFullValuation.mockImplementation(() => { throw new Error("Valuation error"); });

    const res = await POST(makeRequest("SQ"), makeParams("SQ"));
    const json = await res.json();

    // Should still succeed — seed worked, valuation is optional
    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(mockUpdateDataRequestStatus).toHaveBeenCalledWith("SQ", "completed");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/SQ", "layout");
  });

  it("should re-seed if completed but company not found in DB", async () => {
    mockDataRequestStatus("completed");
    // First getCompany call (status check) — returns null
    mockGetCompany.mockResolvedValueOnce(null);
    // After seed, getCompany returns data
    mockGetCompany.mockResolvedValueOnce({ ticker: "SQ", name: "Block", price: 57, market_cap: 50e9 });
    mockSeedSingleCompany.mockResolvedValue({ success: true });
    mockGetFinancials.mockResolvedValue([]);
    mockComputeFullValuation.mockReturnValue({ models: [] });

    const res = await POST(makeRequest("SQ"), makeParams("SQ"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(mockSeedSingleCompany).toHaveBeenCalledWith("SQ");
  });

  it("should handle lowercase ticker by uppercasing", async () => {
    mockDataRequestStatus("completed");
    mockGetCompany.mockResolvedValue({ ticker: "AAPL", name: "Apple", price: 248 });

    const res = await POST(makeRequest("aapl"), makeParams("aapl"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ready");
  });
});
