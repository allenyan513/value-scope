// ============================================================
// DCF (Discounted Cash Flow) Valuation Models
// Variants: Growth Exit (5Y/10Y), EBITDA Exit (5Y/10Y)
// ============================================================

import type {
  FinancialStatement,
  AnalystEstimate,
  ValuationResult,
  DCFProjectionYear,
  DCFProjectionYearFCFE,
  WACCResult,
} from "@/types";

// --- Helpers ---

/** Calculate CAGR between two values over n years */
function cagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** Average of an array */
function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Clamp a value between min and max */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// --- Revenue Projection ---

interface RevenueProjection {
  years: number[];
  revenues: number[];
  growthRates: number[];
  source: string; // "analyst" | "trend"
}

/**
 * Project future revenue using analyst estimates (if available) + trend extrapolation.
 */
function projectRevenue(
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[],
  projectionYears: number
): RevenueProjection {
  // Sort historicals ascending by year
  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length === 0) {
    throw new Error("No historical revenue data available");
  }

  const lastYear = sorted[sorted.length - 1].fiscal_year;
  const lastRevenue = sorted[sorted.length - 1].revenue;

  // Calculate historical CAGR (use last 5 years or all available)
  const yearsForCAGR = Math.min(sorted.length - 1, 5);
  const historicalCAGR =
    yearsForCAGR > 0
      ? cagr(sorted[sorted.length - 1 - yearsForCAGR].revenue, lastRevenue, yearsForCAGR)
      : 0.05;

  // Sort estimates by period (ascending)
  const sortedEstimates = [...estimates].sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  const years: number[] = [];
  const revenues: number[] = [];
  const growthRates: number[] = [];
  let source = "trend";
  let prevRevenue = lastRevenue;

  for (let i = 1; i <= projectionYears; i++) {
    const year = lastYear + i;
    years.push(year);

    // Try analyst estimate first
    const estimate = sortedEstimates.find(
      (e) => parseInt(e.period) === year || e.period === String(year)
    );

    let revenue: number;
    let growthRate: number;

    if (estimate && estimate.revenue_estimate > 0) {
      revenue = estimate.revenue_estimate;
      growthRate = (revenue - prevRevenue) / prevRevenue;
      source = "analyst";
    } else {
      // Fade growth rate towards long-term average (GDP-like, ~3%)
      const fadeYears = i - sortedEstimates.length; // years beyond analyst coverage
      if (fadeYears > 0) {
        const fadeFactor = Math.max(0, 1 - fadeYears / (projectionYears - sortedEstimates.length + 1));
        growthRate = historicalCAGR * fadeFactor + 0.03 * (1 - fadeFactor);
      } else {
        growthRate = historicalCAGR;
      }
      // Clamp growth rate
      growthRate = clamp(growthRate, -0.1, 0.3);
      revenue = prevRevenue * (1 + growthRate);
    }

    revenues.push(revenue);
    growthRates.push(growthRate);
    prevRevenue = revenue;
  }

  return { years, revenues, growthRates, source };
}

// --- DCF Projection ---

interface DCFAssumptions {
  revenueGrowthRates: number[];
  cogsPercent: number;
  sgaPercent: number;
  rndPercent: number;
  taxRate: number;
  capexPercent: number;
  daPercent: number; // D&A as % of revenue
  nwcPercent: number; // NWC change as % of delta revenue
  wacc: number;
  terminalGrowthRate: number;
  exitMultiple: number; // for EBITDA exit method
}

function buildAssumptions(
  historicals: FinancialStatement[],
  wacc: number
): Omit<DCFAssumptions, "revenueGrowthRates"> {
  const recent = historicals.slice(0, 5); // Most recent 5 years

  // Calculate average margins from recent history
  const cogsPercents = recent
    .filter((f) => f.revenue > 0)
    .map((f) => f.cost_of_revenue / f.revenue);
  const sgaPercents = recent
    .filter((f) => f.revenue > 0 && f.sga_expense > 0)
    .map((f) => f.sga_expense / f.revenue);
  const rndPercents = recent
    .filter((f) => f.revenue > 0 && f.rnd_expense > 0)
    .map((f) => f.rnd_expense / f.revenue);
  const capexPercents = recent
    .filter((f) => f.revenue > 0 && f.capital_expenditure !== 0)
    .map((f) => Math.abs(f.capital_expenditure) / f.revenue);
  const daPercents = recent
    .filter((f) => f.revenue > 0 && f.depreciation_amortization > 0)
    .map((f) => f.depreciation_amortization / f.revenue);

  // Tax rate: average effective, with bounds
  const taxRates = recent
    .filter(
      (f) => f.income_before_tax > 0 && f.income_tax > 0
    )
    .map((f) => f.income_tax / f.income_before_tax);

  return {
    cogsPercent: cogsPercents.length > 0 ? avg(cogsPercents) : 0.6,
    sgaPercent: sgaPercents.length > 0 ? avg(sgaPercents) : 0.15,
    rndPercent: rndPercents.length > 0 ? avg(rndPercents) : 0,
    taxRate: taxRates.length > 0 ? clamp(avg(taxRates), 0.05, 0.45) : 0.21,
    capexPercent: capexPercents.length > 0 ? avg(capexPercents) : 0.05,
    daPercent: daPercents.length > 0 ? avg(daPercents) : 0.04,
    nwcPercent: 0.05, // 5% of revenue delta as NWC change
    wacc,
    terminalGrowthRate: 0.03, // 3% default
    exitMultiple: 12, // will be overridden with industry median
  };
}

function buildProjections(
  revenueProjection: RevenueProjection,
  assumptions: DCFAssumptions
): DCFProjectionYear[] {
  const projections: DCFProjectionYear[] = [];
  let prevRevenue = 0;

  for (let i = 0; i < revenueProjection.revenues.length; i++) {
    const revenue = revenueProjection.revenues[i];
    const cogs = revenue * assumptions.cogsPercent;
    const grossProfit = revenue - cogs;
    const sga = revenue * assumptions.sgaPercent;
    const rnd = revenue * assumptions.rndPercent;
    const depreciation = revenue * assumptions.daPercent;
    const ebitda = grossProfit - sga - rnd;
    const ebit = ebitda - depreciation;
    const tax = Math.max(0, ebit * assumptions.taxRate);
    const nopat = ebit - tax;
    const capex = revenue * assumptions.capexPercent;
    const deltaNWC = i === 0 ? 0 : (revenue - prevRevenue) * assumptions.nwcPercent;
    const fcf = nopat + depreciation - capex - deltaNWC;
    const t = i + 1;
    const discountFactor = 1 / Math.pow(1 + assumptions.wacc, t);
    const pvFCF = fcf * discountFactor;

    projections.push({
      year: revenueProjection.years[i],
      revenue,
      cogs,
      gross_profit: grossProfit,
      sga,
      rnd,
      ebitda,
      depreciation,
      ebit,
      tax,
      nopat,
      capex,
      delta_nwc: deltaNWC,
      fcf,
      discount_factor: discountFactor,
      pv_fcf: pvFCF,
    });

    prevRevenue = revenue;
  }

  return projections;
}

// --- Sensitivity Matrix ---

function buildSensitivityMatrix(
  projections: DCFProjectionYear[],
  netDebt: number,
  sharesOutstanding: number,
  baseWACC: number,
  type: "growth" | "multiple",
  lastEBITDA?: number
): { wacc_values: number[]; growth_values: number[]; prices: number[][] } {
  const waccValues = [
    baseWACC - 0.02,
    baseWACC - 0.01,
    baseWACC,
    baseWACC + 0.01,
    baseWACC + 0.02,
  ];

  const secondAxis =
    type === "growth"
      ? [0.01, 0.02, 0.03, 0.04, 0.05]
      : [8, 10, 12, 14, 16];

  const prices: number[][] = [];

  for (const w of waccValues) {
    const row: number[] = [];
    for (const g of secondAxis) {
      // Recompute PV of FCFs with this WACC
      let pvFCFSum = 0;
      for (let i = 0; i < projections.length; i++) {
        const t = i + 1;
        pvFCFSum += projections[i].fcf / Math.pow(1 + w, t);
      }

      let tv: number;
      const n = projections.length;
      const lastFCF = projections[n - 1].fcf;

      if (type === "growth") {
        // Gordon Growth terminal value
        if (w <= g) {
          tv = lastFCF * 20; // Fallback if WACC <= g
        } else {
          tv = (lastFCF * (1 + g)) / (w - g);
        }
      } else {
        // EBITDA multiple terminal value
        tv = (lastEBITDA ?? projections[n - 1].ebitda) * g;
      }

      const pvTV = tv / Math.pow(1 + w, n);
      const ev = pvFCFSum + pvTV;
      const equityValue = ev - netDebt;
      const fairPrice = equityValue / sharesOutstanding;
      row.push(Math.max(0, fairPrice));
    }
    prices.push(row);
  }

  return { wacc_values: waccValues, growth_values: secondAxis, prices };
}

// ============================================================
// FCFE (Free Cash Flow to Equity) DCF Model
// Simpler approach: Revenue → Net Income → FCFE, discount by Cost of Equity
// ============================================================

export interface DCFFCFEInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  costOfEquity: number;       // Discount rate (Ke)
  currentPrice: number;
  sharesOutstanding: number;
  cashAndEquivalents: number;
  totalDebt: number;
  terminalGrowthRate?: number; // Default 2.5%
}

/**
 * DCF valuation using FCFE (Free Cash Flow to Equity) approach.
 * Revenue → Net Margin → Net Income - CapEx = FCFE
 * Discounted by Cost of Equity. Equity Value = PV(FCFE) + Cash - Debt.
 */
export function calculateDCF(
  inputs: DCFFCFEInputs,
  projectionYears: 5 | 10 = 5
): ValuationResult {
  const {
    historicals,
    estimates,
    costOfEquity,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    terminalGrowthRate: termGrowth = 0.025,
  } = inputs;

  const revenueProjection = projectRevenue(historicals, estimates, projectionYears);

  // Calculate historical averages for net margin and capex
  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);
  const recent = sorted.slice(-5);

  const netMargins = recent
    .filter((f) => f.revenue > 0)
    .map((f) => f.net_income / f.revenue);
  const avgNetMargin = netMargins.length > 0 ? avg(netMargins) : 0.10;

  // Sort estimates by period ascending for margin derivation
  const sortedEstimates = [...estimates].sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  // Build per-year margin from analyst estimates (EPS × shares / revenue)
  const lastYear = sorted[sorted.length - 1].fiscal_year;
  const analystMargins = new Map<number, number>();
  for (const est of sortedEstimates) {
    const year = parseInt(est.period);
    if (est.eps_estimate > 0 && est.revenue_estimate > 0 && sharesOutstanding > 0) {
      const derivedNetIncome = est.eps_estimate * sharesOutstanding;
      const margin = derivedNetIncome / est.revenue_estimate;
      // Sanity check: margin should be between -50% and 80%
      if (margin > -0.5 && margin < 0.8) {
        analystMargins.set(year, margin);
      }
    }
  }

  // CapEx model: Maintenance (≈ D&A) + Growth CapEx (tied to revenue increase)
  const lastFinancial = sorted[sorted.length - 1];
  const maintenanceCapex = lastFinancial.depreciation_amortization > 0
    ? lastFinancial.depreciation_amortization
    : Math.abs(lastFinancial.capital_expenditure) * 0.8; // fallback: 80% of total capex as maintenance
  const lastRevenue = lastFinancial.revenue;

  // Growth CapEx intensity: how much incremental capex per dollar of revenue growth
  // Derived from historical: (total capex - D&A) / revenue increase
  const growthCapexRatios: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const revIncrease = recent[i].revenue - recent[i - 1].revenue;
    const da = recent[i].depreciation_amortization > 0 ? recent[i].depreciation_amortization : 0;
    const totalCapex = Math.abs(recent[i].capital_expenditure);
    const growthCapex = totalCapex - da;
    if (revIncrease > 0 && growthCapex > 0) {
      growthCapexRatios.push(growthCapex / revIncrease);
    }
  }
  const growthCapexIntensity = growthCapexRatios.length > 0
    ? avg(growthCapexRatios)
    : 0.05; // fallback: 5 cents of growth capex per dollar of revenue increase

  const ke = costOfEquity;
  const g = termGrowth;

  // Build FCFE projections
  const projections: DCFProjectionYearFCFE[] = [];
  let prevRevenue = lastRevenue;

  for (let i = 0; i < revenueProjection.revenues.length; i++) {
    const revenue = revenueProjection.revenues[i];
    const year = revenueProjection.years[i];

    // Dynamic net margin: analyst-derived → fade to historical average
    let netMargin: number;
    const analystMargin = analystMargins.get(year);
    if (analystMargin !== undefined) {
      netMargin = analystMargin;
    } else {
      // Fade from last known margin toward historical average
      const lastKnownMargin = analystMargins.size > 0
        ? Array.from(analystMargins.values()).pop()!
        : avgNetMargin;
      const yearsBeyondAnalyst = year - lastYear - analystMargins.size;
      const fadeSteps = projectionYears - analystMargins.size;
      if (fadeSteps > 0 && yearsBeyondAnalyst > 0) {
        const fadeFactor = Math.max(0, 1 - yearsBeyondAnalyst / fadeSteps);
        netMargin = lastKnownMargin * fadeFactor + avgNetMargin * (1 - fadeFactor);
      } else {
        netMargin = lastKnownMargin;
      }
    }

    const netIncome = revenue * netMargin;

    // CapEx = Maintenance (D&A, grows slowly) + Growth (tied to revenue increase)
    const revenueIncrease = Math.max(0, revenue - prevRevenue);
    const maintenanceGrowth = 1 + Math.max(0, revenueProjection.growthRates[i] * 0.2); // D&A grows at ~20% of revenue growth
    const yearMaintenanceCapex = i === 0 ? maintenanceCapex : maintenanceCapex * Math.pow(maintenanceGrowth, i);
    const yearGrowthCapex = revenueIncrease * growthCapexIntensity;
    const netCapex = yearMaintenanceCapex + yearGrowthCapex;
    prevRevenue = revenue;

    const fcfe = netIncome - netCapex;
    const t = i + 1;
    const discountFactor = 1 / Math.pow(1 + ke, t);
    const pvFCFE = fcfe * discountFactor;

    projections.push({
      year,
      revenue,
      net_margin: netMargin,
      net_income: netIncome,
      net_capex: netCapex,
      fcfe,
      discount_factor: discountFactor,
      pv_fcfe: pvFCFE,
    });
  }

  // Terminal value (Gordon Growth on FCFE)
  const lastFCFE = projections[projections.length - 1].fcfe;
  const terminalValue =
    ke > g ? (lastFCFE * (1 + g)) / (ke - g) : lastFCFE * 20;

  const pvTerminalValue =
    terminalValue / Math.pow(1 + ke, projectionYears);
  const pvFCFETotal = projections.reduce((sum, p) => sum + p.pv_fcfe, 0);

  // Equity Value = PV of FCFE + PV of Terminal + Cash - Debt
  const totalPV = pvFCFETotal + pvTerminalValue;
  const equityValue = totalPV + cashAndEquivalents - totalDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // Sensitivity matrix (Discount Rate × Terminal Growth)
  const sensitivity = buildFCFESensitivityMatrix(
    projections,
    cashAndEquivalents,
    totalDebt,
    sharesOutstanding,
    ke,
    g
  );

  const allPrices = sensitivity.prices.flat();
  const lowEstimate = Math.min(...allPrices);
  const highEstimate = Math.max(...allPrices);

  return {
    model_type: "dcf_growth_exit_5y", // Keep type for DB compat
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      revenue_growth_rates: revenueProjection.growthRates.map(
        (r) => Math.round(r * 10000) / 100
      ),
      revenue_source: revenueProjection.source,
      net_margin: Math.round(avgNetMargin * 10000) / 100,
      net_margins_by_year: projections.map((p) => Math.round(p.net_margin * 10000) / 100),
      margin_source: analystMargins.size > 0 ? "analyst" : "historical",
      maintenance_capex: Math.round(maintenanceCapex / 1e6),
      growth_capex_intensity: Math.round(growthCapexIntensity * 10000) / 100,
      discount_rate: Math.round(ke * 10000) / 100,
      terminal_growth_rate: Math.round(g * 10000) / 100,
      projection_years: projectionYears,
    },
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

/**
 * Sensitivity matrix for FCFE DCF: Discount Rate × Terminal Growth Rate
 */
function buildFCFESensitivityMatrix(
  projections: DCFProjectionYearFCFE[],
  cash: number,
  debt: number,
  sharesOutstanding: number,
  baseKe: number,
  baseGrowth: number,
): { discount_rate_values: number[]; growth_values: number[]; prices: number[][] } {
  const keValues = [
    baseKe - 0.02,
    baseKe - 0.01,
    baseKe,
    baseKe + 0.01,
    baseKe + 0.02,
  ];
  const growthValues = [0.01, 0.02, baseGrowth, 0.04, 0.05].sort((a, b) => a - b);
  // Deduplicate growth values
  const uniqueGrowth = [...new Set(growthValues.map(v => Math.round(v * 1000) / 1000))];

  const prices: number[][] = [];
  const n = projections.length;

  for (const ke of keValues) {
    const row: number[] = [];
    for (const g of uniqueGrowth) {
      let pvFCFESum = 0;
      for (let i = 0; i < n; i++) {
        const t = i + 1;
        pvFCFESum += projections[i].fcfe / Math.pow(1 + ke, t);
      }

      const lastFCFE = projections[n - 1].fcfe;
      let tv: number;
      if (ke <= g) {
        tv = lastFCFE * 20;
      } else {
        tv = (lastFCFE * (1 + g)) / (ke - g);
      }
      const pvTV = tv / Math.pow(1 + ke, n);
      const totalPV = pvFCFESum + pvTV;
      const equityValue = totalPV + cash - debt;
      row.push(Math.max(0, equityValue / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: keValues, growth_values: uniqueGrowth, prices };
}

// ============================================================
// Three-Stage DCF (FCFE approach)
// Stage 1 (Y1–5): Analyst estimates
// Stage 2 (Y6–10): Growth rate + margin fade linearly to terminal
// Stage 3 (Y11+): Terminal value (perpetuity, PE exit, or EV/EBITDA exit)
// ============================================================

/** Shared context returned by the 3-stage projection builder */
interface ThreeStageProjectionResult {
  projections: import("@/types").DCFProjectionYearFCFE[];
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
  const projections: import("@/types").DCFProjectionYearFCFE[] = [];
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
  projections: import("@/types").DCFProjectionYearFCFE[],
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

// ============================================================
// Legacy FCFF Models (deprecated — kept for potential future use)
// ============================================================

// --- Public API (legacy) ---

/** @deprecated Use DCFFCFEInputs instead */
export interface DCFInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  waccResult: WACCResult;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
}

/**
 * @deprecated Use calculateDCF() (FCFE approach) instead.
 * DCF Growth Exit Model (5Y or 10Y) — FCFF approach
 */
export function calculateDCFGrowthExit(
  inputs: DCFInputs,
  projectionYears: 5 | 10
): ValuationResult {
  const { historicals, estimates, waccResult, currentPrice, sharesOutstanding, netDebt } =
    inputs;

  const revenueProjection = projectRevenue(historicals, estimates, projectionYears);
  const baseAssumptions = buildAssumptions(historicals, waccResult.wacc);
  const assumptions: DCFAssumptions = {
    ...baseAssumptions,
    revenueGrowthRates: revenueProjection.growthRates,
  };

  const projections = buildProjections(revenueProjection, assumptions);

  // Terminal value (Gordon Growth)
  const lastFCF = projections[projections.length - 1].fcf;
  const g = assumptions.terminalGrowthRate;
  const w = assumptions.wacc;
  const terminalValue =
    w > g ? (lastFCF * (1 + g)) / (w - g) : lastFCF * 20;

  const pvTerminalValue =
    terminalValue / Math.pow(1 + w, projectionYears);
  const pvFCFTotal = projections.reduce((sum, p) => sum + p.pv_fcf, 0);
  const enterpriseValue = pvFCFTotal + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // Sensitivity matrix
  const sensitivity = buildSensitivityMatrix(
    projections,
    netDebt,
    sharesOutstanding,
    w,
    "growth"
  );

  // Estimate range from sensitivity extremes
  const allPrices = sensitivity.prices.flat();
  const lowEstimate = Math.min(...allPrices);
  const highEstimate = Math.max(...allPrices);

  const modelType =
    projectionYears === 5 ? "dcf_growth_exit_5y" : "dcf_growth_exit_10y";

  return {
    model_type: modelType as ValuationResult["model_type"],
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      revenue_growth_rates: revenueProjection.growthRates.map(
        (r) => Math.round(r * 10000) / 100
      ),
      revenue_source: revenueProjection.source,
      cogs_percent: Math.round(assumptions.cogsPercent * 10000) / 100,
      sga_percent: Math.round(assumptions.sgaPercent * 10000) / 100,
      rnd_percent: Math.round(assumptions.rndPercent * 10000) / 100,
      tax_rate: Math.round(assumptions.taxRate * 10000) / 100,
      capex_percent: Math.round(assumptions.capexPercent * 10000) / 100,
      da_percent: Math.round(assumptions.daPercent * 10000) / 100,
      wacc: Math.round(w * 10000) / 100,
      terminal_growth_rate: Math.round(g * 10000) / 100,
      projection_years: projectionYears,
    },
    details: {
      projections,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcf_total: pvFCFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}

/**
 * @deprecated Use calculateDCF() (FCFE approach) instead.
 * DCF EBITDA Exit Model (5Y or 10Y) — FCFF approach
 */
export function calculateDCFEBITDAExit(
  inputs: DCFInputs,
  projectionYears: 5 | 10,
  exitMultiple = 12
): ValuationResult {
  const { historicals, estimates, waccResult, currentPrice, sharesOutstanding, netDebt } =
    inputs;

  const revenueProjection = projectRevenue(historicals, estimates, projectionYears);
  const baseAssumptions = buildAssumptions(historicals, waccResult.wacc);
  const assumptions: DCFAssumptions = {
    ...baseAssumptions,
    revenueGrowthRates: revenueProjection.growthRates,
    exitMultiple,
  };

  const projections = buildProjections(revenueProjection, assumptions);
  const w = assumptions.wacc;

  // Terminal value (EBITDA Exit Multiple)
  const lastEBITDA = projections[projections.length - 1].ebitda;
  const terminalValue = lastEBITDA * exitMultiple;

  const pvTerminalValue =
    terminalValue / Math.pow(1 + w, projectionYears);
  const pvFCFTotal = projections.reduce((sum, p) => sum + p.pv_fcf, 0);
  const enterpriseValue = pvFCFTotal + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // Sensitivity matrix (WACC × Exit Multiple)
  const sensitivity = buildSensitivityMatrix(
    projections,
    netDebt,
    sharesOutstanding,
    w,
    "multiple",
    lastEBITDA
  );

  const allPrices = sensitivity.prices.flat();
  const lowEstimate = Math.min(...allPrices);
  const highEstimate = Math.max(...allPrices);

  const modelType =
    projectionYears === 5 ? "dcf_ebitda_exit_5y" : "dcf_ebitda_exit_10y";

  return {
    model_type: modelType as ValuationResult["model_type"],
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: lowEstimate,
    high_estimate: highEstimate,
    assumptions: {
      ...{
        revenue_growth_rates: revenueProjection.growthRates.map(
          (r) => Math.round(r * 10000) / 100
        ),
        cogs_percent: Math.round(assumptions.cogsPercent * 10000) / 100,
        sga_percent: Math.round(assumptions.sgaPercent * 10000) / 100,
        rnd_percent: Math.round(assumptions.rndPercent * 10000) / 100,
        tax_rate: Math.round(assumptions.taxRate * 10000) / 100,
        capex_percent: Math.round(assumptions.capexPercent * 10000) / 100,
        da_percent: Math.round(assumptions.daPercent * 10000) / 100,
        wacc: Math.round(w * 10000) / 100,
        exit_multiple: exitMultiple,
        projection_years: projectionYears,
      },
    },
    details: {
      projections,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcf_total: pvFCFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}
