/**
 * MCP Server tests — verifies tool registration, response shape,
 * model filtering, and error handling.
 * Mocks computeValuationForTicker to avoid real DB/API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ValuationSummary, WACCResult, ValuationResult } from "@/types";
import type { Company, CompanyClassification } from "@/types";

// Mock the valuation handler before importing server
vi.mock("../valuation-handler", () => ({
  computeValuationForTicker: vi.fn(),
  ValuationError: class ValuationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "ValuationError";
      this.statusCode = statusCode;
    }
  },
}));

// Mock credit system — treat all tickers as free in tests
vi.mock("@/lib/credits", () => ({
  isFreeTicker: () => true,
  hasTickerAccess: () => Promise.resolve(true),
}));

import { createValuScopeMcpServer } from "../server";
import { computeValuationForTicker, ValuationError } from "../valuation-handler";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const mockCompute = vi.mocked(computeValuationForTicker);

// --- Fixtures ---

const mockCompany: Company = {
  ticker: "TEST",
  name: "Test Corp",
  sector: "Technology",
  industry: "Consumer Electronics",
  market_cap: 3_000_000_000_000,
  beta: 1.2,
  price: 200,
  shares_outstanding: 15_000_000_000,
  exchange: "NASDAQ",
  description: "Test company",
  logo_url: "",
  updated_at: "2025-01-01T00:00:00Z",
};

const mockWacc: WACCResult = {
  wacc: 0.09,
  cost_of_equity: 0.10,
  cost_of_debt: 0.04,
  risk_free_rate: 0.044,
  beta: 1.2,
  erp: 0.045,
  additional_risk_premium: 0,
  tax_rate: 0.21,
  debt_weight: 0.2,
  equity_weight: 0.8,
  total_debt: 100e9,
  total_equity: 3000e9,
  beta_method: "individual",
};

const mockClassification: CompanyClassification = {
  archetype: "profitable_growth",
  label: "Profitable Growth",
  description: "Strong growth with profitability",
  traits: ["growing", "profitable"],
  model_applicability: [],
};

function makeModel(type: string, fairValue: number): ValuationResult {
  return {
    model_type: type as ValuationResult["model_type"],
    fair_value: fairValue,
    upside_percent: ((fairValue - 200) / 200) * 100,
    low_estimate: fairValue * 0.85,
    high_estimate: fairValue * 1.15,
    assumptions: { test: true },
    details: { projection: "test" },
    computed_at: "2025-01-01T00:00:00Z",
  };
}

const mockSummary: ValuationSummary = {
  ticker: "TEST",
  company_name: "Test Corp",
  current_price: 200,
  primary_fair_value: 220,
  primary_upside: 10,
  consensus_fair_value: 215,
  consensus_low: 180,
  consensus_high: 260,
  consensus_upside: 7.5,
  pillars: {
    dcf: { fairValue: 220, upside: 10, models: [] },
    tradingMultiples: { fairValue: 210, upside: 5, models: [] },
    peg: { fairValue: 195, upside: -2.5, models: [] },
    epv: { fairValue: 180, upside: -10, models: [] },
  },
  models: [
    makeModel("dcf_fcff_growth_5y", 220),
    makeModel("pe_multiples", 210),
    makeModel("peg", 195),
    makeModel("epv", 180),
  ],
  wacc: mockWacc,
  classification: mockClassification,
  verdict: "fairly_valued",
  verdict_text: "Test Corp is fairly valued.",
  computed_at: "2025-01-01T00:00:00Z",
};

// --- Helper to create connected client ---

async function createTestClient() {
  const server = createValuScopeMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0" });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return { client, server };
}

// --- Tests ---

describe("MCP Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers get_stock_valuation tool", async () => {
    const { client } = await createTestClient();
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_stock_valuation");
    expect(tools[0].inputSchema.required).toContain("ticker");
  });

  it("returns valuation data with correct shape (no consensus fields)", async () => {
    mockCompute.mockResolvedValue({ summary: mockSummary, company: mockCompany });
    const { client } = await createTestClient();

    const result = await client.callTool({
      name: "get_stock_valuation",
      arguments: { ticker: "TEST" },
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);

    // Has expected fields
    expect(data.ticker).toBe("TEST");
    expect(data.company_name).toBe("Test Corp");
    expect(data.sector).toBe("Technology");
    expect(data.industry).toBe("Consumer Electronics");
    expect(data.market_cap).toBe(3_000_000_000_000);
    expect(data.current_price).toBe(200);
    expect(data.currency).toBe("USD");
    expect(data.source).toContain("ValuScope");
    expect(data.source_url).toBe("https://valuescope.dev/TEST");
    expect(data.disclaimer).toBeTruthy();
    expect(data.wacc.wacc).toBe(0.09);
    expect(data.classification.archetype).toBe("profitable_growth");

    // Does NOT have consensus fields
    expect(data.consensus_fair_value).toBeUndefined();
    expect(data.consensus_upside).toBeUndefined();
    expect(data.verdict).toBeUndefined();
    expect(data.pillars).toBeUndefined();
    expect(data.primary_fair_value).toBeUndefined();

    // Models have correct shape
    expect(data.models).toHaveLength(4);
    expect(data.models[0].model_id).toBe("dcf_fcff_growth_5y");
    expect(data.models[0].model_name).toBe("DCF FCFF Growth Exit (5-Year)");
    expect(data.models[0].category).toBe("DCF");
    expect(data.models[0].fair_value).toBe(220);
    expect(data.models[0].assumptions).toBeDefined();
    expect(data.models[0].details).toBeDefined();
  });

  it("filters models when models parameter is provided", async () => {
    mockCompute.mockResolvedValue({ summary: mockSummary, company: mockCompany });
    const { client } = await createTestClient();

    const result = await client.callTool({
      name: "get_stock_valuation",
      arguments: { ticker: "TEST", models: ["peg", "epv"] },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.models).toHaveLength(2);
    expect(data.models.map((m: { model_id: string }) => m.model_id)).toEqual(["peg", "epv"]);
  });

  it("returns all models when models parameter is omitted", async () => {
    mockCompute.mockResolvedValue({ summary: mockSummary, company: mockCompany });
    const { client } = await createTestClient();

    const result = await client.callTool({
      name: "get_stock_valuation",
      arguments: { ticker: "TEST" },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.models).toHaveLength(4);
  });

  it("returns error for unknown ticker", async () => {
    mockCompute.mockRejectedValue(new ValuationError("Company ZZZZZ not found", 404));
    const { client } = await createTestClient();

    const result = await client.callTool({
      name: "get_stock_valuation",
      arguments: { ticker: "ZZZZZ" },
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.error).toContain("not found");
    expect(data.ticker).toBe("ZZZZZ");
  });

  it("assigns correct categories to model types", async () => {
    mockCompute.mockResolvedValue({ summary: mockSummary, company: mockCompany });
    const { client } = await createTestClient();

    const result = await client.callTool({
      name: "get_stock_valuation",
      arguments: { ticker: "TEST" },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    const categories = Object.fromEntries(
      data.models.map((m: { model_id: string; category: string }) => [m.model_id, m.category])
    );

    expect(categories["dcf_fcff_growth_5y"]).toBe("DCF");
    expect(categories["pe_multiples"]).toBe("Trading Multiples");
    expect(categories["peg"]).toBe("Growth-Adjusted");
    expect(categories["epv"]).toBe("Perpetuity");
  });
});
