"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import Link from "next/link";
import { type CreditPackKey } from "@/lib/constants";

interface Props {
  packKey: CreditPackKey;
  label: string;
  highlighted: boolean;
}

export function PricingBuyButton({ packKey, label, highlighted }: Props) {
  const { user, session, loading } = useAuth();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    if (!session) return;
    setPurchasing(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pack: packKey }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to create checkout session");
        setPurchasing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPurchasing(false);
    }
  };

  const baseClass = `w-full ${highlighted ? "bg-brand hover:bg-brand/90 text-brand-foreground" : ""}`;

  if (loading) {
    return (
      <Button variant={highlighted ? "default" : "outline"} className={baseClass} disabled>
        Loading...
      </Button>
    );
  }

  if (!user) {
    return (
      <Link href="/auth/login">
        <Button variant={highlighted ? "default" : "outline"} className={baseClass}>
          Sign in to buy
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Button
        variant={highlighted ? "default" : "outline"}
        className={baseClass}
        onClick={handleBuy}
        disabled={purchasing}
      >
        {purchasing ? "Redirecting..." : `Buy ${label}`}
      </Button>
      {error && <p className="text-xs text-destructive mt-2 text-center">{error}</p>}
    </>
  );
}
