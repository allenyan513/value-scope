// ============================================================
// Centralized Constants
// All magic numbers and thresholds in one place.
// ============================================================

// --- Verdict & Display ---
/** Upside % threshold: above = undervalued, below negative = overvalued */
export const VERDICT_THRESHOLD = 15;

// --- Consensus Weighting ---
/** Outlier penalty: deviation from median beyond this triggers half-weight */
export const OUTLIER_HALF_THRESHOLD = 0.50;
/** Outlier penalty: deviation from median beyond this triggers quarter-weight */
export const OUTLIER_QUARTER_THRESHOLD = 1.00;

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
/** P/B ratio upper bound filter */
export const MAX_PB_RATIO = 50;
/** P/S ratio upper bound filter */
export const MAX_PS_RATIO = 100;
/** P/FCF ratio upper bound filter */
export const MAX_PFCF_RATIO = 200;

// --- Content Limits ---
/** Max characters for company description stored in DB */
export const DESCRIPTION_MAX_LENGTH = 1000;
