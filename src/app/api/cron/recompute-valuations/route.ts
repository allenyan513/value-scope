// ============================================================
// Cron: Recompute Valuations
// DB-only valuation recompute for ALL tracked companies.
// Uses recomputeAllValuations() — ZERO FMP calls.
// Schedule: 5:30 PM ET weekdays (after prices + estimates updated)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/supabase";
import { recomputeAllValuations } from "@/lib/data/recompute";
import { refreshAllSectorBetas } from "@/lib/data/sector-beta";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Refresh sector betas before recomputing valuations
    await refreshAllSectorBetas();
    const result = await recomputeAllValuations();

    // Bust ISR cache for all tickers
    const db = createServerClient();
    const { data: companies } = await db.from("companies").select("ticker");
    for (const c of companies ?? []) {
      revalidatePath(`/${c.ticker}`, "layout");
    }

    return NextResponse.json({
      message: "Valuations recomputed",
      ...result,
    });
  } catch (error) {
    console.error("[recompute-valuations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
