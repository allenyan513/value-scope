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
```

## Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── [ticker]/           # Dynamic stock page (ISR 1hr)
│   ├── api/                # API routes (search, valuation, cron)
│   └── auth/               # Supabase Auth flows
├── lib/
│   ├── data/               # External API clients (fmp.ts, fred.ts, seed.ts)
│   ├── db/                 # Supabase client + query helpers
│   └── valuation/          # 7 valuation model engines
├── components/
│   ├── charts/             # Price vs Intrinsic Value chart
│   ├── valuation/          # Model cards, summary, sensitivity heatmap
│   ├── layout/             # Header, footer
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

## FMP API Notes
- Uses `/stable/` endpoints (legacy `/api/v3` deprecated after 2025-08-31)
- Current plan max `limit=5` for financial statement endpoints
- Ticker passed as `?symbol=` query param (not path param)
- Seed Mag 7 only: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config src/lib/data/seed-mag7.ts`

## Commands
```bash
npm run dev          # Start dev server (default port 3001)
npm run build        # Production build
npm run lint         # ESLint
```

## Phase Plan
- **Phase 1 (Done)**: Data layer (Supabase schema + FMP/FRED seeding) + Valuation engine
- **Phase 2 (Done)**: Frontend pages (ticker detail, homepage, search)
- **Phase 3 (Current)**: Daily cron updates + Price vs Intrinsic Value chart
- **Phase 4**: Auth + Watchlist
- **Phase 5**: SEO (sitemap, JSON-LD, meta)
- **Phase 6**: Stripe monetization (future)
