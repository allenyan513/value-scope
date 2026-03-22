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
import { calculateWACC, buildWACCInputs } from "./wacc";
import { calculateDCF, type DCFFCFEInputs } from "./dcf";
import {
  calculatePEMultiples,
  calculatePSMultiples,
  calculatePBMultiples,
  type TradingMultiplesInputs,
} from "./trading-multiples";
import { calculatePeterLynch } from "./peter-lynch";
import { classifyCompany, computeWeightedConsensus } from "./company-classifier";

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
  };

  // 3. Run all models (4 active: DCF FCFE, P/E, EV/EBITDA, Peter Lynch)
  const models: ValuationResult[] = [];

  // DCF (FCFE approach, 5Y)
  try {
    models.push(calculateDCF(dcfInputs, 5));
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
  models.push(calculatePSMultiples(tradingInputs));
  models.push(calculatePBMultiples(tradingInputs));

  // Peter Lynch
  models.push(
    calculatePeterLynch({
      historicals: sortedHistoricals,
      currentPrice,
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

  // 5. Determine primary valuation (DCF Growth Exit 5Y as fallback)
  const primaryModel = models.find(
    (m) => m.model_type === "dcf_growth_exit_5y"
  );
  const primaryFairValue = primaryModel?.fair_value ?? 0;
  const primaryUpside = primaryModel?.upside_percent ?? 0;

  // 6. Determine verdict based on consensus (not just primary model)
  const verdictUpside = consensus > 0 ? consensusUpside : primaryUpside;
  const verdictValue = consensus > 0 ? consensus : primaryFairValue;

  let verdict: "undervalued" | "fairly_valued" | "overvalued";
  let verdictText: string;

  const modelCount = models.filter(m => m.fair_value > 0).length;
  const absUpside = Math.abs(verdictUpside).toFixed(1);

  if (verdictUpside > 15) {
    verdict = "undervalued";
    verdictText = `Based on the market price of $${currentPrice.toFixed(2)} and our intrinsic valuation across ${modelCount} models, ${company.name} (${company.ticker}) is undervalued by ${absUpside}%.`;
  } else if (verdictUpside < -15) {
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
