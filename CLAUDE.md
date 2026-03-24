@AGENTS.md

# ValuScope - Stock Valuation SaaS

## Project Overview
Stock valuation platform covering S&P 500 (expandable to 8000+ US stocks). Provides 7 automated valuation models with daily updates. Target: SEO-driven organic growth.

## Tech Stack
- **Framework**: Next.js 16.2 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase (PostgreSQL 17) — project ID: `kbvldznefhrxnbxgvktw`
- **Styling**: Tailwind CSS 4 + shadcn/ui + Recharts 3
- **Deployment**: Vercel (ISR + Cron)
- **External APIs**: FMP Stable API (financials), FRED (Treasury yields), SEC EDGAR (future)

## Architecture Principles
- **Simplicity first**: 3 services only — Vercel + Supabase + FMP. No Redis, no message queues, no microservices.
- **Compute on demand + cache**: Users visit → compute valuation → ISR cache 1 hour. S&P 500 batch precomputed daily via Vercel Cron.
- **Frontend ↔ paid API isolation**: Browser/client code never calls FMP directly. All FMP calls go through server-side API routes (`/api/provision/[ticker]` for real-time seed, cron for batch updates).
- **Full TypeScript**: No Python. All valuation logic in TS.
- **SEO priority**: SSG/ISR pages, structured data (JSON-LD), sitemap, meaningful meta tags.

## Workflow: Feature Branch Development
**Never commit directly to main.** At the start of every new session:
1. `git fetch origin main && git checkout main && git pull origin main` — sync main
2. Create a feature branch: `git checkout -b feat/<short-description>` (or `fix/`, `chore/`, `docs/`)
3. Develop on the feature branch, commit as needed
4. When done, push and create a PR: `git push -u origin <branch> && gh pr create`
5. Merge via PR (squash or merge commit) — never push directly to main
6. If session work is small/trivial (e.g., typo fix), ask the user before deciding to branch or commit directly

## Database Migrations
Use Supabase MCP tool `apply_migration` for all DDL changes. Never use raw `execute_sql` for schema changes.

## Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FMP_API_KEY
FRED_API_KEY
CRON_SECRET
STRIPE_SECRET_KEY              # Stripe API secret key
STRIPE_WEBHOOK_SECRET          # Stripe webhook signing secret
STRIPE_PRO_PRICE_ID            # Stripe Price ID for Pro plan
STRIPE_API_PRICE_ID            # Stripe Price ID for API plan
```

## Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── [ticker]/           # Dynamic stock page (ISR 1hr) + JSON-LD
│   │   └── dcf-valuation/  # DCF sub-routes: /perpetual-growth, /pe-exit, /ev-ebitda-exit
│   ├── methodology/        # Valuation methodology explanation
│   ├── pricing/            # Pricing plans (Free / Pro / API)
│   ├── watchlist/          # User's watchlist (requires auth)
│   ├── auth/               # Supabase Auth flows (login, signup, callback)
│   ├── api/
│   │   ├── search/         # Ticker/company search
│   │   ├── valuation/      # On-demand valuation compute
│   │   ├── history/        # Price vs intrinsic value history
│   │   ├── cron/           # Daily update cron job
│   │   ├── watchlist/      # Watchlist CRUD (GET/POST/DELETE)
│   │   └── stripe/         # Stripe checkout, webhook, billing portal
│   ├── sitemap.ts          # Dynamic sitemap (all tickers)
│   └── robots.ts           # robots.txt
├── lib/
│   ├── api/                # API route helpers (auth.ts — shared Supabase auth)
│   ├── auth/               # Supabase auth client helpers
│   ├── data/               # External API clients (fmp.ts, fred.ts, seed.ts)
│   ├── db/                 # Supabase client + query helpers + migrations
│   ├── valuation/          # 7 valuation model engines (DCF split: dcf.ts, dcf-3stage.ts, dcf-helpers.ts, dcf-legacy.ts)
│   ├── format.ts           # Shared formatting (formatLargeNumber, formatCurrency, formatMillions)
│   └── stripe.ts           # Stripe client + plan definitions
├── components/
│   ├── auth/               # AuthProvider context
│   ├── charts/             # Price vs Intrinsic Value chart
│   ├── valuation/          # Model cards, summary, sensitivity heatmap
│   ├── watchlist/          # Add to Watchlist button
│   ├── layout/             # Header (with auth), footer
│   └── ui/                 # shadcn/ui primitives
├── types/                  # All TypeScript interfaces
```

## Valuation Models (src/lib/valuation/)
1. **DCF FCFE 5Y** — Revenue (analyst estimates) → Net Margin → Net Income → CapEx → FCFE, discounted by Cost of Equity, Gordon Growth terminal value
2. **DCF 3-Stage Perpetual Growth 10Y** — Same FCFE pipeline, 10Y projection (Y1–5 analyst, Y6–10 transition fade), Gordon Growth terminal value. Primary DCF model on `/dcf-valuation` page.
3. **DCF P/E Exit 10Y** — Same 10Y FCFE projections, terminal value = Year 10 Net Income × historical 5Y avg P/E. Cross-validation only (not in consensus).
4. **DCF EV/EBITDA Exit 10Y** — Same 10Y FCFE projections, terminal value = Year 10 EBITDA × historical 5Y avg EV/EBITDA − net debt. Cross-validation only.
5. **P/E Multiples** — Historical 5Y avg P/E × TTM EPS (falls back to peer median when < 100 data points)
6. **EV/EBITDA Multiples** — Historical 5Y avg EV/EBITDA × EBITDA → subtract net debt → equity per share (same fallback logic)
7. **Peter Lynch Fair Value** — PEG-based (Growth Rate × 100 × EPS, growth clamped 5%–25%)

### Relative Valuation Approach (valueinvesting.io style)
- **Only 2 models**: P/E and EV/EBITDA — simplified for clarity (removed P/S, P/B, EV/EBIT, Forward multiples)
- **Primary method**: Historical self-comparison (company's own 5Y average multiples)
- **Fallback**: Peer-based (when historical data < 100 points)
- **Page design**: Each model shows summary table (Range + Selected), peer comparison table, and transparent step-by-step calculation breakdown
- **Shared logic**: `historical-multiples.ts` — compute multiples from daily_prices + financial_statements
- Low/High estimates use p25/p75 of historical distribution

## WACC Calculation
- Cost of Equity = Risk-free rate (10Y Treasury from FRED) + Beta × ERP (4.5% default, Damodaran implied)
- Cost of Debt = Interest Expense / Total Debt
- Terminal Growth Rate: dynamic by company archetype (2.5%–4.0%), defined in `company-classifier.ts`
- `profitable_growth` (3.5%): growth >12% OR (growth >8% with net margin >20%) — covers companies like AAPL
- MVP uses FMP-provided Beta (no custom Blume adjustment yet)

## Analyst Estimates
- **Daily cron** fetches forward estimates from FMP `getAnalystEstimates()` and stores in `analyst_estimates` table
- **Real-time fallback**: if estimates are empty when computing valuation, fetches from FMP on demand and persists
- DCF uses analyst consensus for revenue projection (up to 5 years), falls back to historical CAGR if unavailable
- Net margin derived from analyst EPS × shares / revenue per year; fades to 5Y historical average beyond analyst coverage
- CapEx = Maintenance (≈ D&A) + Growth CapEx (proportional to revenue increase)

## Key Conventions
- Ticker is always UPPERCASE and used as primary key
- Financial data stored as raw numbers (not in millions/billions)
- Valuation results include `assumptions` field for full transparency
- ISR revalidation: 1 hour in prod. Page `export const revalidate = 3600` must be a literal (Next.js build constraint). Runtime fetch revalidation uses `ISR_REVALIDATE_SECONDS` from constants.
- All prices in USD

## Shared Utilities — Do Not Duplicate
- **Constants** (`src/lib/constants.ts`): All magic numbers live here. Never hardcode thresholds, delays, or limits inline — import from constants. Key values: `VERDICT_THRESHOLD`, `ISR_REVALIDATE_SECONDS`, `FMP_API_DELAY_MS`, `CRON_COMPANY_DELAY_MS`, `DB_BATCH_CHUNK_SIZE`, `DEFAULT_HISTORY_DAYS`, `MIN_GROWTH_RATE`/`MAX_GROWTH_RATE`.
- **Formatting** (`src/lib/format.ts`): Use `formatLargeNumber()`, `formatCurrency()`, `formatMillions()`, `getUpsideColor()`, `toDateString()`. Never create inline formatting functions in components — import from here.
- **API Auth** (`src/lib/api/auth.ts`): Use `getAuthenticatedUser(request)` in API routes that need auth. Returns `{ user, supabase }` or a 401 `NextResponse`. Never inline Supabase client creation with auth headers.
- **DCF Helpers** (`src/lib/valuation/dcf-helpers.ts`): Shared `cagr()`, `avg()`, `clamp()`, `projectRevenue()` — used by all DCF models. Do not redefine these.

## FMP API Notes
- Uses `/stable/` endpoints (legacy `/api/v3` deprecated after 2025-08-31)
- **Plan**: Starter ($19/mo) — 300 req/min, 5 years historical, US coverage, annual fundamentals
- `limit=5` for all financial statement and analyst estimate endpoints (matches plan)
- Ticker passed as `?symbol=` query param (not path param)
- **Field name gotcha**: `/stable/key-metrics` uses `earningsYield`/`evToEBITDA` (NOT `peRatio`/`enterpriseValueOverEBITDA`). Use `/stable/ratios` for `priceToEarningsRatio`, `priceToSalesRatio`, `priceToBookRatio`.
- `/stable/stock-peers` returns peer symbols for a ticker
- `/stable/sector-pe-ratio` returns empty array (not available on stable API)
- `/stable/search` returns empty on Starter plan — use `/stable/profile` with exact ticker as fallback
- **Rate limiting**: `seedSingleCompany()` uses sequential calls with 300ms delay; cron adds 3s between companies
- Seed Mag 7 only: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config src/lib/data/seed-mag7.ts`

## Commands
```bash
npm run dev          # Start dev server (default port 3001)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

## Testing
- **Runner**: Vitest (config in `vitest.config.ts`)
- **Tests**: `src/lib/valuation/__tests__/` + `src/app/api/*/__tests__/` — 111 tests total
- **Fixtures**: `__tests__/fixtures.ts` — shared test data modeled after real financial patterns
- Run `npm test` before and after making logic changes — ensure no regressions before committing
- **Rule**: When adding new code (API routes, lib functions, components with logic), always consider whether unit tests are needed. If the code has branching logic, state transitions, or error handling — add tests. Pure UI or one-liner glue code can skip.

## API Routes
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/search?q=` | GET | No | Ticker/company autocomplete search |
| `/api/valuation/[ticker]` | GET | No | Compute or return cached valuation |
| `/api/history/[ticker]?days=` | GET | No | Price vs intrinsic value history |
| `/api/cron/daily-update` | GET | Bearer CRON_SECRET | Daily price + valuation refresh |
| `/api/watchlist` | GET/POST/DELETE | Bearer JWT | User watchlist CRUD |
| `/api/stripe/checkout` | POST | Bearer JWT | Create Stripe checkout session |
| `/api/stripe/webhook` | POST | Stripe signature | Stripe event webhook |
| `/api/stripe/portal` | POST | Bearer JWT | Create billing portal session |
| `/api/provision/[ticker]` | POST | No | Real-time ticker provisioning (seed + compute + revalidate) |
| `/api/multiples-history/[ticker]?days=` | GET | No | Historical P/E, P/S, P/B with stats & valuations |

## Cron Jobs
- **Daily Update**: `/api/cron/daily-update` — Runs weekdays at 10:30 PM ET via Vercel Cron (`vercel.json`)
  - Updates stock prices, recomputes all 8 models, stores valuation history snapshots
  - Processes `data_requests` queue: seeds up to 10 new tickers per run (3s delay between companies)
  - Manual trigger: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-update`

## Database Tables
`companies`, `financial_statements`, `daily_prices`, `analyst_estimates`, `valuations`, `valuation_history`, `price_target_consensus`, `watchlists`, `usage_tracking`, `subscriptions`, `data_requests`

## Supabase Query Notes
- Column renaming in `.select()` uses PostgREST syntax: `close:close_price` (NOT `close_price as close`)
- The `as` SQL alias syntax silently fails and returns null/empty results

## Phase Plan
- **Phase 1**: Data layer (Supabase schema + FMP/FRED seeding) + Valuation engine ✅
- **Phase 2**: Frontend pages (ticker detail, homepage, search) ✅
- **Phase 3**: Daily cron updates + Price vs Intrinsic Value chart ✅
- **Phase 4**: Auth + Watchlist ✅
- **Phase 5**: SEO (sitemap, JSON-LD, robots.txt, meta) ✅
- **Phase 6**: Stripe monetization (checkout, webhook, billing portal) ✅
- **Phase 7**: Valuation accuracy (ERP calibration, dynamic terminal growth, analyst estimates integration, interactive DCF) ✅
## On-Demand Stock Provisioning (Real-Time)
- Users visit unknown ticker → `<TickerPending>` client component shows spinner + triggers `/api/provision/[ticker]`
- Provision API: `seedSingleCompany()` (~3s) → `computeFullValuation()` → `revalidatePath()` to bust ISR cache
- Client polls every 3s, on "ready" calls `router.refresh()` — page renders with full data
- Fallback: `data_requests` table still enqueued for cron backup (JS-disabled users)
- Only tickers matching `/^[A-Z]{1,5}$/` are accepted
- `data_requests` table: ticker (PK), status (pending/processing/completed/failed), request_count, error

## ISR Cache Invalidation
- `revalidatePath("/${ticker}", "layout")` called from: provision API, daily cron, valuation API
- Ensures frontend pages reflect DB updates immediately (no 1-hour stale wait)
- ISR `revalidate = 3600` remains as background refresh interval

## DCF Model Details
- **Revenue**: analyst estimates (5Y) → fade to historical CAGR → fade to 3% GDP growth
- **Net Margin**: derived per-year from analyst EPS × shares / revenue; fades to 5Y historical avg
- **CapEx**: Maintenance (≈ D&A, grows at 20% of revenue growth) + Growth (intensity × revenue increase)
- **Discount Rate**: Cost of Equity (CAPM), shown in projection table
- **Terminal Value**: Gordon Growth, rate by archetype (profitable_growth=3.5%, mature_stable=3.0%, etc.)
- **Sensitivity**: 5×5 matrix of Discount Rate × Terminal Growth

## Remaining
- Stripe Price IDs configuration, domain setup
- Summary card redesign
- Relative Valuation: populate Forward P/E + Forward EV/EBITDA columns from analyst estimates
- Terminal value improvement: normalize terminal FCFE, two-stage terminal, exit multiple cross-check

## Refactoring Backlog (do when touching the file)
### File Splits (>300 lines, split when modifying)
- `types/index.ts` (328 lines) → split into `types/company.ts`, `types/valuation.ts`, `types/financial.ts`
- `fmp.ts` (433 lines) → split by domain: `fmp-financials.ts`, `fmp-prices.ts`, `fmp-estimates.ts`
- `trading-multiples.ts` (417 lines) → P/E and EV/EBITDA share helpers, consider splitting if adding new models
- `queries.ts` (330 lines) → split by domain: `queries-company.ts`, `queries-valuation.ts`, `queries-prices.ts`
- `estimate-chart.tsx` (366 lines) → extract sub-components (revenue chart, EPS chart, accuracy section)
### Unused Code Cleanup (deferred)
- `fred.ts` — `getTreasuryYieldHistory()` exported but never called
- `fmp.ts` — `getEnterpriseValue()` exported but never called
- `dcf.ts` / `dcf-legacy.ts` — deprecated `DCFInputs`, `calculateDCFGrowthExit`, `calculateDCFEBITDAExit` (remove when confirmed no DB references)
- 6 unused components: `wacc-card.tsx`, `tv-breakdown.tsx`, `dcf-tabs.tsx`, `football-field-chart.tsx`, `analyst-estimates-table.tsx`, `multiples-history-chart.tsx`
