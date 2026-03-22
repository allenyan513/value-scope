// ============================================================
// Trading Multiples Valuation (P/E, P/S, P/B)
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

export interface TradingMultiplesInputs {
  financials: FinancialStatement;
  company: Company;
  currentPrice: number;
  peers: PeerComparison[];
  /** Historical multiples for self-comparison (optional, used when available) */
  historicalMultiples?: HistoricalMultiplesPoint[];
}

// Minimum data points to use historical self-comparison
const MIN_HISTORY_POINTS = 100;

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
    .filter((v): v is number => v !== null && v > 0 && v < 200);

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
 * P/S Multiples Valuation
 * Primary: Fair Price = 5Y Avg P/S × Revenue per Share
 * Fallback: Peer-based
 */
export function calculatePSMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;
  if (!financials.revenue || financials.revenue <= 0 || !sharesOutstanding) {
    return naResult("ps_multiples", "N/A — No revenue data");
  }

  const revenuePerShare = financials.revenue / sharesOutstanding;

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.ps)
    .filter((v): v is number => v !== null && v > 0 && v < 100);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "ps_multiples",
      values: histValues,
      metric: revenuePerShare,
      metricLabel: "Revenue/Share",
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.ps_ratio,
    });
  }

  return peerBasedValuation({
    modelType: "ps_multiples",
    peers,
    peerExtractor: (p) => p.ps_ratio,
    peerCap: 200,
    defaultMultiple: 3,
    metric: revenuePerShare,
    metricLabel: "Revenue/Share",
    currentPrice,
    company,
  });
}

/**
 * P/B Multiples Valuation
 * Primary: Fair Price = 5Y Avg P/B × Book Value per Share
 * Fallback: Peer-based
 */
export function calculatePBMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;
  if (!financials.total_equity || financials.total_equity <= 0 || !sharesOutstanding) {
    return naResult("pb_multiples", "N/A — Negative or zero book value");
  }

  const bookPerShare = financials.total_equity / sharesOutstanding;

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.pb)
    .filter((v): v is number => v !== null && v > 0 && v < 50);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "pb_multiples",
      values: histValues,
      metric: bookPerShare,
      metricLabel: "Book Value/Share",
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.pb_ratio,
    });
  }

  return peerBasedValuation({
    modelType: "pb_multiples",
    peers,
    peerExtractor: (p) => p.pb_ratio,
    peerCap: 100,
    defaultMultiple: 3,
    metric: bookPerShare,
    metricLabel: "Book Value/Share",
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
    fair_value: Math.round(fairValue * 100) / 100,
    upside_percent: Math.round(upside * 100) / 100,
    low_estimate: Math.round(lowEstimate * 100) / 100,
    high_estimate: Math.round(highEstimate * 100) / 100,
    assumptions: {
      method: "historical_self_comparison",
      historical_avg: Math.round(avg * 100) / 100,
      historical_p25: Math.round(p25 * 100) / 100,
      historical_p75: Math.round(p75 * 100) / 100,
      current_multiple: Math.round(current * 100) / 100,
      percentile: pctile,
      deviation_pct: deviation,
      company_metric: Math.round(metric * 100) / 100,
      metric_label: metricLabel,
      data_points: values.length,
      sector_median: sectorMedian !== null ? Math.round(sectorMedian * 100) / 100 : null,
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
    fair_value: Math.round(fairValue * 100) / 100,
    upside_percent: Math.round(upside * 100) / 100,
    low_estimate: Math.round(p25 * metric * 100) / 100,
    high_estimate: Math.round(p75 * metric * 100) / 100,
    assumptions: {
      method: "peer_comparison",
      industry_median: Math.round(med * 100) / 100,
      company_metric: Math.round(metric * 100) / 100,
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
