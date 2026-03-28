// ============================================================
// Trading Multiples Valuation (P/E, EV/EBITDA)
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
import { MIN_HISTORY_POINTS, MAX_PE_RATIO } from "@/lib/constants";
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
