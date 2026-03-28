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

// --- Analyst Stock Recommendations (Buy/Hold/Sell) ---
interface FMPAnalystRecommendation {
  symbol: string;
  date: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensus: string;
}

export async function getAnalystRecommendations(
  ticker: string
): Promise<FMPAnalystRecommendation | null> {
  try {
    const data = await fmpFetch<FMPAnalystRecommendation[]>(
      "/analyst-stock-recommendations",
      { symbol: ticker }
    );
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

// --- Upgrades / Downgrades ---
export interface FMPUpgradeDowngrade {
  symbol: string;
  publishedDate: string;
  gradingCompany: string;
  previousGrade: string;
  newGrade: string;
  action: string;
}

export async function getUpgradesDowngrades(
  ticker: string,
  limit = 10
): Promise<FMPUpgradeDowngrade[]> {
  try {
    const data = await fmpFetch<FMPUpgradeDowngrade[]>(
      "/upgrades-downgrades",
      { symbol: ticker, limit: String(limit) }
    );
    return data ?? [];
  } catch {
    return [];
  }
}

// --- Earnings Calendar (next earnings date) ---
interface FMPEarningsCalendarEntry {
  date: string;
  symbol: string;
  eps: number | null;
  epsEstimated: number | null;
  revenue: number | null;
  revenueEstimated: number | null;
}

/**
 * Fetch all companies that reported earnings in a date range.
 * Used by event-driven refresh cron to find which tickers need financial updates.
 */
export async function getEarningsCalendarByDateRange(
  from: string,
  to: string
): Promise<FMPEarningsCalendarEntry[]> {
  try {
    const data = await fmpFetch<FMPEarningsCalendarEntry[]>(
      "/earnings-calendar",
      { from, to }
    );
    if (!data || data.length === 0) return [];
    // Only return entries that have actual EPS (meaning they already reported)
    return data.filter((e) => e.eps !== null);
  } catch {
    return [];
  }
}

export async function getEarningsCalendar(
  ticker: string
): Promise<FMPEarningsCalendarEntry | null> {
  try {
    const data = await fmpFetch<FMPEarningsCalendarEntry[]>(
      "/earnings-calendar",
      { symbol: ticker }
    );
    if (!data || data.length === 0) return null;
    // API may return all companies — filter to requested ticker
    const tickerUpper = ticker.toUpperCase();
    const filtered = data.filter((e) => e.symbol?.toUpperCase() === tickerUpper);
    if (filtered.length === 0) return null;
    // Find the next upcoming earnings (date >= today)
    const today = new Date().toISOString().split("T")[0];
    const upcoming = filtered.find((e) => e.date >= today);
    return upcoming ?? filtered[0] ?? null;
  } catch {
    return null;
  }
}
