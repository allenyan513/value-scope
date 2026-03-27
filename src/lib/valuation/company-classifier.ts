// ============================================================
// Company Classifier — Determines company archetype and model applicability
// ============================================================

import type { FinancialStatement, Company, AnalystEstimate, ConsensusAdjustment } from "@/types";
import { OUTLIER_HALF_THRESHOLD, OUTLIER_QUARTER_THRESHOLD } from "@/lib/constants";
import { median } from "./statistics";
import {
  type CompanyArchetype,
  type CompanyClassification,
  type ModelWeights,
  type ModelApplicability,
  ARCHETYPE_CONFIGS,
  PRIMARY_MODEL_MAP,
} from "./company-archetype-config";
import { type ClassificationMetrics, computeClassificationMetrics } from "./company-metrics";

// Re-export types and helpers for backward compatibility
export type { CompanyArchetype, CompanyClassification, ModelWeights, ModelApplicability };
export { PRIMARY_MODEL_MAP, getTerminalGrowthRate } from "./company-archetype-config";

// --- Classification Logic ---

function determineArchetype(m: ClassificationMetrics): CompanyArchetype {
  if (!m.isCurrentlyProfitable && !m.isProfitImproving) return "loss_making";
  if (!m.isCurrentlyProfitable && m.isProfitImproving) return "turnaround";

  const effectiveGrowth = m.analystGrowth ?? m.revenueCAGR;
  if (effectiveGrowth > 0.20 && m.latestNetMargin < 0.10) return "high_growth";

  if (effectiveGrowth > 0.12 && m.latestNetMargin > 0.05) return "profitable_growth";
  if (effectiveGrowth > 0.08 && m.latestNetMargin > 0.20) return "profitable_growth";

  if (m.earningsVolatility > 1.5 || m.revenueVolatility > 1.0) return "cyclical";
  if (m.dividendYield > 0.02) return "dividend_payer";
  if (m.assetIntensity > 3) return "asset_heavy";
  if (effectiveGrowth <= 0.12 && m.isCurrentlyProfitable) return "mature_stable";

  return "mature_stable";
}

function buildTraits(m: ClassificationMetrics): string[] {
  const traits: string[] = [];

  if (m.revenueCAGR > 0.20) traits.push("High revenue growth (>" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else if (m.revenueCAGR > 0.10) traits.push("Moderate growth (~" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else if (m.revenueCAGR > 0) traits.push("Low growth (~" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else traits.push("Revenue declining");

  if (m.latestNetMargin > 0.20) traits.push("High profitability (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0.05) traits.push("Moderate margins (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0) traits.push("Thin margins (" + (m.latestNetMargin * 100).toFixed(1) + "% net margin)");
  else traits.push("Currently unprofitable");

  if (m.dividendYield > 0.03) traits.push("Strong dividend yield (" + (m.dividendYield * 100).toFixed(1) + "%)");
  else if (m.dividendYield > 0.01) traits.push("Pays dividends (" + (m.dividendYield * 100).toFixed(1) + "% yield)");

  if (m.earningsVolatility > 1.5) traits.push("Highly cyclical earnings");
  else if (m.earningsVolatility > 0.8) traits.push("Moderately volatile earnings");

  if (m.debtToEquity > 2) traits.push("High leverage (D/E " + m.debtToEquity.toFixed(1) + "x)");

  if (m.fcfYield > 0.05) traits.push("Strong FCF yield (" + (m.fcfYield * 100).toFixed(1) + "%)");
  else if (m.fcfYield < 0) traits.push("Negative free cash flow");

  return traits;
}

function buildModelApplicability(
  archetype: CompanyArchetype,
  m: ClassificationMetrics
): ModelApplicability[] {
  const applicability: ModelApplicability[] = [];

  const dcfConfidence: "high" | "medium" | "low" =
    archetype === "loss_making" || archetype === "turnaround" ? "low"
    : archetype === "high_growth" ? "medium"
    : "high";
  const dcfReason =
    dcfConfidence === "low" ? "DCF projects future cash flows; use with caution for unprofitable companies"
    : dcfConfidence === "medium" ? "DCF captures intrinsic value based on projected free cash flows to equity"
    : "Predictable cash flows make DCF the most reliable intrinsic valuation";

  for (const dcfType of ["dcf_3stage", "dcf_pe_exit_10y", "dcf_ebitda_exit_fcfe_10y"]) {
    applicability.push({
      model_type: dcfType,
      applicable: true,
      reason: dcfReason,
      confidence: dcfConfidence,
      role: "primary",
    });
  }

  if (!m.isCurrentlyProfitable || m.latestEPS <= 0) {
    applicability.push({
      model_type: "pe_multiples",
      applicable: false,
      reason: "Negative or zero EPS makes P/E valuation meaningless",
      confidence: "high",
      role: "not_applicable",
    });
  } else if (archetype === "cyclical") {
    applicability.push({
      model_type: "pe_multiples",
      applicable: true,
      reason: "Current P/E may be distorted by cycle position; interpret carefully",
      confidence: "low",
      role: "sanity_check",
    });
  } else {
    applicability.push({
      model_type: "pe_multiples",
      applicable: true,
      reason: "Peer-based P/E provides useful market-relative valuation",
      confidence: "high",
      role: archetype === "mature_stable" ? "primary" : "cross_check",
    });
  }

  if (archetype === "loss_making" && m.latestEPS <= 0) {
    applicability.push({
      model_type: "ev_ebitda_multiples",
      applicable: true,
      reason: "EV/EBITDA provides a useful anchor when earnings are negative",
      confidence: "medium",
      role: "primary",
    });
  } else {
    applicability.push({
      model_type: "ev_ebitda_multiples",
      applicable: true,
      reason: "EV/EBITDA provides enterprise-level valuation relative to peers",
      confidence: "high",
      role: "cross_check",
    });
  }

  if (m.latestEPS <= 0) {
    applicability.push({
      model_type: "peg",
      applicable: false,
      reason: "Requires positive EPS and meaningful earnings growth",
      confidence: "high",
      role: "not_applicable",
    });
  } else if (archetype === "mature_stable" && m.revenueCAGR < 0.05) {
    applicability.push({
      model_type: "peg",
      applicable: true,
      reason: "Low growth company results in conservative PEG valuation",
      confidence: "low",
      role: "sanity_check",
    });
  } else {
    applicability.push({
      model_type: "peg",
      applicable: true,
      reason: "PEG-based approach provides a quick growth-adjusted sanity check",
      confidence: "medium",
      role: "sanity_check",
    });
  }

  return applicability;
}

// --- Public API ---

export function classifyCompany(
  company: Company,
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[]
): CompanyClassification {
  const metrics = computeClassificationMetrics(company, historicals, estimates);
  const archetype = determineArchetype(metrics);
  const config = ARCHETYPE_CONFIGS[archetype];
  const traits = buildTraits(metrics);
  const modelApplicability = buildModelApplicability(archetype, metrics);

  return {
    archetype,
    label: config.label,
    description: config.description,
    traits,
    model_weights: config.weights,
    model_applicability: modelApplicability,
  };
}

/**
 * Compute weighted consensus fair value from model results.
 * Applies outlier penalty: models deviating >50% from median get half weight,
 * >100% get quarter weight.
 */
export function computeWeightedConsensus(
  models: Array<{ model_type: string; fair_value: number; low_estimate: number; high_estimate: number }>,
  weights: ModelWeights,
  archetype?: CompanyArchetype
): {
  consensus: number;
  low: number;
  high: number;
  primaryModel: string;
  modelContributions: Array<{ model: string; weight: number; value: number }>;
  adjustments: ConsensusAdjustment[];
} {
  const primaryModel = archetype ? PRIMARY_MODEL_MAP[archetype] : "";

  const validModels = models.filter((m) => m.fair_value > 0 && (weights[m.model_type] ?? 0) > 0);

  if (validModels.length === 0) {
    return { consensus: 0, low: 0, high: 0, primaryModel, modelContributions: [], adjustments: [] };
  }

  const medianFV = median(validModels.map((m) => m.fair_value));
  const adjustments: ConsensusAdjustment[] = [];

  let totalWeight = 0;
  let weightedSum = 0;
  let weightedLow = 0;
  let weightedHigh = 0;
  const contributions: Array<{ model: string; weight: number; value: number }> = [];

  for (const m of validModels) {
    const originalWeight = weights[m.model_type] ?? 0;
    let adjustedWeight = originalWeight;

    if (medianFV > 0 && validModels.length >= 3) {
      const deviation = Math.abs(m.fair_value - medianFV) / medianFV;
      if (deviation > OUTLIER_QUARTER_THRESHOLD) {
        adjustedWeight = originalWeight * 0.25;
        adjustments.push({
          model: m.model_type,
          originalWeight,
          adjustedWeight,
          reason: `${(deviation * 100).toFixed(0)}% from median (weight quartered)`,
        });
      } else if (deviation > OUTLIER_HALF_THRESHOLD) {
        adjustedWeight = originalWeight * 0.5;
        adjustments.push({
          model: m.model_type,
          originalWeight,
          adjustedWeight,
          reason: `${(deviation * 100).toFixed(0)}% from median (weight halved)`,
        });
      }
    }

    totalWeight += adjustedWeight;
    weightedSum += m.fair_value * adjustedWeight;
    weightedLow += m.low_estimate * adjustedWeight;
    weightedHigh += m.high_estimate * adjustedWeight;
    contributions.push({ model: m.model_type, weight: adjustedWeight, value: m.fair_value });
  }

  if (totalWeight === 0) {
    return { consensus: 0, low: 0, high: 0, primaryModel, modelContributions: [], adjustments };
  }

  const normalizedContributions = contributions.map((c) => ({
    ...c,
    weight: c.weight / totalWeight,
  }));

  return {
    consensus: weightedSum / totalWeight,
    low: weightedLow / totalWeight,
    high: weightedHigh / totalWeight,
    primaryModel,
    modelContributions: normalizedContributions,
    adjustments,
  };
}
