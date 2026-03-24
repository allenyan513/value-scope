// ============================================================
// Trading Multiples Valuation (P/E, EV/EBITDA)
// Uses historical self-comparison: fair value = 5Y avg multiple × metric
// Falls back to peer-based when insufficient history
// ============================================================

import type {
  ValuationResult,
  ValuationModelType,
  PeerComparison,
  FinancialStatement,
  Company,
  HistoricalMultiplesPoint,
} from "@/types";
import { MIN_HISTORY_POINTS, MAX_PE_RATIO } from "@/lib/constants";

/** Calculate median of an array */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Get 25th and 75th percentile from array */
function percentiles(arr: number[], fallbackMedian: number): { p25: number; p75: number } {
  if (arr.length === 0) return { p25: fallbackMedian * 0.7, p75: fallbackMedian * 1.3 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p25: sorted[Math.floor(sorted.length * 0.25)] ?? fallbackMedian * 0.7,
    p75: sorted[Math.floor(sorted.length * 0.75)] ?? fallbackMedian * 1.3,
  };
}

/** Compute percentile: what % of values are below current */
function computePercentile(sorted: number[], current: number): number {
  const belowCount = sorted.filter((v) => v < current).length;
  return Math.round((belowCount / sorted.length) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TradingMultiplesInputs {
  financials: FinancialStatement;
  company: Company;
  currentPrice: number;
  peers: PeerComparison[];
  /** Historical multiples for self-comparison (optional, used when available) */
  historicalMultiples?: HistoricalMultiplesPoint[];
}

// MIN_HISTORY_POINTS imported from constants

/**
 * P/E Multiples Valuation
 * Primary: Fair Price = 5Y Avg P/E × Company TTM EPS
 * Fallback: Fair Price = Peer Median P/E × Company TTM EPS
 */
export function calculatePEMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const eps = financials.eps_diluted || financials.eps;
  if (!eps || eps <= 0) {
    return naResult("pe_multiples", "N/A — Negative or zero EPS");
  }

  // Try historical self-comparison first
  const histValues = (historicalMultiples ?? [])
    .map((d) => d.pe)
    .filter((v): v is number => v !== null && v > 0 && v < MAX_PE_RATIO);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "pe_multiples",
      values: histValues,
      metric: eps,
      metricLabel: "TTM EPS",
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.trailing_pe,
    });
  }

  // Fallback: peer-based
  return peerBasedValuation({
    modelType: "pe_multiples",
    peers,
    peerExtractor: (p) => p.trailing_pe,
    peerCap: 200,
    defaultMultiple: 20,
    metric: eps,
    metricLabel: "TTM EPS",
    currentPrice,
    company,
  });
}

/**
 * EV/EBITDA Multiples Valuation
 * Fair EV = 5Y Avg EV/EBITDA × Trailing EBITDA → Equity Value = EV − Net Debt → Fair Price = Equity / Shares
 */
export function calculateEVEBITDAMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const ebitda = financials.ebitda;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;
  if (!ebitda || ebitda <= 0 || !sharesOutstanding) {
    return naResult("ev_ebitda_multiples", "N/A — Negative or zero EBITDA");
  }

  const netDebt = (financials.total_debt || 0) - (financials.cash_and_equivalents || 0);

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.ev_ebitda)
    .filter((v): v is number => v != null && v > 0 && v < 100);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return evBasedHistoricalValuation({
      modelType: "ev_ebitda_multiples",
      values: histValues,
      metric: ebitda,
      metricLabel: "EBITDA",
      netDebt,
      sharesOutstanding,
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.ev_ebitda,
    });
  }

  return evBasedPeerValuation({
    modelType: "ev_ebitda_multiples",
    peers,
    peerExtractor: (p) => p.ev_ebitda,
    peerCap: 100,
    defaultMultiple: 15,
    metric: ebitda,
    metricLabel: "EBITDA",
    netDebt,
    sharesOutstanding,
    currentPrice,
    company,
  });
}

// --- Internal helpers ---

function naResult(modelType: ValuationModelType, note: string): ValuationResult {
  return {
    model_type: modelType,
    fair_value: 0,
    upside_percent: 0,
    low_estimate: 0,
    high_estimate: 0,
    assumptions: { note },
    details: {},
    computed_at: new Date().toISOString(),
  };
}

interface HistoricalValuationArgs {
  modelType: ValuationModelType;
  values: number[];
  metric: number;
  metricLabel: string;
  currentPrice: number;
  company: Company;
  peers: PeerComparison[];
  peerExtractor: (p: PeerComparison) => number | null;
}

function historicalValuation(args: HistoricalValuationArgs): ValuationResult {
  const { modelType, values, metric, metricLabel, currentPrice, company, peers, peerExtractor } = args;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = values[values.length - 1]; // most recent
  const pctile = computePercentile(sorted, current);
  const deviation = Math.round(((current - avg) / avg) * 100);

  const fairValue = avg * metric;
  const lowEstimate = p25 * metric;
  const highEstimate = p75 * metric;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Supplementary: peer/sector median
  const validPeerValues = peers
    .map(peerExtractor)
    .filter((v): v is number => v !== null && v > 0);
  const sectorMedian = validPeerValues.length > 0 ? median(validPeerValues) : null;

  return {
    model_type: modelType,
    fair_value: round2(fairValue),
    upside_percent: round2(upside),
    low_estimate: round2(lowEstimate),
    high_estimate: round2(highEstimate),
    assumptions: {
      method: "historical_self_comparison",
      historical_avg: round2(avg),
      historical_p25: round2(p25),
      historical_p75: round2(p75),
      current_multiple: round2(current),
      percentile: pctile,
      deviation_pct: deviation,
      company_metric: round2(metric),
      metric_label: metricLabel,
      data_points: values.length,
      sector_median: sectorMedian !== null ? round2(sectorMedian) : null,
      industry: company.industry,
    },
    details: {
      peers: peers.filter((p) => {
        const v = peerExtractor(p);
        return v !== null && v > 0;
      }),
      industry_median: sectorMedian ?? avg,
      company_metric: metric,
      metric_label: metricLabel,
    },
    computed_at: new Date().toISOString(),
  };
}

interface PeerBasedArgs {
  modelType: ValuationModelType;
  peers: PeerComparison[];
  peerExtractor: (p: PeerComparison) => number | null;
  peerCap: number;
  defaultMultiple: number;
  metric: number;
  metricLabel: string;
  currentPrice: number;
  company: Company;
}

function peerBasedValuation(args: PeerBasedArgs): ValuationResult {
  const { modelType, peers, peerExtractor, peerCap, defaultMultiple, metric, metricLabel, currentPrice, company } = args;

  const validPeers = peers.filter((p) => {
    const v = peerExtractor(p);
    return v !== null && v > 0 && v < peerCap;
  });

  const values = validPeers.map((p) => peerExtractor(p)!);
  const med = values.length > 0 ? median(values) : defaultMultiple;
  const { p25, p75 } = percentiles(values, med);

  const fairValue = med * metric;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  return {
    model_type: modelType,
    fair_value: round2(fairValue),
    upside_percent: round2(upside),
    low_estimate: round2(p25 * metric),
    high_estimate: round2(p75 * metric),
    assumptions: {
      method: "peer_comparison",
      industry_median: round2(med),
      company_metric: round2(metric),
      metric_label: metricLabel,
      peer_count: validPeers.length,
      industry: company.industry,
    },
    details: {
      peers: validPeers,
      industry_median: med,
      company_metric: metric,
      metric_label: metricLabel,
    },
    computed_at: new Date().toISOString(),
  };
}

interface EVBasedHistoricalArgs {
  modelType: ValuationModelType;
  values: number[];
  metric: number;
  metricLabel: string;
  netDebt: number;
  sharesOutstanding: number;
  currentPrice: number;
  company: Company;
  peers: PeerComparison[];
  peerExtractor: (p: PeerComparison) => number | null;
}

function evBasedHistoricalValuation(args: EVBasedHistoricalArgs): ValuationResult {
  const { modelType, values, metric, metricLabel, netDebt, sharesOutstanding, currentPrice, company, peers, peerExtractor } = args;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = values[values.length - 1];
  const pctile = computePercentile(sorted, current);
  const deviation = Math.round(((current - avg) / avg) * 100);

  const fairEV = avg * metric;
  const equityValue = fairEV - netDebt;
  const fairPrice = equityValue / sharesOutstanding;
  const upside = ((fairPrice - currentPrice) / currentPrice) * 100;

  const lowEV = p25 * metric;
  const highEV = p75 * metric;

  const validPeerValues = peers
    .map(peerExtractor)
    .filter((v): v is number => v !== null && v > 0);
  const sectorMedian = validPeerValues.length > 0 ? median(validPeerValues) : null;

  return {
    model_type: modelType,
    fair_value: round2(fairPrice),
    upside_percent: round2(upside),
    low_estimate: round2((lowEV - netDebt) / sharesOutstanding),
    high_estimate: round2((highEV - netDebt) / sharesOutstanding),
    assumptions: {
      method: "historical_self_comparison",
      historical_avg: round2(avg),
      historical_p25: round2(p25),
      historical_p75: round2(p75),
      current_multiple: round2(current),
      percentile: pctile,
      deviation_pct: deviation,
      company_metric: round2(metric),
      metric_label: metricLabel,
      data_points: values.length,
      sector_median: sectorMedian !== null ? round2(sectorMedian) : null,
      industry: company.industry,
      net_debt: round2(netDebt),
      shares_outstanding: sharesOutstanding,
    },
    details: {
      peers: peers.filter((p) => {
        const v = peerExtractor(p);
        return v !== null && v > 0;
      }),
      industry_median: sectorMedian ?? avg,
      company_metric: metric,
      metric_label: metricLabel,
    },
    computed_at: new Date().toISOString(),
  };
}

interface EVBasedPeerArgs {
  modelType: ValuationModelType;
  peers: PeerComparison[];
  peerExtractor: (p: PeerComparison) => number | null;
  peerCap: number;
  defaultMultiple: number;
  metric: number;
  metricLabel: string;
  netDebt: number;
  sharesOutstanding: number;
  currentPrice: number;
  company: Company;
}

function evBasedPeerValuation(args: EVBasedPeerArgs): ValuationResult {
  const { modelType, peers, peerExtractor, peerCap, defaultMultiple, metric, metricLabel, netDebt, sharesOutstanding, currentPrice, company } = args;

  const validPeers = peers.filter((p) => {
    const v = peerExtractor(p);
    return v !== null && v > 0 && v < peerCap;
  });

  const values = validPeers.map((p) => peerExtractor(p)!);
  const med = values.length > 0 ? median(values) : defaultMultiple;
  const { p25, p75 } = percentiles(values, med);

  const fairEV = med * metric;
  const equityValue = fairEV - netDebt;
  const fairPrice = equityValue / sharesOutstanding;
  const upside = ((fairPrice - currentPrice) / currentPrice) * 100;

  return {
    model_type: modelType,
    fair_value: round2(fairPrice),
    upside_percent: round2(upside),
    low_estimate: round2((p25 * metric - netDebt) / sharesOutstanding),
    high_estimate: round2((p75 * metric - netDebt) / sharesOutstanding),
    assumptions: {
      method: "peer_comparison",
      industry_median: round2(med),
      company_metric: round2(metric),
      metric_label: metricLabel,
      peer_count: validPeers.length,
      industry: company.industry,
      net_debt: round2(netDebt),
      shares_outstanding: sharesOutstanding,
    },
    details: {
      peers: validPeers,
      industry_median: med,
      company_metric: metric,
      metric_label: metricLabel,
    },
    computed_at: new Date().toISOString(),
  };
}
