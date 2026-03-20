@AGENTS.md

# ValuScope - Stock Valuation SaaS

## Project Overview
Stock valuation platform covering S&P 500 (expandable to 8000+ US stocks). Provides 7 automated valuation models with daily updates. Target: SEO-driven organic growth.

## Tech Stack
- **Framework**: Next.js 16.2 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase (PostgreSQL 17) — project ID: `kbvldznefhrxnbxgvktw`
- **Styling**: Tailwind CSS 4 + shadcn/ui + Recharts 3
- **Deployment**: Vercel (ISR + Cron)
- **External APIs**: FMP (financials), FRED (Treasury yields), SEC EDGAR (future)

## Architecture Principles
- **Simplicity first**: 3 services only — Vercel + Supabase + FMP. No Redis, no message queues, no microservices.
- **Compute on demand + cache**: Users visit → compute valuation → ISR cache 1 hour. S&P 500 batch precomputed daily via Vercel Cron.
- **Full TypeScript**: No Python. All valuation logic in TS.
- **SEO priority**: SSG/ISR pages, structured data (JSON-LD), sitemap, meaningful meta tags.

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
1. **DCF Growth Exit 5Y/10Y** — Free cash flow projection + perpetuity growth terminal value
2. **DCF EBITDA Exit 5Y/10Y** — Free cash flow projection + EV/EBITDA exit multiple terminal value
3. **P/E Multiples** — Peer median trailing/forward P/E × EPS
4. **EV/EBITDA Multiples** — Peer median EV/EBITDA × company EBITDA
5. **Peter Lynch Fair Value** — PEG-based (Growth Rate × EPS)

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

## Commands
```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
```

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

## Cron Jobs
- **Daily Update**: `/api/cron/daily-update` — Runs weekdays at 10:30 PM ET via Vercel Cron (`vercel.json`)
  - Updates stock prices, recomputes all 7 models, stores valuation history snapshots

## Database Tables
`companies`, `financial_statements`, `daily_prices`, `analyst_estimates`, `valuations`, `valuation_history`, `watchlists`, `usage_tracking`, `subscriptions`

## Phase Plan
- **Phase 1**: Data layer (Supabase schema + FMP/FRED seeding) + Valuation engine ✅
- **Phase 2**: Frontend pages (ticker detail, homepage, search) ✅
- **Phase 3**: Daily cron updates + Price vs Intrinsic Value chart ✅
- **Phase 4**: Auth + Watchlist ✅
- **Phase 5**: SEO (sitemap, JSON-LD, robots.txt, meta) ✅
- **Phase 6**: Stripe monetization (checkout, webhook, billing portal) ✅
- **Remaining**: Data seeding (run seed script), Stripe Price IDs configuration, domain setup
