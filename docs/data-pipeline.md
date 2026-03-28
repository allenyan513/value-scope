# Data Pipeline: Seed, Cron & Audit

## Overview

ValuScope's data pipeline has 3 stages:

```
Seed (one-time)          Cron (daily, automated)              Audit (on-demand)
─────────────────        ──────────────────────────            ─────────────────
FMP → DB + Valuations    5:30 PM  update-prices               Scan all tickers
                         7:00 PM  refresh-after-earnings      Output quality report
                                  ├─ earnings calendar check
                                  ├─ targeted financials refresh
                                  └─ targeted recompute + peers
```

---

## 1. Seed — Initial Data Import

**Purpose**: Import company data from FMP into Supabase for the first time.

```bash
npx tsx --env-file=.env.local src/lib/data/seed.ts
```

### What it does (per company)

| Step | Data | FMP Endpoint | DB Table |
|------|------|-------------|----------|
| 1 | Company profile | `/stable/profile` | `companies` |
| 2 | Income statements (5yr) | `/stable/income-statement` | `financial_statements` |
| 3 | Balance sheets (5yr) | `/stable/balance-sheet-statement` | `financial_statements` |
| 4 | Cash flow statements (5yr) | `/stable/cash-flow-statement` | `financial_statements` |
| 5 | Analyst estimates (5yr) | `/stable/analyst-estimates` | `analyst_estimates` |
| 6 | Daily prices (2yr) | `/stable/historical-price-eod/full` | `daily_prices` |

### ADR Currency Conversion

For non-USD reporting companies (e.g. NVO in DKK, ASML in EUR):
- Detects `reportedCurrency` from FMP income statements
- Fetches live FX rate via `/stable/fx?symbol=DKKUSD`
- Converts all financial figures to USD at ingestion
- Stores `reporting_currency` and `fx_rate_to_usd` on `companies` table

### Auto-Recompute After Seed

After all companies are imported, the seed script automatically runs `recomputeAllValuations()` to compute fair values for all 9 models. This is DB-only (zero FMP calls).

### Resume Support

The seed script skips tickers already in the DB. If it crashes mid-run, just re-run it — it picks up where it left off.

### Rate Limiting

- FMP Starter plan: 300 requests/min
- Seed uses 300ms delay between API calls
- ~5 FMP calls per company → ~1.2s per company
- 500 companies ≈ 10 minutes
- 8000 companies ≈ 2.5 hours

---

## 2. Cron — Daily Updates

Scheduled via **GitHub Actions** (`.github/workflows/cron-jobs.yml`). Two automated jobs run weekday evenings:

### 2.1 Update Prices — 5:30 PM ET (automated)

```
/api/cron/update-prices
Schedule: 30 21 * * 1-5 (UTC)
```

- Fetches latest quotes via FMP `/stable/batch-quote` (50 tickers per call)
- Updates `daily_prices` and `companies.price` / `companies.market_cap`
- Warms FRED 10Y Treasury yield cache for downstream valuation consumers
- Busts ISR cache via `revalidatePath()` for all updated tickers
- **FMP calls**: ~10 for 500 stocks, ~160 for 8000 stocks

### 2.2 Refresh After Earnings — 7:00 PM ET (automated, event-driven)

```
/api/cron/refresh-after-earnings
Schedule: 0 23 * * 1-5 (UTC)
```

Event-driven refresh: instead of blindly rotating through all tickers, checks which companies actually reported earnings and refreshes only those.

**Flow**:
1. Query FMP `/stable/earnings-calendar` for yesterday + today
2. Filter to tickers tracked in our `companies` table
3. For each reporting ticker (~5-20/day, peaks at ~30-40 during earnings season):
   - Fetch 3 financial statement types (income, balance, cash flow) → merge & upsert
   - Refresh analyst estimates + price target consensus
   - Update company profile (beta, shares outstanding)
4. Refresh sector betas (DB-only, since company beta/debt may have changed)
5. **Targeted recompute**: recompute valuations for affected tickers + their peers only (not all stocks)
6. Bust ISR cache for refreshed tickers

**Fallback**: On no-earnings days, refreshes a rotating batch of 50 tickers (`?fallback_batch=50`).

**FMP calls**: ~7 per ticker × ~20 tickers = ~140/day (vs previous ~1030/day)

### 2.3 Manual-Only Jobs

These are NOT scheduled. Triggered via GitHub Actions → Run workflow → select job.

**Refresh Estimates Full** (`/api/cron/refresh-estimates?full=true`):
- Refreshes analyst estimates + price targets for ALL tickers
- Use after bulk onboarding or data recovery

**Recompute Valuations** (`/api/cron/recompute-valuations`):
- Full recompute of all valuation snapshots via `recomputeAllValuations()`
- DB-only, zero FMP calls
- Use after valuation model changes or snapshot corruption

### Execution Order

```
5:30 PM ET   update-prices              → fresh prices in DB
7:00 PM ET   refresh-after-earnings     → financials + estimates for reporters
                ├─ targeted recompute    → snapshots for reporters + peers
                └─ sector beta refresh   → updated WACC inputs
```

### Valuation Snapshots & Dynamic Upside%

Fair Value = f(financials, estimates, WACC, peers) — changes only when inputs change (quarterly).
Upside% = (Fair Value - Price) / Price — changes daily with price.

**Design**: Fair Value is stored in `valuation_snapshots`. Upside% and verdict are recalculated at read time using the latest `companies.price` via `refreshSummaryWithLivePrice()`. This means recompute only runs when financial data changes (after earnings), not daily.

Snapshots are considered stale after 25 hours (`SNAPSHOT_MAX_AGE_MS`). If stale or missing, `getCoreTickerData()` falls back to live computation (DB-only).

### Manual Trigger

```bash
# Update prices
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.vercel.app/api/cron/update-prices

# Refresh after earnings (or test fallback batch)
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.vercel.app/api/cron/refresh-after-earnings

# Refresh ALL estimates (manual recovery)
curl -H "Authorization: Bearer $CRON_SECRET" "https://valuescope.vercel.app/api/cron/refresh-estimates?full=true"

# Recompute all valuations (manual recovery)
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.vercel.app/api/cron/recompute-valuations
```

For local development:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/update-prices
```

### Recompute (CLI shortcut)

Recompute valuations without starting the dev server:

```bash
npm run recompute
```

This runs `scripts/recompute.ts` directly — same logic as the cron endpoint, but as a standalone script.

---

## 3. Audit — Data Quality Check

**Purpose**: Scan all tickers for valuation anomalies, data gaps, and model issues.

```bash
npm run audit
```

### Output

- **Console**: Summary with counts (CRITICAL / WARNING / INFO)
- **File**: `reports/audit-YYYY-MM-DD.md` with full details

### Check Rules

| Check | Severity | Rule |
|-------|----------|------|
| No valuations at all | CRITICAL | Ticker in `companies` but no row in `valuation_snapshots` |
| Fair value < 0.02x or > 50x market price | CRITICAL | Almost certainly a bug |
| Cross-model spread > 20x | CRITICAL | Max FV / Min FV ratio too extreme |
| Less than 5/9 models computed | WARNING | Missing data for some models |
| Peer-based model with < 3 peers | WARNING | Insufficient peer data |
| Fair value vs analyst target < 0.2x or > 5x | WARNING | Worth manual review |

### When to Run

- After initial seed of new tickers
- After code changes to valuation models
- After fixing bugs (verify CRITICAL count decreased)
- Periodically as a health check

---

## FMP API Budget

FMP Starter plan: 300 requests/min, ~750,000/month.

| Operation | FMP Calls | Frequency |
|-----------|-----------|-----------|
| Seed (500 stocks) | ~2,500 | One-time |
| Seed (8000 stocks) | ~40,000 | One-time |
| Daily: update-prices | ~10 | Weekdays |
| Daily: refresh-after-earnings | ~140 | Weekdays (earnings) |
| Daily: refresh-after-earnings (fallback) | ~350 | Weekdays (no earnings) |
| Manual: refresh-estimates (full) | ~1,000 | On-demand |
| Manual: recompute-valuations | 0 (DB-only) | On-demand |
| Audit | 0 (DB-only) | On-demand |

**Daily steady-state**: ~150-360 FMP calls/day → ~3,000-7,200/month (well under 750K limit)

Previous architecture used ~1,030 calls/day (~20,600/month). Event-driven refresh reduced this by **~85%**.

---

## Scaling to 8000 Stocks

When expanding beyond S&P 500:

1. **Seed**: Update `SP500_TICKERS` or add a new ticker list. Script auto-resumes.
2. **Prices**: `getBatchQuotes()` handles any size (50/batch). ~160 calls for 8000 stocks.
3. **Earnings refresh**: Event-driven — volume scales with earnings reporters (~20-40/day), NOT total stock count. On no-earnings days, fallback batch refreshes 50 tickers (configurable via `CRON_EARNINGS_FALLBACK_BATCH`).
4. **Targeted recompute**: Only recomputes tickers with new earnings + their peers. At 8000 stocks with ~30 reporters/day + ~300 peers = ~330 recomputes (vs 8000 for full recompute — **96% reduction**).
5. **Full estimates refresh**: Manual-only (`?full=true`). Run after bulk onboarding. At 8000 stocks × 2 FMP calls × 300ms = ~80 min.
6. **Audit**: DB-only. Runs in seconds regardless of ticker count.
