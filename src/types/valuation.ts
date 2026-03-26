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
  | "pe_multiples"
  | "ev_ebitda_multiples"
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
  net_capex: number;
  fcfe: number; // Free Cash Flow to Equity = Net Income - CapEx
  discount_factor: number;
  pv_fcfe: number;
  stage?: 1 | 2; // Three-stage DCF: 1 = analyst-driven, 2 = transition
  ebitda?: number; // For exit multiple terminal value methods
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

// --- DCF Specific (legacy FCFF approach, @deprecated) ---
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

/** @deprecated Use DCFFCFEResult instead */
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
      growth_values: number[]; // or exit_multiple_values
      prices: number[][]; // [wacc_index][growth_index]
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

// --- Valuation Summary ---
export interface ValuationSummary {
  ticker: string;
  company_name: string;
  current_price: number;
  primary_fair_value: number; // DCF Growth Exit 5Y
  primary_upside: number;
  // Weighted consensus across all applicable models
  consensus_fair_value: number;
  consensus_low: number;
  consensus_high: number;
  consensus_upside: number;
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
  };
}
