// ============================================================
// GET /api/multiples-history/[ticker]
// Compute historical P/E, EV/EBITDA from daily prices + financials
// Returns enhanced response with stats
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getFinancials, getPriceHistory } from "@/lib/db/queries";
import {
  computeHistoricalMultiples,
  computeMultiplesStats,
  sampleData,
} from "@/lib/valuation/historical-multiples";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 365 * 5;

  try {
    const [financials, prices] = await Promise.all([
      getFinancials(upperTicker, "annual", 5),
      getPriceHistory(upperTicker, days),
    ]);

    if (financials.length === 0 || prices.length === 0) {
      return NextResponse.json({
        history: [],
        stats: { pe: null, ev_ebitda: null },
      });
    }

    const fullData = computeHistoricalMultiples(financials, prices);
    const stats = computeMultiplesStats(fullData);
    const sampled = sampleData(fullData, 250);

    return NextResponse.json({
      history: sampled,
      stats,
    });
  } catch (error) {
    console.error(`Multiples history error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
