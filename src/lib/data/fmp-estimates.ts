// FMP API — Analyst estimates, earnings surprises, price targets

import { fmpFetch } from "./fmp-core";

// --- Analyst Estimates ---
interface FMPAnalystEstimate {
  date: string;
  revenueAvg: number;
  revenueLow: number;
  revenueHigh: number;
  epsAvg: number;
  epsLow: number;
  epsHigh: number;
  numAnalystsRevenue: number;
  numAnalystsEps: number;
}

export async function getAnalystEstimates(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<FMPAnalystEstimate[]> {
  const data = await fmpFetch<FMPAnalystEstimate[]>("/analyst-estimates", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
  // Normalize field names for seed compatibility
  return data.map((d) => ({
    ...d,
    estimatedRevenueAvg: d.revenueAvg,
    estimatedRevenueLow: d.revenueLow,
    estimatedRevenueHigh: d.revenueHigh,
    estimatedEpsAvg: d.epsAvg,
    estimatedEpsLow: d.epsLow,
    estimatedEpsHigh: d.epsHigh,
    numberAnalystEstimatedRevenue: d.numAnalystsRevenue,
  })) as (FMPAnalystEstimate & {
    estimatedRevenueAvg: number;
    estimatedRevenueLow: number;
    estimatedRevenueHigh: number;
    estimatedEpsAvg: number;
    estimatedEpsLow: number;
    estimatedEpsHigh: number;
    numberAnalystEstimatedRevenue: number;
  })[];
}

// --- Price Target Consensus ---
interface FMPPriceTargetConsensus {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetConsensus: number;
  targetMedian: number;
}

export async function getPriceTargetConsensus(
  ticker: string
): Promise<FMPPriceTargetConsensus | null> {
  try {
    const data = await fmpFetch<FMPPriceTargetConsensus[]>(
      "/price-target-consensus",
      { symbol: ticker }
    );
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

// --- Earnings Surprises ---
interface FMPEarningsSurprise {
  date: string;
  symbol: string;
  actualEarningResult: number;
  estimatedEarning: number;
}

export async function getEarningsSurprises(
  ticker: string,
  limit = 12
): Promise<FMPEarningsSurprise[]> {
  try {
    const data = await fmpFetch<FMPEarningsSurprise[]>(
      "/earnings-surprises",
      { symbol: ticker, limit: String(limit) }
    );
    return data ?? [];
  } catch {
    return [];
  }
}
