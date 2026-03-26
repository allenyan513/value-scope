// ============================================================
// Shared Formatting Utilities
// ============================================================

import { VERDICT_THRESHOLD } from "./constants";

interface FormatLargeNumberOptions {
  prefix?: string;   // Default "$"
  decimals?: number;  // Default 1 for B/T, 1 for M
  includeK?: boolean; // Default false
}

/** Format a number with T/B/M/K abbreviations (e.g., $1.2T, $1.2B, $1.2M) */
export function formatLargeNumber(n: number, opts?: FormatLargeNumberOptions): string {
  const { prefix = "$", decimals = 1, includeK = false } = opts ?? {};
  if (Math.abs(n) >= 1e12) return `${prefix}${(n / 1e12).toFixed(decimals)}T`;
  if (Math.abs(n) >= 1e9) return `${prefix}${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${prefix}${(n / 1e6).toFixed(decimals)}M`;
  if (includeK && Math.abs(n) >= 1e3) return `${prefix}${(n / 1e3).toFixed(decimals)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

/** Format a number as locale-aware USD currency (e.g., $1,234.56) */
export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a number in millions (e.g., 125000000 → "125,000") */
export function formatMillions(n: number): string {
  const inMillions = n / 1e6;
  return inMillions.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Return CSS color class based on upside percentage */
export function getUpsideColor(upside: number): string {
  if (upside > VERDICT_THRESHOLD) return "text-green-400";
  if (upside < -VERDICT_THRESHOLD) return "text-red-400";
  return "text-foreground";
}

/** Convert a Date to YYYY-MM-DD string */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
