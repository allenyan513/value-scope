import { cache } from "react";
import { getCoreTickerData } from "../../data";
import { computePeerMetricsFromDB } from "@/lib/db/queries";
import {
  calculatePEMultiplesDetailed,
  calculateEVEBITDAMultiplesDetailed,
  type TradingMultiplesInputs,
  type MultipleLeg,
  type TradingMultiplesDetailedResult,
} from "@/lib/valuation/trading-multiples";
import type { PeerComparison } from "@/types";

// --- Public types ---

export type MultipleKey = "pe" | "ev_ebitda";

/** Per-multiple detailed result for the UI */
export interface MultipleDetail {
  key: MultipleKey;
  label: string;
  /** Selected fair price = average of trailing + forward legs */
  fairValue: number | null;
  upside: number | null;
  trailing: MultipleLeg | null;
  forward: MultipleLeg | null;
  peerRange: { p25: number; p75: number };
  peerCount: number;
  /** Is this an EV-based multiple (needs net debt bridge) */
  isEVBased: boolean;
  netDebt: number;
  sharesOutstanding: number;
}

export interface CompanyRow {
  ticker: string;
  name: string;
  market_cap: number;
  trailing_pe: number | null;
  forward_pe: number | null;
  ev_ebitda: number | null;
  forward_ev_ebitda: number | null;
}

export interface RelativePageData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
  industry: string;
  consensusFairValue: number;
  consensusUpside: number;
  multiples: MultipleDetail[];
  peers: PeerComparison[];
  companyRow: CompanyRow;
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

function buildMultipleDetail(
  key: MultipleKey,
  label: string,
  detailed: TradingMultiplesDetailedResult,
  isEVBased: boolean,
  netDebt: number,
  sharesOutstanding: number,
): MultipleDetail {
  const { result, trailing, forward, peerRange, peerCount } = detailed;
  return {
    key,
    label,
    fairValue: result.fair_value > 0 ? result.fair_value : null,
    upside: result.fair_value > 0 ? result.upside_percent : null,
    trailing,
    forward,
    peerRange,
    peerCount,
    isEVBased,
    netDebt,
    sharesOutstanding,
  };
}

// --- Main data function ---

export const getRelativeValuationData = cache(async (ticker: string): Promise<RelativePageData | null> => {
  // Fetch core data + page-specific peers with forward multiples in parallel
  const [coreData, peers] = await Promise.all([
    getCoreTickerData(ticker),
    computePeerMetricsFromDB(ticker, 15),
  ]);
  const { company, summary, estimates, historicals } = coreData;

  if (!summary) return null;

  const sortedHistoricals = [...historicals].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sortedHistoricals[0];
  const shares = latest?.shares_outstanding || company.shares_outstanding;
  if (!latest || !shares) return null;

  const currentPrice = summary.current_price;
  const netDebt = (latest.total_debt || 0) - (latest.cash_and_equivalents || 0);

  // Derive forward metrics from analyst estimates
  const nextEstimate = estimates[0]; // nearest forward year
  let forwardNetIncome: number | undefined;
  let forwardEBITDA: number | undefined;

  if (nextEstimate) {
    if (nextEstimate.eps_estimate > 0) {
      forwardNetIncome = nextEstimate.eps_estimate * shares;
    }
    if (nextEstimate.revenue_estimate > 0 && latest.ebitda && latest.revenue && latest.revenue > 0) {
      const ebitdaMargin = latest.ebitda / latest.revenue;
      forwardEBITDA = nextEstimate.revenue_estimate * ebitdaMargin;
    }
  }

  // Build trading multiples inputs
  const tradingInputs: TradingMultiplesInputs = {
    financials: latest,
    company,
    currentPrice,
    peers,
    forwardNetIncome,
    forwardEBITDA,
  };

  // Run detailed trading multiples models
  const peDetailed = calculatePEMultiplesDetailed(tradingInputs);
  const evDetailed = calculateEVEBITDAMultiplesDetailed(tradingInputs);

  // Build per-multiple details
  const multiples: MultipleDetail[] = [
    buildMultipleDetail("pe", "P/E", peDetailed, false, netDebt, shares),
    buildMultipleDetail("ev_ebitda", "EV/EBITDA", evDetailed, true, netDebt, shares),
  ];

  // Consensus: median of available fair values
  const validFairValues = multiples
    .map((m) => m.fairValue)
    .filter((v): v is number => v !== null && v > 0);
  const consensusFairValue = validFairValues.length > 0 ? round2(median(validFairValues)) : 0;
  const consensusUpside = consensusFairValue > 0
    ? round2(((consensusFairValue - currentPrice) / currentPrice) * 100)
    : 0;

  // Company row — compute company's own multiples for the peer table
  const eps = latest.eps_diluted || latest.eps;
  const companyTrailingPE = eps && eps > 0 && currentPrice > 0 ? currentPrice / eps : null;
  const companyForwardPE = nextEstimate?.eps_estimate && nextEstimate.eps_estimate > 0 && currentPrice > 0
    ? currentPrice / nextEstimate.eps_estimate
    : null;
  const companyEV = currentPrice * shares + (latest.total_debt || 0) - (latest.cash_and_equivalents || 0);
  const companyEvEbitda = latest.ebitda && latest.ebitda > 0 ? companyEV / latest.ebitda : null;
  const companyForwardEvEbitda = forwardEBITDA && forwardEBITDA > 0 ? companyEV / forwardEBITDA : null;

  const companyRow: CompanyRow = {
    ticker,
    name: summary.company_name,
    market_cap: currentPrice * shares,
    trailing_pe: companyTrailingPE,
    forward_pe: companyForwardPE,
    ev_ebitda: companyEvEbitda,
    forward_ev_ebitda: companyForwardEvEbitda,
  };

  return {
    ticker,
    companyName: summary.company_name,
    currentPrice,
    sharesOutstanding: shares,
    netDebt,
    industry: company.industry || "Unknown",
    consensusFairValue,
    consensusUpside,
    multiples,
    peers,
    companyRow,
  };
});
