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

## Ticker Normalization
Normalize immediately at route entry:
```ts
const upperTicker = ticker.toUpperCase();
```
Validate format: `/^[A-Z]{1,5}$/`

## Pending State
Pages check `data.pending` flag → render `<TickerPending>` client component which triggers `/api/provision/[ticker]` POST. Client polls every 3s, calls `router.refresh()` on "ready".

## API Route Patterns
- Protected routes: use `getAuthenticatedUser(request)` from `@/lib/api/auth`
- Cron routes: check `Bearer ${process.env.CRON_SECRET}` header
- Always export `maxDuration` for Vercel: `export const maxDuration = 30` (300 for cron)
- Error format: `NextResponse.json({ error: "message" }, { status: 4xx })`
- Cache check pattern: return cached if < 1 hour old, respect `?refresh=true` param

## Metadata & SEO
- Generate metadata dynamically from company data in `generateMetadata()`
- JSON-LD via `<script type="application/ld+json">` with `dangerouslySetInnerHTML`
- Index pages (e.g., `/dcf-valuation/page.tsx`) redirect to default sub-page via `redirect()`
