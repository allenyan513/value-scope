// ============================================================
// Valuation Summary Aggregator
// Combines all model results into a unified summary with
// company classification and weighted consensus
// ============================================================

import type {
  ValuationResult,
  ValuationSummary,
  FinancialStatement,
  AnalystEstimate,
  Company,
  PeerComparison,
  HistoricalMultiplesPoint,
} from "@/types";
import { VERDICT_THRESHOLD } from "@/lib/constants";
import { calculateWACC, buildWACCInputs } from "./wacc";
import type { DCFFCFEInputs } from "./dcf";
import {
  calculateDCF3Stage,
  calculateDCF3StagePEExit,
  calculateDCF3StageEBITDAExit,
  type DCFExitMultipleInputs,
} from "./dcf-3stage";
import { computeMultiplesStats } from "./historical-multiples";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
  type TradingMultiplesInputs,
} from "./trading-multiples";
import { calculatePEG } from "./peg";
import { classifyCompany, computeWeightedConsensus, getTerminalGrowthRate } from "./company-classifier";

export interface FullValuationInputs {
  company: Company;
  historicals: FinancialStatement[]; // Annual, sorted desc
  estimates: AnalystEstimate[];
  peers: PeerComparison[];
  currentPrice: number;
  riskFreeRate: number;
  /** Historical multiples for self-comparison valuation (optional) */
  historicalMultiples?: HistoricalMultiplesPoint[];
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
  } = inputs;

  // Ensure historicals are sorted descending (most recent first)
  const sortedHistoricals = [...historicals].sort(
    (a, b) => b.fiscal_year - a.fiscal_year
  );

  const latestFinancial = sortedHistoricals[0];
  if (!latestFinancial) {
    throw new Error(`No financial data available for ${company.ticker}`);
  }

  // 0. Classify the company
  const classification = classifyCompany(company, sortedHistoricals, estimates);

  // 1. Calculate WACC
  const waccInputs = buildWACCInputs(
    latestFinancial,
    company.beta || 1.0,
    riskFreeRate,
    company.market_cap || currentPrice * company.shares_outstanding
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

  // 3. Run all 6 models — all participate in weighted consensus
  const models: ValuationResult[] = [];

  // DCF: Perpetual Growth (10Y: Y1–5 analyst, Y6–10 transition, terminal via Gordon Growth)
  try {
    models.push(calculateDCF3Stage(dcfInputs));
  } catch {
    /* skip if insufficient data */
  }

  // DCF: Exit multiple terminal values (P/E and EV/EBITDA)
  // Compute historical multiples stats for exit P/E and EV/EBITDA
  const multiplesStats = inputs.historicalMultiples
    ? computeMultiplesStats(inputs.historicalMultiples)
    : null;

  const exitInputs: DCFExitMultipleInputs = {
    ...dcfInputs,
    exitPE: multiplesStats?.pe?.avg5y,
    exitEVEBITDA: multiplesStats?.ev_ebitda?.avg5y,
  };

  try {
    models.push(calculateDCF3StagePEExit(exitInputs));
  } catch {
    /* skip if insufficient data */
  }

  try {
    models.push(calculateDCF3StageEBITDAExit(exitInputs));
  } catch {
    /* skip if insufficient data */
  }

  // Trading Multiples (uses historical self-comparison when data available)
  const tradingInputs: TradingMultiplesInputs = {
    financials: latestFinancial,
    company,
    currentPrice,
    peers,
    historicalMultiples: inputs.historicalMultiples,
  };

  models.push(calculatePEMultiples(tradingInputs));
  models.push(calculateEVEBITDAMultiples(tradingInputs));

  // PEG Fair Value (forward estimates + dividend yield)
  models.push(
    calculatePEG({
      historicals: sortedHistoricals,
      currentPrice,
      estimates,
      marketCap: company.market_cap || currentPrice * company.shares_outstanding,
    })
  );

  // 4. Compute weighted consensus using classification weights
  const { consensus, low, high } = computeWeightedConsensus(
    models,
    classification.model_weights
  );

  const consensusUpside = currentPrice > 0
    ? ((consensus - currentPrice) / currentPrice) * 100
    : 0;

  // 5. Determine primary valuation (DCF Perpetual Growth as fallback)
  const primaryModel = models.find(
    (m) => m.model_type === "dcf_3stage"
  );
  const primaryFairValue = primaryModel?.fair_value ?? 0;
  const primaryUpside = primaryModel?.upside_percent ?? 0;

  // 6. Determine verdict based on consensus (not just primary model)
  const verdictUpside = consensus > 0 ? consensusUpside : primaryUpside;
  let verdict: "undervalued" | "fairly_valued" | "overvalued";
  let verdictText: string;

  const modelCount = models.filter(m => m.fair_value > 0).length;
  const absUpside = Math.abs(verdictUpside).toFixed(1);

  if (verdictUpside > VERDICT_THRESHOLD) {
    verdict = "undervalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${modelCount} models, ${company.name} (${company.ticker}) is undervalued by ${absUpside}%.`;
  } else if (verdictUpside < -VERDICT_THRESHOLD) {
    verdict = "overvalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${modelCount} models, ${company.name} (${company.ticker}) is overvalued by ${absUpside}%.`;
  } else {
    verdict = "fairly_valued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${modelCount} models, ${company.name} (${company.ticker}) appears fairly valued (${verdictUpside > 0 ? "+" : ""}${verdictUpside.toFixed(1)}%).`;
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
    models,
    wacc: waccResult,
    classification,
    verdict,
    verdict_text: verdictText,
    computed_at: new Date().toISOString(),
  };
}
