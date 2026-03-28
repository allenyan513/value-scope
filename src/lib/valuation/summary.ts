// ============================================================
// Valuation Summary Aggregator
// Combines all model results into a unified summary.
// Supports two consensus strategies:
//   - "median": Three-tier pillars (DCF / Trading Multiples / PEG) → median
//   - "weighted": Archetype-based weighted average (legacy, switchable)
// ============================================================

import type {
  ValuationResult,
  ValuationSummary,
  FinancialStatement,
  AnalystEstimate,
  Company,
  PeerComparison,
  HistoricalMultiplesPoint,
  ConsensusStrategy,
  ValuationPillars,
} from "@/types";
import { VERDICT_THRESHOLD, DEFAULT_CONSENSUS_STRATEGY } from "@/lib/constants";
import { calculateWACC, buildWACCInputs } from "./wacc";
import type { DCFFCFEInputs } from "./dcf";
import { calculateDCF3Stage } from "./dcf-3stage";
import { calculateDCFFCFF, calculateDCFFCFF10Y, calculateDCFFCFFEBITDAExit, calculateDCFFCFFEBITDAExit10Y, type DCFFCFFInputs, type DCFFCFFEBITDAExitInputs } from "./dcf-fcff";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  type TradingMultiplesInputs,
} from "./trading-multiples";
import { calculatePEG } from "./peg";
import { classifyCompany, computeWeightedConsensus, getTerminalGrowthRate } from "./company-classifier";
import { median } from "./statistics";

export interface FullValuationInputs {
  company: Company;
  historicals: FinancialStatement[]; // Annual, sorted desc
  estimates: AnalystEstimate[];
  peers: PeerComparison[];
  currentPrice: number;
  riskFreeRate: number;
  /** Historical multiples for self-comparison valuation (optional) */
  historicalMultiples?: HistoricalMultiplesPoint[];
  /** Override consensus strategy (defaults to DEFAULT_CONSENSUS_STRATEGY) */
  consensusStrategy?: ConsensusStrategy;
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
 * Build three-tier pillars from model results and compute median consensus.
 */
function computeMedianConsensus(
  models: ValuationResult[],
  currentPrice: number
): {
  pillars: ValuationPillars;
  consensus: number;
  low: number;
  high: number;
} {
  // Group models into pillars
  const dcfModels = models.filter(m => DCF_MODEL_TYPES.has(m.model_type) && m.fair_value > 0);
  const tmModels = models.filter(m => TRADING_MULTIPLES_MODEL_TYPES.has(m.model_type) && m.fair_value > 0);
  const pegModel = models.find(m => m.model_type === "peg");

  // Pillar fair values: median within each group
  const dcfFairValue = dcfModels.length > 0 ? median(dcfModels.map(m => m.fair_value)) : 0;
  const tmFairValue = tmModels.length > 0 ? median(tmModels.map(m => m.fair_value)) : 0;
  const pegFairValue = pegModel && pegModel.fair_value > 0 ? pegModel.fair_value : 0;

  const upside = (fv: number) => currentPrice > 0 ? ((fv - currentPrice) / currentPrice) * 100 : 0;

  const pillars: ValuationPillars = {
    dcf: {
      fairValue: dcfFairValue,
      upside: upside(dcfFairValue),
      models: models.filter(m => DCF_MODEL_TYPES.has(m.model_type)),
    },
    tradingMultiples: {
      fairValue: tmFairValue,
      upside: upside(tmFairValue),
      models: models.filter(m => TRADING_MULTIPLES_MODEL_TYPES.has(m.model_type)),
    },
    peg: {
      fairValue: pegFairValue,
      upside: upside(pegFairValue),
      models: pegModel ? [pegModel] : [],
    },
  };

  // Final consensus: median of pillar fair values (only those > 0)
  const pillarValues = [dcfFairValue, tmFairValue, pegFairValue].filter(v => v > 0);
  const consensus = pillarValues.length > 0 ? median(pillarValues) : 0;

  // Low/high: median of all model lows/highs
  const validModels = models.filter(m => m.fair_value > 0);
  const low = validModels.length > 0 ? median(validModels.map(m => m.low_estimate)) : 0;
  const high = validModels.length > 0 ? median(validModels.map(m => m.high_estimate)) : 0;

  return { pillars, consensus, low, high };
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

  const strategy: ConsensusStrategy = inputs.consensusStrategy ?? DEFAULT_CONSENSUS_STRATEGY;

  // Ensure historicals are sorted descending (most recent first)
  const sortedHistoricals = [...historicals].sort(
    (a, b) => b.fiscal_year - a.fiscal_year
  );

  const latestFinancial = sortedHistoricals[0];
  if (!latestFinancial) {
    throw new Error(`No financial data available for ${company.ticker}`);
  }

  // 0. Classify the company (used for terminal growth + display label in both strategies)
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

  const dcfInputs: DCFFCFEInputs = {
    historicals: sortedHistoricals,
    estimates,
    costOfEquity: waccResult.cost_of_equity,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents: latestFinancial.cash_and_equivalents || 0,
    totalDebt: latestFinancial.total_debt || 0,
    terminalGrowthRate: getTerminalGrowthRate(classification.archetype),
  };

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

  // DCF: Perpetual Growth
  try {
    models.push(calculateDCF3Stage(dcfInputs));
  } catch {
    /* skip if insufficient data */
  }

  // Trading Multiples
  const tradingInputs: TradingMultiplesInputs = {
    financials: latestFinancial,
    company,
    currentPrice,
    peers,
    historicalMultiples: inputs.historicalMultiples,
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

  // 4. Compute consensus based on strategy
  // Always build pillars for display regardless of strategy
  const medianResult = computeMedianConsensus(models, currentPrice);
  const pillars: ValuationPillars = medianResult.pillars;

  let consensus: number;
  let low: number;
  let high: number;
  let primaryModelType: string;
  let adjustments: ValuationSummary["consensus_adjustments"];

  if (strategy === "dcf_primary") {
    // --- FCFF Growth Exit 5Y as single source of truth ---
    const dcfModel = models.find(m => m.model_type === "dcf_fcff_growth_5y" && m.fair_value > 0);
    consensus = dcfModel?.fair_value ?? 0;
    low = dcfModel?.low_estimate ?? 0;
    high = dcfModel?.high_estimate ?? 0;
    primaryModelType = "dcf_fcff_growth_5y";
    adjustments = [];
  } else if (strategy === "median") {
    // --- Three-tier median consensus ---
    consensus = medianResult.consensus;
    low = medianResult.low;
    high = medianResult.high;
    primaryModelType = "";
    adjustments = [];
  } else {
    // --- Legacy weighted consensus ---
    const result = computeWeightedConsensus(
      models,
      classification.model_weights,
      classification.archetype
    );
    consensus = result.consensus;
    low = result.low;
    high = result.high;
    primaryModelType = result.primaryModel;
    adjustments = result.adjustments;
  }

  const consensusUpside = currentPrice > 0
    ? ((consensus - currentPrice) / currentPrice) * 100
    : 0;

  // 5. Primary valuation
  const primaryResult = primaryModelType
    ? models.find((m) => m.model_type === primaryModelType)
    : undefined;
  const primaryFairValue = primaryResult?.fair_value ?? consensus;
  const primaryUpside = primaryResult?.upside_percent ?? consensusUpside;

  // 6. Determine verdict
  const verdictUpside = consensus > 0 ? consensusUpside : primaryUpside;
  let verdict: "undervalued" | "fairly_valued" | "overvalued";
  let verdictText: string;

  const modelCount = models.filter(m => m.fair_value > 0).length;
  const absUpside = Math.abs(verdictUpside).toFixed(1);
  const pillarCount = [pillars.dcf.fairValue, pillars.tradingMultiples.fairValue, pillars.peg.fairValue]
    .filter(v => v > 0).length;

  const methodDescription = strategy === "dcf_primary"
    ? "our 5-year unlevered FCFF model with Gordon Growth terminal value"
    : strategy === "median"
      ? `${pillarCount} valuation pillars (DCF, Trading Multiples, PEG) covering ${modelCount} models`
      : `${modelCount} valuation models`;

  if (verdictUpside > VERDICT_THRESHOLD) {
    verdict = "undervalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${methodDescription}, ${company.name} (${company.ticker}) is undervalued by ${absUpside}%.`;
  } else if (verdictUpside < -VERDICT_THRESHOLD) {
    verdict = "overvalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${methodDescription}, ${company.name} (${company.ticker}) is overvalued by ${absUpside}%.`;
  } else {
    verdict = "fairly_valued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${methodDescription}, ${company.name} (${company.ticker}) appears fairly valued (${verdictUpside > 0 ? "+" : ""}${verdictUpside.toFixed(1)}%).`;
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
    consensus_strategy: strategy,
    consensus_primary_model: primaryModelType,
    consensus_adjustments: adjustments,
    pillars,
    models,
    wacc: waccResult,
    classification,
    verdict,
    verdict_text: verdictText,
    computed_at: new Date().toISOString(),
  };
}
