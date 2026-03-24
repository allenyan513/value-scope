"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticker: string;
}

type ProvisionStatus = "idle" | "provisioning" | "ready" | "failed" | "timeout";

export function TickerPending({ ticker }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ProvisionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const startProvisioning = useCallback(async () => {
    setStatus("provisioning");
    setError(null);
    setElapsed(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const maxAttempts = 10; // 10 polls × 3s = 30s max
    let attempts = 0;

    try {
      while (attempts < maxAttempts) {
        const res = await fetch(`/api/provision/${ticker}`, { method: "POST" });
        const data = await res.json();

        if (data.status === "ready") {
          clearInterval(timer);
          setStatus("ready");
          // Small delay to let ISR cache invalidation propagate
          await new Promise((r) => setTimeout(r, 500));
          router.refresh();
          return;
        }

        if (data.status === "failed") {
          clearInterval(timer);
          setStatus("failed");
          setError(data.error || "Failed to fetch data for this ticker");
          return;
        }

        // status === "processing" — wait and poll again
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
      }

      clearInterval(timer);
      setStatus("timeout");
    } catch {
      clearInterval(timer);
      setStatus("failed");
      setError("Network error — please try again");
    }
  }, [ticker, router]);

  useEffect(() => {
    startProvisioning();
  }, [startProvisioning]);

  return (
    <div className="py-16 text-center">
      {status === "provisioning" && (
        <>
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mb-4" />
          <h2 className="text-xl font-bold mb-3">{ticker}</h2>
          <p className="text-muted-foreground mb-2">
            Fetching financial data...
          </p>
          <p className="text-sm text-muted-foreground">
            This usually takes about 5 seconds ({elapsed}s)
          </p>
        </>
      )}

      {status === "ready" && (
        <>
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-xl font-bold mb-3">{ticker}</h2>
          <p className="text-muted-foreground">Loading valuation data...</p>
        </>
      )}

      {status === "failed" && (
        <>
          <div className="text-4xl mb-4">✗</div>
          <h2 className="text-xl font-bold mb-3">{ticker}</h2>
          <p className="text-muted-foreground mb-2">
            {error || "Could not find data for this ticker."}
          </p>
          <button
            onClick={startProvisioning}
            className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            Retry
          </button>
        </>
      )}

      {status === "timeout" && (
        <>
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-xl font-bold mb-3">{ticker}</h2>
          <p className="text-muted-foreground mb-2">
            Taking longer than expected. Data may be loading in the background.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            Refresh Page
          </button>
        </>
      )}
    </div>
  );
}
