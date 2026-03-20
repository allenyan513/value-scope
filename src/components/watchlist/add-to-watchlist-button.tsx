"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { createAuthBrowserClient } from "@/lib/auth/supabase-auth";
import Link from "next/link";

export function AddToWatchlistButton({ ticker }: { ticker: string }) {
  const { user } = useAuth();
  const [inWatchlist, setInWatchlist] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function check() {
      const supabase = createAuthBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/watchlist", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const items = await res.json();
        setInWatchlist(
          items.some((i: { ticker: string }) => i.ticker === ticker)
        );
      }
    }

    check();
  }, [user, ticker]);

  if (!user) {
    return (
      <Link href="/auth/login">
        <Button variant="outline" size="sm">
          Sign in to watch
        </Button>
      </Link>
    );
  }

  const toggle = async () => {
    setLoading(true);
    const supabase = createAuthBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (inWatchlist) {
      await fetch(`/api/watchlist?ticker=${ticker}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setInWatchlist(false);
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ticker }),
      });
      setInWatchlist(true);
    }
    setLoading(false);
  };

  return (
    <Button
      variant={inWatchlist ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={loading}
    >
      {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
    </Button>
  );
}
