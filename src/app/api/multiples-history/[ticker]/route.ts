// ============================================================
// GET /api/multiples-history/[ticker]
// Compute historical P/E, P/S, P/B from daily prices + financials
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getFinancials, getPriceHistory } from "@/lib/db/queries";
import type { HistoricalMultiplesPoint, FinancialStatement } from "@/types";

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
      getFinancials(upperTicker, "annual", 7),
      getPriceHistory(upperTicker, days),
    ]);

    if (financials.length === 0 || prices.length === 0) {
      return NextResponse.json([]);
    }

    // Sort financials ascending by fiscal year
    const sortedFinancials = [...financials].sort(
      (a, b) => a.fiscal_year - b.fiscal_year
    );

    // For each daily price, find the matching fiscal year's financials
    // and compute P/E, P/S, P/B
    const result: HistoricalMultiplesPoint[] = [];

    for (const price of prices) {
      const priceDate = new Date(price.date);
      const priceYear = priceDate.getFullYear();
      const priceMonth = priceDate.getMonth(); // 0-based

      // Find the most recent annual financial statement available at this date
      // Assume annual reports are available ~3 months after fiscal year end
      // So for a price in March 2024, we use FY2023 data (if available), else FY2022
      const applicableFinancial = findApplicableFinancial(
        sortedFinancials,
        priceYear,
        priceMonth
      );

      if (!applicableFinancial) continue;

      const shares = applicableFinancial.shares_outstanding;
      if (!shares || shares <= 0) continue;

      const marketCap = price.close * shares;

      // P/E
      const eps = applicableFinancial.eps_diluted || applicableFinancial.eps;
      const pe = eps > 0 ? price.close / eps : null;

      // P/S
      const revenue = applicableFinancial.revenue;
      const ps = revenue > 0 ? marketCap / revenue : null;

      // P/B
      const equity = applicableFinancial.total_equity;
      const pb = equity > 0 ? marketCap / equity : null;

      result.push({
        date: price.date,
        pe: pe !== null ? Math.round(pe * 100) / 100 : null,
        ps: ps !== null ? Math.round(ps * 100) / 100 : null,
        pb: pb !== null ? Math.round(pb * 100) / 100 : null,
      });
    }

    // Sample to reduce payload — keep ~250 points max for 5Y data
    const sampled = sampleData(result, 250);

    return NextResponse.json(sampled);
  } catch (error) {
    console.error(`Multiples history error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Find the most recent financial statement that would have been
 * publicly available at the given date.
 * Assume ~3 month lag for annual report publication.
 */
function findApplicableFinancial(
  financials: FinancialStatement[],
  priceYear: number,
  priceMonth: number
): FinancialStatement | null {
  // If we're past Q1 (April+), the previous fiscal year's report is available.
  // If we're in Jan-Mar, use the fiscal year before that.
  const availableFY = priceMonth >= 3 ? priceYear - 1 : priceYear - 2;

  // Find the most recent fiscal year <= availableFY
  let best: FinancialStatement | null = null;
  for (const f of financials) {
    if (f.fiscal_year <= availableFY) {
      if (!best || f.fiscal_year > best.fiscal_year) {
        best = f;
      }
    }
  }
  return best;
}

/**
 * Downsample data to a target number of points, keeping first and last.
 */
function sampleData(
  data: HistoricalMultiplesPoint[],
  maxPoints: number
): HistoricalMultiplesPoint[] {
  if (data.length <= maxPoints) return data;

  const result: HistoricalMultiplesPoint[] = [data[0]];
  const step = (data.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(data[Math.round(i * step)]);
  }
  result.push(data[data.length - 1]);

  return result;
}
