// ============================================================
// GET /api/multiples-history/[ticker]
// Compute historical P/E, P/S, P/B from daily prices + financials
// Returns enhanced response with stats & valuations
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getFinancials, getPriceHistory } from "@/lib/db/queries";
import {
  computeHistoricalMultiples,
  computeMultiplesStats,
  computeHistoricalValuations,
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
        stats: { pe: null, ps: null, pb: null },
        valuations: [],
      });
    }

    const fullData = computeHistoricalMultiples(financials, prices);
    const stats = computeMultiplesStats(fullData);

    // Get latest financial for valuation computation
    const sortedFinancials = [...financials].sort(
      (a, b) => b.fiscal_year - a.fiscal_year
    );
    const latest = sortedFinancials[0];
    const shares = latest.shares_outstanding;

    const valuations = shares
      ? computeHistoricalValuations(stats, latest, shares)
      : [];

    const sampled = sampleData(fullData, 250);

    return NextResponse.json({
      history: sampled,
      stats,
      valuations,
    });
  } catch (error) {
    console.error(`Multiples history error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
