// ============================================================
// Cron: Refresh Estimates
// Rotates through all companies, refreshing analyst estimates
// and price target consensus from FMP in batches.
// Schedule: 5:00 PM ET weekdays
// FMP calls: ~200/day (100 stocks × 2 endpoints)
// Supports ?full=true to refresh ALL stocks (for initial setup)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getAnalystEstimates, getPriceTargetConsensus } from "@/lib/data/fmp";
import { upsertEstimates, upsertPriceTargets } from "@/lib/db/queries";
import { CRON_ESTIMATES_BATCH_SIZE, FMP_API_DELAY_MS } from "@/lib/constants";

export const maxDuration = 300;

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFull = request.nextUrl.searchParams.get("full") === "true";
  const db = createServerClient();

  try {
    // 1. Get all tickers sorted alphabetically
    const { data: companies } = await db
      .from("companies")
      .select("ticker")
      .order("ticker");

    if (!companies || companies.length === 0) {
      return NextResponse.json({ message: "No companies to update" });
    }

    const allTickers = companies.map((c) => c.ticker);

    // 2. Select batch to process
    let tickersToProcess: string[];
    if (isFull) {
      tickersToProcess = allTickers;
    } else {
      const totalBatches = Math.ceil(allTickers.length / CRON_ESTIMATES_BATCH_SIZE);
      const batchIndex = getDayOfYear() % totalBatches;
      const start = batchIndex * CRON_ESTIMATES_BATCH_SIZE;
      tickersToProcess = allTickers.slice(start, start + CRON_ESTIMATES_BATCH_SIZE);
    }

    console.log(
      `[refresh-estimates] Processing ${tickersToProcess.length}/${allTickers.length} companies` +
      (isFull ? " (FULL)" : ` (batch ${getDayOfYear() % Math.ceil(allTickers.length / CRON_ESTIMATES_BATCH_SIZE) + 1})`)
    );

    let estimatesRefreshed = 0;
    let priceTargetsRefreshed = 0;
    let errors = 0;

    for (const ticker of tickersToProcess) {
      try {
        // Refresh analyst estimates
        const fmpEstimates = await getAnalystEstimates(ticker, "annual", 5);
        if (fmpEstimates.length > 0) {
          await upsertEstimates(
            fmpEstimates.map((e) => ({
              ticker,
              period: e.date.split("-")[0],
              revenue_estimate: e.revenueAvg,
              eps_estimate: e.epsAvg,
              revenue_low: e.revenueLow,
              revenue_high: e.revenueHigh,
              eps_low: e.epsLow,
              eps_high: e.epsHigh,
              number_of_analysts: e.numAnalystsRevenue,
            }))
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

    console.log(
      `[refresh-estimates] Done: ${estimatesRefreshed} estimates, ${priceTargetsRefreshed} price targets, ${errors} errors`
    );

    return NextResponse.json({
      message: "Estimates refreshed",
      total_companies: allTickers.length,
      batch_size: tickersToProcess.length,
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
