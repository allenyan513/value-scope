// ============================================================
// Cron: Recompute Valuations
// Batch-computes all 9 valuation models for every company and
// persists results to `valuation_snapshots` table.
// Schedule: Nightly after update-prices (5:30 PM ET weekdays)
// FMP calls: ZERO — all inputs read from DB.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { recomputeAllValuations } from "@/lib/data/recompute";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await recomputeAllValuations();

    // Fail the cron if error rate is too high (>20%)
    if (result.total > 0 && result.errors / result.total > 0.2) {
      return NextResponse.json(
        { error: "High error rate", ...result },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recompute-valuations] Fatal error:", error);
    return NextResponse.json(
      { error: "Recompute failed", message: String(error) },
      { status: 500 }
    );
  }
}
