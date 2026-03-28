// ============================================================
// Valuation Summary Aggregator
// Combines all model results into a unified summary.
// Uses FCFF Growth Exit 5Y as the primary fair value.
// ============================================================

import type {
  ValuationResult,
  ValuationSummary,
  FinancialStatement,
  AnalystEstimate,
  Company,
  PeerComparison,
  HistoricalMultiplesPoint,
  ValuationPillars,
} from "@/types";
import { VERDICT_THRESHOLD } from "@/lib/constants";
import { calculateWACC, buildWACCInputs } from "./wacc";
import { calculateDCFFCFF, calculateDCFFCFF10Y, calculateDCFFCFFEBITDAExit, calculateDCFFCFFEBITDAExit10Y, type DCFFCFFInputs, type DCFFCFFEBITDAExitInputs } from "./dcf-fcff";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  type TradingMultiplesInputs,
} from "./trading-multiples";
import { calculatePEG } from "./peg";
import { calculateEPV } from "./epv";
import { classifyCompany, getTerminalGrowthRate } from "./company-classifier";

export interface FullValuationInputs {
  company: Company;
  historicals: FinancialStatement[]; // Annual, sorted desc
  estimates: AnalystEstimate[];
  peers: PeerComparison[];
  currentPrice: number;
  riskFreeRate: number;
  /** Historical multiples for self-comparison valuation (optional) */
  historicalMultiples?: HistoricalMultiplesPoint[];
  /** Peer EV/EBITDA median for the EBITDA Exit models terminal value */
  peerEVEBITDAMedian?: number;
  /** Sector median unlevered beta for bottom-up WACC (optional) */
  sectorUnleveredBeta?: number;
}

// --- DCF model types for pillar grouping ---
const DCF_MODEL_TYPES = new Set([
  "dcf_fcff_growth_5y",
  "dcf_fcff_growth_10y",
  "dcf_fcff_ebitda_exit_5y",
  "dcf_fcff_ebitda_exit_10y",
]);

const TRADING_MULTIPLES_MODEL_TYPES = new Set([
  "pe_multiples",
  "ev_ebitda_multiples",
]);

/**
 * Build pillar structure for display grouping.
 */
function buildPillars(models: ValuationResult[]): ValuationPillars {
  return {
    dcf: {
      fairValue: 0,
      upside: 0,
      models: models.filter(m => DCF_MODEL_TYPES.has(m.model_type)),
    },
    tradingMultiples: {
      fairValue: 0,
      upside: 0,
      models: models.filter(m => TRADING_MULTIPLES_MODEL_TYPES.has(m.model_type)),
    },
    peg: {
      fairValue: 0,
      upside: 0,
      models: models.filter(m => m.model_type === "peg"),
    },
    epv: {
      fairValue: 0,
      upside: 0,
      models: models.filter(m => m.model_type === "epv"),
    },
  };
}

/**
 * Run all valuation models and produce a unified summary.
 */
export function computeFullValuation(
  inputs: FullValuationInputs
): ValuationSummary {
  const {
    company,
    historicals,
    estimates,
    peers,
    currentPrice,
    riskFreeRate,
    peerEVEBITDAMedian,
  } = inputs;

  // Ensure historicals are sorted descending (most recent first)
  const sortedHistoricals = [...historicals].sort(
    (a, b) => b.fiscal_year - a.fiscal_year
  );

  const latestFinancial = sortedHistoricals[0];
  if (!latestFinancial) {
    throw new Error(`No financial data available for ${company.ticker}`);
  }

  // 0. Classify the company (used for terminal growth + display label)
  const classification = classifyCompany(company, sortedHistoricals, estimates);

  // 1. Calculate WACC
  const waccInputs = buildWACCInputs(
    latestFinancial,
    company.beta || 1.0,
    riskFreeRate,
    company.market_cap || currentPrice * company.shares_outstanding,
    inputs.sectorUnleveredBeta
  );
  const waccResult = calculateWACC(waccInputs);

  // 2. Common DCF inputs
  const sharesOutstanding =
    latestFinancial.shares_outstanding || company.shares_outstanding;

  // 3. Run all models
  const models: ValuationResult[] = [];

  // DCF: FCFF Growth Exit 5Y & 10Y (unlevered, WACC-based) — primary models
  const fcffInputs: DCFFCFFInputs = {
    historicals: sortedHistoricals,
    estimates,
    wacc: waccResult.wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents: latestFinancial.cash_and_equivalents || 0,
    totalDebt: latestFinancial.total_debt || 0,
    terminalGrowthRate: getTerminalGrowthRate(classification.archetype),
  };

  try {
    models.push(calculateDCFFCFF(fcffInputs));
  } catch {
    /* skip if insufficient data */
  }

  try {
    models.push(calculateDCFFCFF10Y(fcffInputs));
  } catch {
    /* skip if insufficient data */
  }

  // DCF: FCFF EBITDA Exit 5Y & 10Y — uses peer EV/EBITDA median as terminal multiple
  if (peerEVEBITDAMedian && peerEVEBITDAMedian > 0) {
    const ebitdaExitInputs: DCFFCFFEBITDAExitInputs = {
      ...fcffInputs,
      peerEVEBITDAMedian,
    };
    try {
      models.push(calculateDCFFCFFEBITDAExit(ebitdaExitInputs));
    } catch {
      /* skip if insufficient data */
    }
    try {
      models.push(calculateDCFFCFFEBITDAExit10Y(ebitdaExitInputs));
    } catch {
      /* skip if insufficient data */
    }
  }

  // Trading Multiples — derive forward metrics from analyst estimates
  const nextEstimate = estimates[0]; // nearest forward year
  let forwardNetIncome: number | undefined;
  let forwardEBITDA: number | undefined;
  if (nextEstimate) {
    if (nextEstimate.eps_estimate > 0) {
      forwardNetIncome = nextEstimate.eps_estimate * sharesOutstanding;
    }
    if (nextEstimate.revenue_estimate > 0 && latestFinancial.ebitda && latestFinancial.revenue && latestFinancial.revenue > 0) {
      const ebitdaMargin = latestFinancial.ebitda / latestFinancial.revenue;
      forwardEBITDA = nextEstimate.revenue_estimate * ebitdaMargin;
    }
  }

  const tradingInputs: TradingMultiplesInputs = {
    financials: latestFinancial,
    company,
    currentPrice,
    peers,
    forwardNetIncome,
    forwardEBITDA,
  };

  models.push(calculatePEMultiples(tradingInputs));
  models.push(calculateEVEBITDAMultiples(tradingInputs));

  // PEG Fair Value
  models.push(
    calculatePEG({
      historicals: sortedHistoricals,
      currentPrice,
      estimates,
      marketCap: company.market_cap || currentPrice * company.shares_outstanding,
    })
  );

  // Earnings Power Value
  try {
    models.push(
      calculateEPV({
        historicals: sortedHistoricals,
        wacc: waccResult.wacc,
        currentPrice,
        sharesOutstanding,
        netDebt: latestFinancial.net_debt ?? 0,
      })
    );
  } catch {
    /* skip if insufficient data */
  }

  // 4. Consensus: FCFF Growth Exit 5Y as single source of truth
  const dcfModel = models.find(m => m.model_type === "dcf_fcff_growth_5y" && m.fair_value > 0);
  const consensus = dcfModel?.fair_value ?? 0;
  const low = dcfModel?.low_estimate ?? 0;
  const high = dcfModel?.high_estimate ?? 0;

  const consensusUpside = currentPrice > 0
    ? ((consensus - currentPrice) / currentPrice) * 100
    : 0;

  // 5. Primary valuation
  const primaryFairValue = consensus;
  const primaryUpside = consensusUpside;

  // 6. Determine verdict
  const verdictUpside = consensus > 0 ? consensusUpside : 0;
  let verdict: "undervalued" | "fairly_valued" | "overvalued";
  let verdictText: string;

  const absUpside = Math.abs(verdictUpside).toFixed(1);

  if (verdictUpside > VERDICT_THRESHOLD) {
    verdict = "undervalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across our 5-year unlevered FCFF model with Gordon Growth terminal value, ${company.name} (${company.ticker}) is undervalued by ${absUpside}%.`;
  } else if (verdictUpside < -VERDICT_THRESHOLD) {
    verdict = "overvalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across our 5-year unlevered FCFF model with Gordon Growth terminal value, ${company.name} (${company.ticker}) is overvalued by ${absUpside}%.`;
  } else {
    verdict = "fairly_valued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across our 5-year unlevered FCFF model with Gordon Growth terminal value, ${company.name} (${company.ticker}) appears fairly valued (${verdictUpside > 0 ? "+" : ""}${verdictUpside.toFixed(1)}%).`;
  }

  return {
    ticker: company.ticker,
    company_name: company.name,
    current_price: currentPrice,
    primary_fair_value: primaryFairValue,
    primary_upside: primaryUpside,
    consensus_fair_value: consensus,
    consensus_low: low,
    consensus_high: high,
    consensus_upside: consensusUpside,
    pillars: buildPillars(models),
    models,
    wacc: waccResult,
    classification,
    verdict,
    verdict_text: verdictText,
    computed_at: new Date().toISOString(),
  };
}
