@AGENTS.md

# ValuScope - Stock Valuation SaaS

Stock valuation platform covering S&P 500 (expandable to 8000+ US stocks). 9 automated valuation models (4 FCFF DCF + 1 FCFE DCF + 2 Trading Multiples + PEG + EPV) with daily updates. SEO-driven organic growth. Also exposed as a free MCP server (`/api/mcp`) for AI clients.

## Tech Stack
- **Framework**: Next.js 16.2 (App Router) + React 19 + TypeScript 5
- **Database**: Supabase (PostgreSQL 17) — project ID: `kbvldznefhrxnbxgvktw`
- **Styling**: Tailwind CSS 4 + shadcn/ui + Recharts 3
- **Deployment**: Vercel (ISR) + GitHub Actions (Cron)
- **External APIs**: FMP Stable API (financials), FRED (Treasury yields)

## Commands
```bash
npm run dev          # Start dev server (default port 3001)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest, 263 tests)
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
- **MethodologyCard** (`src/components/valuation/methodology-card.tsx`): Shared "Methodology" section. Takes `paragraphs: string[]`. Used by all valuation model pages. Never inline methodology text — use this component.
- **Valuation Handler** (`src/mcp/valuation-handler.ts`): Shared data-fetching + `computeFullValuation()` pipeline. Used by both `/api/valuation/[ticker]` and MCP server. Never duplicate valuation computation logic — use `computeValuationForTicker()`.

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
Scheduled via **GitHub Actions** (`.github/workflows/cron-jobs.yml`), not Vercel Cron (Hobby plan doesn't support multiple daily jobs). GitHub Actions calls the Vercel-hosted API routes with `CRON_SECRET`.
- **Update Prices** (`/api/cron/update-prices`): 3x weekdays — 8:30 AM, 10:30 AM, 5:30 PM ET. Also refreshes sector betas and busts ISR cache.
- **Refresh Estimates** (`/api/cron/refresh-estimates`): 2x weekdays — 4:00 PM (slot=0), 6:00 PM ET (slot=1). Rotates 250 tickers/slot, 500/day. Busts ISR cache for processed tickers.
- **No recompute cron** — valuations are computed lazily on page visit via `getCoreTickerData()` → `computeFullValuation()`, cached by ISR (1 hour). No `valuations` or `valuation_history` tables — all computation is ephemeral, cached only as ISR HTML.
- Manual trigger (local): `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/update-prices`
- Manual trigger (prod): Use GitHub Actions → "Cron Jobs" → Run workflow → select job

## MCP Server
- **Endpoint**: `POST /api/mcp` — Streamable HTTP, stateless (no sessions)
- **Transport**: `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse: true`
- **Tool**: `get_stock_valuation(ticker, models?)` — returns structured valuation data from up to 9 models
- **Architecture**: Per-request `McpServer` + transport (stateless, Vercel-friendly). Factory in `src/mcp/server.ts`.
- **No auth required** — free public endpoint. CORS enabled for cross-origin clients.
- Client config: `{ "mcpServers": { "valuescope": { "url": "https://valuescope.dev/api/mcp" } } }`

## Environment Variables
Required in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, `FRED_API_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_API_PRICE_ID`
