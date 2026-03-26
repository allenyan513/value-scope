# Optimization TODO

## P0 — Parallelization (High Impact, Low Risk)

### 1. Parallelize peer data fetching
- **Files**: `src/app/api/valuation/[ticker]/route.ts`, `src/app/api/provision/[ticker]/route.ts`, `src/app/api/cron/daily-update/route.ts`
- **Issue**: Sequential `for...of` loop fetching peer metrics one by one (getKeyMetrics + getEVMetrics per peer)
- **Fix**: `Promise.all(peerCompanies.map(peer => Promise.all([getKeyMetrics(...), getEVMetrics(...)])))`
- **Impact**: 5-15 sequential API calls (~300ms each) → single parallel batch (~600ms total)

### 2. Parallelize valuation upserts
- **Files**: Same 3 files as above
- **Issue**: `for (const model of summary.models) { await upsertValuation(...) }` — sequential DB writes
- **Fix**: `Promise.all(summary.models.map(m => upsertValuation(...)))`
- **Impact**: 3-7 sequential DB writes → single parallel batch

### 3. Parallelize seed FMP API calls
- **File**: `src/lib/data/seed.ts`
- **Issue**: Sequential `await getIncomeStatements()` → `sleep` → `await getBalanceSheets()` → `sleep` → `await getCashFlows()` → `sleep`
- **Fix**: `Promise.all([getIncomeStatements(...), getBalanceSheets(...), getCashFlowStatements(...)])` + single sleep after
- **Impact**: Seed time ~2x faster (3s → 1.5s per ticker)

### 4. Parallelize cron batch price updates
- **File**: `src/app/api/cron/daily-update/route.ts`
- **Issue**: Sequential `await db.from("companies").update(...)` in a loop for each quote
- **Fix**: Batch update with `Promise.all()` or single bulk upsert
- **Impact**: 100+ sequential DB updates → parallel batch

---

## P1 — Reduce Redundant Queries (Medium Impact)

### 5. Eliminate redundant getCompany() in getIndustryPeers()
- **File**: `src/lib/db/queries-company.ts`
- **Issue**: `getIndustryPeers(ticker)` calls `getCompany(ticker)` to get industry, but callers already have company data
- **Fix**: Add `getPeersByIndustry(industry, excludeTicker, limit)` that accepts industry directly
- **Impact**: Saves 1 DB query per valuation request (~50-100ms)

### 6. Parallelize watchlist API DB queries
- **File**: `src/app/api/watchlist/route.ts`
- **Issue**: Two sequential DB queries (companies, then valuations) on GET
- **Fix**: `Promise.all([db.from("companies").select(...), db.from("valuations").select(...)])`
- **Impact**: ~50ms saved per request

### 7. Extract shared MODEL_NAMES constant
- **Files**: `src/components/valuation/model-card.tsx`, `summary-card.tsx`, `model-card-compact.tsx`
- **Issue**: `MODEL_NAMES` record duplicated across 3 component files
- **Fix**: Extract to `src/lib/valuation/model-names.ts`, import in all 3 files
- **Impact**: Maintainability — single source of truth

---

## P2 — Frontend Optimization (Nice-to-have)

### 8. Dynamic import for Recharts components
- **Files**: `src/components/charts/price-value-chart.tsx`, `src/components/valuation/estimate-chart.tsx`, `src/components/valuation/price-targets-summary.tsx`
- **Issue**: Recharts (~80KB minified) loaded in initial bundle even on non-chart pages
- **Fix**: Use `next/dynamic` for chart components with loading skeletons
- **Impact**: ~80KB deferred from initial page load
