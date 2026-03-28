-- ============================================================
-- ValuScope Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Companies
CREATE TABLE companies (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,
  beta REAL,
  price REAL,
  shares_outstanding BIGINT,
  exchange TEXT,
  description TEXT,
  logo_url TEXT,
  reporting_currency TEXT DEFAULT 'USD',  -- e.g., "DKK", "EUR" for ADRs
  fx_rate_to_usd REAL DEFAULT 1.0,       -- conversion rate used at ingestion
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_sector ON companies(sector);

-- Sector Betas (pre-computed median unlevered beta + WACC stats per sector)
CREATE TABLE sector_betas (
  sector TEXT PRIMARY KEY,
  median_unlevered_beta REAL NOT NULL,
  peer_count INTEGER NOT NULL DEFAULT 0,
  median_wacc REAL,
  p25_wacc REAL,
  p75_wacc REAL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial Statements (annual + quarterly)
CREATE TABLE financial_statements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES companies(ticker),
  period TEXT NOT NULL,          -- "2024" or "2024-Q3"
  period_type TEXT NOT NULL,     -- "annual" or "quarterly"
  fiscal_year INT NOT NULL,
  fiscal_quarter INT,

  -- Income Statement
  revenue BIGINT,
  cost_of_revenue BIGINT,
  gross_profit BIGINT,
  sga_expense BIGINT,
  rnd_expense BIGINT,
  operating_income BIGINT,
  interest_expense BIGINT,
  income_before_tax BIGINT,
  income_tax BIGINT,
  net_income BIGINT,
  ebitda BIGINT,
  eps REAL,
  eps_diluted REAL,

  -- Balance Sheet
  total_assets BIGINT,
  total_liabilities BIGINT,
  total_equity BIGINT,
  total_debt BIGINT,
  cash_and_equivalents BIGINT,
  net_debt BIGINT,
  accounts_receivable BIGINT,
  accounts_payable BIGINT,
  inventory BIGINT,

  -- Cash Flow
  operating_cash_flow BIGINT,
  capital_expenditure BIGINT,
  free_cash_flow BIGINT,
  depreciation_amortization BIGINT,
  dividends_paid BIGINT,

  -- Derived
  tax_rate REAL,
  gross_margin REAL,
  operating_margin REAL,
  net_margin REAL,
  shares_outstanding BIGINT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, period)
);

CREATE INDEX idx_financials_ticker ON financial_statements(ticker);
CREATE INDEX idx_financials_ticker_type ON financial_statements(ticker, period_type);

-- Daily Prices
CREATE TABLE daily_prices (
  ticker TEXT NOT NULL REFERENCES companies(ticker),
  date DATE NOT NULL,
  close_price REAL NOT NULL,
  volume BIGINT,
  PRIMARY KEY (ticker, date)
);

CREATE INDEX idx_prices_ticker_date ON daily_prices(ticker, date DESC);

-- Analyst Estimates
CREATE TABLE analyst_estimates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES companies(ticker),
  period TEXT NOT NULL,           -- "2025", "2026"
  revenue_estimate BIGINT,
  eps_estimate REAL,
  revenue_low BIGINT,
  revenue_high BIGINT,
  eps_low REAL,
  eps_high REAL,
  number_of_analysts INT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, period)
);

-- Price Target Consensus (analyst consensus targets)
CREATE TABLE price_target_consensus (
  ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
  target_high REAL,
  target_low REAL,
  target_consensus REAL,
  target_median REAL,
  number_of_analysts INT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valuation Snapshots (pre-computed nightly, 1 row per ticker)
CREATE TABLE valuation_snapshots (
  ticker         TEXT PRIMARY KEY REFERENCES companies(ticker),
  fair_value     REAL NOT NULL,
  upside_pct     REAL NOT NULL,
  verdict        TEXT NOT NULL,
  current_price  REAL NOT NULL,
  summary        JSONB NOT NULL,   -- full ValuationSummary object
  peers          JSONB,            -- PeerComparison[] used during computation
  computed_at    TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlists
CREATE TABLE watchlists (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL REFERENCES companies(ticker),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

CREATE INDEX idx_watchlist_user ON watchlists(user_id);

-- Usage tracking (free tier)
CREATE TABLE usage_tracking (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,               -- for anonymous users
  ticker TEXT NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user ON usage_tracking(user_id);
CREATE INDEX idx_usage_session ON usage_tracking(session_id);

-- Row Level Security
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Watchlist policies
CREATE POLICY "Users can view own watchlist"
  ON watchlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist"
  ON watchlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist"
  ON watchlists FOR DELETE
  USING (auth.uid() = user_id);

-- Usage tracking policies
CREATE POLICY "Users can view own usage"
  ON usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON usage_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Public read access for non-user tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_target_consensus ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Public read financials" ON financial_statements FOR SELECT USING (true);
CREATE POLICY "Public read prices" ON daily_prices FOR SELECT USING (true);
CREATE POLICY "Public read estimates" ON analyst_estimates FOR SELECT USING (true);
CREATE POLICY "Public read price_target_consensus" ON price_target_consensus FOR SELECT USING (true);
CREATE POLICY "Public read valuation_snapshots" ON valuation_snapshots FOR SELECT USING (true);
