// ============================================================
// Cron: Refresh After Earnings (Event-Driven)
//
// Checks FMP earnings calendar for companies that reported today
// or yesterday, then refreshes their financials, estimates,
// profile, and price targets.
//
// On no-earnings days, falls back to a small rotating batch.
//
// Schedule: 7:00 PM ET weekdays (after market close)
// FMP calls: ~7 per ticker × ~5-20 tickers = ~35-140/day
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/supabase";
import { getEarningsCalendarByDateRange } from "@/lib/data/fmp";
import { refreshFinancialsForTicker } from "@/lib/data/refresh-financials";
import { refreshAllSectorBetas } from "@/lib/data/sector-beta";
import { recomputeValuationsForTickers } from "@/lib/data/recompute";
import { CRON_EARNINGS_FALLBACK_BATCH, FMP_API_DELAY_MS } from "@/lib/constants";
import { toDateString } from "@/lib/format";

export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fallbackBatch = parseInt(
    request.nextUrl.searchParams.get("fallback_batch") ?? String(CRON_EARNINGS_FALLBACK_BATCH),
    10
  );

  const db = createServerClient();

  try {
    // 1. Get our tracked tickers + currency info
    const { data: companies } = await db
      .from("companies")
      .select("ticker, reporting_currency")
      .order("ticker");

    if (!companies || companies.length === 0) {
      return NextResponse.json({ message: "No companies tracked" });
    }

    const trackedTickers = new Set(companies.map((c) => c.ticker));
    const currencyMap = new Map(
      companies.map((c) => [c.ticker, c.reporting_currency || "USD"])
    );

    // 2. Query FMP earnings calendar for yesterday + today
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = toDateString(yesterday);
    const toDate = toDateString(today);

    console.log(`[refresh-after-earnings] Checking earnings calendar ${fromDate} → ${toDate}`);

    const earningsEntries = await getEarningsCalendarByDateRange(fromDate, toDate);

    // 3. Filter to tickers we track
    const earningsTickers = earningsEntries
      .map((e) => e.symbol?.toUpperCase())
      .filter((t): t is string => !!t && trackedTickers.has(t));

    const uniqueTickers = [...new Set(earningsTickers)];

    // 4. If no earnings today, use fallback rotating batch
    let tickersToRefresh: string[];
    let mode: "earnings" | "fallback";

    if (uniqueTickers.length > 0) {
      tickersToRefresh = uniqueTickers;
      mode = "earnings";
      console.log(
        `[refresh-after-earnings] Found ${tickersToRefresh.length} tickers with earnings: ${tickersToRefresh.join(", ")}`
      );
    } else {
      // Fallback: rotate through all tickers on no-earnings days
      const allTickers = companies.map((c) => c.ticker);
      const batchIndex = getDayOfYear() % Math.ceil(allTickers.length / fallbackBatch);
      const start = batchIndex * fallbackBatch;
      tickersToRefresh = allTickers.slice(start, start + fallbackBatch);
      mode = "fallback";
      console.log(
        `[refresh-after-earnings] No earnings today. Fallback batch ${batchIndex + 1}: ${tickersToRefresh.length} tickers`
      );
    }

    // 5. Refresh each ticker's financials
    let success = 0;
    let errors = 0;

    for (const ticker of tickersToRefresh) {
      try {
        const currency = currencyMap.get(ticker) || "USD";
        const result = await refreshFinancialsForTicker(ticker, currency);
        console.log(
          `[refresh-after-earnings] ${ticker}: ${result.financials} financials, ${result.estimates} estimates, profile=${result.profile}`
        );
        success++;
      } catch (error) {
        console.error(`[refresh-after-earnings] Error for ${ticker}:`, error);
        errors++;
      }
      await sleep(FMP_API_DELAY_MS);
    }

    // 6. Refresh sector betas (company beta/debt may have changed)
    if (success > 0) {
      await refreshAllSectorBetas().catch((err) =>
        console.error("[refresh-after-earnings] Sector beta refresh error:", err)
      );
    }

    // 7. Recompute valuations for affected tickers + their peers (DB-only)
    let recomputeResult = null;
    if (success > 0) {
      console.log("[refresh-after-earnings] Recomputing valuations (targeted)...");
      recomputeResult = await recomputeValuationsForTickers(tickersToRefresh);
    }

    // 8. Bust ISR cache for refreshed tickers
    for (const ticker of tickersToRefresh) {
      revalidatePath(`/${ticker}`, "layout");
    }

    console.log(
      `[refresh-after-earnings] Done: ${success} success, ${errors} errors (mode: ${mode})`
    );

    return NextResponse.json({
      mode,
      earnings_tickers: mode === "earnings" ? tickersToRefresh : [],
      fallback_batch_size: mode === "fallback" ? tickersToRefresh.length : 0,
      success,
      errors,
      recompute: recomputeResult,
    });
  } catch (error) {
    console.error("[refresh-after-earnings] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
