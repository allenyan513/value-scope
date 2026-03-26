import { cache } from "react";
import { getCoreTickerData } from "../../data";
import { computeMultiplesStats } from "@/lib/valuation/historical-multiples";
import type { PeerComparison } from "@/types";

export interface RelativeValuationData {
  type: "pe" | "ev_ebitda";
  label: string;
  currentPrice: number;
  trailingMultiple: { selected: number; low: number; high: number } | null;
  trailingFairPrice: number | null;
  trailingUpside: number | null;
  forwardMultiple: { selected: number; low: number; high: number } | null;
  forwardFairPrice: number | null;
  forwardUpside: number | null;
  selectedFairPrice: number;
  selectedUpside: number;
  trailingMetric: number | null;
  trailingMetricLabel: string;
  forwardMetric: number | null;
  forwardMetricLabel: string;
  netDebt: number | null;
  sharesOutstanding: number;
  peers: PeerComparison[];
  companyMultiple: { trailing: number | null; forward: number | null };
  ticker: string;
  companyName: string;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentileRange(arr: number[]): { low: number; high: number } {
  if (arr.length === 0) return { low: 0, high: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    low: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
    high: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const getRelativeValuationData = cache(async (ticker: string): Promise<{
  peData: RelativeValuationData | null;
  evData: RelativeValuationData | null;
  error?: string;
}> => {
  const { summary, historicals, historicalMultiples } = await getCoreTickerData(ticker);

  if (!summary || !historicalMultiples || historicalMultiples.length === 0) {
    return { peData: null, evData: null, error: "Historical data not yet available for trading multiples analysis." };
  }

  const stats = computeMultiplesStats(historicalMultiples);
  const sortedHistoricals = [...historicals].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sortedHistoricals[0];
  const shares = latest?.shares_outstanding;
  if (!latest || !shares) {
    return { peData: null, evData: null, error: "Insufficient data for trading multiples analysis." };
  }

  const currentPrice = summary.current_price;
  const peers = summary.models
    .find((m) => m.model_type === "pe_multiples" || m.model_type === "ev_ebitda_multiples")
    ?.details?.peers as PeerComparison[] | undefined ?? [];
  const netDebt = (latest.total_debt || 0) - (latest.cash_and_equivalents || 0);

  // --- P/E ---
  const eps = latest.eps_diluted || latest.eps;
  const trailingProfitAfterTax = eps > 0 ? latest.net_income : null;
  const trailingPEs = peers.map((p) => p.trailing_pe).filter((v): v is number => v !== null && v > 0 && v < 200);
  const trailingPEMedian = trailingPEs.length > 0 ? median(trailingPEs) : stats.pe?.avg5y ?? null;
  const trailingPERange = trailingPEs.length > 0
    ? percentileRange(trailingPEs)
    : stats.pe ? { low: stats.pe.p25, high: stats.pe.p75 } : { low: 0, high: 0 };

  const forwardPEs = peers.map((p) => p.forward_pe).filter((v): v is number => v !== null && v > 0 && v < 200);
  const forwardPEMedian = forwardPEs.length > 0 ? median(forwardPEs) : null;
  const forwardPERange = percentileRange(forwardPEs);

  let peTrailingFairPrice: number | null = null;
  let peTrailingUpside: number | null = null;
  if (trailingPEMedian && trailingProfitAfterTax && trailingProfitAfterTax > 0) {
    const equityValue = trailingPEMedian * trailingProfitAfterTax;
    peTrailingFairPrice = Math.round((equityValue / shares) * 100) / 100;
    peTrailingUpside = Math.round(((peTrailingFairPrice - currentPrice) / currentPrice) * 10000) / 100;
  }

  const peData: RelativeValuationData = {
    type: "pe",
    label: "P/E Multiples",
    currentPrice,
    trailingMultiple: trailingPEMedian ? { selected: round1(trailingPEMedian), low: round1(trailingPERange.low), high: round1(trailingPERange.high) } : null,
    trailingFairPrice: peTrailingFairPrice,
    trailingUpside: peTrailingUpside,
    forwardMultiple: forwardPEMedian ? { selected: round1(forwardPEMedian), low: round1(forwardPERange.low), high: round1(forwardPERange.high) } : null,
    forwardFairPrice: null,
    forwardUpside: null,
    selectedFairPrice: peTrailingFairPrice ?? 0,
    selectedUpside: peTrailingUpside ?? 0,
    trailingMetric: trailingProfitAfterTax,
    trailingMetricLabel: "Profit after tax",
    forwardMetric: null,
    forwardMetricLabel: "Forward Profit",
    netDebt: null,
    sharesOutstanding: shares,
    peers,
    companyMultiple: { trailing: stats.pe?.current ?? null, forward: null },
    ticker,
    companyName: summary.company_name,
  };

  // --- EV/EBITDA ---
  const ebitda = latest.ebitda;
  const trailingEVEBITDAs = peers.map((p) => p.ev_ebitda).filter((v): v is number => v !== null && v > 0 && v < 100);
  const trailingEVEBITDAMedian = trailingEVEBITDAs.length > 0
    ? median(trailingEVEBITDAs)
    : stats.ev_ebitda?.avg5y ?? null;
  const trailingEVEBITDARange = trailingEVEBITDAs.length > 0
    ? percentileRange(trailingEVEBITDAs)
    : stats.ev_ebitda ? { low: stats.ev_ebitda.p25, high: stats.ev_ebitda.p75 } : { low: 0, high: 0 };

  let evTrailingFairPrice: number | null = null;
  let evTrailingUpside: number | null = null;
  if (trailingEVEBITDAMedian && ebitda && ebitda > 0) {
    const fairEV = trailingEVEBITDAMedian * ebitda;
    const equityValue = fairEV - netDebt;
    evTrailingFairPrice = Math.round((equityValue / shares) * 100) / 100;
    evTrailingUpside = Math.round(((evTrailingFairPrice - currentPrice) / currentPrice) * 10000) / 100;
  }

  const evData: RelativeValuationData = {
    type: "ev_ebitda",
    label: "EV/EBITDA Multiples",
    currentPrice,
    trailingMultiple: trailingEVEBITDAMedian ? { selected: round1(trailingEVEBITDAMedian), low: round1(trailingEVEBITDARange.low), high: round1(trailingEVEBITDARange.high) } : null,
    trailingFairPrice: evTrailingFairPrice,
    trailingUpside: evTrailingUpside,
    forwardMultiple: null,
    forwardFairPrice: null,
    forwardUpside: null,
    selectedFairPrice: evTrailingFairPrice ?? 0,
    selectedUpside: evTrailingUpside ?? 0,
    trailingMetric: ebitda,
    trailingMetricLabel: "EBITDA",
    forwardMetric: null,
    forwardMetricLabel: "Forward EBITDA",
    netDebt,
    sharesOutstanding: shares,
    peers,
    companyMultiple: { trailing: stats.ev_ebitda?.current ?? null, forward: null },
    ticker,
    companyName: summary.company_name,
  };

  return {
    peData: peData.trailingMultiple ? peData : null,
    evData: evData.trailingMultiple ? evData : null,
  };
});
