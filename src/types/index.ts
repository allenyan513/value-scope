// ============================================================
// ValuScope Core Type Definitions
// ============================================================

// --- Company ---
export interface Company {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number;
  beta: number;
  price: number;
  shares_outstanding: number;
  exchange: string;
  description: string;
  logo_url: string | null;
  updated_at: string;
}

// --- Financial Statements ---
export interface FinancialStatement {
  ticker: string;
  period: string; // "2024", "2024-Q3"
  period_type: "annual" | "quarterly";
  fiscal_year: number;
  fiscal_quarter: number | null;

  // Income Statement
  revenue: number;
  cost_of_revenue: number;
  gross_profit: number;
  sga_expense: number;
  rnd_expense: number;
  operating_income: number;
  interest_expense: number;
  income_before_tax: number;
  income_tax: number;
  net_income: number;
  ebitda: number;
  eps: number;
  eps_diluted: number;

  // Balance Sheet
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_debt: number;
  cash_and_equivalents: number;
  net_debt: number;
  accounts_receivable: number;
  accounts_payable: number;
  inventory: number;

  // Cash Flow
  operating_cash_flow: number;
  capital_expenditure: number;
  free_cash_flow: number;
  depreciation_amortization: number;
  dividends_paid: number;

  // Shares
  shares_outstanding: number;

  // Derived
  tax_rate: number; // effective
  gross_margin: number;
  operating_margin: number;
  net_margin: number;
}

// --- Analyst Estimates ---
export interface AnalystEstimate {
  ticker: string;
  period: string; // "2025", "2026"
  revenue_estimate: number;
  eps_estimate: number;
  revenue_low: number;
  revenue_high: number;
  eps_low: number;
  eps_high: number;
  number_of_analysts: number;
}

// --- Daily Price ---
export interface DailyPrice {
  ticker: string;
  date: string; // "2024-01-15"
  close: number;
  volume: number;
}

// --- Valuation Models ---
export type ValuationModelType =
  | "dcf_growth_exit_5y"
  | "dcf_growth_exit_10y"
  | "dcf_ebitda_exit_5y"
  | "dcf_ebitda_exit_10y"
  | "pe_multiples"
  | "ev_ebitda_multiples"
  | "peter_lynch";

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

// --- DCF Specific ---
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

// --- Company Classification ---
export type CompanyArchetype =
  | "high_growth"
  | "profitable_growth"
  | "mature_stable"
  | "dividend_payer"
  | "cyclical"
  | "turnaround"
  | "asset_heavy"
  | "loss_making";

export interface ModelApplicability {
  model_type: string;
  applicable: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  role: "primary" | "cross_check" | "sanity_check" | "not_applicable";
}

export interface CompanyClassification {
  archetype: CompanyArchetype;
  label: string;
  description: string;
  traits: string[];
  model_weights: Record<string, number>;
  model_applicability: ModelApplicability[];
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

// --- User / Watchlist ---
export interface WatchlistItem {
  ticker: string;
  company_name: string;
  current_price: number;
  fair_value: number;
  upside_percent: number;
  added_at: string;
}
