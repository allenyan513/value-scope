// ============================================================
// ValuScope MCP Server Factory
// Creates a stateless MCP server with the get_stock_valuation tool
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { computeValuationForTicker, ValuationError } from "./valuation-handler";
import type { ValuationModelType, ValuationResult } from "@/types";

const VALID_MODELS = [
  "dcf_fcff_growth_5y",
  "dcf_fcff_growth_10y",
  "dcf_fcff_ebitda_exit_5y",
  "dcf_fcff_ebitda_exit_10y",
  "pe_multiples",
  "ev_ebitda_multiples",
  "peg",
  "epv",
] as const;

type ValidModel = (typeof VALID_MODELS)[number];

/**
 * Creates a new MCP server instance with the get_stock_valuation tool registered.
 * Each request gets a fresh server (stateless mode).
 */
export function createValuScopeMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "valuescope",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  server.registerTool(
    "get_stock_valuation",
    {
      title: "Get Stock Valuation",
      description:
        "Get comprehensive stock valuation for US equities (S&P 500). " +
        "Returns fair value estimates from up to 9 valuation models: " +
        "4 DCF variants (FCFF Growth/EBITDA Exit x 5Y/10Y), " +
        "P/E Multiples, EV/EBITDA Multiples, PEG, and Earnings Power Value. " +
        "Each model returns fair value, upside/downside %, low/high estimates, assumptions, and detailed breakdowns. " +
        "Use the `models` parameter to request specific models, or omit for all. " +
        "Data updates daily. Covers ~500 S&P 500 stocks.",
      inputSchema: {
        ticker: z
          .string()
          .min(1)
          .max(6)
          .describe("Stock ticker symbol, e.g. AAPL, MSFT, NVDA, BRK-B"),
        models: z
          .array(z.enum(VALID_MODELS))
          .optional()
          .describe(
            "Specific valuation models to return. Omit for all models. " +
            "Options: dcf_fcff_growth_5y, dcf_fcff_growth_10y, dcf_fcff_ebitda_exit_5y, " +
            "dcf_fcff_ebitda_exit_10y, pe_multiples, ev_ebitda_multiples, peg, epv"
          ),
      },
    },
    async ({ ticker, models }) => {
      const start = Date.now();
      try {
        const { summary, company } = await computeValuationForTicker(ticker);

        // Filter models if requested
        let filteredModels = summary.models;
        if (models && models.length > 0) {
          const requestedSet = new Set<string>(models);
          filteredModels = summary.models.filter((m: ValuationResult) =>
            requestedSet.has(m.model_type as ValidModel)
          );
        }

        // Build clean MCP response (no consensus fields)
        const response = {
          ticker: summary.ticker,
          company_name: summary.company_name,
          sector: company.sector,
          industry: company.industry,
          market_cap: company.market_cap,
          current_price: summary.current_price,
          currency: "USD",
          computed_at: summary.computed_at,
          models: filteredModels.map((m: ValuationResult) => ({
            model_id: m.model_type,
            model_name: getModelDisplayName(m.model_type as ValidModel),
            category: getModelCategory(m.model_type as ValidModel),
            fair_value: m.fair_value,
            upside_percent: m.upside_percent,
            low_estimate: m.low_estimate,
            high_estimate: m.high_estimate,
            assumptions: m.assumptions,
            details: m.details,
          })),
          wacc: summary.wacc,
          classification: {
            archetype: summary.classification.archetype,
            label: summary.classification.label,
            description: summary.classification.description,
          },
          source: "ValuScope (valuescope.dev)",
          source_url: `https://valuescope.dev/${summary.ticker}`,
          disclaimer:
            "This is not financial advice. Valuation models are estimates based on public financial data.",
        };

        const duration = Date.now() - start;
        console.log(
          `[MCP] get_stock_valuation: ${summary.ticker} | models=${models?.join(",") || "all"} | ${response.models.length} results | ${duration}ms`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const duration = Date.now() - start;
        if (error instanceof ValuationError) {
          console.log(
            `[MCP] get_stock_valuation: ${ticker.toUpperCase()} | error=${error.message} | ${duration}ms`
          );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error.message,
                  ticker: ticker.toUpperCase(),
                }),
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    }
  );

  return server;
}

function getModelDisplayName(modelType: string): string {
  const names: Record<string, string> = {
    dcf_fcff_growth_5y: "DCF FCFF Growth Exit (5-Year)",
    dcf_fcff_growth_10y: "DCF FCFF Growth Exit (10-Year)",
    dcf_fcff_ebitda_exit_5y: "DCF FCFF EBITDA Exit (5-Year)",
    dcf_fcff_ebitda_exit_10y: "DCF FCFF EBITDA Exit (10-Year)",
    pe_multiples: "P/E Trading Multiples",
    ev_ebitda_multiples: "EV/EBITDA Trading Multiples",
    peg: "PEG Fair Value",
    epv: "Earnings Power Value",
  };
  return names[modelType] || modelType;
}

function getModelCategory(modelType: string): string {
  if (modelType.startsWith("dcf")) return "DCF";
  if (modelType.includes("multiples")) return "Trading Multiples";
  if (modelType === "peg") return "Growth-Adjusted";
  if (modelType === "epv") return "Perpetuity";
  return "Other";
}
