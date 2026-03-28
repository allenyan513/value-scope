# ValuScope Optimization & Refactoring Report

**Date**: 2026-03-28
**Scope**: Full codebase audit — performance, reliability, code quality, SEO, frontend

---

## Executive Summary

ValuScope is well-architected with clear separation of concerns, good parallelism in data fetching, and a clean ISR caching strategy. However, the audit identified **3 critical issues**, **8 high-severity issues**, and several medium/low improvements across 5 areas:

| Area | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| Data Pipeline & Cron | 1 | 4 | 3 | 2 |
| Valuation Performance | 0 | 2 | 1 | 0 |
| Code Quality & Types | 0 | 1 | 3 | 2 |
| SEO & Metadata | 0 | 1 | 3 | 2 |
| Frontend & Bundle | 0 | 0 | 2 | 3 |

**Estimated total latency savings**: ~1000-1500ms per page load (from peer metrics consolidation alone).

---

## 1. Data Pipeline & Cron Reliability

### CRITICAL: Silent Cron Failures

**Problem**: Both cron jobs return HTTP 200 even when most/all tickers fail. GitHub Actions only checks HTTP status, so failures are completely silent.

```
refresh-estimates: 250/250 tickers fail → returns 200 with { errors: 250 }
GitHub Actions: sees 200 → marks green ✓
Result: stale estimates for 24+ hours, nobody knows
```

**Current code** (`refresh-estimates/route.ts`):
```ts
} catch {
  errors++;  // No detail logged, no ticker name, no error type
}
```

**Fix**:
1. Return HTTP 500 if error rate > 20% of batch
2. Log per-ticker error details (ticker name + error message)
3. Add response body check in GitHub Actions workflow
4. Consider adding a health check endpoint for monitoring

---

### HIGH: FX Rate Fallback Without Logging

**Problem**: `getFXRateToUSD()` silently falls back to hardcoded rates (or worse, `.catch(() => 1.0)` in refresh-estimates). For ADRs like BABA (CNY), a fallback of 1.0 instead of ~0.138 inflates estimates by ~7x.

**Impact**: Any ADR with non-USD reporting currency could have wildly incorrect analyst estimates when the FX API fails.

**Fix**:
1. Log warnings when fallback rates are used
2. Never use 1.0 as default — use the hardcoded rate table instead
3. Cache FX rates for 1 hour to reduce API dependency

---

### HIGH: Partial Price Updates Without Atomicity

**Problem**: `update-prices` upserts daily_prices in one batch, then updates companies in another. If it fails between these steps:
- `daily_prices` has new price
- `companies.price` and `companies.market_cap` are stale
- ISR cache is already invalidated → users see inconsistent data

**Fix**: Wrap both operations in a single DB transaction, or at minimum update companies first (since pages primarily read from companies table).

---

### HIGH: Estimate Rotation Breaks When Stock Count Changes

**Problem**: Slot offset calculation depends on `totalBatches = Math.ceil(companies.length / BATCH_SIZE)`. When companies are added/removed (delistings, new S&P entries), the rotation windows shift — causing coverage gaps or double-processing.

**Fix**: Use ticker hash-based assignment instead of index-based rotation:
```ts
const slot = hashCode(ticker) % NUM_SLOTS;
```

---

### HIGH: No Timeout or Retry on FMP API Calls

**Problem**: `fmp-core.ts` uses bare `fetch()` with no timeout. A hanging FMP call can block the entire cron run (300s max duration).

**Fix**: Add `AbortController` with 15s timeout + 1 retry with exponential backoff.

---

### MEDIUM: Missing Database Indexes

Current queries that would benefit from indexes:
- `analyst_estimates`: needs `(ticker)` index for peer IN-clause queries
- `financial_statements`: needs `(ticker, fiscal_year DESC)` compound index
- These are hit on every peer metrics computation (10+ times per page load)

---

### MEDIUM: Sector Beta Recalculates Everything Daily

`refreshSectorBetas()` fetches ALL companies + financials and recomputes all sectors, even when only a few prices changed. This is expensive and could be weekly instead of daily (betas don't change fast).

---

## 2. Valuation Pipeline Performance

### HIGH: Redundant Peer Resolution (~300ms wasted)

**Problem**: `getCoreTickerData()` calls `resolvePeers()` at line 68, then `getPeerEVEBITDAMedianFromDB()` at line 101 calls `resolvePeers()` again internally.

```
getCoreTickerData()
  ├─ resolvePeers(ticker)          ← 1st call (~300ms: FMP + DB)
  ├─ 10x getKeyMetrics(peer)       ← 10 FMP calls
  └─ getPeerEVEBITDAMedianFromDB()
       └─ computePeerMetricsFromDB()
            └─ resolvePeers(ticker) ← 2nd call (redundant!)
```

**Fix**: Pass the already-resolved peer list as parameter:
```ts
const peerEVEBITDAMedian = await getPeerEVEBITDAMedianFromDB(peerCompanies);
```

---

### HIGH: Fragmented Peer Metrics Fetching (~500ms wasted)

**Problem**: Two completely separate peer metric fetching strategies exist:

| Location | Fetches | FMP Calls | Gets EV/EBITDA? |
|----------|---------|-----------|-----------------|
| `data.ts` (page) | `getKeyMetrics()` only | 10 | No |
| `valuation-handler.ts` (API) | `getKeyMetrics()` + `getEVMetrics()` | 20 | Yes |

The page path then separately calls `getPeerEVEBITDAMedianFromDB()` which recomputes peer EV/EBITDA from DB — redundant work.

**Fix**: Create a unified `fetchPeerMetrics(peers)` function that fetches both key metrics and EV metrics in parallel, used by both code paths:
```ts
// Shared utility
export async function fetchPeerMetrics(peers: PeerCompany[]) {
  return Promise.all(peers.map(async (peer) => {
    const [metrics, evMetrics] = await Promise.all([
      getKeyMetrics(peer.ticker, "annual", 1),
      getEVMetrics(peer.ticker, 1),
    ]);
    return { ...peer, trailing_pe, ev_ebitda, ... };
  }));
}
```

**Impact**: Eliminates ~10 redundant FMP calls + 1 redundant DB query per page load.

---

### MEDIUM: Production Latency vs Test Expectations

Performance test expects 400ms (mocked FMP at 100ms). Real production latency:
- Level 1 (6 parallel DB): ~100ms
- Level 2 (peer resolution): ~300-600ms
- Level 3 (peer metrics + EV/EBITDA): ~500-1000ms
- **Real total: ~1200-1700ms** (vs 400ms test expectation)

After fixing redundancies above, achievable target: **~600-800ms**.

---

## 3. Code Quality & Type Safety

### HIGH: `Record<string, unknown>` Overuse in Valuation Results

**Problem**: `ValuationResult.details` is typed as `Record<string, unknown>`, forcing double-casts everywhere:

```ts
// In PEG model (peg.ts:202)
details: details as unknown as Record<string, unknown>

// In DCF cards component (dcf-fcff-cards.tsx:32-50)
const projections = model.details.fcff_projections as FCFFProjection[];
const sensitivity = model.details.sensitivity_table as SensitivityRow[];
```

This pattern appears 20+ times across model files, components, and tests. Zero compile-time safety on detail field access.

**Fix**: Use discriminated union types:
```ts
export type ValuationResultTyped =
  | { model_id: "dcf_fcff_growth_5y"; details: DCFFDetails }
  | { model_id: "pe_multiples"; details: PEDetails }
  | { model_id: "peg"; details: PEGDetails }
  // ...
```

---

### MEDIUM: DCF Card Component Duplication (95% overlap)

`dcf-fcff-cards.tsx` (631 lines) and `dcf-fcff-ebitda-exit-cards.tsx` (626 lines) are nearly identical. Both contain:
- Sensitivity matrix UI
- WACC/terminal growth sliders
- FCF/Revenue/CapEx/WC tab panels
- Projection tables

**Fix**: Extract shared `DCFInteractiveCards` component, parameterized by exit method (growth vs EBITDA exit).

---

### MEDIUM: Scattered Magic Numbers

Numbers not yet in `constants.ts`:
- PE/EV caps: `200` and `100` (in `trading-multiples.ts` and `historical-multiples.ts`)
- WACC sensitivity deltas: `±0.02, ±0.01` (in both DCF files)
- Default tax rate: `0.21` (in `dcf-fcff-builders.ts` AND `wacc.ts`)
- Working capital defaults: `dso: 45, dpo: 30, dio: 60` days

---

### MEDIUM: Inconsistent Error Handling Pattern

DCF models **throw** on missing data. Trading Multiples/PEG/EPV **return N/A results**. The summary aggregator must handle both patterns differently.

**Fix**: Standardize on returning N/A results (safer for aggregation). Reserve throws for truly unrecoverable issues (no company data at all).

---

## 4. SEO & Metadata

### HIGH: Incomplete Page Metadata

Only 8 of ~20+ pages implement `generateMetadata()`. Missing pages:
- `/[ticker]/financials/`
- `/[ticker]/forecast/`
- `/[ticker]/compare/`
- `/[ticker]/historical-price/`
- `/[ticker]/dividends/`
- `/[ticker]/solvency/`
- `/[ticker]/transactions/`
- `/[ticker]/people/`

These pages use only the root template (`%s | ValuScope`), missing ticker-specific titles and descriptions that are critical for SEO.

---

### MEDIUM: Limited Sitemap Coverage

Current sitemap hardcodes 4 URL patterns per ticker. Missing:
- `/[ticker]/valuation/summary` (primary page)
- Individual DCF model pages
- PEG, EPV pages
- Non-valuation pages (financials, forecast, etc.)

---

### MEDIUM: No Open Graph Images

No `og:image` or `twitter:card` tags. Social sharing shows plain text previews. Adding dynamic OG images (via `@vercel/og`) would significantly improve click-through from social/search.

---

### MEDIUM: JSON-LD Only on Summary Page

Structured data (FinancialProduct schema) only exists on the summary page. Adding BreadcrumbList and extending to model-specific pages would improve rich snippet eligibility.

---

## 5. Frontend & Bundle

### MEDIUM: No Dynamic Imports for Chart Components

Recharts (~500KB) loads eagerly on all valuation pages. Should use `next/dynamic` with `{ ssr: false }` for:
- `price-value-chart.tsx`
- `historical-chart.tsx`
- DCF interactive cards (631 + 626 lines of client code)

---

### MEDIUM: Missing Suspense Boundaries

Only 2 sections have Suspense wrappers (WallStreetSection, ValuationChartSection). Other async data sections load without fallbacks, potentially blocking rendering.

---

### LOW: Route Duplication

`/trading-multiples/ev-ebitda-multiples/` redirects to `/trading-multiples/evebitda-multiples/`. The redirect folder should be removed, with a next.config redirect handling the legacy URL.

---

### LOW: No Middleware for Security Headers

No `middleware.ts` exists. Could add:
- CSP headers
- HSTS
- Ticker normalization (uppercase)
- Rate limiting on non-API routes

---

### LOW: Accessibility Gaps

- Only 11 ARIA attributes across all components
- Missing `aria-current="page"` on active nav
- Chart interactions are mouse-only
- No screen reader text for financial abbreviations

---

## Prioritized Action Plan

### Phase 1: Critical Fixes (Week 1)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | Add error logging + HTTP 500 threshold to cron jobs | S | Prevents silent data staleness |
| 2 | Fix FX rate fallback (never use 1.0, log warnings) | S | Prevents 7x valuation errors on ADRs |
| 3 | Add FMP fetch timeout (15s) + 1 retry | S | Prevents cron hangs |
| 4 | Add missing DB indexes (analyst_estimates, financial_statements) | S | Speeds up peer queries |

### Phase 2: Performance (Weeks 2-3)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 5 | Eliminate redundant `resolvePeers()` call | S | -300ms per page |
| 6 | Unify peer metrics fetching (shared function) | M | -500ms per page, removes code duplication |
| 7 | Dynamic imports for Recharts components | S | -200KB initial bundle |
| 8 | Fix slot rotation to use hash-based assignment | M | Prevents coverage gaps |

### Phase 3: Code Quality (Weeks 3-4)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 9 | Type-safe ValuationResult (discriminated union) | M | Eliminates 20+ unsafe casts |
| 10 | Merge DCF card components (631 + 626 lines → ~700) | M | -500 lines, easier maintenance |
| 11 | Move magic numbers to constants.ts | S | Consistency, auditability |
| 12 | Standardize error handling (N/A results, not throws) | S | Safer aggregation |

### Phase 4: SEO & Growth (Month 2)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 13 | Add generateMetadata() to all pages | M | Better search rankings |
| 14 | Expand sitemap to cover all page types | S | More pages indexed |
| 15 | Add OG images via @vercel/og | M | Better social sharing CTR |
| 16 | Extend JSON-LD to model pages + BreadcrumbList | S | Rich snippet eligibility |

### Phase 5: Hardening (Month 2-3)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 17 | Add atomicity to price/company updates | M | Prevents inconsistent state |
| 18 | Move sector beta refresh to weekly | S | Reduces daily DB load |
| 19 | Add middleware (security headers, ticker normalization) | M | Security + UX |
| 20 | Improve accessibility (ARIA, keyboard nav) | M | Compliance, usability |

---

## What NOT to Change

The following are well-designed and should be preserved:
- **Lazy valuation (no DB storage)** — avoids stale data, simplifies architecture
- **ISR + revalidatePath** — good cache strategy for this use case
- **3-service constraint** (Vercel + Supabase + FMP) — keeps ops simple
- **React `cache()` dedup** — prevents duplicate DB calls within a request
- **Shared `computeValuationForTicker()`** — good code reuse between API and MCP
- **Peer resolution strategy** (FMP first → DB fallback) — quality over speed, correct tradeoff
