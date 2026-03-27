// ============================================================
// Trading Multiples Valuation (P/E, EV/EBITDA, P/B, P/S, P/FCF)
// Uses historical self-comparison: fair value = 5Y avg multiple × metric
// Falls back to peer-based when insufficient history
// ============================================================

import type {
  ValuationResult,
  PeerComparison,
  FinancialStatement,
  Company,
  HistoricalMultiplesPoint,
} from "@/types";
import { MIN_HISTORY_POINTS, MAX_PE_RATIO, MAX_PB_RATIO, MAX_PS_RATIO, MAX_PFCF_RATIO } from "@/lib/constants";
import {
  naResult,
  historicalValuation,
  peerBasedValuation,
  evBasedHistoricalValuation,
  evBasedPeerValuation,
} from "./trading-multiples-strategies";

export interface TradingMultiplesInputs {
  financials: FinancialStatement;
  company: Company;
  currentPrice: number;
  peers: PeerComparison[];
  /** Historical multiples for self-comparison (optional, used when available) */
  historicalMultiples?: HistoricalMultiplesPoint[];
}

/**
 * P/E Multiples Valuation
 * Primary: Fair Price = 5Y Avg P/E × Company TTM EPS
 * Fallback: Fair Price = Peer Median P/E × Company TTM EPS
 */
export function calculatePEMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const eps = financials.eps_diluted || financials.eps;
  if (!eps || eps <= 0) {
    return naResult("pe_multiples", "N/A — Negative or zero EPS");
  }
  if (currentPrice > 0 && eps < currentPrice * 0.001) {
    return naResult("pe_multiples", `N/A — EPS ($${eps.toFixed(2)}) too small relative to price`);
  }

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
export function calculateEVEBITDAMultiples(inputs: TradingMultiplesInputs): ValuationResult {
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

/**
 * P/B Multiples Valuation
 * Fair Price = Avg P/B × Book Value Per Share
 */
export function calculatePBMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const shares = financials.shares_outstanding || company.shares_outstanding;
  const bookValue = financials.total_equity;
  if (!bookValue || bookValue <= 0 || !shares || shares <= 0) {
    return naResult("pb_multiples", "N/A — Negative or zero book value");
  }

  const bookValuePerShare = bookValue / shares;

  if (currentPrice > 0 && bookValuePerShare < currentPrice * 0.005) {
    return naResult("pb_multiples", `N/A — Book value/share ($${bookValuePerShare.toFixed(2)}) too small relative to price`);
  }

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.pb)
    .filter((v): v is number => v !== null && v > 0 && v < MAX_PB_RATIO);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "pb_multiples",
      values: histValues,
      metric: bookValuePerShare,
      metricLabel: "Book Value/Share",
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.price_to_book,
    });
  }

  return peerBasedValuation({
    modelType: "pb_multiples",
    peers,
    peerExtractor: (p) => p.price_to_book,
    peerCap: MAX_PB_RATIO,
    defaultMultiple: 3,
    metric: bookValuePerShare,
    metricLabel: "Book Value/Share",
    currentPrice,
    company,
  });
}

/**
 * P/S Multiples Valuation
 * Fair Price = Avg P/S × Revenue Per Share
 */
export function calculatePSMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const shares = financials.shares_outstanding || company.shares_outstanding;
  const revenue = financials.revenue;
  if (!revenue || revenue <= 0 || !shares || shares <= 0) {
    return naResult("ps_multiples", "N/A — Zero revenue");
  }

  const revenuePerShare = revenue / shares;

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.ps)
    .filter((v): v is number => v !== null && v > 0 && v < MAX_PS_RATIO);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "ps_multiples",
      values: histValues,
      metric: revenuePerShare,
      metricLabel: "Revenue/Share",
      currentPrice,
      company,
      peers,
      peerExtractor: (p) => p.price_to_sales,
    });
  }

  return peerBasedValuation({
    modelType: "ps_multiples",
    peers,
    peerExtractor: (p) => p.price_to_sales,
    peerCap: MAX_PS_RATIO,
    defaultMultiple: 5,
    metric: revenuePerShare,
    metricLabel: "Revenue/Share",
    currentPrice,
    company,
  });
}

/**
 * P/FCF Multiples Valuation
 * Fair Price = Avg P/FCF × Free Cash Flow Per Share
 */
export function calculatePFCFMultiples(inputs: TradingMultiplesInputs): ValuationResult {
  const { financials, company, currentPrice, peers, historicalMultiples } = inputs;

  const shares = financials.shares_outstanding || company.shares_outstanding;
  const fcf = financials.free_cash_flow;
  if (!fcf || fcf <= 0 || !shares || shares <= 0) {
    return naResult("p_fcf_multiples", "N/A — Negative or zero free cash flow");
  }

  const fcfPerShare = fcf / shares;

  if (currentPrice > 0 && fcfPerShare < currentPrice * 0.001) {
    return naResult("p_fcf_multiples", `N/A — FCF/share ($${fcfPerShare.toFixed(2)}) too small relative to price`);
  }

  const histValues = (historicalMultiples ?? [])
    .map((d) => d.p_fcf)
    .filter((v): v is number => v !== null && v > 0 && v < MAX_PFCF_RATIO);

  if (histValues.length >= MIN_HISTORY_POINTS) {
    return historicalValuation({
      modelType: "p_fcf_multiples",
      values: histValues,
      metric: fcfPerShare,
      metricLabel: "FCF/Share",
      currentPrice,
      company,
      peers,
      peerExtractor: () => null,
    });
  }

  return peerBasedValuation({
    modelType: "p_fcf_multiples",
    peers,
    peerExtractor: () => null,
    peerCap: MAX_PFCF_RATIO,
    defaultMultiple: 20,
    metric: fcfPerShare,
    metricLabel: "FCF/Share",
    currentPrice,
    company,
  });
}
