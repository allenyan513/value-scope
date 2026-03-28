"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { Lock, Coins, LogIn } from "lucide-react";

interface Props {
  ticker: string;
  reason: "login_required" | "credit_required" | string;
  remaining?: number;
}

/**
 * Paywall card shown when user doesn't have access to a ticker.
 * Two states:
 * - Not logged in: "Sign in to unlock"
 * - Logged in, no credit: "Unlock with 1 Credit" / "Buy Credits"
 */
export function TickerPaywall({ ticker, reason, remaining }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCredits = typeof remaining === "number" && remaining > 0;

  const handleUnlock = async () => {
    if (!session) return;
    setUnlocking(true);
    setError(null);

    try {
      const res = await fetch("/api/credits/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticker }),
      });

      if (res.ok) {
        // Refresh the page to re-check access
        router.refresh();
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to unlock");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="bg-card border rounded-xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
      <div className="flex justify-center">
        <div className="rounded-full bg-muted p-3">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
      </div>

      <h3 className="text-xl font-bold">Unlock {ticker}</h3>
      <p className="text-sm text-muted-foreground">
        Get the full valuation analysis for {ticker} — including DCF models,
        trading multiples, PEG ratio, and more.
      </p>

      {reason === "login_required" ? (
        <>
          <Link href="/auth/login">
            <Button className="w-full" size="lg">
              <LogIn className="h-4 w-4 mr-2" />
              Sign in to unlock
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            New user?{" "}
            <Link href="/auth/signup" className="underline hover:text-foreground">
              Create a free account
            </Link>
          </p>
        </>
      ) : (
        <>
          {hasCredits ? (
            <Button
              className="w-full"
              size="lg"
              onClick={handleUnlock}
              disabled={unlocking}
            >
              <Coins className="h-4 w-4 mr-2" />
              {unlocking ? "Unlocking..." : "Unlock · 1 Credit"}
            </Button>
          ) : (
            <Link href="/pricing">
              <Button className="w-full" size="lg">
                <Coins className="h-4 w-4 mr-2" />
                Buy Credits
              </Button>
            </Link>
          )}

          {typeof remaining === "number" && (
            <p className="text-xs text-muted-foreground">
              {remaining > 0
                ? `You have ${remaining} credit${remaining === 1 ? "" : "s"} remaining`
                : "No credits remaining"}
              {" · "}
              <Link href="/pricing" className="underline hover:text-foreground">
                Buy more
              </Link>
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
