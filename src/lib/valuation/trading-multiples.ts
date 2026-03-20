// ============================================================
// Trading Multiples Valuation (P/E and EV/EBITDA)
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
  const sortedPEs = [...trailingPEs].sort((a, b) => a - b);
  const p25 = sortedPEs[Math.floor(sortedPEs.length * 0.25)] || medianTrailingPE * 0.7;
  const p75 = sortedPEs[Math.floor(sortedPEs.length * 0.75)] || medianTrailingPE * 1.3;
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
 * EV/EBITDA Multiples Valuation
 *
 * Fair Price = (Industry Median EV/EBITDA × Company EBITDA − Net Debt) / Shares Outstanding
 */
export function calculateEVEBITDAMultiples(
  inputs: TradingMultiplesInputs
): ValuationResult {
  const { financials, company, currentPrice, peers } = inputs;

  // Filter peers with valid EV/EBITDA
  const validPeers = peers.filter(
    (p) => p.ev_ebitda !== null && p.ev_ebitda > 0 && p.ev_ebitda < 100
  );

  const evEbitdaValues = validPeers.map((p) => p.ev_ebitda!);
  const medianEVEBITDA = evEbitdaValues.length > 0 ? median(evEbitdaValues) : 12;

  const ebitda = financials.ebitda;
  const netDebt = financials.net_debt || 0;
  const sharesOutstanding = financials.shares_outstanding || company.shares_outstanding;

  if (!ebitda || ebitda <= 0 || !sharesOutstanding) {
    return {
      model_type: "ev_ebitda_multiples",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: {
        note: "N/A — Negative or zero EBITDA",
        industry_median_ev_ebitda: medianEVEBITDA,
        ebitda,
      },
      details: { peers: validPeers, industry_median: medianEVEBITDA, company_metric: ebitda, metric_label: "EBITDA" },
      computed_at: new Date().toISOString(),
    };
  }

  const enterpriseValue = medianEVEBITDA * ebitda;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;

  // Range from 25th/75th percentile
  const sorted = [...evEbitdaValues].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)] || medianEVEBITDA * 0.7;
  const p75 = sorted[Math.floor(sorted.length * 0.75)] || medianEVEBITDA * 1.3;
  const lowEstimate = Math.max(0, (p25 * ebitda - netDebt) / sharesOutstanding);
  const highEstimate = Math.max(0, (p75 * ebitda - netDebt) / sharesOutstanding);

  return {
    model_type: "ev_ebitda_multiples",
    fair_value: fairValue,
    upside_percent: upside,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      industry_median_ev_ebitda: Math.round(medianEVEBITDA * 100) / 100,
      company_ebitda: ebitda,
      net_debt: netDebt,
      shares_outstanding: sharesOutstanding,
      peer_count: validPeers.length,
      industry: company.industry,
    },
    details: {
      peers: validPeers,
      industry_median: medianEVEBITDA,
      company_metric: ebitda,
      metric_label: "EBITDA",
    },
    computed_at: new Date().toISOString(),
  };
}
