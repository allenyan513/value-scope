import { cache } from "react";
import { getCoreTickerData } from "../../data";
import { computeMultiplesStats } from "@/lib/valuation/historical-multiples";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  calculatePBMultiples,
  calculatePSMultiples,
  calculatePFCFMultiples,
  type TradingMultiplesInputs,
} from "@/lib/valuation/trading-multiples";
import type { PeerComparison, MultipleStats, ValuationResult } from "@/types";

// --- Public types ---

export type MultipleKey = "pe" | "ev_ebitda" | "pb" | "ps" | "p_fcf";

export interface MultipleSummary {
  key: MultipleKey;
  label: string;
  current: number | null;
  avg5y: number | null;
  p25: number | null;
  p75: number | null;
  percentile: number | null;
  dataPoints: number;
  peerMedian: number | null;
  fairValue: number | null;
  upside: number | null;
  method: string | null;
  metric: number | null;
  metricLabel: string;
  isEVBased: boolean;
  netDebt: number | null;
}

export interface CompanyRow {
  ticker: string;
  name: string;
  market_cap: number;
  pe: number | null;
  ev_ebitda: number | null;
  pb: number | null;
  ps: number | null;
  revenue_growth: number | null;
  net_margin: number | null;
  roe: number | null;
}

export interface RelativePageData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
  consensusFairValue: number;
  consensusUpside: number;
  multiples: MultipleSummary[];
  peers: PeerComparison[];
  companyRow: CompanyRow;
  error?: string;
}

// --- Helpers ---

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildMultipleSummary(
  key: MultipleKey,
  label: string,
  stats: MultipleStats | null,
  result: ValuationResult,
  peers: PeerComparison[],
  peerExtractor: (p: PeerComparison) => number | null,
  metricLabel: string,
  isEVBased: boolean,
  netDebt: number | null,
): MultipleSummary {
  const validPeerValues = peers
    .map(peerExtractor)
    .filter((v): v is number => v !== null && v > 0);
  const peerMed = validPeerValues.length > 0 ? round2(median(validPeerValues)) : null;

  const method = result.fair_value > 0
    ? ((result.assumptions as Record<string, unknown>).method as string) ?? null
    : null;
  const metric = result.fair_value > 0
    ? ((result.details as Record<string, unknown>).company_metric as number) ?? null
    : null;

  return {
    key,
    label,
    current: stats?.current ?? null,
    avg5y: stats ? round2(stats.avg5y) : null,
    p25: stats ? round2(stats.p25) : null,
    p75: stats ? round2(stats.p75) : null,
    percentile: stats?.percentile ?? null,
    dataPoints: stats?.dataPoints ?? 0,
    peerMedian: peerMed,
    fairValue: result.fair_value > 0 ? result.fair_value : null,
    upside: result.fair_value > 0 ? result.upside_percent : null,
    method,
    metric,
    metricLabel,
    isEVBased,
    netDebt,
  };
}

// --- Main data function ---

export const getRelativeValuationData = cache(async (ticker: string): Promise<RelativePageData | null> => {
  const { company, summary, historicals, historicalMultiples, peers } = await getCoreTickerData(ticker);

  if (!summary || !historicalMultiples || historicalMultiples.length === 0) {
    return null;
  }

  const stats = computeMultiplesStats(historicalMultiples);
  const sortedHistoricals = [...historicals].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sortedHistoricals[0];
  const shares = latest?.shares_outstanding;
  if (!latest || !shares) return null;

  const currentPrice = summary.current_price;
  const netDebt = (latest.total_debt || 0) - (latest.cash_and_equivalents || 0);

  // Build trading multiples inputs
  const tradingInputs: TradingMultiplesInputs = {
    financials: latest,
    company,
    currentPrice,
    peers,
    historicalMultiples,
  };

  // Run all 5 models
  const peResult = calculatePEMultiples(tradingInputs);
  const evResult = calculateEVEBITDAMultiples(tradingInputs);
  const pbResult = calculatePBMultiples(tradingInputs);
  const psResult = calculatePSMultiples(tradingInputs);
  const pfcfResult = calculatePFCFMultiples(tradingInputs);

  // Build summaries
  const multiples: MultipleSummary[] = [
    buildMultipleSummary("pe", "P/E", stats.pe, peResult, peers, (p) => p.trailing_pe, "TTM EPS", false, null),
    buildMultipleSummary("ev_ebitda", "EV/EBITDA", stats.ev_ebitda, evResult, peers, (p) => p.ev_ebitda, "EBITDA", true, netDebt),
    buildMultipleSummary("pb", "P/B", stats.pb, pbResult, peers, (p) => p.price_to_book, "Book Value/Share", false, null),
    buildMultipleSummary("ps", "P/S", stats.ps, psResult, peers, (p) => p.price_to_sales, "Revenue/Share", false, null),
    buildMultipleSummary("p_fcf", "P/FCF", stats.p_fcf, pfcfResult, peers, () => null, "FCF/Share", false, null),
  ];

  // Consensus: median of available fair values (robust against outliers)
  const validFairValues = multiples
    .map((m) => m.fairValue)
    .filter((v): v is number => v !== null && v > 0);
  const sortedFairValues = [...validFairValues].sort((a, b) => a - b);
  const consensusFairValue = sortedFairValues.length > 0
    ? round2(median(sortedFairValues))
    : 0;
  const consensusUpside = consensusFairValue > 0
    ? round2(((consensusFairValue - currentPrice) / currentPrice) * 100)
    : 0;

  // Company row for peer table
  const prevRevenue = sortedHistoricals[1]?.revenue;
  const revenueGrowth = prevRevenue && prevRevenue > 0 && latest.revenue
    ? round2(((latest.revenue - prevRevenue) / prevRevenue) * 100)
    : null;
  const netMargin = latest.net_margin
    ? round2(latest.net_margin * 100)
    : null;
  const roe = latest.total_equity && latest.total_equity > 0 && latest.net_income
    ? round2((latest.net_income / latest.total_equity) * 100)
    : null;

  const companyRow: CompanyRow = {
    ticker,
    name: summary.company_name,
    market_cap: currentPrice * shares,
    pe: stats.pe?.current ?? null,
    ev_ebitda: stats.ev_ebitda?.current ?? null,
    pb: stats.pb?.current ?? null,
    ps: stats.ps?.current ?? null,
    revenue_growth: revenueGrowth,
    net_margin: netMargin,
    roe,
  };

  return {
    ticker,
    companyName: summary.company_name,
    currentPrice,
    sharesOutstanding: shares,
    netDebt,
    consensusFairValue,
    consensusUpside,
    multiples,
    peers,
    companyRow,
  };
});
