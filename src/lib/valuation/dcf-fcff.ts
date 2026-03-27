// ============================================================
// FCFF DCF Growth Exit (5Y / 10Y)
// Unlevered Free Cash Flow to Firm with Gordon Growth terminal value.
// N-year projection + 1 terminal year, mid-year discounting, WACC.
//
// Key differences from FCFE models:
// - Line-by-line expense modeling (COGS, SG&A, R&D, Interest)
// - D&A via vintage matrix (CapEx depreciated straight-line over useful life)
// - Working capital via turnover days (DSO, DPO, DIO)
// - FCFF = EBITDA - Tax - CapEx - ΔWC
// - Discount rate = WACC (not Cost of Equity)
// - Mid-year convention for discounting
// - EV → Equity bridge (subtract net debt)
// ============================================================

import type {
  FinancialStatement,
  AnalystEstimate,
  ValuationResult,
  DCFFCFFProjectionYear,
  DCFFCFFDASchedule,
  DCFFCFFWorkingCapital,
  DCFFCFFExpenseRatios,
} from "@/types";
import { avg, projectRevenue } from "./dcf-helpers";

// --- Inputs ---

export interface DCFFCFFInputs {
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  wacc: number;
  currentPrice: number;
  sharesOutstanding: number;
  cashAndEquivalents: number;
  totalDebt: number;
  terminalGrowthRate?: number;
  usefulLife?: number; // default 5
}

// --- Helpers ---

/** Compute historical average expense ratios from recent financials */
function computeExpenseRatios(recent: FinancialStatement[]): DCFFCFFExpenseRatios {
  const withRevenue = recent.filter((f) => f.revenue > 0);

  const cogsPcts = withRevenue.map((f) => f.cost_of_revenue / f.revenue);
  const sgaPcts = withRevenue.map((f) => f.sga_expense / f.revenue);
  const rndPcts = withRevenue.map((f) => f.rnd_expense / f.revenue);
  const interestPcts = withRevenue.map((f) => f.interest_expense / f.revenue);
  const taxRates = withRevenue
    .filter((f) => f.income_before_tax > 0)
    .map((f) => f.income_tax / f.income_before_tax);

  return {
    cogs_pct: avg(cogsPcts) || 0.5,
    sga_pct: avg(sgaPcts) || 0.05,
    rnd_pct: avg(rndPcts) || 0,
    interest_pct: avg(interestPcts) || 0.02,
    tax_rate: taxRates.length > 0 ? Math.max(0, Math.min(0.5, avg(taxRates))) : 0.21,
  };
}

/** Build D&A vintage matrix from historical + projected CapEx */
function buildDASchedule(
  historicalCapex: { year: number; capex: number }[],
  projectedCapex: { year: number; capex: number }[],
  projectionYears: number[],
  usefulLife: number
): DCFFCFFDASchedule {
  // All CapEx entries that could still be depreciating during projection period
  const allCapex = [...historicalCapex, ...projectedCapex];
  const firstProjYear = projectionYears[0];
  const lastProjYear = projectionYears[projectionYears.length - 1];

  const vintages: DCFFCFFDASchedule["vintages"] = [];

  for (const { year: capexYear, capex } of allCapex) {
    const annualDA = capex / usefulLife;
    const depStartYear = capexYear + 1; // depreciation starts the year after purchase
    const depEndYear = capexYear + usefulLife;

    // Only include if depreciation overlaps with projection period
    if (depEndYear < firstProjYear || depStartYear > lastProjYear) continue;

    const amounts: number[] = [];
    for (const projYear of projectionYears) {
      if (projYear >= depStartYear && projYear <= depEndYear) {
        amounts.push(annualDA);
      } else {
        amounts.push(0);
      }
    }
    vintages.push({ capex_year: capexYear, amounts });
  }

  // Totals per projection year
  const totals = projectionYears.map((_, i) =>
    vintages.reduce((sum, v) => sum + v.amounts[i], 0)
  );

  return { useful_life: usefulLife, vintages, totals };
}

/** Compute working capital turnover days from historical data */
function computeWorkingCapitalDays(recent: FinancialStatement[]): {
  dso: number;
  dpo: number;
  dio: number;
} {
  const withRevenue = recent.filter((f) => f.revenue > 0);

  const dsoValues = withRevenue
    .filter((f) => f.accounts_receivable > 0)
    .map((f) => (f.accounts_receivable / f.revenue) * 365);

  const dpoValues = withRevenue
    .filter((f) => f.accounts_payable > 0 && f.cost_of_revenue > 0)
    .map((f) => (f.accounts_payable / f.cost_of_revenue) * 365);

  const dioValues = withRevenue
    .filter((f) => f.inventory > 0 && f.cost_of_revenue > 0)
    .map((f) => (f.inventory / f.cost_of_revenue) * 365);

  return {
    dso: dsoValues.length > 0 ? Math.round(avg(dsoValues)) : 45,
    dpo: dpoValues.length > 0 ? Math.round(avg(dpoValues)) : 30,
    dio: dioValues.length > 0 ? Math.round(avg(dioValues)) : 60,
  };
}

/** Build working capital projections from turnover days */
function buildWorkingCapital(
  years: number[],
  revenues: number[],
  cogsValues: number[],
  dso: number,
  dpo: number,
  dio: number,
  baseNWC: number
): DCFFCFFWorkingCapital {
  const receivables: number[] = [];
  const payables: number[] = [];
  const inventory: number[] = [];
  const nwc: number[] = [];
  const deltaNWC: number[] = [];

  for (let i = 0; i < years.length; i++) {
    const ar = (revenues[i] * dso) / 365;
    const ap = (cogsValues[i] * dpo) / 365;
    const inv = (cogsValues[i] * dio) / 365;
    const currentNWC = ar - ap + inv;

    receivables.push(ar);
    payables.push(ap);
    inventory.push(inv);
    nwc.push(currentNWC);

    const prevNWC = i === 0 ? baseNWC : nwc[i - 1];
    deltaNWC.push(currentNWC - prevNWC);
  }

  return { dso, dpo, dio, years, receivables, payables, inventory, nwc, delta_nwc: deltaNWC };
}

/** Build FCFF sensitivity matrix: WACC × Terminal Growth → Fair Value */
function buildFCFFSensitivityMatrix(
  projections: DCFFCFFProjectionYear[],
  terminalFCFF: number,
  netDebt: number,
  sharesOutstanding: number,
  baseWACC: number,
  baseG: number,
  projectionYears: number = 5
): { discount_rate_values: number[]; growth_values: number[]; prices: number[][] } {
  const waccValues = [
    baseWACC - 0.02,
    baseWACC - 0.01,
    baseWACC,
    baseWACC + 0.01,
    baseWACC + 0.02,
  ];

  const gValues = [
    baseG - 0.01,
    baseG - 0.005,
    baseG,
    baseG + 0.005,
    baseG + 0.01,
  ];

  const prices: number[][] = [];

  for (const wacc of waccValues) {
    const row: number[] = [];
    for (const g of gValues) {
      // PV of projected FCFFs (mid-year)
      let pvFCFF = 0;
      for (const p of projections) {
        pvFCFF += p.fcff / Math.pow(1 + wacc, p.timing);
      }

      // Terminal value
      const tv = wacc > g ? terminalFCFF / (wacc - g) : terminalFCFF * 20;
      const pvTV = tv / Math.pow(1 + wacc, projectionYears);

      const ev = pvFCFF + pvTV;
      const equity = ev - netDebt;
      row.push(Math.max(0, equity / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: waccValues, growth_values: gValues, prices };
}

// --- Main Calculator ---

function calculateFCFFInternal(inputs: DCFFCFFInputs, numYears: number): ValuationResult {
  const {
    historicals,
    estimates,
    wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    terminalGrowthRate: termGrowth = 0.025,
    usefulLife = 5,
  } = inputs;

  const sorted = [...historicals]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (sorted.length === 0) throw new Error("No historical revenue data available");

  const recent = sorted.slice(-5);
  const lastFinancial = sorted[sorted.length - 1];

  // 1. Revenue projection — reuse shared helper
  const revProj = projectRevenue(historicals, estimates, numYears);

  // 2. Expense ratios from historical averages
  const ratios = computeExpenseRatios(recent);

  // 3. CapEx as % of revenue (historical average)
  const capexRatios = recent
    .filter((f) => f.capital_expenditure !== 0)
    .map((f) => Math.abs(f.capital_expenditure) / f.revenue);
  const capexRatio = capexRatios.length > 0 ? avg(capexRatios) : 0.05;

  // 4. Historical CapEx for D&A vintage matrix
  const historicalCapex = sorted
    .slice(-usefulLife)
    .map((f) => ({ year: f.fiscal_year, capex: Math.abs(f.capital_expenditure) }));

  const projectedCapex = revProj.revenues.map((rev, i) => ({
    year: revProj.years[i],
    capex: rev * capexRatio,
  }));

  const daSchedule = buildDASchedule(historicalCapex, projectedCapex, revProj.years, usefulLife);

  // 5. Working capital turnover days
  const wcDays = computeWorkingCapitalDays(recent);

  // Compute base year NWC
  const baseAR = lastFinancial.accounts_receivable || 0;
  const baseAP = lastFinancial.accounts_payable || 0;
  const baseInv = lastFinancial.inventory || 0;
  const baseNWC = baseAR - baseAP + baseInv;

  // COGS values for working capital calculation
  const cogsValues = revProj.revenues.map((rev) => rev * ratios.cogs_pct);

  const wc = buildWorkingCapital(
    revProj.years, revProj.revenues, cogsValues,
    wcDays.dso, wcDays.dpo, wcDays.dio, baseNWC
  );

  // 6. Build projections
  const projections: DCFFCFFProjectionYear[] = [];
  const g = termGrowth;

  for (let i = 0; i < numYears; i++) {
    const revenue = revProj.revenues[i];
    const prevRevenue = i === 0 ? lastFinancial.revenue : revProj.revenues[i - 1];
    const revenueGrowth = prevRevenue > 0 ? (revenue - prevRevenue) / prevRevenue : 0;

    const cogs = revenue * ratios.cogs_pct;
    const grossProfit = revenue - cogs;
    const sga = revenue * ratios.sga_pct;
    const rnd = revenue * ratios.rnd_pct;
    const operatingIncome = grossProfit - sga - rnd;

    const interestExpense = revenue * ratios.interest_pct;
    const incomeBT = operatingIncome - interestExpense;
    const tax = Math.max(0, incomeBT * ratios.tax_rate);
    const netIncome = incomeBT - tax;

    const depreciation = daSchedule.totals[i];
    const ebitda = incomeBT + interestExpense + depreciation;
    // Alternative: EBITDA = incomeBT - (-interestExpense) + depreciation
    // = Profit Before Tax - Net Interest + D&A (matching competitor formula)

    const capex = revenue * capexRatio;
    const deltaNWC = wc.delta_nwc[i];

    const fcff = ebitda - tax - capex - deltaNWC;
    const timing = i + 0.5; // mid-year convention
    const discountFactor = 1 / Math.pow(1 + wacc, timing);

    projections.push({
      year: revProj.years[i],
      revenue,
      revenue_growth: revenueGrowth,
      cogs,
      gross_profit: grossProfit,
      sga,
      rnd,
      operating_income: operatingIncome,
      interest_expense: interestExpense,
      income_before_tax: incomeBT,
      tax,
      net_income: netIncome,
      ebitda,
      depreciation,
      capex,
      delta_nwc: deltaNWC,
      fcff,
      timing,
      discount_factor: discountFactor,
      pv_fcff: fcff * discountFactor,
    });
  }

  // 7. Terminal year (Year N+1) — grow all items by g
  const lastProj = projections[numYears - 1];
  const termRevenue = lastProj.revenue * (1 + g);
  const termCOGS = termRevenue * ratios.cogs_pct;
  const termGrossProfit = termRevenue - termCOGS;
  const termSGA = termRevenue * ratios.sga_pct;
  const termRND = termRevenue * ratios.rnd_pct;
  const termOpIncome = termGrossProfit - termSGA - termRND;
  const termInterest = termRevenue * ratios.interest_pct;
  const termIncBT = termOpIncome - termInterest;
  const termTax = Math.max(0, termIncBT * ratios.tax_rate);
  const termNetIncome = termIncBT - termTax;
  // Terminal D&A: grow last projection year D&A by g (simplified for terminal)
  const termDepreciation = lastProj.depreciation * (1 + g);
  const termEBITDA = termIncBT + termInterest + termDepreciation;
  const termCapex = termRevenue * capexRatio;
  const termDeltaNWC = lastProj.delta_nwc * (1 + g);
  const termFCFF = termEBITDA - termTax - termCapex - termDeltaNWC;

  const terminalYear: DCFFCFFProjectionYear = {
    year: lastProj.year + 1,
    revenue: termRevenue,
    revenue_growth: g,
    cogs: termCOGS,
    gross_profit: termGrossProfit,
    sga: termSGA,
    rnd: termRND,
    operating_income: termOpIncome,
    interest_expense: termInterest,
    income_before_tax: termIncBT,
    tax: termTax,
    net_income: termNetIncome,
    ebitda: termEBITDA,
    depreciation: termDepreciation,
    capex: termCapex,
    delta_nwc: termDeltaNWC,
    fcff: termFCFF,
    timing: numYears, // terminal discounted at year N (not mid-year)
    discount_factor: 1 / Math.pow(1 + wacc, numYears),
    pv_fcff: 0, // will be set via terminal value
  };

  // 8. Terminal value (Gordon Growth on FCFF)
  const terminalValue = wacc > g
    ? termFCFF / (wacc - g)
    : termFCFF * 20; // fallback cap

  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, numYears);
  const pvFCFFTotal = projections.reduce((sum, p) => sum + p.pv_fcff, 0);

  // 9. Enterprise → Equity bridge
  const enterpriseValue = pvFCFFTotal + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // 10. Sensitivity matrix
  const sensitivity = buildFCFFSensitivityMatrix(
    projections, termFCFF, netDebt, sharesOutstanding, wacc, g, numYears
  );
  const allPrices = sensitivity.prices.flat();

  // Base year data for display
  const baseYear = {
    year: lastFinancial.fiscal_year,
    revenue: lastFinancial.revenue,
    cogs: lastFinancial.cost_of_revenue,
    sga: lastFinancial.sga_expense,
    rnd: lastFinancial.rnd_expense,
    interest_expense: lastFinancial.interest_expense,
    tax: lastFinancial.income_tax,
    net_income: lastFinancial.net_income,
    nwc: baseNWC,
  };

  return {
    model_type: numYears === 10 ? "dcf_fcff_growth_10y" : "dcf_fcff_growth_5y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: Math.min(...allPrices),
    high_estimate: Math.max(...allPrices),
    assumptions: {
      wacc: Math.round(wacc * 10000) / 100,
      terminal_growth_rate: Math.round(g * 10000) / 100,
      terminal_method: "perpetuity",
      projection_years: numYears,
      useful_life: usefulLife,
      revenue_growth_rates: revProj.growthRates.map((r) => Math.round(r * 10000) / 100),
      revenue_source: revProj.source,
      cogs_pct_revenue: Math.round(ratios.cogs_pct * 10000) / 100,
      sga_pct_revenue: Math.round(ratios.sga_pct * 10000) / 100,
      rnd_pct_revenue: Math.round(ratios.rnd_pct * 10000) / 100,
      interest_pct_revenue: Math.round(ratios.interest_pct * 10000) / 100,
      effective_tax_rate: Math.round(ratios.tax_rate * 10000) / 100,
      capex_pct_revenue: Math.round(capexRatio * 10000) / 100,
      dso: wcDays.dso,
      dpo: wcDays.dpo,
      dio: wcDays.dio,
      discount_rate: Math.round(wacc * 10000) / 100,
    },
    details: {
      projections,
      terminal_year: terminalYear,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcff_total: pvFCFFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      da_schedule: daSchedule,
      working_capital: wc,
      expense_ratios: ratios,
      base_year: baseYear,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}

export function calculateDCFFCFF(inputs: DCFFCFFInputs): ValuationResult {
  return calculateFCFFInternal(inputs, 5);
}

export function calculateDCFFCFF10Y(inputs: DCFFCFFInputs): ValuationResult {
  return calculateFCFFInternal(inputs, 10);
}

// ============================================================
// FCFF EBITDA Exit (5Y)
// Same projection as Growth 5Y but terminal value = Terminal EBITDA × peer multiple.
// ============================================================

export interface DCFFCFFEBITDAExitInputs extends Omit<DCFFCFFInputs, "terminalGrowthRate"> {
  peerEVEBITDAMedian: number;
}

/** Build sensitivity matrix: WACC × EV/EBITDA Multiple → Fair Value */
function buildEBITDAExitSensitivityMatrix(
  projections: DCFFCFFProjectionYear[],
  terminalEBITDA: number,
  netDebt: number,
  sharesOutstanding: number,
  baseWACC: number,
  baseMultiple: number
): { discount_rate_values: number[]; multiple_values: number[]; prices: number[][] } {
  const waccValues = [
    baseWACC - 0.02,
    baseWACC - 0.01,
    baseWACC,
    baseWACC + 0.01,
    baseWACC + 0.02,
  ].map((v) => Math.max(0.01, v));

  const multipleValues = [
    baseMultiple - 4,
    baseMultiple - 2,
    baseMultiple,
    baseMultiple + 2,
    baseMultiple + 4,
  ].map((v) => Math.max(1, v));

  const prices: number[][] = [];
  for (const wacc of waccValues) {
    const row: number[] = [];
    for (const multiple of multipleValues) {
      let pvFCFF = 0;
      for (const p of projections) {
        pvFCFF += p.fcff / Math.pow(1 + wacc, p.timing);
      }
      const tv = terminalEBITDA * multiple;
      const pvTV = tv / Math.pow(1 + wacc, projections.length);
      const ev = pvFCFF + pvTV;
      const equity = ev - netDebt;
      row.push(Math.max(0, equity / sharesOutstanding));
    }
    prices.push(row);
  }

  return { discount_rate_values: waccValues, multiple_values: multipleValues, prices };
}

export function calculateDCFFCFFEBITDAExit(inputs: DCFFCFFEBITDAExitInputs): ValuationResult {
  const {
    historicals,
    estimates,
    wacc,
    currentPrice,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
    peerEVEBITDAMedian,
    usefulLife = 5,
  } = inputs;

  // Reuse all projection logic from the 5Y growth model
  const baseResult = calculateFCFFInternal(
    { ...inputs, terminalGrowthRate: 0.025 },
    5
  );

  // Extract the terminal EBITDA from the base result
  const terminalYear = baseResult.details.terminal_year as DCFFCFFProjectionYear;
  const projections = baseResult.details.projections as DCFFCFFProjectionYear[];

  const terminalEBITDA = terminalYear.ebitda;
  const netDebt = totalDebt - cashAndEquivalents;

  // Override terminal value with EBITDA exit multiple
  const terminalValue = terminalEBITDA * peerEVEBITDAMedian;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, 5);
  const pvFCFFTotal = projections.reduce((sum, p) => sum + p.pv_fcff, 0);

  const enterpriseValue = pvFCFFTotal + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const fairValue = Math.max(0, equityValue / sharesOutstanding);

  // Sensitivity: WACC × EV/EBITDA Multiple
  const sensitivity = buildEBITDAExitSensitivityMatrix(
    projections, terminalEBITDA, netDebt, sharesOutstanding, wacc, peerEVEBITDAMedian
  );
  const allPrices = sensitivity.prices.flat().filter((p) => p > 0);

  return {
    model_type: "dcf_fcff_ebitda_exit_5y",
    fair_value: fairValue,
    upside_percent: ((fairValue - currentPrice) / currentPrice) * 100,
    low_estimate: allPrices.length > 0 ? Math.min(...allPrices) : 0,
    high_estimate: allPrices.length > 0 ? Math.max(...allPrices) : 0,
    assumptions: {
      ...baseResult.assumptions,
      terminal_method: "ebitda_exit",
      peer_ev_ebitda_multiple: Math.round(peerEVEBITDAMedian * 100) / 100,
      useful_life: usefulLife,
    },
    details: {
      ...baseResult.details,
      terminal_value: terminalValue,
      pv_terminal_value: pvTerminalValue,
      pv_fcff_total: pvFCFFTotal,
      enterprise_value: enterpriseValue,
      net_debt: netDebt,
      equity_value: equityValue,
      shares_outstanding: sharesOutstanding,
      sensitivity_matrix: sensitivity,
    },
    computed_at: new Date().toISOString(),
  };
}
