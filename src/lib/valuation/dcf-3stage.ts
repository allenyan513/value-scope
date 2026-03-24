// ============================================================
// Three-Stage DCF (FCFE approach)
// Stage 1 (Y1–5): Analyst estimates
// Stage 2 (Y6–10): Growth rate + margin fade linearly to terminal
// Stage 3 (Y11+): Terminal value (perpetuity, PE exit, or EV/EBITDA exit)
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
  avgEbitdaMargin: number;
  maintenanceCapex: number;
  growthCapexIntensity: number;
  stage1GrowthRates: number[];
  stage1RevSource: string;
  analystMarginSource: boolean;
}

/**
 * Build 10-year 3-stage FCFE projections (shared by all terminal methods).
 * Also computes EBITDA per year for exit multiple methods.
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

  // Historical EBITDA margin for projecting EBITDA
  const ebitdaMargins = recent
    .filter((f) => f.revenue > 0 && f.ebitda > 0)
    .map((f) => f.ebitda / f.revenue);
  const avgEbitdaMargin = ebitdaMargins.length > 0 ? avg(ebitdaMargins) : 0.2;

  const sortedEstimates = [...estimates].sort((a, b) => a.period.localeCompare(b.period));
  const analystMargins = new Map<number, number>();
  for (const est of sortedEstimates) {
    const year = parseInt(est.period);
    if (est.eps_estimate > 0 && est.revenue_estimate > 0 && sharesOutstanding > 0) {
      const margin = (est.eps_estimate * sharesOutstanding) / est.revenue_estimate;
      if (margin > -0.5 && margin < 0.8) analystMargins.set(year, margin);
    }
  }

  const maintenanceCapex = lastFinancial.depreciation_amortization > 0
    ? lastFinancial.depreciation_amortization
    : Math.abs(lastFinancial.capital_expenditure) * 0.8;

  const growthCapexRatios: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const revIncrease = recent[i].revenue - recent[i - 1].revenue;
    const da = recent[i].depreciation_amortization > 0 ? recent[i].depreciation_amortization : 0;
    const growthCapex = Math.abs(recent[i].capital_expenditure) - da;
    if (revIncrease > 0 && growthCapex > 0) growthCapexRatios.push(growthCapex / revIncrease);
  }
  const growthCapexIntensity = growthCapexRatios.length > 0 ? avg(growthCapexRatios) : 0.05;

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
    const revenueIncrease = Math.max(0, revenue - prevRevenue);
    const maintenanceGrowth = 1 + Math.max(0, stage1Rev.growthRates[i] * 0.2);
    const yearMaintenanceCapex = i === 0 ? maintenanceCapex : maintenanceCapex * Math.pow(maintenanceGrowth, i);
    const netCapex = yearMaintenanceCapex + revenueIncrease * growthCapexIntensity;
    prevRevenue = revenue;

    const fcfe = netIncome - netCapex;
    const t = i + 1;
    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      net_capex: netCapex,
      fcfe,
      discount_factor: 1 / Math.pow(1 + ke, t),
      pv_fcfe: fcfe / Math.pow(1 + ke, t),
      stage: 1,
      ebitda: revenue * avgEbitdaMargin,
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
    const revenueIncrease = Math.max(0, revenue - prevRevenue);
    const yearIdx = 5 + i;
    const maintenanceGrowth = 1 + Math.max(0, growthRate * 0.2);
    const yearMaintenanceCapex = maintenanceCapex * Math.pow(maintenanceGrowth, yearIdx);
    const netCapex = yearMaintenanceCapex + revenueIncrease * growthCapexIntensity;
    prevRevenue = revenue;

    const year = lastYear + 6 + i;
    const t = 6 + i;
    const fcfe = netIncome - netCapex;
    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      net_capex: netCapex,
      fcfe,
      discount_factor: 1 / Math.pow(1 + ke, t),
      pv_fcfe: fcfe / Math.pow(1 + ke, t),
      stage: 2,
      ebitda: revenue * avgEbitdaMargin,
    });
  }

  return {
    projections,
    ke,
    g,
    avgNetMargin,
    avgEbitdaMargin,
    maintenanceCapex,
    growthCapexIntensity,
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
    maintenance_capex: Math.round(ctx.maintenanceCapex / 1e6),
    growth_capex_intensity: Math.round(ctx.growthCapexIntensity * 10000) / 100,
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

// ============================================================
// Three-Stage DCF — P/E Exit Multiple Terminal Value
// Terminal Value = Year 10 Net Income × Exit P/E
// ============================================================

export interface DCFExitMultipleInputs extends DCFFCFEInputs {
  exitPE?: number;       // Historical 5Y avg P/E (for PE exit)
  exitEVEBITDA?: number; // Historical 5Y avg EV/EBITDA (for EBITDA exit)
}

/**
 * Sensitivity matrix for exit multiple methods: Discount Rate × Exit Multiple
 */
function buildExitMultipleSensitivityMatrix(
  projections: DCFProjectionYearFCFE[],
  cash: number,
  debt: number,
  sharesOutstanding: number,
  baseKe: number,
  baseMultiple: number,
  terminalMetric: number, // Net Income (for PE) or EBITDA (for EV/EBITDA)
  isEV: boolean, // true = EV/EBITDA (needs debt subtraction), false = PE (direct equity)
): { discount_rate_values: number[]; growth_values: number[]; prices: number[][] } {
  const keValues = [
    baseKe - 0.02,
    baseKe - 0.01,
    baseKe,
    baseKe + 0.01,
    baseKe + 0.02,
  ];

  // Exit multiple axis: ±30% around base in 5 steps
  const multipleValues = [
    Math.round(baseMultiple * 0.7 * 10) / 10,
    Math.round(baseMultiple * 0.85 * 10) / 10,
    Math.round(baseMultiple * 10) / 10,
    Math.round(baseMultiple * 1.15 * 10) / 10,
    Math.round(baseMultiple * 1.3 * 10) / 10,
  ];

  const n = projections.length;
  const prices: number[][] = [];

  for (const ke of keValues) {
    const row: number[] = [];
    for (const mult of multipleValues) {
      let pvFCFESum = 0;
      for (let i = 0; i < n; i++) {
        pvFCFESum += projections[i].fcfe / Math.pow(1 + ke, i + 1);
      }

      const rawTV = terminalMetric * mult;
      // For EV/EBITDA: TV is enterprise value, subtract net debt to get equity portion
      const equityTV = isEV ? rawTV - (debt - cash) : rawTV;
      const pvTV = equityTV / Math.pow(1 + ke, n);
      const totalPV = pvFCFESum + pvTV;
      const equityValue = totalPV + cash - debt;
      row.push(Math.max(0, equityValue / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: keValues, growth_values: multipleValues, prices };
}

/**
 * Three-stage DCF with P/E exit multiple terminal value.
 * Terminal Value = Year 10 Net Income × Exit P/E
 * Exit P/E sourced from historical 5Y average.
 */
export function calculateDCF3StagePEExit(inputs: DCFExitMultipleInputs): ValuationResult {
  const { currentPrice, sharesOutstanding, cashAndEquivalents, totalDebt, exitPE } = inputs;

  if (!exitPE || exitPE <= 0) {
    // Return zero-value result if no valid P/E available
    return {
      model_type: "dcf_pe_exit_10y",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: { error: "No valid historical P/E available for exit multiple" },
      details: {},
      computed_at: new Date().toISOString(),
    };
  }

  const ctx = build3StageProjections(inputs);
  const { projections, ke } = ctx;

  const year10NetIncome = projections[9].net_income;
  if (year10NetIncome <= 0) {
    return {
      model_type: "dcf_pe_exit_10y",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: { error: "Projected Year 10 Net Income is negative; P/E exit not applicable" },
      details: {},
      computed_at: new Date().toISOString(),
    };
  }

  // Terminal value = Year 10 Net Income × Exit P/E (already equity value)
  const terminalValue = year10NetIncome * exitPE;
  const pvTerminalValue = terminalValue / Math.pow(1 + ke, 10);
  const pvFCFETotal = projections.reduce((sum, p) => sum + p.pv_fcfe, 0);

  const equityValue = pvFCFETotal + pvTerminalValue + cashAndEquivalents - totalDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  const sensitivity = buildExitMultipleSensitivityMatrix(
    projections, cashAndEquivalents, totalDebt, sharesOutstanding,
    ke, exitPE, year10NetIncome, false
  );
  const allPrices = sensitivity.prices.flat();

  return {
    model_type: "dcf_pe_exit_10y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: Math.min(...allPrices),
    high_estimate: Math.max(...allPrices),
    assumptions: build3StageAssumptions(ctx, {
      terminal_method: "pe_exit",
      exit_pe: Math.round(exitPE * 100) / 100,
      year10_net_income: Math.round(year10NetIncome / 1e6),
    }),
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

// ============================================================
// Three-Stage DCF — EV/EBITDA Exit Multiple Terminal Value
// Terminal EV = Year 10 EBITDA × Exit EV/EBITDA
// Terminal Equity = Terminal EV - Net Debt
// ============================================================

/**
 * Three-stage DCF with EV/EBITDA exit multiple terminal value.
 * Terminal EV = Year 10 EBITDA × Exit EV/EBITDA, minus net debt.
 * Exit EV/EBITDA sourced from historical 5Y average.
 */
export function calculateDCF3StageEBITDAExit(inputs: DCFExitMultipleInputs): ValuationResult {
  const { currentPrice, sharesOutstanding, cashAndEquivalents, totalDebt, exitEVEBITDA } = inputs;

  if (!exitEVEBITDA || exitEVEBITDA <= 0) {
    return {
      model_type: "dcf_ebitda_exit_fcfe_10y",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: { error: "No valid historical EV/EBITDA available for exit multiple" },
      details: {},
      computed_at: new Date().toISOString(),
    };
  }

  const ctx = build3StageProjections(inputs);
  const { projections, ke } = ctx;

  const year10EBITDA = projections[9].ebitda ?? 0;
  if (year10EBITDA <= 0) {
    return {
      model_type: "dcf_ebitda_exit_fcfe_10y",
      fair_value: 0,
      upside_percent: 0,
      low_estimate: 0,
      high_estimate: 0,
      assumptions: { error: "Projected Year 10 EBITDA is negative; EV/EBITDA exit not applicable" },
      details: {},
      computed_at: new Date().toISOString(),
    };
  }

  // Terminal EV = EBITDA × multiple, then subtract net debt for equity value
  const netDebt = totalDebt - cashAndEquivalents;
  const terminalEV = year10EBITDA * exitEVEBITDA;
  const terminalEquity = terminalEV - netDebt; // convert EV → Equity
  const terminalValue = Math.max(0, terminalEquity);
  const pvTerminalValue = terminalValue / Math.pow(1 + ke, 10);
  const pvFCFETotal = projections.reduce((sum, p) => sum + p.pv_fcfe, 0);

  // Note: cash/debt already accounted for in terminal equity conversion,
  // but FCFE projections are equity-level, so we add back cash - debt for consistency
  const equityValue = pvFCFETotal + pvTerminalValue + cashAndEquivalents - totalDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  const sensitivity = buildExitMultipleSensitivityMatrix(
    projections, cashAndEquivalents, totalDebt, sharesOutstanding,
    ke, exitEVEBITDA, year10EBITDA, true
  );
  const allPrices = sensitivity.prices.flat();

  return {
    model_type: "dcf_ebitda_exit_fcfe_10y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: Math.min(...allPrices),
    high_estimate: Math.max(...allPrices),
    assumptions: build3StageAssumptions(ctx, {
      terminal_method: "ebitda_exit",
      exit_ev_ebitda: Math.round(exitEVEBITDA * 100) / 100,
      year10_ebitda: Math.round(year10EBITDA / 1e6),
      ebitda_margin: Math.round(ctx.avgEbitdaMargin * 10000) / 100,
    }),
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
