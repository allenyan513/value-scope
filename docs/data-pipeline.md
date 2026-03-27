# Data Pipeline: Seed, Cron & Audit

## Overview

ValuScope's data pipeline has 3 stages:

```
Seed (one-time)          Cron (daily)              Audit (on-demand)
─────────────────        ─────────────────         ─────────────────
FMP → DB + Valuations    Prices → Estimates        Scan all tickers
                         → Recompute               Output quality report
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

Three separate cron jobs run on Vercel, weekday evenings (UTC times in `vercel.json`):

### 2.1 Update Prices — 4:30 PM ET

```
/api/cron/update-prices
Schedule: 30 21 * * 1-5 (UTC)
```

- Fetches latest quotes via FMP `/stable/batch-quote` (50 tickers per call)
- Updates `daily_prices` and `companies.price` / `companies.market_cap`
- **FMP calls**: ~10 for 500 stocks, ~160 for 8000 stocks
- **No valuations computed** — just price data

### 2.2 Refresh Estimates — 5:00 PM ET

```
/api/cron/refresh-estimates
Schedule: 0 22 * * 1-5 (UTC)
```

- Rotates through companies in daily batches (100/day by default)
- Refreshes analyst estimates + price target consensus from FMP
- Handles ADR currency conversion
- Full refresh: `curl -H "Authorization: Bearer $CRON_SECRET" .../refresh-estimates?full=true`
- **FMP calls**: ~200/day (100 stocks x 2 endpoints)
- At 100/day, all 500 stocks cycle every 5 business days

### 2.3 Recompute Valuations — 5:30 PM ET

```
/api/cron/recompute-valuations
Schedule: 30 22 * * 1-5 (UTC)
```

- Runs `recomputeAllValuations()` — **DB-only, zero FMP calls**
- Reads financials, estimates, peers, prices from Supabase
- Computes all 9 valuation models for every ticker
- Saves results to `valuation_results` + `valuation_history`
- Busts ISR cache via `revalidatePath()` so visitors see fresh data

### Execution Order

```
4:30 PM ET   update-prices         → fresh prices in DB
5:00 PM ET   refresh-estimates     → fresh estimates in DB
5:30 PM ET   recompute-valuations  → all models recalculated with latest data
```

Order matters: valuations depend on prices + estimates being current.

### Manual Trigger

Any cron endpoint can be triggered manually:

```bash
# Update prices
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.app/api/cron/update-prices

# Refresh ALL estimates (not just daily batch)
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.app/api/cron/refresh-estimates?full=true

# Recompute valuations
curl -H "Authorization: Bearer $CRON_SECRET" https://valuescope.app/api/cron/recompute-valuations
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
| No valuations at all | CRITICAL | Ticker in `companies` but no rows in `valuation_results` |
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
| Daily: refresh-estimates | ~200 | Weekdays |
| Daily: recompute-valuations | 0 (DB-only) | Weekdays |
| Daily: audit | 0 (DB-only) | On-demand |

**Daily steady-state**: ~210 FMP calls/day → ~4,200/month (well under 750K limit)

---

## Scaling to 8000 Stocks

When expanding beyond S&P 500:

1. **Seed**: Update `SP500_TICKERS` or add a new ticker list. Script auto-resumes.
2. **Prices**: `getBatchQuotes()` handles any size (50/batch). ~160 calls for 8000 stocks.
3. **Estimates**: Batch rotation auto-adjusts. At 100/day, 8000 stocks cycle every 80 business days. Increase `CRON_ESTIMATES_BATCH_SIZE` if needed.
4. **Recompute**: DB-only. Time scales linearly — ~500 stocks in ~30s, ~8000 stocks in ~8 min.
5. **Audit**: DB-only. Runs in seconds regardless of ticker count.
