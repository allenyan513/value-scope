// ============================================================
// Shared valuation computation logic
// Used by both /api/valuation/[ticker] and MCP server
// ============================================================

import { getCompany, getFinancials, getEstimates, getLatestPrice, getPriceHistory, computePeerMetricsFromDB, getValuationSnapshot } from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { median } from "@/lib/valuation/statistics";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getSectorBeta } from "@/lib/data/sector-beta";
import { SNAPSHOT_MAX_AGE_MS } from "@/lib/constants";
import type { ValuationSummary, Company } from "@/types";

export class ValuationError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ValuationError";
  }
}

export interface ValuationComputeResult {
  summary: ValuationSummary;
  company: Company;
}

/**
 * Fetch all data and compute full valuation for a ticker.
 * Throws ValuationError for expected failures (404-level).
 * Used by both the REST API and MCP server.
 */
export async function computeValuationForTicker(ticker: string): Promise<ValuationComputeResult> {
  const upperTicker = ticker.toUpperCase();

  // Try pre-computed snapshot first (no FMP, no FRED — single DB read)
  const [snapshotCompany, snapshot] = await Promise.all([
    getCompany(upperTicker),
    getValuationSnapshot(upperTicker),
  ]);

  if (!snapshotCompany) {
    throw new ValuationError(`Company ${upperTicker} not found`, 404);
  }

  if (snapshot && (Date.now() - new Date(snapshot.computed_at).getTime()) < SNAPSHOT_MAX_AGE_MS) {
    return { summary: snapshot.summary as ValuationSummary, company: snapshotCompany };
  }

  // Fallback: full live computation (DB-only peers + FRED + CPU — no FMP calls)
  const company = snapshotCompany; // already fetched above
  const [historicals, estimates, riskFreeRate, prices, peers, sectorUnleveredBeta] = await Promise.all([
    getFinancials(upperTicker, "annual", 5),
    getEstimates(upperTicker),
    getTenYearTreasuryYield().catch(() => 0.0425),
    getPriceHistory(upperTicker, 365 * 5),
    computePeerMetricsFromDB(upperTicker, 10),
    company.sector ? getSectorBeta(company.sector).catch(() => null) : Promise.resolve(null),
  ]);

  if (historicals.length === 0) {
    throw new ValuationError(`No financial data for ${upperTicker}`, 404);
  }

  const currentPrice = (await getLatestPrice(upperTicker)) || company.price;
  if (!currentPrice) {
    throw new ValuationError(`No price data for ${upperTicker}`, 404);
  }

  const historicalMultiples = computeHistoricalMultiples(historicals, prices);
  const validEV = peers.map(p => p.ev_ebitda).filter((v): v is number => v !== null && v > 0 && v < 100);
  const peerEVEBITDAMedian = validEV.length > 0 ? median(validEV) : null;

  const summary = computeFullValuation({
    company,
    historicals,
    estimates,
    peers,
    currentPrice,
    riskFreeRate,
    historicalMultiples,
    peerEVEBITDAMedian: peerEVEBITDAMedian ?? undefined,
    sectorUnleveredBeta: sectorUnleveredBeta ?? undefined,
  });

  return { summary, company };
}
