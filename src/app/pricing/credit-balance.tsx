"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Coins } from "lucide-react";

export function CreditBalance() {
  const { user, session, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);

  useEffect(() => {
    if (authLoading || !user || !session) return;

    fetch("/api/credits/status", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => setBalance(data))
      .catch(() => {});
  }, [user, session, authLoading]);

  if (!balance || balance.total === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 mb-8 text-sm">
      <Coins className="h-4 w-4 text-brand" />
      <span>
        You have{" "}
        <span className="font-bold text-foreground">{balance.remaining}</span>{" "}
        credit{balance.remaining === 1 ? "" : "s"} remaining
      </span>
      <span className="text-muted-foreground">
        ({balance.used} of {balance.total} used)
      </span>
    </div>
  );
}
