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
- **Full TypeScript**: No Python. All valuation logic in TS.
- **SEO priority**: SSG/ISR pages, structured data (JSON-LD), sitemap, meaningful meta tags.

## Workflow: Multi-Branch Development
This project uses parallel feature branches. At the start of every new session:
1. `git fetch origin main` — check for new commits on main
2. If behind, `git pull origin main` (or merge into current branch) and resolve conflicts
3. Always resolve conflicts before starting new work

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
│   ├── auth/               # Supabase auth client helpers
│   ├── data/               # External API clients (fmp.ts, fred.ts, seed.ts)
│   ├── db/                 # Supabase client + query helpers + migrations
│   ├── valuation/          # 7 valuation model engines
│   └── stripe.ts           # Stripe client + plan definitions
├── components/
│   ├── auth/               # AuthProvider context
│   ├── charts/             # Price vs Intrinsic Value chart
│   ├── valuation/          # Model cards, summary, sensitivity heatmap
│   ├── watchlist/          # Add to Watchlist button
│   ├── layout/             # Header (with auth), footer
│   └── ui/                 # shadcn/ui primitives
├── types/                  # All TypeScript interfaces
└── scripts/                # Migration runner (legacy, prefer MCP)
```

## Valuation Models (src/lib/valuation/)
1. **DCF FCFE 5Y** — Revenue projection → Net Income → FCFE, discounted by Cost of Equity, Gordon Growth terminal value
2. **P/E Multiples** — Historical 5Y avg P/E × TTM EPS (falls back to peer median when < 100 data points)
3. **P/S Multiples** — Historical 5Y avg P/S × Revenue/Share (same fallback logic)
4. **P/B Multiples** — Historical 5Y avg P/B × Book Value/Share (same fallback logic)
5. **Peter Lynch Fair Value** — PEG-based (Growth Rate × 100 × EPS, growth clamped 5%–25%)

### Relative Valuation Approach
- **Primary method**: Historical self-comparison (company's own 5Y average multiples)
- **Fallback**: Peer-based (when historical data < 100 points)
- **Shared logic**: `historical-multiples.ts` — compute multiples from daily_prices + financial_statements
- Low/High estimates use p25/p75 of historical distribution
- Percentile shows where current multiple sits vs history

## WACC Calculation
- Cost of Equity = Risk-free rate (10Y Treasury from FRED) + Beta × ERP (5.5% default)
- Cost of Debt = Interest Expense / Total Debt
- MVP uses FMP-provided Beta (no custom Blume adjustment yet)

## Key Conventions
- Ticker is always UPPERCASE and used as primary key
- Financial data stored as raw numbers (not in millions/billions)
- Valuation results include `assumptions` field for full transparency
- ISR revalidation: 1 hour for stock pages
- All prices in USD

## FMP API Notes
- Uses `/stable/` endpoints (legacy `/api/v3` deprecated after 2025-08-31)
- Current plan max `limit=5` for financial statement endpoints
- Ticker passed as `?symbol=` query param (not path param)
- **Field name gotcha**: `/stable/key-metrics` uses `earningsYield`/`evToEBITDA` (NOT `peRatio`/`enterpriseValueOverEBITDA`). Use `/stable/ratios` for `priceToEarningsRatio`, `priceToSalesRatio`, `priceToBookRatio`.
- `/stable/stock-peers` returns peer symbols for a ticker
- `/stable/sector-pe-ratio` returns empty array (not available on stable API)
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
- **Tests**: `src/lib/valuation/__tests__/` — 72 tests covering all valuation models
- **Fixtures**: `__tests__/fixtures.ts` — shared test data modeled after real financial patterns
- Run `npm test` before committing valuation logic changes

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
| `/api/multiples-history/[ticker]?days=` | GET | No | Historical P/E, P/S, P/B with stats & valuations |

## Cron Jobs
- **Daily Update**: `/api/cron/daily-update` — Runs weekdays at 10:30 PM ET via Vercel Cron (`vercel.json`)
  - Updates stock prices, recomputes all 7 models, stores valuation history snapshots

## Database Tables
`companies`, `financial_statements`, `daily_prices`, `analyst_estimates`, `valuations`, `valuation_history`, `price_target_consensus`, `watchlists`, `usage_tracking`, `subscriptions`

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
- **Remaining**: Data seeding (run seed script), Stripe Price IDs configuration, domain setup
