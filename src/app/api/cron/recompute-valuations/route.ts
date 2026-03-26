// ============================================================
// Cron: Recompute Valuations
// DB-only valuation recompute for ALL tracked companies.
// Uses computePeerMetricsFromDB() — ZERO FMP calls.
// Schedule: 5:30 PM ET weekdays (after prices + estimates updated)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/supabase";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import {
  getFinancials,
  getEstimates,
  getPriceHistory,
  computePeerMetricsFromDB,
  upsertValuation,
  upsertValuationHistory,
} from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { toDateString } from "@/lib/format";
import type { Company } from "@/types";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const today = toDateString(new Date());

  try {
    // 1. Get all companies with their data
    const { data: companies } = await db
      .from("companies")
      .select("*")
      .order("ticker");

    if (!companies || companies.length === 0) {
      return NextResponse.json({ message: "No companies to recompute" });
    }

    console.log(`[recompute-valuations] Processing ${companies.length} companies...`);

    const riskFreeRate = await getTenYearTreasuryYield().catch(() => 0.0425);
    let success = 0;
    let errors = 0;

    for (const company of companies as Company[]) {
      try {
        // All data from DB — no FMP calls
        const [historicals, estimates, peers, prices] = await Promise.all([
          getFinancials(company.ticker, "annual", 5),
          getEstimates(company.ticker),
          computePeerMetricsFromDB(company.ticker, 10),
          getPriceHistory(company.ticker, 365 * 5),
        ]);

        if (historicals.length === 0) continue;

        const currentPrice = company.price || 0;
        if (currentPrice <= 0) continue;

        const historicalMultiples = computeHistoricalMultiples(historicals, prices);

        const summary = computeFullValuation({
          company,
          historicals,
          estimates,
          peers,
          currentPrice,
          riskFreeRate,
          historicalMultiples,
        });

        // Save each model result
        for (const model of summary.models) {
          await upsertValuation(company.ticker, model);
        }

        // Save valuation history snapshot
        await upsertValuationHistory(
          company.ticker,
          today,
          currentPrice,
          summary.primary_fair_value
        );

        success++;

        // Bust ISR cache
        revalidatePath(`/${company.ticker}`, "layout");
      } catch (error) {
        console.error(`[recompute-valuations] Error for ${company.ticker}:`, error);
        errors++;
      }
    }

    console.log(
      `[recompute-valuations] Done: ${success} success, ${errors} errors`
    );

    return NextResponse.json({
      message: "Valuations recomputed",
      date: today,
      valuations_computed: success,
      valuation_errors: errors,
    });
  } catch (error) {
    console.error("[recompute-valuations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
