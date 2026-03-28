// ============================================================
// Centralized Constants
// All magic numbers and thresholds in one place.
// ============================================================

// --- Verdict & Display ---
/** Upside % threshold: above = undervalued, below negative = overvalued */
export const VERDICT_THRESHOLD = 15;

// --- ISR & Caching ---
// Note: ISR `revalidate` in page exports must be a literal number (Next.js build-time constraint).
// Use `ISR_REVALIDATE_SECONDS` only in runtime code (e.g., fetch options), not in page segment config.
export const ISR_REVALIDATE_SECONDS = 3600;

// --- History & Data ---
/** Default number of days for price/valuation history (5 years) */
export const DEFAULT_HISTORY_DAYS = 1825;
/** Max data points before downsampling history response */
export const HISTORY_SAMPLE_MAX = 500;
/** Max EMA span for smoothing intrinsic value history */
export const MAX_EMA_SPAN = 120;

// --- API Rate Limiting ---
/** Delay between FMP API calls in seed operations (ms) */
export const FMP_API_DELAY_MS = 300;
/** Delay between companies in cron batch processing (ms) */
export const CRON_COMPANY_DELAY_MS = 3000;

// --- MCP Rate Limiting ---
/** Max MCP requests per IP per minute (sliding window) */
export const MCP_RATE_LIMIT_RPM = 30;

// --- Database ---
/** Max rows per upsert batch to avoid payload limits */
export const DB_BATCH_CHUNK_SIZE = 1000;

// --- Valuation Model Defaults ---
/** Revenue growth rate bounds for DCF projections */
export const MIN_GROWTH_RATE = -0.1;
export const MAX_GROWTH_RATE = 0.3;
/** Minimum historical data points for self-comparison (below = use peer fallback) */
export const MIN_HISTORY_POINTS = 100;
/** P/E ratio upper bound filter (exclude outliers) */
export const MAX_PE_RATIO = 200;

// --- Ticker Validation ---
/** Matches standard tickers (AAPL) and hyphenated share classes (BRK-B, BF-B) */
export const TICKER_REGEX = /^[A-Z]{1,5}(-[A-Z]{1,2})?$/;

// --- Cron ---
/** Number of stocks to refresh estimates for per cron run (rotates through all).
 *  At 2 FMP calls × 300ms delay = 600ms/ticker, 250 tickers ≈ 150s — well within 300s Vercel limit. */
export const CRON_ESTIMATES_BATCH_SIZE = 250;
/** Number of companies to recompute valuations for in parallel.
 *  10 concurrent × ~4 DB queries each = 40 peak connections — conservative for Supabase connection pool. */
export const RECOMPUTE_CONCURRENCY = 10;

// --- Valuation Snapshots ---
/** Max age for valuation snapshots before falling back to live compute (25h to cover daily cycle + buffer) */
export const SNAPSHOT_MAX_AGE_MS = 25 * 60 * 60 * 1000;

// --- Content Limits ---
/** Max characters for company description stored in DB */
export const DESCRIPTION_MAX_LENGTH = 1000;
