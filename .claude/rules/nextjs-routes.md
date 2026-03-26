---
paths:
  - "src/app/**"
---

# Next.js App Router Conventions

## Async Params (CRITICAL)
All dynamic route params are Promises in Next.js 16. Always await:
```ts
const { ticker } = await params;
```
Never destructure params synchronously — it will silently fail.

## ISR Revalidation
- Page files: `export const revalidate = 3600` — must be a **literal number** (Next.js build constraint)
- Runtime code: use `ISR_REVALIDATE_SECONDS` from constants
- After DB mutations: always call `revalidatePath("/${ticker}", "layout")` to bust cache immediately
- `generateStaticParams()` returns `[]` — all routes are on-demand ISR, not precompiled

## ISR + Dynamic APIs — NEVER MIX (CRITICAL)
ISR pages (`revalidate = 3600`) must **never** access dynamic APIs:
- `searchParams`, `cookies()`, `headers()` — all trigger `DYNAMIC_SERVER_USAGE` error in production
- If a page needs query params (e.g., `?strategy=`), read them in a **client component** via `useSearchParams()` hook
- Server component renders with default values; client component handles URL-driven variations
- This was a production incident (500 on `/AAPL/valuation/summary`) — do not repeat

## Ticker Normalization
Normalize immediately at route entry:
```ts
const upperTicker = ticker.toUpperCase();
```
Validate format: `TICKER_REGEX` from `@/lib/constants` — supports `BRK-B` style tickers

## Unknown Ticker State
If `getCompany()` returns null, pages render a static "not currently covered" message. No on-demand provisioning — all data is pre-seeded via batch seed scripts.

## API Route Patterns
- Protected routes: use `getAuthenticatedUser(request)` from `@/lib/api/auth`
- Cron routes: check `Bearer ${process.env.CRON_SECRET}` header
- Always export `maxDuration` for Vercel: `export const maxDuration = 30` (300 for cron)
- Error format: `NextResponse.json({ error: "message" }, { status: 4xx })`
- Cache check pattern: return cached if < 1 hour old, respect `?refresh=true` param

## Metadata & SEO
- Generate metadata dynamically from company data in `generateMetadata()`
- JSON-LD via `<script type="application/ld+json">` with `dangerouslySetInnerHTML`
- Index pages (e.g., `/valuation/dcf/page.tsx`, `/valuation/relative/page.tsx`) redirect to default sub-page via `redirect()`
