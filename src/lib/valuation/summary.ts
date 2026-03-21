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
} from "@/types";
import { calculateWACC, buildWACCInputs } from "./wacc";
import { calculateDCFGrowthExit, calculateDCFEBITDAExit, type DCFInputs } from "./dcf";
import {
  calculatePEMultiples,
  calculateEVEBITDAMultiples,
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
  const netDebt = latestFinancial.net_debt || 0;
  const sharesOutstanding =
    latestFinancial.shares_outstanding || company.shares_outstanding;

  const dcfInputs: DCFInputs = {
    historicals: sortedHistoricals,
    estimates,
    waccResult,
    currentPrice,
    sharesOutstanding,
    netDebt,
  };

  // 3. Run all models
  const models: ValuationResult[] = [];

  // DCF Growth Exit 5Y & 10Y
  try {
    models.push(calculateDCFGrowthExit(dcfInputs, 5));
  } catch {
    /* skip if insufficient data */
  }
  try {
    models.push(calculateDCFGrowthExit(dcfInputs, 10));
  } catch {
    /* skip */
  }

  // DCF EBITDA Exit 5Y & 10Y
  const peerEVEBITDA = peers
    .map((p) => p.ev_ebitda)
    .filter((v): v is number => v !== null && v > 0 && v < 100);
  const exitMultiple =
    peerEVEBITDA.length > 0
      ? peerEVEBITDA.sort((a, b) => a - b)[Math.floor(peerEVEBITDA.length / 2)]
      : 12;

  try {
    models.push(calculateDCFEBITDAExit(dcfInputs, 5, exitMultiple));
  } catch {
    /* skip */
  }
  try {
    models.push(calculateDCFEBITDAExit(dcfInputs, 10, exitMultiple));
  } catch {
    /* skip */
  }

  // Trading Multiples
  const tradingInputs: TradingMultiplesInputs = {
    financials: latestFinancial,
    company,
    currentPrice,
    peers,
  };

  models.push(calculatePEMultiples(tradingInputs));
  models.push(calculateEVEBITDAMultiples(tradingInputs));

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

  if (verdictUpside > 15) {
    verdict = "undervalued";
    verdictText = `Our weighted analysis across ${models.filter(m => m.fair_value > 0).length} models suggests ${company.name} is undervalued by ${Math.abs(verdictUpside).toFixed(1)}%. The consensus intrinsic value of $${verdictValue.toFixed(2)} is above the current trading price of $${currentPrice.toFixed(2)}.`;
  } else if (verdictUpside < -15) {
    verdict = "overvalued";
    verdictText = `Our weighted analysis across ${models.filter(m => m.fair_value > 0).length} models suggests ${company.name} is overvalued by ${Math.abs(verdictUpside).toFixed(1)}%. The consensus intrinsic value of $${verdictValue.toFixed(2)} is below the current trading price of $${currentPrice.toFixed(2)}.`;
  } else {
    verdict = "fairly_valued";
    verdictText = `Our weighted analysis across ${models.filter(m => m.fair_value > 0).length} models suggests ${company.name} is fairly valued. The consensus intrinsic value of $${verdictValue.toFixed(2)} is close to the current trading price of $${currentPrice.toFixed(2)} (${verdictUpside > 0 ? "+" : ""}${verdictUpside.toFixed(1)}%).`;
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
