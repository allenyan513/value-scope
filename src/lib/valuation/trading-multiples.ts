// ============================================================
// Trading Multiples Valuation (P/E, P/S, P/B)
// ============================================================

import type {
  ValuationResult,
  PeerComparison,
  FinancialStatement,
  Company,
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

export interface TradingMultiplesInputs {
  /** Target company latest financials */
  financials: FinancialStatement;
  /** Target company info */
  company: Company;
  /** Current stock price */
  currentPrice: number;
  /** Peer companies data (from same industry) */
  peers: PeerComparison[];
}

/**
 * P/E Multiples Valuation
 *
 * Fair Price = Industry Median P/E × Company TTM EPS
 */
export function calculatePEMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers } = inputs;

  // Filter peers with valid P/E ratios
  const validPeers = peers.filter(
    (p) => p.trailing_pe !== null && p.trailing_pe > 0 && p.trailing_pe < 200
  );

  const trailingPEs = validPeers
    .map((p) => p.trailing_pe!)
    .filter((pe) => pe > 0);
  const forwardPEs = validPeers
    .map((p) => p.forward_pe!)
    .filter((pe) => pe !== null && pe > 0);

  const medianTrailingPE = trailingPEs.length > 0 ? median(trailingPEs) : 20;
  const medianForwardPE = forwardPEs.length > 0 ? median(forwardPEs) : medianTrailingPE;

  // Company EPS
  const eps = financials.eps_diluted || financials.eps;
  if (!eps || eps <= 0) {
    return {
      model_type: "pe_multiples",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: {
        note: "N/A — Negative or zero EPS",
        industry_median_pe: medianTrailingPE,
        eps,
      },
      details: { peers: validPeers, industry_median: medianTrailingPE, company_metric: eps, metric_label: "TTM EPS" },
      computed_at: new Date().toISOString(),
    };
  }

  // Use average of trailing and forward median P/E
  const blendedPE =
    forwardPEs.length > 0
      ? (medianTrailingPE + medianForwardPE) / 2
      : medianTrailingPE;

  const fairValue = blendedPE * eps;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Range: use 25th and 75th percentile P/E
  const { p25, p75 } = percentiles(trailingPEs, medianTrailingPE);
  const lowEstimate = p25 * eps;
  const highEstimate = p75 * eps;

  return {
    model_type: "pe_multiples",
    fair_value: fairValue,
    upside_percent: upside,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      industry_median_trailing_pe: Math.round(medianTrailingPE * 100) / 100,
      industry_median_forward_pe: Math.round(medianForwardPE * 100) / 100,
      blended_pe: Math.round(blendedPE * 100) / 100,
      company_eps: Math.round(eps * 100) / 100,
      peer_count: validPeers.length,
      industry: company.industry,
    },
    details: {
      peers: validPeers,
      industry_median: blendedPE,
      company_metric: eps,
      metric_label: "TTM EPS",
    },
    computed_at: new Date().toISOString(),
  };
}

/**
 * P/S Multiples Valuation
 *
 * Fair Price = Industry Median P/S × Company Revenue per Share
 */
export function calculatePSMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers } = inputs;

  // Filter peers with valid P/S ratios
  const validPeers = peers.filter(
    (p) => p.ps_ratio !== null && p.ps_ratio > 0 && p.ps_ratio < 200
  );

  const psValues = validPeers.map((p) => p.ps_ratio!);
  const medianPS = psValues.length > 0 ? median(psValues) : 3;

  const revenue = financials.revenue;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!revenue || revenue <= 0 || !sharesOutstanding) {
    return {
      model_type: "ps_multiples",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: {
        note: "N/A — No revenue data",
        industry_median_ps: medianPS,
        revenue,
      },
      details: { peers: validPeers, industry_median: medianPS, company_metric: revenue, metric_label: "Revenue" },
      computed_at: new Date().toISOString(),
    };
  }

  const revenuePerShare = revenue / sharesOutstanding;
  const fairValue = medianPS * revenuePerShare;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  const { p25, p75 } = percentiles(psValues, medianPS);
  const lowEstimate = p25 * revenuePerShare;
  const highEstimate = p75 * revenuePerShare;

  return {
    model_type: "ps_multiples",
    fair_value: fairValue,
    upside_percent: upside,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      industry_median_ps: Math.round(medianPS * 100) / 100,
      company_revenue: revenue,
      revenue_per_share: Math.round(revenuePerShare * 100) / 100,
      shares_outstanding: sharesOutstanding,
      peer_count: validPeers.length,
      industry: company.industry,
    },
    details: {
      peers: validPeers,
      industry_median: medianPS,
      company_metric: revenuePerShare,
      metric_label: "Revenue/Share",
    },
    computed_at: new Date().toISOString(),
  };
}

/**
 * P/B Multiples Valuation
 *
 * Fair Price = Industry Median P/B × Company Book Value per Share
 */
export function calculatePBMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers } = inputs;

  // Filter peers with valid P/B ratios
  const validPeers = peers.filter(
    (p) => p.pb_ratio !== null && p.pb_ratio > 0 && p.pb_ratio < 100
  );

  const pbValues = validPeers.map((p) => p.pb_ratio!);
  const medianPB = pbValues.length > 0 ? median(pbValues) : 3;

  const totalEquity = financials.total_equity;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!totalEquity || totalEquity <= 0 || !sharesOutstanding) {
    return {
      model_type: "pb_multiples",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: {
        note: "N/A — Negative or zero book value",
        industry_median_pb: medianPB,
        total_equity: totalEquity,
      },
      details: { peers: validPeers, industry_median: medianPB, company_metric: totalEquity, metric_label: "Total Equity" },
      computed_at: new Date().toISOString(),
    };
  }

  const bookValuePerShare = totalEquity / sharesOutstanding;
  const fairValue = medianPB * bookValuePerShare;
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  const { p25, p75 } = percentiles(pbValues, medianPB);
  const lowEstimate = p25 * bookValuePerShare;
  const highEstimate = p75 * bookValuePerShare;

  return {
    model_type: "pb_multiples",
    fair_value: fairValue,
    upside_percent: upside,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      industry_median_pb: Math.round(medianPB * 100) / 100,
      company_total_equity: totalEquity,
      book_value_per_share: Math.round(bookValuePerShare * 100) / 100,
      shares_outstanding: sharesOutstanding,
      peer_count: validPeers.length,
      industry: company.industry,
    },
    details: {
      peers: validPeers,
      industry_median: medianPB,
      company_metric: bookValuePerShare,
      metric_label: "Book Value/Share",
    },
    computed_at: new Date().toISOString(),
  };
}
