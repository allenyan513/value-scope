/**
 * Rate limiter tests — verifies sliding window behavior,
 * limit enforcement, and cleanup.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIP, _resetRateLimiter } from "../rate-limit";
import { MCP_RATE_LIMIT_RPM } from "@/lib/constants";

describe("Rate Limiter", () => {
  beforeEach(() => {
    _resetRateLimiter();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_RPM - 1);
    expect(result.limit).toBe(MCP_RATE_LIMIT_RPM);
  });

  it("tracks remaining count correctly", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("1.2.3.4");
    }
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_RPM - 6);
  });

  it("blocks requests at the limit", () => {
    for (let i = 0; i < MCP_RATE_LIMIT_RPM; i++) {
      const r = checkRateLimit("1.2.3.4");
      expect(r.allowed).toBe(true);
    }

    const blocked = checkRateLimit("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks IPs independently", () => {
    // Fill up IP A
    for (let i = 0; i < MCP_RATE_LIMIT_RPM; i++) {
      checkRateLimit("1.1.1.1");
    }
    expect(checkRateLimit("1.1.1.1").allowed).toBe(false);

    // IP B should still be allowed
    expect(checkRateLimit("2.2.2.2").allowed).toBe(true);
  });

  it("allows requests again after window expires", () => {
    vi.useFakeTimers();

    // Fill up the limit
    for (let i = 0; i < MCP_RATE_LIMIT_RPM; i++) {
      checkRateLimit("1.2.3.4");
    }
    expect(checkRateLimit("1.2.3.4").allowed).toBe(false);

    // Advance 61 seconds (past the 1-minute window)
    vi.advanceTimersByTime(61_000);

    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_RPM - 1);

    vi.useRealTimers();
  });
});

describe("getClientIP", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIP(req)).toBe("9.8.7.6");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost");
    expect(getClientIP(req)).toBe("unknown");
  });
});
