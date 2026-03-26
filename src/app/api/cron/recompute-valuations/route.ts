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
  computePeerMetricsFromDB,
  upsertValuation,
  upsertValuationHistory,
  getPendingDataRequests,
  updateDataRequestStatus,
} from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { CRON_COMPANY_DELAY_MS } from "@/lib/constants";
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
        const [historicals, estimates, peers] = await Promise.all([
          getFinancials(company.ticker, "annual", 5),
          getEstimates(company.ticker),
          computePeerMetricsFromDB(company.ticker, 10),
        ]);

        if (historicals.length === 0) continue;

        const currentPrice = company.price || 0;
        if (currentPrice <= 0) continue;

        const summary = computeFullValuation({
          company,
          historicals,
          estimates,
          peers,
          currentPrice,
          riskFreeRate,
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

    // Process pending data requests (new tickers users have requested)
    let provisioned = 0;
    let provisionErrors = 0;
    try {
      const { seedSingleCompany } = await import("@/lib/data/seed");
      const pendingTickers = await getPendingDataRequests(10);
      for (const pendingTicker of pendingTickers) {
        await updateDataRequestStatus(pendingTicker, "processing");
        const result = await seedSingleCompany(pendingTicker);
        if (result.success) {
          await updateDataRequestStatus(pendingTicker, "completed");
          revalidatePath(`/${pendingTicker}`, "layout");
          provisioned++;
        } else {
          await updateDataRequestStatus(pendingTicker, "failed", result.error);
          provisionErrors++;
        }
        if (pendingTickers.indexOf(pendingTicker) < pendingTickers.length - 1) {
          await new Promise((r) => setTimeout(r, CRON_COMPANY_DELAY_MS));
        }
      }
    } catch (error) {
      console.error("[recompute-valuations] Data request processing error:", error);
    }

    console.log(
      `[recompute-valuations] Done: ${success} success, ${errors} errors, ${provisioned} provisioned`
    );

    return NextResponse.json({
      message: "Valuations recomputed",
      date: today,
      valuations_computed: success,
      valuation_errors: errors,
      new_tickers_provisioned: provisioned,
      new_tickers_failed: provisionErrors,
    });
  } catch (error) {
    console.error("[recompute-valuations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
