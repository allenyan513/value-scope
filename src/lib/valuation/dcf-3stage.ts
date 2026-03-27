// ============================================================
// Three-Stage DCF (FCFE approach)
// Stage 1 (Y1–5): Analyst estimates
// Stage 2 (Y6–10): Growth rate + margin fade linearly to terminal
// Stage 3 (Y11+): Terminal value (perpetuity)
// ============================================================

import type {
  ValuationResult,
  DCFProjectionYearFCFE,
} from "@/types";
import { avg, projectRevenue } from "./dcf-helpers";
import { type DCFFCFEInputs, buildFCFESensitivityMatrix } from "./dcf";

// --- Shared 3-Stage Infrastructure ---

/** Shared context returned by the 3-stage projection builder */
interface ThreeStageProjectionResult {
  projections: DCFProjectionYearFCFE[];
  ke: number;
  g: number;
  avgNetMargin: number;
  capexRatio: number;
  daRatio: number;
  stage1GrowthRates: number[];
  stage1RevSource: string;
  analystMarginSource: boolean;
}

/**
 * Build 10-year 3-stage FCFE projections (shared by perpetuity terminal method).
 */
function build3StageProjections(inputs: DCFFCFEInputs): ThreeStageProjectionResult {
  const {
    historicals,
    estimates,
    costOfEquity,
    sharesOutstanding,
    terminalGrowthRate: termGrowth = 0.025,
  } = inputs;

  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length === 0) throw new Error("No historical revenue data available");

  const recent = sorted.slice(-5);
  const lastFinancial = sorted[sorted.length - 1];
  const lastRevenue = lastFinancial.revenue;
  const lastYear = lastFinancial.fiscal_year;

  const netMargins = recent.filter((f) => f.revenue > 0).map((f) => f.net_income / f.revenue);
  const avgNetMargin = netMargins.length > 0 ? avg(netMargins) : 0.1;

  const sortedEstimates = [...estimates].sort((a, b) => a.period.localeCompare(b.period));
  const analystMargins = new Map<number, number>();
  for (const est of sortedEstimates) {
    const year = parseInt(est.period);
    if (est.eps_estimate > 0 && est.revenue_estimate > 0 && sharesOutstanding > 0) {
      const margin = (est.eps_estimate * sharesOutstanding) / est.revenue_estimate;
      if (margin > -0.5 && margin < 0.8) analystMargins.set(year, margin);
    }
  }

  // CapEx & D&A as stable % of Revenue (historical averages)
  const daRatios = recent
    .filter((f) => f.depreciation_amortization > 0)
    .map((f) => f.depreciation_amortization / f.revenue);
  const daRatio = daRatios.length > 0 ? avg(daRatios) : 0.03;

  const capexRatios = recent
    .filter((f) => f.capital_expenditure !== 0)
    .map((f) => Math.abs(f.capital_expenditure) / f.revenue);
  const capexRatio = capexRatios.length > 0 ? avg(capexRatios) : 0.05;

  const stage1Rev = projectRevenue(historicals, estimates, 5);
  const ke = costOfEquity;
  const g = termGrowth;
  const projections: DCFProjectionYearFCFE[] = [];
  let prevRevenue = lastRevenue;

  // ── Stage 1 (Y1–5): analyst-driven ────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const revenue = stage1Rev.revenues[i];
    const year = stage1Rev.years[i];

    let netMargin: number;
    const analystMargin = analystMargins.get(year);
    if (analystMargin !== undefined) {
      netMargin = analystMargin;
    } else {
      const lastKnownMargin = analystMargins.size > 0
        ? Array.from(analystMargins.values()).pop()!
        : avgNetMargin;
      const yearsBeyondAnalyst = year - lastYear - analystMargins.size;
      const fadeSteps = 5 - analystMargins.size;
      if (fadeSteps > 0 && yearsBeyondAnalyst > 0) {
        const fadeFactor = Math.max(0, 1 - yearsBeyondAnalyst / fadeSteps);
        netMargin = lastKnownMargin * fadeFactor + avgNetMargin * (1 - fadeFactor);
      } else {
        netMargin = lastKnownMargin;
      }
    }

    const netIncome = revenue * netMargin;
    const yearDA = revenue * daRatio;
    const yearCapex = revenue * capexRatio;

    const fcfe = netIncome + yearDA - yearCapex;
    prevRevenue = revenue;
    const t = i + 1;
    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      depreciation_amortization: yearDA,
      capital_expenditure: yearCapex,
      fcfe,
      discount_factor: 1 / Math.pow(1 + ke, t),
      pv_fcfe: fcfe / Math.pow(1 + ke, t),
      stage: 1,
    });
  }

  // ── Stage 2 (Y6–10): linear fade ─────────────────────────────────
  const year5 = projections[4];
  const year5GrowthRate = stage1Rev.growthRates[4];
  const year5NetMargin = year5.net_margin;

  for (let i = 0; i < 5; i++) {
    const stageProgress = i / 4;
    const growthRate = year5GrowthRate + (g - year5GrowthRate) * stageProgress;
    const netMargin = year5NetMargin + (avgNetMargin - year5NetMargin) * stageProgress;

    const revenue = prevRevenue * (1 + growthRate);
    const netIncome = revenue * netMargin;
    const yearDA = revenue * daRatio;
    const yearCapex = revenue * capexRatio;
    prevRevenue = revenue;

    const year = lastYear + 6 + i;
    const t = 6 + i;
    const fcfe = netIncome + yearDA - yearCapex;
    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      depreciation_amortization: yearDA,
      capital_expenditure: yearCapex,
      fcfe,
      discount_factor: 1 / Math.pow(1 + ke, t),
      pv_fcfe: fcfe / Math.pow(1 + ke, t),
      stage: 2,
    });
  }

  return {
    projections,
    ke,
    g,
    avgNetMargin,
    capexRatio,
    daRatio,
    stage1GrowthRates: stage1Rev.growthRates,
    stage1RevSource: stage1Rev.source,
    analystMarginSource: analystMargins.size > 0,
  };
}

/** Build common assumptions object for 3-stage models */
function build3StageAssumptions(
  ctx: ThreeStageProjectionResult,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    revenue_growth_rates: ctx.stage1GrowthRates.map((r) => Math.round(r * 10000) / 100),
    revenue_source: ctx.stage1RevSource,
    net_margin: Math.round(ctx.avgNetMargin * 10000) / 100,
    net_margins_by_year: ctx.projections.map((p) => Math.round(p.net_margin * 10000) / 100),
    margin_source: ctx.analystMarginSource ? "analyst" : "historical",
    capex_pct_revenue: Math.round(ctx.capexRatio * 10000) / 100,
    da_pct_revenue: Math.round(ctx.daRatio * 10000) / 100,
    discount_rate: Math.round(ctx.ke * 10000) / 100,
    terminal_growth_rate: Math.round(ctx.g * 10000) / 100,
    projection_years: 10,
    stage1_years: 5,
    stage2_years: 5,
    ...extra,
  };
}

// --- Three-Stage Models ---

/**
 * Three-stage DCF using FCFE approach — Gordon Growth perpetuity terminal value.
 */
export function calculateDCF3Stage(inputs: DCFFCFEInputs): ValuationResult {
  const { currentPrice, sharesOutstanding, cashAndEquivalents, totalDebt } = inputs;
  const ctx = build3StageProjections(inputs);
  const { projections, ke, g } = ctx;

  const lastFCFE = projections[9].fcfe;
  const terminalValue = ke > g ? (lastFCFE * (1 + g)) / (ke - g) : lastFCFE * 20;
  const pvTerminalValue = terminalValue / Math.pow(1 + ke, 10);
  const pvFCFETotal = projections.reduce((sum, p) => sum + p.pv_fcfe, 0);

  const equityValue = pvFCFETotal + pvTerminalValue + cashAndEquivalents - totalDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  const sensitivity = buildFCFESensitivityMatrix(projections, cashAndEquivalents, totalDebt, sharesOutstanding, ke, g);
  const allPrices = sensitivity.prices.flat();

  return {
    model_type: "dcf_3stage",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: Math.min(...allPrices),
    high_estimate: Math.max(...allPrices),
    assumptions: build3StageAssumptions(ctx, { terminal_method: "perpetuity" }),
    details: {
      projections,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcfe_total: pvFCFETotal,
      cash_and_equivalents: cashAndEquivalents,
      total_debt: totalDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}

