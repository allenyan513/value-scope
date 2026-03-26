// ============================================================
// Company Classifier — Determines company archetype and model applicability
// ============================================================

import type { FinancialStatement, Company, AnalystEstimate } from "@/types";

// --- Company Archetypes ---

export type CompanyArchetype =
  | "high_growth"     // High revenue growth, often low/negative earnings (tech disruptors)
  | "profitable_growth" // Strong growth + healthy margins (FAANG-style)
  | "mature_stable"   // Low growth, high margins, established (blue chips)
  | "dividend_payer"  // Significant dividend yield, stable cash flows
  | "cyclical"        // Earnings highly variable, tied to economic cycles
  | "turnaround"      // Currently unprofitable but improving
  | "asset_heavy"     // Capital-intensive, asset-rich (banks, REITs, utilities)
  | "loss_making";    // Unprofitable with no clear improvement trend

export interface CompanyClassification {
  archetype: CompanyArchetype;
  label: string;
  description: string;
  traits: string[];
  model_weights: ModelWeights;
  model_applicability: ModelApplicability[];
}

export type ModelWeights = Record<string, number>;

export interface ModelApplicability {
  model_type: string;
  applicable: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  role: "primary" | "cross_check" | "sanity_check" | "not_applicable";
}

// --- Classification Logic ---

interface ClassificationMetrics {
  revenueCAGR: number;       // 3-5 year revenue CAGR
  netIncomeCAGR: number;     // 3-5 year net income CAGR
  latestNetMargin: number;
  avgNetMargin: number;
  latestEPS: number;
  dividendYield: number;     // dividends / market cap
  revenueVolatility: number; // coefficient of variation
  earningsVolatility: number;
  isCurrentlyProfitable: boolean;
  isProfitImproving: boolean;
  assetIntensity: number;    // total assets / revenue
  debtToEquity: number;
  fcfYield: number;          // FCF / market cap
  analystGrowth: number | null; // forward revenue growth from estimates
}

function computeClassificationMetrics(
  company: Company,
  historicals: FinancialStatement[],
  estimates: AnalystEstimate[]
): ClassificationMetrics {
  const sorted = [...historicals]
    .filter((f) => f.period_type === "annual" && f.revenue > 0)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  const latest = sorted[sorted.length - 1];
  const years = Math.min(sorted.length - 1, 5);

  // Revenue CAGR
  const revenueCAGR =
    years > 0 && sorted[sorted.length - 1 - years].revenue > 0
      ? Math.pow(
          latest.revenue / sorted[sorted.length - 1 - years].revenue,
          1 / years
        ) - 1
      : 0;

  // Net Income CAGR (only if both endpoints positive)
  const startNI = sorted[sorted.length - 1 - Math.min(years, sorted.length - 1)].net_income;
  const endNI = latest.net_income;
  const netIncomeCAGR =
    startNI > 0 && endNI > 0 && years > 0
      ? Math.pow(endNI / startNI, 1 / years) - 1
      : 0;

  // Margins
  const latestNetMargin = latest.revenue > 0 ? latest.net_income / latest.revenue : 0;
  const margins = sorted
    .filter((f) => f.revenue > 0)
    .map((f) => f.net_income / f.revenue);
  const avgNetMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;

  // EPS
  const latestEPS = latest.eps_diluted || latest.eps || 0;

  // Dividend yield
  const totalDividends = Math.abs(latest.dividends_paid || 0);
  const marketCap = company.market_cap || company.price * company.shares_outstanding;
  const dividendYield = marketCap > 0 ? totalDividends / marketCap : 0;

  // Revenue volatility (coefficient of variation of YoY growth)
  const revGrowths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].revenue > 0) {
      revGrowths.push((sorted[i].revenue - sorted[i - 1].revenue) / sorted[i - 1].revenue);
    }
  }
  const revMean = revGrowths.length > 0 ? revGrowths.reduce((a, b) => a + b, 0) / revGrowths.length : 0;
  const revStd = revGrowths.length > 1
    ? Math.sqrt(revGrowths.reduce((s, g) => s + (g - revMean) ** 2, 0) / (revGrowths.length - 1))
    : 0;
  const revenueVolatility = Math.abs(revMean) > 0.01 ? revStd / Math.abs(revMean) : revStd;

  // Earnings volatility
  const earningsGrowths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].net_income !== 0) {
      earningsGrowths.push(
        (sorted[i].net_income - sorted[i - 1].net_income) / Math.abs(sorted[i - 1].net_income)
      );
    }
  }
  const eMean = earningsGrowths.length > 0 ? earningsGrowths.reduce((a, b) => a + b, 0) / earningsGrowths.length : 0;
  const eStd = earningsGrowths.length > 1
    ? Math.sqrt(earningsGrowths.reduce((s, g) => s + (g - eMean) ** 2, 0) / (earningsGrowths.length - 1))
    : 0;
  const earningsVolatility = Math.abs(eMean) > 0.01 ? eStd / Math.abs(eMean) : eStd;

  // Profitability trend
  const isCurrentlyProfitable = latest.net_income > 0;
  const recentMargins = sorted.slice(-3).map((f) => f.revenue > 0 ? f.net_income / f.revenue : 0);
  const isProfitImproving =
    recentMargins.length >= 2 &&
    recentMargins[recentMargins.length - 1] > recentMargins[0];

  // Asset intensity
  const assetIntensity = latest.revenue > 0 ? latest.total_assets / latest.revenue : 2;

  // Debt/Equity
  const debtToEquity = latest.total_equity > 0 ? latest.total_debt / latest.total_equity : 5;

  // FCF yield
  const fcfYield = marketCap > 0 ? latest.free_cash_flow / marketCap : 0;

  // Analyst forward growth
  const sortedEst = [...estimates].sort((a, b) => a.period.localeCompare(b.period));
  let analystGrowth: number | null = null;
  if (sortedEst.length > 0 && latest.revenue > 0) {
    const nextRevenue = sortedEst[0].revenue_estimate;
    if (nextRevenue > 0) {
      analystGrowth = (nextRevenue - latest.revenue) / latest.revenue;
    }
  }

  return {
    revenueCAGR,
    netIncomeCAGR,
    latestNetMargin,
    avgNetMargin,
    latestEPS,
    dividendYield,
    revenueVolatility,
    earningsVolatility,
    isCurrentlyProfitable,
    isProfitImproving,
    assetIntensity,
    debtToEquity,
    fcfYield,
    analystGrowth,
  };
}

// --- Archetype Definitions ---

const ARCHETYPE_CONFIGS: Record<CompanyArchetype, {
  label: string;
  description: string;
  weights: ModelWeights;
}> = {
  high_growth: {
    label: "High Growth",
    description: "Fast-growing company with strong revenue momentum. DCF captures future potential while PEG provides growth-adjusted anchor.",
    weights: {
      dcf_3stage: 0.20,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.10,
      ev_ebitda_multiples: 0.15,
      peg: 0.35,
    },
  },
  profitable_growth: {
    label: "Profitable Growth",
    description: "Company with both strong growth and healthy profitability. DCF provides the most reliable estimate, complemented by multiples.",
    weights: {
      dcf_3stage: 0.20,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.20,
      ev_ebitda_multiples: 0.15,
      peg: 0.25,
    },
  },
  mature_stable: {
    label: "Mature & Stable",
    description: "Well-established company with predictable cash flows. DCF and trading multiples are most reliable.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.25,
      ev_ebitda_multiples: 0.15,
      peg: 0.25,
    },
  },
  dividend_payer: {
    label: "Dividend Payer",
    description: "Company returning significant cash to shareholders via dividends. Cash flow stability and payout sustainability are key.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.25,
      ev_ebitda_multiples: 0.15,
      peg: 0.25,
    },
  },
  cyclical: {
    label: "Cyclical",
    description: "Earnings fluctuate significantly with economic cycles. EV/EBITDA and DCF are preferred over point-in-time P/E.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.10,
      ev_ebitda_multiples: 0.20,
      peg: 0.35,
    },
  },
  turnaround: {
    label: "Turnaround",
    description: "Currently unprofitable but showing improving trends. DCF and EV/EBITDA are prioritized.",
    weights: {
      dcf_3stage: 0.20,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.00,
      ev_ebitda_multiples: 0.25,
      peg: 0.35,
    },
  },
  asset_heavy: {
    label: "Asset-Heavy",
    description: "Capital-intensive business with significant tangible assets. DCF and EV/EBITDA are key metrics.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.15,
      ev_ebitda_multiples: 0.20,
      peg: 0.30,
    },
  },
  loss_making: {
    label: "Loss-Making",
    description: "Company is currently unprofitable. EV/EBITDA provides an alternative anchor when earnings-based models are not applicable.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.00,
      ev_ebitda_multiples: 0.25,
      peg: 0.40,
    },
  },
};

function determineArchetype(m: ClassificationMetrics): CompanyArchetype {
  // Loss-making with no improvement
  if (!m.isCurrentlyProfitable && !m.isProfitImproving) {
    return "loss_making";
  }

  // Turnaround: currently unprofitable but improving
  if (!m.isCurrentlyProfitable && m.isProfitImproving) {
    return "turnaround";
  }

  // High growth: revenue CAGR > 20% OR analyst growth > 20%
  const effectiveGrowth = m.analystGrowth ?? m.revenueCAGR;
  if (effectiveGrowth > 0.20 && m.latestNetMargin < 0.10) {
    return "high_growth";
  }

  // Profitable growth: strong growth OR high-margin grower
  // - growth > 12% with decent margins, OR
  // - growth > 8% with high margins (>20%) — companies like AAPL
  if (effectiveGrowth > 0.12 && m.latestNetMargin > 0.05) {
    return "profitable_growth";
  }
  if (effectiveGrowth > 0.08 && m.latestNetMargin > 0.20) {
    return "profitable_growth";
  }

  // Cyclical: high earnings volatility
  if (m.earningsVolatility > 1.5 || m.revenueVolatility > 1.0) {
    return "cyclical";
  }

  // Dividend payer: yield > 2%
  if (m.dividendYield > 0.02) {
    return "dividend_payer";
  }

  // Asset heavy: asset intensity > 3x revenue
  if (m.assetIntensity > 3) {
    return "asset_heavy";
  }

  // Mature stable: low growth, profitable
  if (effectiveGrowth <= 0.12 && m.isCurrentlyProfitable) {
    return "mature_stable";
  }

  // Default
  return "mature_stable";
}

function buildTraits(m: ClassificationMetrics): string[] {
  const traits: string[] = [];

  // Growth
  if (m.revenueCAGR > 0.20) traits.push("High revenue growth (>" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else if (m.revenueCAGR > 0.10) traits.push("Moderate growth (~" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else if (m.revenueCAGR > 0) traits.push("Low growth (~" + (m.revenueCAGR * 100).toFixed(0) + "% CAGR)");
  else traits.push("Revenue declining");

  // Profitability
  if (m.latestNetMargin > 0.20) traits.push("High profitability (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0.05) traits.push("Moderate margins (" + (m.latestNetMargin * 100).toFixed(0) + "% net margin)");
  else if (m.latestNetMargin > 0) traits.push("Thin margins (" + (m.latestNetMargin * 100).toFixed(1) + "% net margin)");
  else traits.push("Currently unprofitable");

  // Dividends
  if (m.dividendYield > 0.03) traits.push("Strong dividend yield (" + (m.dividendYield * 100).toFixed(1) + "%)");
  else if (m.dividendYield > 0.01) traits.push("Pays dividends (" + (m.dividendYield * 100).toFixed(1) + "% yield)");

  // Volatility
  if (m.earningsVolatility > 1.5) traits.push("Highly cyclical earnings");
  else if (m.earningsVolatility > 0.8) traits.push("Moderately volatile earnings");

  // Leverage
  if (m.debtToEquity > 2) traits.push("High leverage (D/E " + m.debtToEquity.toFixed(1) + "x)");

  // FCF
  if (m.fcfYield > 0.05) traits.push("Strong FCF yield (" + (m.fcfYield * 100).toFixed(1) + "%)");
  else if (m.fcfYield < 0) traits.push("Negative free cash flow");

  return traits;
}

function buildModelApplicability(
  archetype: CompanyArchetype,
  m: ClassificationMetrics
): ModelApplicability[] {
  const applicability: ModelApplicability[] = [];

  // DCF models (3 variants: perpetual growth, P/E exit, EV/EBITDA exit)
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

  // P/E Multiples
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

  // EV/EBITDA Multiples
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

  // PEG
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

// --- Terminal Growth Rate by Archetype ---
// Higher-growth companies warrant a higher perpetual growth rate in DCF terminal value.
// Range: 2.5% (slow/stable) to 4.0% (high growth). All within nominal GDP bounds.

const TERMINAL_GROWTH_RATES: Record<CompanyArchetype, number> = {
  high_growth: 0.040,       // 4.0% — strong secular growth
  profitable_growth: 0.035, // 3.5% — above-average grower
  mature_stable: 0.030,     // 3.0% — GDP-ish growth
  dividend_payer: 0.025,    // 2.5% — slow, stable
  cyclical: 0.025,          // 2.5% — normalize to economy
  turnaround: 0.030,        // 3.0% — assume recovery
  asset_heavy: 0.025,       // 2.5% — capital-intensive, slow
  loss_making: 0.030,       // 3.0% — assume eventual normalization
};

/**
 * Get the terminal growth rate appropriate for a company archetype.
 */
export function getTerminalGrowthRate(archetype: CompanyArchetype): number {
  return TERMINAL_GROWTH_RATES[archetype];
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
 * Returns null values for models that returned fair_value=0 (N/A).
 */
export function computeWeightedConsensus(
  models: Array<{ model_type: string; fair_value: number; low_estimate: number; high_estimate: number }>,
  weights: ModelWeights
): { consensus: number; low: number; high: number; modelContributions: Array<{ model: string; weight: number; value: number }> } {
  let totalWeight = 0;
  let weightedSum = 0;
  let weightedLow = 0;
  let weightedHigh = 0;
  const contributions: Array<{ model: string; weight: number; value: number }> = [];

  for (const m of models) {
    if (m.fair_value <= 0) continue;
    const w = weights[m.model_type] ?? 0;
    if (w <= 0) continue;

    totalWeight += w;
    weightedSum += m.fair_value * w;
    weightedLow += m.low_estimate * w;
    weightedHigh += m.high_estimate * w;
    contributions.push({ model: m.model_type, weight: w, value: m.fair_value });
  }

  if (totalWeight === 0) {
    return { consensus: 0, low: 0, high: 0, modelContributions: [] };
  }

  // Normalize weights (in case some models were N/A)
  const normalizedContributions = contributions.map((c) => ({
    ...c,
    weight: c.weight / totalWeight,
  }));

  return {
    consensus: weightedSum / totalWeight,
    low: weightedLow / totalWeight,
    high: weightedHigh / totalWeight,
    modelContributions: normalizedContributions,
  };
}
