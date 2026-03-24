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

// --- Price Target Consensus ---
export interface PriceTargetConsensus {
  ticker: string;
  target_high: number;
  target_low: number;
  target_consensus: number;
  target_median: number;
  number_of_analysts: number;
}

// --- Earnings Surprise ---
export interface EarningsSurprise {
  date: string;
  actual_eps: number;
  estimated_eps: number;
  surprise_percent: number;
}

// --- Daily Price ---
export interface DailyPrice {
  ticker: string;
  date: string; // "2024-01-15"
  close: number;
  volume: number;
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
