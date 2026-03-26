@AGENTS.md

# ValuScope - Stock Valuation SaaS

Stock valuation platform covering S&P 500 (expandable to 8000+ US stocks). 7 automated valuation models with daily updates. SEO-driven organic growth.

## Tech Stack
- **Framework**: Next.js 16.2 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase (PostgreSQL 17) — project ID: `kbvldznefhrxnbxgvktw`
- **Styling**: Tailwind CSS 4 + shadcn/ui + Recharts 3
- **Deployment**: Vercel (ISR + Cron)
- **External APIs**: FMP Stable API (financials), FRED (Treasury yields)

## Commands
```bash
npm run dev          # Start dev server (default port 3001)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest, 125 tests)
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

## Architecture Principles
- **3 services only**: Vercel + Supabase + FMP. No Redis, no message queues, no microservices.
- **Frontend never calls FMP directly**. All FMP calls go through server-side API routes.
- **Full TypeScript**: No Python. All valuation logic in TS.
- **ISR revalidation**: 1 hour. `export const revalidate = 3600` must be a literal (Next.js build constraint). Runtime uses `ISR_REVALIDATE_SECONDS` from constants.

## Workflow: Feature Branch Development
**Never commit directly to main.** At the start of every new session:
1. `git fetch origin main && git checkout main && git pull origin main` — sync main
2. Create a feature branch: `git checkout -b feat/<short-description>` (or `fix/`, `chore/`, `docs/`)
3. Develop on the feature branch, commit as needed
4. When done: `git push -u origin <branch> && gh pr create`
5. If session work is small/trivial (e.g., typo fix), ask the user before deciding to branch or commit directly

## Database Migrations
Use Supabase MCP tool `apply_migration` for all DDL changes. Never use raw `execute_sql` for schema changes.

## Key Conventions
- Ticker is always UPPERCASE and used as primary key
- Financial data stored as raw numbers (not in millions/billions)
- Valuation results include `assumptions` field for full transparency
- All prices in USD

## Shared Utilities — Do Not Duplicate
- **Constants** (`src/lib/constants.ts`): All magic numbers live here. Never hardcode thresholds, delays, or limits inline — import from constants.
- **Formatting** (`src/lib/format.ts`): Use `formatLargeNumber()`, `formatCurrency()`, `formatMillions()`, `getUpsideColor()`, `toDateString()`. Never create inline formatting functions in components.
- **API Auth** (`src/lib/api/auth.ts`): Use `getAuthenticatedUser(request)` in API routes that need auth. Never inline Supabase client creation with auth headers.
- **DCF Helpers** (`src/lib/valuation/dcf-helpers.ts`): Shared `cagr()`, `avg()`, `clamp()`, `projectRevenue()` — used by all DCF models. Do not redefine these.
- **ValuationHero** (`src/components/valuation/valuation-hero.tsx`): Unified stat-row (Fair Value / Market Price / Upside / Verdict) + narrative paragraph. Used by Summary, DCF, PEG, and Relative pages. Never duplicate this pattern inline — use the component.

## Testing
- Run `npm test` before and after making logic changes — ensure no regressions before committing
- When adding new code with branching logic, state transitions, or error handling — add tests
- Fixtures in `__tests__/fixtures.ts` — shared test data modeled after real financial patterns

## Performance Rules — MUST follow
- **Parallel by default**: Multiple independent DB/API calls MUST use `Promise.all()`. Never sequential `await` when calls don't depend on each other.
- **No over-fetching**: Pages must only fetch data they render. Do not add queries to `getCoreTickerData()` unless ALL pages need the result. Page-specific data goes in its own `cache()` function.
- **No client-side data waterfalls**: If data can be fetched server-side and passed as props, do that. Do not use `useEffect` + `fetch()` for data that the server already has access to.
- **Heavy client components**: Recharts and other large libraries should only be imported in components that actually render charts. Use Suspense boundaries so chart loading doesn't block critical content.
- **Performance tests required**: When adding or modifying data fetching functions, add or update performance tests in `__tests__/data.perf.test.ts` that verify parallelism and prevent over-fetching regression.

## Supabase Query Notes
- Column renaming uses PostgREST syntax: `close:close_price` (NOT `close_price as close`)
- The `as` SQL alias syntax silently fails and returns null/empty results

## Cron Jobs
- **Daily Update** (`/api/cron/daily-update`): Weekdays 10:30 PM ET via Vercel Cron
- Manual trigger: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-update`

## Environment Variables
Required in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, `FRED_API_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_API_PRICE_ID`
