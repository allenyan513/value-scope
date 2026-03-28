# Architecture Overview

## System Summary

ValuScope is a stock valuation platform covering S&P 500 stocks with 9 automated valuation models and daily data updates. The system follows a **3-service architecture**: Vercel (compute + CDN) + Supabase (PostgreSQL) + FMP (financial data).

Key design principle: **valuations are computed lazily on demand, never stored in DB**. Results are cached as ISR HTML (1 hour) for browsers and returned as JSON for API/MCP clients.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     EXTERNAL SOURCES                        │
│  FMP API (financials, quotes, estimates, peers)             │
│  FRED API (10Y Treasury yield for WACC)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               GITHUB ACTIONS CRON JOBS                      │
│                                                             │
│  update-prices (3x weekdays: 8:30/10:30/17:30 ET)          │
│    → daily_prices, companies.price/market_cap               │
│    → sector_betas (median unlevered beta per sector)        │
│                                                             │
│  refresh-estimates (2x weekdays: 16:00/18:00 ET)            │
│    → analyst_estimates (250 tickers/slot, 500/day)          │
│    → price_target_consensus                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE (PostgreSQL)                      │
│                                                             │
│  companies ─────────── ticker, name, sector, industry,      │
│                        market_cap, price, beta,             │
│                        reporting_currency, fx_rate_to_usd   │
│                                                             │
│  financial_statements  5yr annual + quarterly financials    │
│                        (revenue, net_income, ebitda,        │
│                         fcf, shares_out, margins, etc.)     │
│                                                             │
│  daily_prices ──────── ticker + date → close_price, volume  │
│                                                             │
│  analyst_estimates ─── forward EPS/revenue by period        │
│                                                             │
│  price_target_consensus consensus/high/low targets          │
│                                                             │
│  sector_betas ──────── sector-level median beta & WACC      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            LAZY VALUATION COMPUTATION                       │
│                                                             │
│  Triggered by:                                              │
│    1. Page visit → getCoreTickerData() (SSR)                │
│    2. REST API  → GET /api/valuation/[ticker]               │
│    3. MCP tool  → POST /api/mcp (get_stock_valuation)       │
│                                                             │
│  computeFullValuation():                                    │
│    ├─ Classify archetype (profitable_growth, mature, etc.)  │
│    ├─ Compute WACC (CoE = Rf + Beta × ERP; CoD = IE/Debt)  │
│    └─ Run 9 models in parallel:                             │
│       ├─ DCF FCFF Growth Exit 5Y  ← consensus fair value   │
│       ├─ DCF FCFF Growth Exit 10Y                           │
│       ├─ DCF FCFF EBITDA Exit 5Y                            │
│       ├─ DCF FCFF EBITDA Exit 10Y                           │
│       ├─ P/E Multiples (historical + peer)                  │
│       ├─ EV/EBITDA Multiples (historical + peer)            │
│       ├─ PEG (growth-adjusted)                              │
│       └─ EPV (earnings power value)                         │
│                                                             │
│  Results: NOT stored in DB — ephemeral, cached by ISR only  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT CHANNELS                           │
│                                                             │
│  Browser ────── SSR pages with ISR cache (1 hour)           │
│                 Charts, tables, peer comparisons            │
│                 Cache busted by cron → revalidatePath()     │
│                                                             │
│  REST API ───── GET /api/valuation/[ticker] → JSON          │
│                 On-demand computation, no cache              │
│                                                             │
│  MCP Server ─── POST /api/mcp (stateless HTTP)              │
│                 Tool: get_stock_valuation(ticker, models?)   │
│                 Rate limit: 30 req/min per IP               │
│                 No auth required — free public endpoint      │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Tables

| Table | Primary Key | Updated By | Purpose |
|-------|-------------|------------|---------|
| `companies` | ticker | Seed + Cron (price only) | Company metadata, live price |
| `financial_statements` | ticker + period | Seed script | 5yr historical financials |
| `daily_prices` | ticker + date | Cron 3x/day | Historical closing prices |
| `analyst_estimates` | ticker + period | Cron 2x/day | Forward EPS/revenue estimates |
| `price_target_consensus` | ticker | Cron 2x/day | Wall Street consensus targets |
| `sector_betas` | sector | Cron (with prices) | Sector-level beta & WACC stats |

---

## Caching Strategy

| Layer | Scope | TTL | Invalidation |
|-------|-------|-----|-------------|
| ISR (Vercel) | Per-ticker page HTML | 1 hour | `revalidatePath()` after cron |
| React `cache()` | Per-request dedup | Single SSR render | Automatic |
| In-memory rate limit | MCP endpoint | Sliding window | 30 req/min per IP |

No Redis, no CDN edge cache, no database-level valuation cache.

---

## Key Design Decisions

1. **No valuation tables** — All 9 models computed on-the-fly. Avoids stale data and complex cache invalidation. ISR provides sub-second responses for repeat visitors.

2. **Cron rotation for estimates** — 500 tickers split into 2 daily slots (250 each). Full coverage every ~2 days. Balances FMP API rate limits with data freshness.

3. **ADR currency handling** — Non-USD companies (e.g., Danish DKK) are converted at ingestion time. FX rate stored on `companies.fx_rate_to_usd` for auditability.

4. **Synthetic valuation history** — Charts show EMA-smoothed price vs. synthetic intrinsic value (computed on each visit, not stored). No historical valuation snapshots.

5. **Shared computation pipeline** — `computeValuationForTicker()` in `src/mcp/valuation-handler.ts` is the single entry point for both REST API and MCP server. Page SSR uses the same underlying `computeFullValuation()`.

---

## Key File Paths

```
Data Ingestion
  src/app/api/cron/update-prices/route.ts
  src/app/api/cron/refresh-estimates/route.ts
  src/lib/data/fmp.ts, fmp-prices.ts, fmp-estimates.ts

Database Queries
  src/lib/db/queries-prices.ts
  src/lib/db/queries-financial.ts
  src/lib/db/queries-company.ts
  src/lib/db/resolve-peers.ts

Valuation Models
  src/lib/valuation/summary.ts          — 9-model aggregator
  src/lib/valuation/dcf-fcff.ts         — DCF FCFF (4 variants)
  src/lib/valuation/trading-multiples.ts — P/E & EV/EBITDA
  src/lib/valuation/peg.ts              — PEG model
  src/lib/valuation/epv.ts              — EPV model

Page Data Loading
  src/app/[ticker]/data.ts              — getCoreTickerData(), getChartHistory()

API & MCP
  src/app/api/valuation/[ticker]/route.ts
  src/app/api/mcp/route.ts
  src/mcp/server.ts
  src/mcp/valuation-handler.ts
```
