# ValuScope Implementation Plan

## Tech Stack (Final)

- **Framework**: Next.js 14+ (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui + Recharts (charts)
- **Database**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Deployment**: Vercel (Frontend + API Routes + Cron Jobs)
- **Data Sources**: FMP API (primary) + FRED API (rates) + SEC EDGAR (filings)
- **Caching**: Next.js ISR (no Redis in MVP)

---

## Phase 0: Project Scaffolding (Day 1-2)

- [ ] 0.1 — Init Next.js 14 project with TypeScript, Tailwind, ESLint
- [ ] 0.2 — Setup shadcn/ui component library
- [ ] 0.3 — Setup Supabase project (create DB, enable Auth)
- [ ] 0.4 — Design and create database schema (migrations)
  - `companies` — ticker, name, sector, industry, market_cap, etc.
  - `financial_statements` — ticker, period, type(annual/quarterly), revenue, cogs, sga, rnd, ebitda, net_income, eps, dps, total_debt, cash, shares_outstanding, capex, da, interest_expense, tax_rate, etc.
  - `daily_prices` — ticker, date, close_price
  - `analyst_estimates` — ticker, period, revenue_est, eps_est
  - `valuations` — ticker, date, model_type, fair_value, assumptions_json
  - `valuation_history` — ticker, date, intrinsic_value (for the price vs value chart)
  - `users` — via Supabase Auth
  - `watchlists` — user_id, ticker
- [ ] 0.5 — Setup environment variables (FMP API key, Supabase keys, FRED API key)
- [ ] 0.6 — Create project folder structure:
  ```
  src/
    app/
      page.tsx                    # Landing page
      [ticker]/
        page.tsx                  # Stock valuation page (SSG/ISR)
      api/
        cron/
          daily-update/route.ts   # Daily price + data update
          compute-valuations/route.ts
        valuation/[ticker]/route.ts
      auth/
        login/page.tsx
        callback/route.ts
    lib/
      db/                        # Supabase client + queries
      data/                      # FMP, FRED, SEC API clients
      valuation/                 # All valuation model logic
        dcf.ts
        trading-multiples.ts
        peter-lynch.ts
        wacc.ts
        summary.ts
      utils/
    components/
      valuation/                 # Valuation display components
      charts/                    # Price vs Value chart
      ui/                        # shadcn components
  ```

---

## Phase 1: Data Layer (Day 3-5)

- [ ] 1.1 — FMP API client (`lib/data/fmp.ts`)
  - Company profile (name, sector, industry, market_cap, beta)
  - Income statement (annual + quarterly, 5 years)
  - Balance sheet
  - Cash flow statement
  - Analyst estimates (consensus revenue/EPS)
  - Daily historical prices
- [ ] 1.2 — FRED API client (`lib/data/fred.ts`)
  - 10-Year Treasury yield (for Rf in WACC)
- [ ] 1.3 — S&P 500 data seeding script
  - Fetch S&P 500 constituent list from FMP
  - For each company: fetch profile, 5yr financials, 1yr daily prices, analyst estimates
  - Insert into Supabase
  - Handle rate limiting (FMP: 300 req/min on Starter)
- [ ] 1.4 — Daily update Cron job (`api/cron/daily-update`)
  - Fetch latest close prices for all tracked companies
  - Fetch updated analyst estimates
  - Fetch latest Treasury yield
  - Scheduled: 6:30 PM ET (after market close)

---

## Phase 2: Valuation Engine (Day 6-12)

All computation in pure TypeScript, no external dependencies beyond standard math.

- [ ] 2.1 — WACC Calculator (`lib/valuation/wacc.ts`)
  - Inputs: beta (from FMP), risk_free_rate (from FRED), tax_rate, debt, equity, interest_expense
  - Cost of Equity = Rf + Beta × ERP (use 5.5% default ERP)
  - Cost of Debt = Interest Expense / Total Debt
  - WACC = Ke × E/(D+E) + Kd × (1-t) × D/(D+E)
  - Output: WACC value + all intermediate values (for display)

- [ ] 2.2 — DCF Growth Exit Model (`lib/valuation/dcf.ts`)
  - 5Y and 10Y variants
  - Revenue projection (analyst estimates for 2Y → trend extrapolation)
  - Expense projection (historical margin averages)
  - FCF calculation per year
  - Terminal Value = FCF_terminal × (1+g) / (WACC-g)
  - Discount to present value
  - Enterprise Value → Equity Value → Fair Price
  - Sensitivity matrix (WACC × Growth Rate, 5×5 grid)

- [ ] 2.3 — DCF EBITDA Exit Model
  - Same as Growth Exit but Terminal Value = EBITDA × Exit Multiple
  - Sensitivity matrix (WACC × Exit Multiple)

- [ ] 2.4 — Trading Multiples (`lib/valuation/trading-multiples.ts`)
  - P/E: Fetch industry peers → median P/E → Fair Price = Median P/E × EPS
  - EV/EBITDA: Same flow → Fair Price = (Median EV/EBITDA × EBITDA - Net Debt) / Shares
  - Peer list from FMP sector/industry classification

- [ ] 2.5 — Peter Lynch Fair Value (`lib/valuation/peter-lynch.ts`)
  - Growth Rate = 5Y Net Income CAGR (clamped 5%-25%)
  - Fair Value = Growth Rate × TTM EPS
  - Handle negative EPS (mark N/A)

- [ ] 2.6 — Valuation Summary (`lib/valuation/summary.ts`)
  - Aggregate all model outputs
  - Primary valuation = DCF Growth Exit 5Y
  - Calculate overall fair value range
  - Generate text summary ("AAPL appears undervalued by X%")

- [ ] 2.7 — Valuation compute + store pipeline
  - For a given ticker: fetch data from DB → run all models → store results in `valuations` table
  - Store daily snapshot in `valuation_history` for the trend chart
  - Cron job to recompute S&P 500 valuations daily (after data update)

---

## Phase 3: Frontend — Stock Valuation Page (Day 13-20)

- [ ] 3.1 — Landing page (`/`)
  - Hero: "AI-Powered Stock Valuation" + search bar (ticker search)
  - Featured valuations (most undervalued S&P 500 stocks)
  - How it works (3-step explanation)
  - SEO: meta tags, structured data

- [ ] 3.2 — Ticker search component
  - Autocomplete with company name + ticker
  - Debounced search against `companies` table

- [ ] 3.3 — Stock valuation page (`/[ticker]`)
  - ISR with revalidate = 3600 (1 hour)
  - **Header**: Company name, ticker, current price, market cap
  - **Price vs Intrinsic Value Chart** (prominent position)
    - Dual line: daily close price + intrinsic value
    - Time range selector: 1Y, 3Y, 5Y
    - Green zone (undervalued) / Red zone (overvalued) shading
  - **Valuation Summary Card**
    - Fair Value (primary), Upside/Downside %, confidence range
    - Bar chart: all models' fair values vs current price
  - **Individual Model Tabs/Sections**:
    - DCF Growth Exit 5Y (default expanded)
    - DCF Growth Exit 10Y
    - DCF EBITDA Exit 5Y / 10Y
    - P/E Multiples
    - EV/EBITDA Multiples
    - Peter Lynch
  - **WACC Section**: Show all WACC inputs and calculation
  - **Assumptions Panel**: Read-only display of all key assumptions
  - **SEO**: Dynamic meta tags, Open Graph for social sharing

- [ ] 3.4 — Individual model detail components
  - DCF: Revenue/expense projection table, FCF waterfall, sensitivity heatmap
  - Trading Multiples: Peer comparison table
  - Peter Lynch: Historical earnings growth table
  - WACC: Component breakdown visual

- [ ] 3.5 — Price vs Intrinsic Value chart component
  - Recharts AreaChart with dual lines
  - Tooltip showing both values + spread
  - Responsive design

---

## Phase 4: Auth + User Features (Day 21-24)

- [ ] 4.1 — Supabase Auth integration
  - Google OAuth + Email/Password
  - Auth middleware (protect premium routes)
  - Login/Register pages

- [ ] 4.2 — Watchlist feature
  - Add/remove stocks to watchlist
  - Watchlist dashboard page (`/dashboard`)
  - Show valuation changes for watched stocks

- [ ] 4.3 — Free tier gating
  - Free: 5 stocks/month (full valuation view)
  - Track usage in DB
  - Show upgrade prompt when limit reached

---

## Phase 5: SEO + Polish (Day 25-28)

- [ ] 5.1 — SEO optimization
  - Dynamic sitemap.xml (all S&P 500 tickers)
  - robots.txt
  - Structured data (JSON-LD for financial data)
  - Open Graph images (auto-generated with valuation summary)

- [ ] 5.2 — Static pages
  - /about, /pricing, /methodology (explain valuation models)
  - /blog (placeholder for future content)

- [ ] 5.3 — Performance optimization
  - Lighthouse audit + fixes
  - Image optimization
  - Bundle size check

- [ ] 5.4 — Error handling + edge cases
  - Missing data graceful degradation
  - API failure fallbacks
  - Loading states + skeletons

---

## Phase 6: Payment + Launch (Day 29-32)

- [ ] 6.1 — Stripe integration
  - Basic ($9.99/mo) and Pro ($19.99/mo) plans
  - Stripe Checkout + Customer Portal
  - Webhook for subscription status sync

- [ ] 6.2 — Production deployment checklist
  - Custom domain setup on Vercel
  - Supabase production project
  - Environment variables in Vercel
  - Error monitoring (Sentry)
  - Analytics (PostHog or Vercel Analytics)

- [ ] 6.3 — Launch
  - Product Hunt listing prep
  - Initial blog post: "How We Calculate Intrinsic Value"
  - Social media announcement

---

## Post-MVP Roadmap (Phase 2 features)

- EPV model
- DDM (Stable + Multi-Stage) models
- User editable assumptions + Save Model
- Self-calculated industry Beta (Unlevered → Relevered → Blume)
- SEC EDGAR auto-detection (real-time filing updates)
- Expand to all 8000 US stocks
- Redis caching layer
- Notification system (email + web push)
- Sensitivity analysis interactive heatmap (user-adjustable)
- AI valuation explanation (Claude API integration)
- PDF export

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0: Scaffolding | 2 days | Day 2 |
| 1: Data Layer | 3 days | Day 5 |
| 2: Valuation Engine | 7 days | Day 12 |
| 3: Frontend | 8 days | Day 20 |
| 4: Auth + Users | 4 days | Day 24 |
| 5: SEO + Polish | 4 days | Day 28 |
| 6: Payment + Launch | 4 days | Day 32 |

**Total: ~32 working days to MVP launch**
