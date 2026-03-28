"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { isFreeTicker } from "@/lib/credits";
import { TickerPaywall } from "./ticker-paywall";

interface AccessCheckResult {
  access: boolean;
  reason: "free" | "unlocked" | "login_required" | "credit_required";
  remaining?: number;
}

interface Props {
  ticker: string;
  children: React.ReactNode;
}

/**
 * Client-side access gate for ticker pages.
 *
 * PERFORMANCE DESIGN:
 * - Server renders full content (SEO + ISR)
 * - Client NEVER replaces content with skeleton (no CLS)
 * - Free tickers: zero overhead, renders children immediately
 * - Non-free tickers: renders children first (matches SSR), then overlays
 *   paywall ONLY after confirming user lacks access
 *
 * The "default open, close if needed" approach avoids:
 * 1. CLS (Cumulative Layout Shift) — no skeleton swap
 * 2. LCP regression — server-rendered content stays visible
 * 3. Flash of loading state on free tickers
 */
export function AccessGate({ ticker, children }: Props) {
  const { user, session, loading: authLoading } = useAuth();
  const [serverAccess, setServerAccess] = useState<AccessCheckResult | null>(null);

  // Synchronous: free tickers bypass everything
  const isFree = useMemo(() => isFreeTicker(ticker), [ticker]);

  // Fetch unlock status from server only when logged in + non-free
  useEffect(() => {
    if (isFree || authLoading || !user || !session) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const res = await fetch(`/api/credits/access?ticker=${encodeURIComponent(ticker)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!cancelled) setServerAccess(data as AccessCheckResult);
      } catch {
        if (!cancelled) setServerAccess({ access: false, reason: "login_required" });
      }
    };

    checkAccess();
    return () => { cancelled = true; };
  }, [ticker, user, session, authLoading, isFree]);

  // --- Decide what to show ---

  // Free tickers: always show content, zero overhead
  if (isFree) {
    return <>{children}</>;
  }

  // Auth still loading: show content (matches SSR, no CLS)
  if (authLoading) {
    return <>{children}</>;
  }

  // Not logged in: show paywall immediately
  if (!user) {
    return (
      <PaywallOverlay ticker={ticker} reason="login_required">
        {children}
      </PaywallOverlay>
    );
  }

  // Logged in, waiting for access check: show content (optimistic, no flash)
  if (!serverAccess) {
    return <>{children}</>;
  }

  // Access granted
  if (serverAccess.access) {
    return <>{children}</>;
  }

  // Access denied: overlay paywall on blurred content
  return (
    <PaywallOverlay
      ticker={ticker}
      reason={serverAccess.reason}
      remaining={serverAccess.remaining}
    >
      {children}
    </PaywallOverlay>
  );
}

/** Blurred content with paywall card overlay */
function PaywallOverlay({
  ticker,
  reason,
  remaining,
  children,
}: {
  ticker: string;
  reason: string;
  remaining?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div
        className="blur-[8px] select-none pointer-events-none max-h-[500px] overflow-hidden"
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <TickerPaywall
          ticker={ticker}
          reason={reason}
          remaining={remaining}
        />
      </div>
    </div>
  );
}
