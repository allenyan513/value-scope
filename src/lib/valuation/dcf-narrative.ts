// ============================================================
// DCF Narrative Generator
// Produces human-readable explanations of DCF valuation results
// ============================================================

import type { ValuationResult } from "@/types";
import { VERDICT_THRESHOLD } from "@/lib/constants";

function pct(v: number): string {
  return v.toFixed(1) + "%";
}

function dollar(v: number): string {
  return "$" + v.toFixed(2);
}

function verdictWord(upside: number): string {
  if (upside > VERDICT_THRESHOLD) return "undervalued";
  if (upside < -VERDICT_THRESHOLD) return "overvalued";
  return "fairly valued";
}

/**
 * Generate a human-readable narrative for a DCF model result.
 */
export function generateDCFNarrative(
  model: ValuationResult,
  companyName: string,
  ticker: string,
  currentPrice: number,
): string {
  const a = model.assumptions as Record<string, unknown>;
  const d = model.details as Record<string, unknown>;
  const method = a.terminal_method as string | undefined;

  const discountRate = a.discount_rate as number;
  const terminalGrowth = a.terminal_growth_rate as number;
  const growthRates = a.revenue_growth_rates as number[] | undefined;
  const marginSource = a.margin_source as string | undefined;
  const margins = a.net_margins_by_year as number[] | undefined;
  const projYears = a.projection_years as number;

  const pvFCFE = (d.pv_fcfe_total ?? d.pv_fcff_total ?? 0) as number;
  const pvTV = (d.pv_terminal_value ?? 0) as number;
  const totalPV = pvFCFE + pvTV;
  const tvPortion = totalPV > 0 ? Math.round((pvTV / totalPV) * 100) : 0;

  const verdict = verdictWord(model.upside_percent);
  const absUpside = Math.abs(model.upside_percent).toFixed(1);

  // Revenue growth summary
  let growthDesc = "";
  if (growthRates && growthRates.length >= 2) {
    growthDesc = `revenue growing from ${pct(growthRates[0])} to ${pct(growthRates[growthRates.length - 1])} annually`;
  }

  // Margin description
  let marginDesc = "";
  if (margins && margins.length > 0) {
    const first = margins[0];
    const last = margins[margins.length - 1];
    marginDesc = marginSource === "analyst"
      ? `Net margins start at ${pct(first)} (analyst-derived) and fade to ${pct(last)}`
      : `Net margins average ${pct(first)} based on historical data`;
  }

  // Build narrative based on terminal method
  if (method === "pe_exit") {
    const exitPE = a.exit_pe as number;
    return [
      `Using a Discounted Cash Flow model with P/E exit multiple, we project ${companyName}'s free cash flows over ${projYears} years.`,
      growthDesc ? `The first 5 years use analyst consensus estimates (${growthDesc}), while years 6–10 transition to the terminal phase.` : "",
      marginDesc ? `${marginDesc}.` : "",
      `At a ${pct(discountRate)} cost of equity, we discount projected cash flows to present value.`,
      `In year ${projYears}, we assume the market values ${ticker} at a P/E of ${exitPE.toFixed(1)}x — its 5-year historical average — to derive the terminal value, which represents ${tvPortion}% of total present value.`,
      `This yields an intrinsic value of ${dollar(model.fair_value)} per share, suggesting ${ticker} is ${verdict} by ${absUpside}% at the current price of ${dollar(currentPrice)}.`,
    ].filter(Boolean).join(" ");
  }

  if (method === "ebitda_exit") {
    const exitMult = a.exit_ev_ebitda as number;
    const ebitdaMargin = a.ebitda_margin as number | undefined;
    return [
      `Using a Discounted Cash Flow model with EV/EBITDA exit multiple, we project ${companyName}'s free cash flows over ${projYears} years.`,
      growthDesc ? `The first 5 years use analyst consensus estimates (${growthDesc}), while years 6–10 transition to the terminal phase.` : "",
      marginDesc ? `${marginDesc}.` : "",
      ebitdaMargin ? `The historical EBITDA margin of ${pct(ebitdaMargin)} is applied to project terminal EBITDA.` : "",
      `At a ${pct(discountRate)} cost of equity, we discount projected cash flows to present value.`,
      `In year ${projYears}, we value the enterprise at ${exitMult.toFixed(1)}x EV/EBITDA — the 5-year historical average — then subtract net debt to arrive at equity value. Terminal value represents ${tvPortion}% of total present value.`,
      `This yields an intrinsic value of ${dollar(model.fair_value)} per share, suggesting ${ticker} is ${verdict} by ${absUpside}% at the current price of ${dollar(currentPrice)}.`,
    ].filter(Boolean).join(" ");
  }

  // FCFF (unlevered) — 5Y and 10Y
  if (model.model_type === "dcf_fcff_growth_5y" || model.model_type === "dcf_fcff_growth_10y") {
    const waccRate = a.wacc as number ?? discountRate;
    const horizonDesc = projYears === 10
      ? `over 10 years with analyst estimates for the first 3–5 years, fading toward long-term GDP growth for the remaining years`
      : `over 5 years`;
    const termYearNum = projYears + 1;
    return [
      `Using an unlevered Free Cash Flow to Firm (FCFF) model, we project ${companyName}'s cash flows ${horizonDesc} with line-by-line expense modeling.`,
      growthDesc ? `Revenue is projected ${growthDesc}, with expenses (COGS, SG&A, R&D) held at historical ratios.` : "",
      `Depreciation is computed from a vintage matrix based on a ${a.useful_life ?? 5}-year useful life. Working capital is modeled using historical turnover days (DSO ${a.dso ?? "N/A"}, DPO ${a.dpo ?? "N/A"}, DIO ${a.dio ?? "N/A"}).`,
      `At a ${pct(waccRate)} WACC with mid-year discounting, the terminal value (${tvPortion}% of enterprise value) is derived from the Gordon Growth Model on Year ${termYearNum} FCFF at a ${pct(terminalGrowth)} perpetual rate.`,
      `After subtracting net debt, the equity value implies a fair price of ${dollar(model.fair_value)} per share, suggesting ${ticker} is ${verdict} by ${absUpside}% at the current price of ${dollar(currentPrice)}.`,
    ].filter(Boolean).join(" ");
  }

  // Default: perpetuity (Gordon Growth)
  const isThreeStage = projYears === 10;
  const stageDesc = isThreeStage
    ? `The first 5 years use analyst consensus estimates${growthDesc ? ` (${growthDesc})` : ""}, while years 6–10 transition gradually to a ${pct(terminalGrowth)} terminal growth rate.`
    : `We project ${projYears} years of free cash flows${growthDesc ? ` with ${growthDesc}` : ""}, then apply a ${pct(terminalGrowth)} perpetual growth rate.`;

  return [
    `Using a Discounted Cash Flow model with perpetual growth terminal value, we project ${companyName}'s free cash flows over ${projYears} years.`,
    stageDesc,
    marginDesc ? `${marginDesc}.` : "",
    `At a ${pct(discountRate)} cost of equity, the present value of projected cash flows plus the Gordon Growth terminal value (${tvPortion}% of total) yields an intrinsic value of ${dollar(model.fair_value)} per share.`,
    `This suggests ${ticker} is ${verdict} by ${absUpside}% at the current price of ${dollar(currentPrice)}.`,
  ].filter(Boolean).join(" ");
}
