// ============================================================
// In-memory sliding window rate limiter for MCP endpoint
// ============================================================

import { MCP_RATE_LIMIT_RPM } from "@/lib/constants";

const WINDOW_MS = 60_000; // 1 minute

/** Map of IP → array of request timestamps (within current window) */
const requests = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check if a request from this IP is allowed.
 * Prunes stale entries on each call to prevent memory leaks.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get or create timestamps for this IP, filter to current window
  const timestamps = (requests.get(ip) || []).filter((t) => t > windowStart);

  if (timestamps.length >= MCP_RATE_LIMIT_RPM) {
    requests.set(ip, timestamps);
    return { allowed: false, remaining: 0, limit: MCP_RATE_LIMIT_RPM };
  }

  timestamps.push(now);
  requests.set(ip, timestamps);

  // Periodic cleanup: remove IPs with no recent requests
  if (requests.size > 1000) {
    for (const [key, ts] of requests) {
      if (ts.every((t) => t <= windowStart)) {
        requests.delete(key);
      }
    }
  }

  return {
    allowed: true,
    remaining: MCP_RATE_LIMIT_RPM - timestamps.length,
    limit: MCP_RATE_LIMIT_RPM,
  };
}

/**
 * Extract client IP from request headers (Vercel sets x-forwarded-for).
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Reset all state — for testing only */
export function _resetRateLimiter(): void {
  requests.clear();
}
