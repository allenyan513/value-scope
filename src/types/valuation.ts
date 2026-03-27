import type { CompanyClassification } from "./company";

// --- Valuation Models ---
export type ValuationModelType =
  | "dcf_growth_exit_5y"
  | "dcf_growth_exit_10y"
  | "dcf_ebitda_exit_5y"
  | "dcf_ebitda_exit_10y"
  | "dcf_3stage"
  | "dcf_pe_exit_10y"
  | "dcf_ebitda_exit_fcfe_10y"
  | "dcf_fcff_growth_5y"
  | "dcf_fcff_growth_10y"
  | "dcf_fcff_ebitda_exit_5y"
  | "pe_multiples"
  | "ev_ebitda_multiples"
  | "pb_multiples"
  | "ps_multiples"
  | "p_fcf_multiples"
  | "peg";

export interface ValuationResult {
  model_type: ValuationModelType;
  fair_value: number;
  upside_percent: number;
  low_estimate: number;
  high_estimate: number;
  assumptions: Record<string, unknown>;
  details: Record<string, unknown>;
  computed_at: string;
}

// --- DCF Specific (FCFE approach) ---
export interface DCFProjectionYearFCFE {
  year: number;
  revenue: number;
  net_margin: number; // as decimal (e.g., 0.25 = 25%)
  net_income: number;
  depreciation_amortization: number; // D&A add-back (already deducted in Net Income)
  capital_expenditure: number;       // Total CapEx (maintenance + growth)
  fcfe: number; // FCFE = Net Income + D&A − CapEx
  discount_factor: number;
  pv_fcfe: number;
  stage?: 1 | 2; // Three-stage DCF: 1 = analyst-driven, 2 = transition
  ebitda?: number; // For exit multiple terminal value methods
  /** @deprecated Use depreciation_amortization and capital_expenditure instead */
  net_capex?: number;
}

export interface DCFFCFEResult extends ValuationResult {
  details: {
    projections: DCFProjectionYearFCFE[];
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcfe_total: number;
    cash_and_equivalents: number;
    total_debt: number;
    equity_value: number;
    shares_outstanding: number;
    sensitivity_matrix: {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

// --- DCF Specific (FCFF approach — Unlevered Free Cash Flow to Firm) ---
export interface DCFFCFFProjectionYear {
  year: number;
  revenue: number;
  revenue_growth: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  rnd: number;
  operating_income: number;
  interest_expense: number;
  income_before_tax: number;
  tax: number;
  net_income: number;
  ebitda: number;
  depreciation: number;
  capex: number;
  delta_nwc: number;
  fcff: number;
  timing: number; // mid-year convention: 0.5, 1.5, 2.5, ...
  discount_factor: number;
  pv_fcff: number;
}

export interface DCFFCFFDASchedule {
  useful_life: number;
  vintages: { capex_year: number; amounts: number[] }[];
  totals: number[];
}

export interface DCFFCFFWorkingCapital {
  dso: number;
  dpo: number;
  dio: number;
  years: number[];
  receivables: number[];
  payables: number[];
  inventory: number[];
  nwc: number[];
  delta_nwc: number[];
}

export interface DCFFCFFExpenseRatios {
  cogs_pct: number;
  sga_pct: number;
  rnd_pct: number;
  interest_pct: number;
  tax_rate: number;
}

export interface DCFFCFFResult extends ValuationResult {
  details: {
    projections: DCFFCFFProjectionYear[];
    terminal_year: DCFFCFFProjectionYear;
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcff_total: number;
    enterprise_value: number;
    net_debt: number;
    equity_value: number;
    shares_outstanding: number;
    da_schedule: DCFFCFFDASchedule;
    working_capital: DCFFCFFWorkingCapital;
    expense_ratios: DCFFCFFExpenseRatios;
    base_year: {
      year: number;
      revenue: number;
      cogs: number;
      sga: number;
      rnd: number;
      interest_expense: number;
      tax: number;
      net_income: number;
      nwc: number;
    };
    sensitivity_matrix: {
      discount_rate_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

/** @deprecated Legacy FCFF projection type — use DCFFCFFProjectionYear instead */
export interface DCFProjectionYear {
  year: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  rnd: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  tax: number;
  nopat: number;
  capex: number;
  delta_nwc: number;
  fcf: number;
  discount_factor: number;
  pv_fcf: number;
}

/** @deprecated Use DCFFCFEResult or DCFFCFFResult instead */
export interface DCFResult extends ValuationResult {
  details: {
    projections: DCFProjectionYear[];
    terminal_value: number;
    pv_terminal_value: number;
    pv_fcf_total: number;
    enterprise_value: number;
    net_debt: number;
    equity_value: number;
    shares_outstanding: number;
    sensitivity_matrix: {
      wacc_values: number[];
      growth_values: number[];
      prices: number[][];
    };
  };
}

// --- Trading Multiples Specific ---
export interface PeerComparison {
  ticker: string;
  name: string;
  market_cap: number;
  trailing_pe: number | null;
  forward_pe: number | null;
  ev_ebitda: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  revenue_growth: number | null;
  net_margin: number | null;
  roe: number | null;
}

// --- EBITDA Exit DCF Specific ---
export interface PeerEBITDARow {
  ticker: string;
  name: string;
  market_cap: number;
  trailing_ev_ebitda: number | null;
  forward_ev_ebitda: number | null;
}

export interface TradingMultiplesResult extends ValuationResult {
  details: {
    peers: PeerComparison[];
    industry_median: number;
    company_metric: number; // EPS or EBITDA
    metric_label: string;
  };
}

// --- WACC ---
export interface WACCResult {
  wacc: number;
  cost_of_equity: number;
  cost_of_debt: number;
  risk_free_rate: number;
  beta: number;
  erp: number;
  additional_risk_premium: number;
  tax_rate: number;
  debt_weight: number;
  equity_weight: number;
  total_debt: number;
  total_equity: number;
}

// --- Consensus Adjustments ---
export interface ConsensusAdjustment {
  model: string;
  originalWeight: number;
  adjustedWeight: number;
  reason: string;
}

// --- Consensus Strategy ---
export type ConsensusStrategy = "median" | "weighted" | "dcf_primary";

// --- Three-Tier Pillar Structure ---
export interface ValuationPillar {
  fairValue: number;
  upside: number;
  models: ValuationResult[];
}

export interface ValuationPillars {
  dcf: ValuationPillar;
  tradingMultiples: ValuationPillar;
  peg: ValuationPillar;
}

// --- Valuation Summary ---
export interface ValuationSummary {
  ticker: string;
  company_name: string;
  current_price: number;
  primary_fair_value: number;
  primary_upside: number;
  // Consensus across all applicable models
  consensus_fair_value: number;
  consensus_low: number;
  consensus_high: number;
  consensus_upside: number;
  /** The strategy used for consensus: "median" (3 pillars) or "weighted" (archetype-based) */
  consensus_strategy: ConsensusStrategy;
  /** The model_type of the primary (dominant) model for this archetype (weighted strategy only) */
  consensus_primary_model: string;
  /** Outlier adjustments applied during consensus calculation (weighted strategy only) */
  consensus_adjustments: ConsensusAdjustment[];
  /** Three-tier pillar breakdown (median strategy) */
  pillars: ValuationPillars;
  models: ValuationResult[];
  wacc: WACCResult;
  classification: CompanyClassification;
  verdict: "undervalued" | "fairly_valued" | "overvalued";
  verdict_text: string;
  computed_at: string;
}

// --- Valuation History (for chart) ---
export interface ValuationHistoryPoint {
  date: string;
  close_price: number;
  intrinsic_value: number;
}

// --- Historical Multiples (for trend chart + self-comparison valuation) ---
export interface HistoricalMultiplesPoint {
  date: string;
  pe: number | null;
  ev_ebitda: number | null;
  pb: number | null;
  ps: number | null;
  p_fcf: number | null;
}

export interface MultipleStats {
  current: number | null;
  avg5y: number;
  p25: number;
  p75: number;
  percentile: number; // 0-100, where current sits vs history
  dataPoints: number;
}

export interface HistoricalMultiplesResponse {
  history: HistoricalMultiplesPoint[];
  stats: {
    pe: MultipleStats | null;
    ev_ebitda: MultipleStats | null;
    pb: MultipleStats | null;
    ps: MultipleStats | null;
    p_fcf: MultipleStats | null;
  };
}
