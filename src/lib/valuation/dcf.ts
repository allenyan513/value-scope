// ============================================================
// DCF (Discounted Cash Flow) Valuation Models
// Variants: Growth Exit (5Y/10Y), EBITDA Exit (5Y/10Y)
// ============================================================

import type {
  FinancialStatement,
  AnalystEstimate,
  ValuationResult,
  DCFProjectionYear,
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

// --- Public API ---

export interface DCFInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  waccResult: WACCResult;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
}

/**
 * DCF Growth Exit Model (5Y or 10Y)
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
 * DCF EBITDA Exit Model (5Y or 10Y)
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
