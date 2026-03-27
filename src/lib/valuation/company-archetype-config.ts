// ============================================================
// Company Archetype Configuration
// Static config tables: weights, primary model map, terminal growth rates.
// ============================================================

// --- Types ---

export type CompanyArchetype =
  | "high_growth"
  | "profitable_growth"
  | "mature_stable"
  | "dividend_payer"
  | "cyclical"
  | "turnaround"
  | "asset_heavy"
  | "loss_making";

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

// --- Archetype Definitions ---

export const ARCHETYPE_CONFIGS: Record<CompanyArchetype, {
  label: string;
  description: string;
  weights: ModelWeights;
}> = {
  high_growth: {
    label: "High Growth",
    description: "Fast-growing company with strong revenue momentum. PEG provides the most reliable growth-adjusted anchor.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.08,
      dcf_ebitda_exit_fcfe_10y: 0.07,
      pe_multiples: 0.10,
      ev_ebitda_multiples: 0.20,
      peg: 0.40,
    },
  },
  profitable_growth: {
    label: "Profitable Growth",
    description: "Company with both strong growth and healthy profitability. PEG best captures the balance of growth and earnings quality.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.08,
      dcf_ebitda_exit_fcfe_10y: 0.07,
      pe_multiples: 0.15,
      ev_ebitda_multiples: 0.15,
      peg: 0.40,
    },
  },
  mature_stable: {
    label: "Mature & Stable",
    description: "Well-established company with predictable earnings. P/E peer comparison is the most intuitive and reliable valuation approach.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.40,
      ev_ebitda_multiples: 0.10,
      peg: 0.15,
    },
  },
  dividend_payer: {
    label: "Dividend Payer",
    description: "Company returning significant cash to shareholders via dividends. DCF is the most reliable model for predictable cash flows.",
    weights: {
      dcf_3stage: 0.40,
      dcf_pe_exit_10y: 0.10,
      dcf_ebitda_exit_fcfe_10y: 0.10,
      pe_multiples: 0.15,
      ev_ebitda_multiples: 0.10,
      peg: 0.15,
    },
  },
  cyclical: {
    label: "Cyclical",
    description: "Earnings fluctuate significantly with economic cycles. EV/EBITDA is more stable than point-in-time P/E for cyclical businesses.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.07,
      dcf_ebitda_exit_fcfe_10y: 0.08,
      pe_multiples: 0.10,
      ev_ebitda_multiples: 0.40,
      peg: 0.20,
    },
  },
  turnaround: {
    label: "Turnaround",
    description: "Currently unprofitable but showing improving trends. EV/EBITDA is the best alternative when earnings-based models are unreliable.",
    weights: {
      dcf_3stage: 0.15,
      dcf_pe_exit_10y: 0.05,
      dcf_ebitda_exit_fcfe_10y: 0.05,
      pe_multiples: 0.00,
      ev_ebitda_multiples: 0.40,
      peg: 0.35,
    },
  },
  asset_heavy: {
    label: "Asset-Heavy",
    description: "Capital-intensive business with significant tangible assets. EV/EBITDA is the industry standard for asset-heavy valuations.",
    weights: {
      dcf_3stage: 0.12,
      dcf_pe_exit_10y: 0.08,
      dcf_ebitda_exit_fcfe_10y: 0.08,
      pe_multiples: 0.12,
      ev_ebitda_multiples: 0.40,
      peg: 0.20,
    },
  },
  loss_making: {
    label: "Loss-Making",
    description: "Company is currently unprofitable. EV/EBITDA provides the only reliable anchor when earnings-based models are not applicable.",
    weights: {
      dcf_3stage: 0.10,
      dcf_pe_exit_10y: 0.05,
      dcf_ebitda_exit_fcfe_10y: 0.05,
      pe_multiples: 0.00,
      ev_ebitda_multiples: 0.40,
      peg: 0.40,
    },
  },
};

// --- Primary Model per Archetype ---

export const PRIMARY_MODEL_MAP: Record<CompanyArchetype, string> = {
  high_growth: "peg",
  profitable_growth: "peg",
  mature_stable: "pe_multiples",
  dividend_payer: "dcf_3stage",
  cyclical: "ev_ebitda_multiples",
  turnaround: "ev_ebitda_multiples",
  asset_heavy: "ev_ebitda_multiples",
  loss_making: "ev_ebitda_multiples",
};

// --- Terminal Growth Rate by Archetype ---

const TERMINAL_GROWTH_RATES: Record<CompanyArchetype, number> = {
  high_growth: 0.040,
  profitable_growth: 0.035,
  mature_stable: 0.030,
  dividend_payer: 0.025,
  cyclical: 0.025,
  turnaround: 0.030,
  asset_heavy: 0.025,
  loss_making: 0.030,
};

export function getTerminalGrowthRate(archetype: CompanyArchetype): number {
  return TERMINAL_GROWTH_RATES[archetype];
}
