"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WatchlistItem } from "@/types";
import { createAuthBrowserClient } from "@/lib/auth/supabase-auth";

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    async function fetchWatchlist() {
      const supabase = createAuthBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/watchlist", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        setItems(await res.json());
      }
      setLoading(false);
    }

    fetchWatchlist();
  }, [user, authLoading]);

  // Derive loading state without setState in effect
  const isLoading = authLoading || (loading && !!user);

  const handleRemove = async (ticker: string) => {
    const supabase = createAuthBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    await fetch(`/api/watchlist?ticker=${ticker}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Watchlist</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to save stocks to your watchlist and track valuations.
        </p>
        <Link href="/auth/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-2xl font-bold mb-8">My Watchlist</h1>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-4">Your watchlist is empty.</p>
          <Link href="/">
            <Button variant="outline">Search for stocks</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isUp = item.upside_percent > 0;
            return (
              <div
                key={item.ticker}
                className="flex items-center justify-between rounded-lg border p-4 hover:shadow-sm transition-shadow"
              >
                <Link
                  href={`/${item.ticker}`}
                  className="flex-1 flex items-center gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono">
                        {item.ticker}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {item.company_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mt-1">
                      <span>
                        Price: ${item.current_price.toFixed(2)}
                      </span>
                      {item.fair_value > 0 && (
                        <>
                          <span>
                            Fair Value: ${item.fair_value.toFixed(2)}
                          </span>
                          <Badge
                            variant={isUp ? "default" : "destructive"}
                          >
                            {isUp ? "+" : ""}
                            {item.upside_percent.toFixed(1)}%
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(item.ticker)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
