# Data Architecture Review: Why Current Design Won't Scale

**Date**: 2026-03-28
**Focus**: Data flow architecture — valuation持久化、Cron频率、缓存策略、万级股票扩展

---

## Current Architecture Summary

```
FMP API ──→ Cron (GitHub Actions) ──→ Supabase (raw data only)
                                          │
                                          ▼
                              User/API/MCP Request
                                          │
                              ┌───────────▼───────────┐
                              │  Lazy Computation     │
                              │  5 DB queries         │
                              │  11 FMP API calls     │
                              │  ~100ms CPU           │
                              │  Total: 700-1700ms    │
                              └───────────┬───────────┘
                                          │
                                    ISR HTML Cache
                                    (1 hour TTL)
```

**Three fundamental problems**:
1. Every page visit triggers 11+ external API calls (peer metrics from FMP)
2. ISR is the ONLY caching layer — no application-level cache exists
3. Cron frequency doesn't match data change frequency

---

## Problem 1: Lazy Valuation — The Hidden Cost

### What Happens Per Request Today

| Step | Type | Count | Latency |
|------|------|-------|---------|
| Company, financials, estimates, prices | DB | 5-6 queries | ~100ms |
| 10Y Treasury yield | FRED API | 1 call | ~300ms |
| Peer resolution | FMP API + DB | 1+1 | ~300ms |
| Peer key metrics | FMP API | 10 calls | ~300ms (parallel) |
| Peer EV/EBITDA from DB | DB | 2 queries | ~50ms |
| Valuation computation (9 models) | CPU | pure compute | ~100ms |
| **Total** | | **~20 operations** | **~700-1200ms** |

**Key insight**: I/O accounts for 90%+ of latency. Pure CPU (9 valuation models) is only ~100ms.

### Why This Fails at Scale

| Metric | 500 stocks | 8,000 stocks |
|--------|-----------|-------------|
| Unique page visits/day (est.) | ~2,000 | ~30,000+ |
| FMP calls from page visits (11/visit) | ~22,000 | ~330,000 |
| FMP rate limit (Starter plan) | 300/min | 300/min |
| Time to exhaust rate limit | Never | **~66 minutes of traffic** |
| DB queries from page visits | ~14,000 | ~210,000 |
| Supabase free-tier connection limit | 60 | 60 |

**At 8,000 stocks, lazy FMP calls from page visits will hit rate limits within an hour of moderate traffic.**

### What Should Change

**Principle: Separate data collection from data serving. Never call external APIs during user requests.**

```
BEFORE (current):
  User Request → DB queries + FMP calls + CPU → Response

AFTER (proposed):
  User Request → DB read (pre-computed result) → Response
  Background  → Cron collects + pre-computes → DB write
```

### Proposed: Pre-Computed Valuation Table

```sql
CREATE TABLE valuations (
  ticker        TEXT PRIMARY KEY REFERENCES companies(ticker),
  fair_value    REAL NOT NULL,
  upside_pct    REAL NOT NULL,
  verdict       TEXT NOT NULL,
  models        JSONB NOT NULL,      -- all 9 model results
  pillars       JSONB NOT NULL,      -- DCF/Multiples/PEG/EPV summaries
  wacc          REAL,
  classification JSONB,
  assumptions   JSONB,               -- full transparency
  computed_at   TIMESTAMPTZ NOT NULL,
  data_version  TEXT,                -- hash of inputs for cache invalidation
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_valuations_updated ON valuations(updated_at);
```

**Request cost drops from ~20 operations to 1 DB query (~5ms).**

### Pre-Computation Strategy

```
Nightly Batch (after market close, ~6 PM ET):
  1. For each ticker:
     a. Read: company, financials, estimates, prices (all from DB — no FMP)
     b. Read: peer list + peer metrics (from pre-computed peer_metrics table)
     c. Compute: 9 valuation models (~100ms CPU)
     d. Write: valuations table (upsert)
  2. Total time: 8,000 × 100ms = ~13 minutes (parallelizable to ~2-3 min)
  3. FMP calls: ZERO (all inputs already in DB from cron)
```

### What About Peer Metrics?

Today peer metrics are fetched from FMP **per user request** (10 calls/visit). This must also be pre-computed:

```sql
CREATE TABLE peer_metrics (
  ticker          TEXT NOT NULL REFERENCES companies(ticker),
  peer_ticker     TEXT NOT NULL REFERENCES companies(ticker),
  trailing_pe     REAL,
  forward_pe      REAL,
  ev_ebitda       REAL,
  price_to_book   REAL,
  price_to_sales  REAL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, peer_ticker)
);
```

**Pre-compute schedule**: After estimate refresh cron, batch-fetch peer metrics:
- 8,000 tickers × 10 peers × 1 FMP call = 80,000 FMP calls
- At 300/min rate limit = ~267 minutes (~4.5 hours)
- Run overnight, stagger across 6 hours
- OR: compute from DB data (financials table has PE, EV/EBITDA inputs)

**Better approach**: Compute peer multiples from our own DB, not FMP:
```sql
-- P/E = price / (net_income / shares_outstanding)
-- EV/EBITDA = (market_cap + total_debt - cash) / ebitda
-- All data already in companies + financial_statements tables
```
**This eliminates ALL per-request FMP calls.** FMP is only used for data ingestion (cron), never for serving.

---

## Problem 2: Cron Frequency vs Reality

### Data Change Frequency Analysis

| Data Type | Real Change Frequency | Current Polling | Justified? |
|-----------|----------------------|-----------------|-----------|
| Stock Price | Continuous (market hours) | 3x/day | OK for daily close |
| Market Cap | Derived from price | 3x/day | Follows price |
| Analyst Estimates | ~4x/year per stock (earnings season) | 2x/day (1000 FMP calls) | **Wasteful** |
| Price Targets | ~2-4x/year per stock | 2x/day (bundled) | **Wasteful** |
| 10Y Treasury | 1x/day | Lazy (per request) | Should be cron |
| Company Beta | ~monthly | Never updated post-seed | **Gap** |
| Financial Statements | Quarterly | Never updated post-seed | **Gap** |

### The Real Problem: What We DON'T Update

More concerning than over-polling estimates is what we **never refresh**:

1. **Financial statements** — Seeded once, never updated. When Q4 2025 earnings come out, our DB still shows Q3 2025.
2. **Company beta** — Seeded from FMP profile, never refreshed. Betas drift significantly over 6-12 months.
3. **Shares outstanding** — Changes with buybacks/dilution. Affects per-share valuation.
4. **Debt levels** — Affects WACC. Only updates with new financial statements.

### Proposed: Tiered Refresh Strategy

```
┌─────────────────────────────────────────────────────────┐
│  HOT DATA — Refresh daily (after market close)          │
│  • Stock prices & market cap (1 batch FMP call)         │
│  • 10Y Treasury yield (1 FRED call)                     │
│  Cost: ~20 FMP calls/day (8000 stocks ÷ 50/batch × 1)  │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  WARM DATA — Refresh weekly (or event-driven)           │
│  • Analyst estimates & price targets                    │
│  • Sector betas (recompute from DB)                     │
│  Cost: ~16,000 FMP calls/week (8000 × 2 endpoints)     │
│  Schedule: Stagger Mon-Fri, 1600 tickers/day            │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  COLD DATA — Refresh quarterly (earnings-driven)        │
│  • Financial statements (income, balance sheet, CF)     │
│  • Company profile (beta, shares out, debt)             │
│  Cost: ~32,000 FMP calls/quarter (8000 × 4 endpoints)  │
│  Trigger: Earnings calendar → refresh after report      │
│  Schedule: Stagger over 2-week post-earnings window     │
└─────────────────────────────────────────────────────────┘
```

### Daily FMP API Budget (8,000 stocks)

| Task | Calls/Day | Notes |
|------|----------|-------|
| Prices (HOT) | 160 | 8000 ÷ 50/batch |
| Estimates (WARM, staggered) | ~3,200 | 1600 tickers/day × 2 endpoints |
| Financials (COLD, staggered) | ~450 | ~100 tickers/day × 4 endpoints |
| **Total** | **~3,810/day** | Well within 300/min limit |

Compare to current: ~1,030 calls/day for only 500 stocks. The tiered approach handles **16x more stocks** with only **4x more calls**.

---

## Problem 3: ISR Dependency and Commercialization

### Why ISR Won't Work for Paid Product

| Requirement | ISR Behavior | Problem |
|-------------|-------------|---------|
| Login required | ISR caches per-route, not per-user | Cached page shown to wrong user |
| Subscription tiers (free/pro) | ISR can't vary by user plan | Pro content leaked to free users |
| API rate limiting per user | ISR bypasses API layer | No per-user tracking |
| Real-time portfolio view | ISR has 1-hour stale window | Unacceptable for paid users |
| Client-side rendering | ISR is server-side only | Doesn't apply to SPA sections |

### The Transition Path

```
PHASE 1 (Current — SEO Growth):
  Public pages + ISR
  ├─ Good for: Google indexing, organic traffic
  ├─ Works for: anonymous visitors seeing summary data
  └─ Keep for: marketing pages, stock overview pages

PHASE 2 (Commercialization):
  Auth-gated detail pages + API-first architecture
  ├─ Summary page: still public (ISR, SEO)
  ├─ Detail pages: behind login → API fetch, no ISR
  ├─ API consumers: rate-limited, cached responses
  └─ MCP consumers: same API layer
```

### Proposed: Application-Level Cache (Valuation Cache)

Instead of relying on ISR (HTML-level cache), introduce a **data-level cache**:

```
┌──────────────────────────────────────────────────────────┐
│                    CACHE LAYERS                           │
│                                                          │
│  Layer 1: valuations table (DB)                          │
│  ├─ Pre-computed nightly                                 │
│  ├─ TTL: until next computation (~24h)                   │
│  ├─ Serves: ALL consumers (pages, API, MCP)              │
│  └─ Cost: 1 DB read per request (~5ms)                   │
│                                                          │
│  Layer 2: In-memory cache (Vercel Edge/Node)             │
│  ├─ LRU cache for hot tickers (AAPL, MSFT, NVDA...)     │
│  ├─ TTL: 5-15 minutes                                   │
│  ├─ Serves: repeat requests within same instance         │
│  └─ Cost: 0ms (memory read)                              │
│                                                          │
│  Layer 3: ISR (public pages only)                        │
│  ├─ Summary/overview pages for SEO                       │
│  ├─ TTL: 1 hour                                          │
│  └─ Does NOT apply to auth-gated pages                   │
│                                                          │
│  Layer 4: Client-side cache (React Query / SWR)          │
│  ├─ Browser-level dedup for logged-in SPA                │
│  ├─ TTL: 5 minutes (staleTime)                           │
│  └─ Reduces API calls from same user session             │
└──────────────────────────────────────────────────────────┘
```

### Unified API Layer

All consumers should go through the same data path:

```
                    ┌─── Browser (public, ISR page)
                    │
GET /api/valuation  ├─── Browser (logged in, client fetch)
     ──────────────►│
                    ├─── MCP client (AI agent)
                    │
                    └─── 3rd party API consumer

                    ┌───────────────────────┐
                    │   API Handler          │
                    │                       │
                    │   1. Auth check        │
                    │   2. Rate limit check  │
                    │   3. Read valuations   │
                    │      table (5ms)       │
                    │   4. Return JSON       │
                    └───────────────────────┘
```

**No lazy computation. No FMP calls. No FRED calls. Just a DB read.**

If valuation is stale (>24h or missing), the API can either:
- Return stale data with `computed_at` timestamp (preferred — fast)
- Trigger async recomputation and return stale data immediately
- Queue ticker for next batch computation

---

## Problem 4: Scaling to 8,000+ Stocks

### Database Growth Projections

| Table | Rows @ 500 | Rows @ 8,000 | Growth Factor |
|-------|-----------|-------------|--------------|
| companies | 500 | 8,000 | 16x |
| financial_statements | ~2,500 | ~40,000 | 16x |
| daily_prices | ~625,000 | ~10,000,000 | 16x |
| analyst_estimates | ~2,500 | ~40,000 | 16x |
| peer_metrics | ~5,000 | ~80,000 | 16x |
| valuations | 500 | 8,000 | 16x |

**Supabase capacity**: PostgreSQL handles 10M+ rows easily. No schema change needed, but indexes become critical.

### Required Index Strategy

```sql
-- Hot path: valuation read (every request)
CREATE INDEX idx_valuations_ticker ON valuations(ticker);

-- Peer lookups (batch computation)
CREATE INDEX idx_peer_metrics_ticker ON peer_metrics(ticker);
CREATE INDEX idx_companies_sector_mcap ON companies(sector, market_cap DESC);
CREATE INDEX idx_companies_industry_mcap ON companies(industry, market_cap DESC);

-- Price history (chart rendering)
CREATE INDEX idx_prices_ticker_date ON daily_prices(ticker, date DESC);

-- Estimate lookups
CREATE INDEX idx_estimates_ticker ON analyst_estimates(ticker);

-- Financial statement lookups
CREATE INDEX idx_financials_ticker_year ON financial_statements(ticker, fiscal_year DESC);
```

### Batch Computation at Scale

**Nightly valuation recompute for 8,000 stocks:**

```
Strategy: Parallel workers with DB-only inputs

Input per ticker:
  - 1 company row
  - 5 financial_statements rows
  - 5 analyst_estimates rows
  - 10 peer_metrics rows (pre-computed)
  - 1 sector_betas row
  - 1 latest price (from companies.price)

Total DB reads: ~22 rows per ticker
Batch read: SELECT * FROM ... WHERE ticker IN (batch of 100)
  → 80 batches × ~22 rows = ~1,760 queries total

CPU per ticker: ~100ms (9 models)
Parallelism: 10 concurrent workers
Total time: 8,000 × 100ms ÷ 10 = ~80 seconds

Write: 8,000 upserts to valuations table
Batch write: 80 batches of 100 = ~80 queries
Total time: ~10 seconds

GRAND TOTAL: ~90 seconds for full recompute of 8,000 stocks
```

**This is feasible as a single Vercel serverless function** (300s max duration, well within budget).

### Seeding 8,000 Stocks

Initial data load becomes the bottleneck:

| Data | FMP Calls | At 300/min | Time |
|------|----------|-----------|------|
| Company profiles | 8,000 | 27 min | 27 min |
| Income statements (5yr) | 8,000 | 27 min | 27 min |
| Balance sheets (5yr) | 8,000 | 27 min | 27 min |
| Cash flow (5yr) | 8,000 | 27 min | 27 min |
| Analyst estimates | 8,000 | 27 min | 27 min |
| **Total** | **40,000** | | **~2.5 hours** |

Need: Resumable seed script with checkpoint tracking (current seed has no resume capability).

---

## Proposed Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA INGESTION                          │
│                                                             │
│  Cron: Daily 5:30 PM ET                                    │
│  ├─ Batch price quotes (HOT)        → daily_prices         │
│  ├─ 10Y Treasury (HOT)              → config/cache         │
│  └─ Trigger: recompute valuations                          │
│                                                             │
│  Cron: Weekly (staggered Mon-Fri)                           │
│  ├─ Analyst estimates (WARM)         → analyst_estimates    │
│  └─ Price targets (WARM)             → price_targets        │
│                                                             │
│  Cron: Quarterly (earnings-driven)                          │
│  ├─ Financial statements (COLD)      → financial_statements │
│  └─ Company profiles (COLD)          → companies            │
│                                                             │
│  Cron: Nightly (after price update)                         │
│  ├─ Peer metrics from DB (no FMP)    → peer_metrics         │
│  └─ 9-model valuation batch          → valuations           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                     │
│                                                             │
│  Source Tables (raw data):                                  │
│  ├─ companies, financial_statements, daily_prices           │
│  ├─ analyst_estimates, price_target_consensus               │
│  └─ sector_betas                                            │
│                                                             │
│  Computed Tables (pre-built for serving):                   │
│  ├─ valuations (9 models, JSONB, 1 row per ticker)         │
│  └─ peer_metrics (10 peers per ticker, computed from DB)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED API LAYER                         │
│                                                             │
│  GET /api/valuation/[ticker]                                │
│  ├─ Auth check (free tier / pro tier / API key)             │
│  ├─ Rate limit (per user/key)                               │
│  ├─ Read from valuations table (1 query, ~5ms)              │
│  ├─ Optional: enrich with live price (1 DB read)            │
│  └─ Return JSON                                             │
│                                                             │
│  POST /api/mcp                                              │
│  ├─ Same data path as REST API                              │
│  ├─ Rate limit (per IP, 30/min)                             │
│  └─ Return structured MCP response                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              Public Page   Auth Page   API/MCP
              (ISR, SEO)    (SPA fetch)  (JSON)
```

---

## Migration Plan

### Phase 1: Add Valuation Persistence (Week 1-2)

1. Create `valuations` table
2. Create `peer_metrics` table
3. Build `computePeerMetricsFromDB()` — derive all peer multiples from existing DB data, zero FMP calls
4. Build batch valuation job: read DB → compute → write `valuations`
5. Add cron trigger: run after `update-prices` completes
6. **Keep lazy computation as fallback** for tickers not yet in `valuations` table

### Phase 2: Cut FMP from Request Path (Week 2-3)

1. Modify `getCoreTickerData()` to read from `valuations` table instead of computing
2. Modify `/api/valuation/[ticker]` to read from `valuations` table
3. Modify MCP handler to read from `valuations` table
4. **Result: zero FMP calls during user requests**
5. Monitor: compare pre-computed vs lazy results for accuracy

### Phase 3: Optimize Cron Frequency (Week 3-4)

1. Reduce estimate refresh to weekly (staggered)
2. Reduce price update to 1x/day (post-market)
3. Add quarterly financial refresh cron (earnings-driven)
4. Add 10Y Treasury daily cron (replace lazy FRED calls)

### Phase 4: Auth + Credit-Based Monetization (Month 2) ✅ Done (PR #54)

Pivoted from subscription to credit-based model. See `docs/credit-system.md` for full details.

1. ✅ Credit system (DB tables + atomic PG functions + service layer)
2. ✅ Stripe one-time payment checkout + webhook fulfillment
3. ✅ Client-side AccessGate with blur paywall (ISR preserved, no CLS)
4. ✅ Credit gating on MCP + REST API endpoints
5. ✅ Google OAuth + cookie-based auth callback
6. ✅ Pricing page with 3 credit packs

### Phase 5: Scale to 8,000 (Month 2-3)

1. Resumable seed script with checkpointing
2. Increase cron batch sizes (tiered refresh strategy)
3. Add database indexes for scale
4. Load test: 8,000 tickers × concurrent users

---

## Key Numbers Summary

| Metric | Current (500, lazy) | Proposed (8,000, pre-computed) |
|--------|--------------------|-----------------------------|
| Request latency | 700-1700ms | **~5-10ms** |
| FMP calls per request | 11 | **0** |
| DB queries per request | 5-8 | **1-2** |
| Daily FMP API budget | ~1,030 | ~3,810 |
| Concurrent request capacity | ~30 (FMP bottleneck) | **thousands** (DB only) |
| Nightly recompute time | N/A | ~90 seconds |
| Data staleness | 0-1 hour (ISR) | 0-24 hours (nightly batch) |
| Works behind auth? | No (ISR conflict) | **Yes** |

### Trade-off: Freshness vs Performance

Pre-computing means valuations are up to 24 hours stale (vs current 1 hour with ISR). This is acceptable because:

1. **Valuation inputs change slowly** — analyst estimates update quarterly, financials update quarterly
2. **Price is the only fast-moving input** — and even daily close is sufficient for fundamental valuation
3. **Professional platforms** (Morningstar, S&P Capital IQ) update valuations daily or weekly, not real-time
4. **If needed**: run recompute 2x/day (after market open + close) for ~12-hour freshness at minimal cost

---

## What NOT to Change

- **3-service architecture** (Vercel + Supabase + FMP) — still correct
- **9 valuation models** — computation logic is solid
- **Peer resolution strategy** (FMP peers → DB fallback) — keep for cron, just don't call during requests
- **TypeScript-only** — no reason to add Python/Go
- **GitHub Actions for cron** — works fine, just adjust schedules
