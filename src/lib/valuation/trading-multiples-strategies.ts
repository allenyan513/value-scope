// ============================================================
// Trading Multiples — Internal Strategy Functions
// Four reusable strategies for computing fair value from multiples.
// ============================================================

import type {
  ValuationResult,
  ValuationModelType,
  PeerComparison,
  Company,
} from "@/types";
import { median, percentiles, computePercentile, round2 } from "./statistics";

export function naResult(modelType: ValuationModelType, note: string): ValuationResult {
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

export interface HistoricalValuationArgs {
  modelType: ValuationModelType;
  values: number[];
  metric: number;
  metricLabel: string;
  currentPrice: number;
  company: Company;
  peers: PeerComparison[];
  peerExtractor: (p: PeerComparison) => number | null;
}

export function historicalValuation(args: HistoricalValuationArgs): ValuationResult {
  const { modelType, values, metric, metricLabel, currentPrice, company, peers, peerExtractor } = args;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = values[values.length - 1];
  const pctile = computePercentile(sorted, current);
  const deviation = Math.round(((current - avg) / avg) * 100);

  const fairValue = avg * metric;
  const lowEstimate = p25 * metric;
  const highEstimate = p75 * metric;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

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

export interface PeerBasedArgs {
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

export function peerBasedValuation(args: PeerBasedArgs): ValuationResult {
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

export interface EVBasedHistoricalArgs {
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

export function evBasedHistoricalValuation(args: EVBasedHistoricalArgs): ValuationResult {
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

export interface EVBasedPeerArgs {
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

export function evBasedPeerValuation(args: EVBasedPeerArgs): ValuationResult {
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
