// ============================================================
// Cron: Refresh Estimates (Manual / Recovery)
// Refreshes analyst estimates and price target consensus for ALL
// tracked companies. Use ?full=true to trigger.
// Not scheduled — run manually after bulk onboarding or data recovery.
// FMP calls: ~2 per ticker (estimates + price targets)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/supabase";
import { getAnalystEstimates, getPriceTargetConsensus, getFXRateToUSD } from "@/lib/data/fmp";
import { upsertEstimates, upsertPriceTargets } from "@/lib/db/queries";
import { FMP_API_DELAY_MS } from "@/lib/constants";
import { convertEstimateToUSD } from "@/lib/data/fx-convert";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFull = request.nextUrl.searchParams.get("full") === "true";
  if (!isFull) {
    return NextResponse.json(
      { error: "Pass ?full=true to refresh all estimates" },
      { status: 400 }
    );
  }

  const db = createServerClient();

  try {
    // 1. Get all tickers sorted alphabetically (include currency for ADR conversion)
    const { data: companies } = await db
      .from("companies")
      .select("ticker, reporting_currency")
      .order("ticker");

    if (!companies || companies.length === 0) {
      return NextResponse.json({ message: "No companies to update" });
    }

    const tickersToProcess = companies.map((c) => c.ticker);
    const currencyMap = new Map(
      companies.map((c) => [c.ticker, c.reporting_currency || "USD"])
    );

    console.log(
      `[refresh-estimates] Processing ${tickersToProcess.length} companies (full refresh)`
    );

    // 2. Pre-fetch all distinct FX rates needed (one call per currency, not per ticker)
    const distinctCurrencies = [
      ...new Set(
        tickersToProcess
          .map((t) => currencyMap.get(t) || "USD")
          .filter((c) => c !== "USD")
      ),
    ];
    const fxRates = new Map<string, number>([["USD", 1.0]]);
    await Promise.all(
      distinctCurrencies.map(async (currency) => {
        const rate = await getFXRateToUSD(currency).catch(() => 1.0);
        fxRates.set(currency, rate);
      })
    );

    let estimatesRefreshed = 0;
    let priceTargetsRefreshed = 0;
    let errors = 0;

    for (const ticker of tickersToProcess) {
      try {
        // Refresh analyst estimates (convert non-USD to USD using pre-fetched FX rate)
        const fmpEstimates = await getAnalystEstimates(ticker, "annual", 5);
        if (fmpEstimates.length > 0) {
          const currency = currencyMap.get(ticker) || "USD";
          const fxRate = fxRates.get(currency) ?? 1.0;
          await upsertEstimates(
            fmpEstimates.map((e) =>
              convertEstimateToUSD(
                {
                  ticker,
                  period: e.date.split("-")[0],
                  revenue_estimate: e.revenueAvg,
                  eps_estimate: e.epsAvg,
                  revenue_low: e.revenueLow,
                  revenue_high: e.revenueHigh,
                  eps_low: e.epsLow,
                  eps_high: e.epsHigh,
                  number_of_analysts: e.numAnalystsRevenue,
                },
                fxRate
              )
            )
          );
          estimatesRefreshed++;
        }

        await new Promise((r) => setTimeout(r, FMP_API_DELAY_MS));

        // Refresh price target consensus
        const ptConsensus = await getPriceTargetConsensus(ticker);
        if (ptConsensus) {
          await upsertPriceTargets({
            ticker,
            target_high: ptConsensus.targetHigh,
            target_low: ptConsensus.targetLow,
            target_consensus: ptConsensus.targetConsensus,
            target_median: ptConsensus.targetMedian,
            number_of_analysts: 0,
          });
          priceTargetsRefreshed++;
        }

        await new Promise((r) => setTimeout(r, FMP_API_DELAY_MS));
      } catch {
        errors++;
      }
    }

    // Bust ISR cache for processed tickers so pages recompute with new estimates
    for (const ticker of tickersToProcess) {
      revalidatePath(`/${ticker}`, "layout");
    }
    console.log(`[refresh-estimates] Invalidated ISR cache for ${tickersToProcess.length} tickers`);

    console.log(
      `[refresh-estimates] Done: ${estimatesRefreshed} estimates, ${priceTargetsRefreshed} price targets, ${errors} errors`
    );

    return NextResponse.json({
      message: "Estimates refreshed",
      total_companies: tickersToProcess.length,
      estimates_refreshed: estimatesRefreshed,
      price_targets_refreshed: priceTargetsRefreshed,
      errors,
    });
  } catch (error) {
    console.error("[refresh-estimates] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
