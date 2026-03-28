// ============================================================
// GET /api/valuation/[ticker]
// Compute valuation for a stock on demand
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCompany, getFinancials, getEstimates, getLatestPrice, getPriceHistory, upsertEstimates, getPeerEVEBITDAMedianFromDB, resolvePeers } from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import type { PeerComparison, AnalystEstimate } from "@/types";
import { getKeyMetrics, getAnalystEstimates, getEVMetrics, getFXRateToUSD } from "@/lib/data/fmp";
import { convertEstimateToUSD } from "@/lib/data/fx-convert";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  try {
    // Fetch fresh data
    const [company, historicals, dbEstimates, riskFreeRate, prices] = await Promise.all([
      getCompany(upperTicker),
      getFinancials(upperTicker, "annual", 5),
      getEstimates(upperTicker),
      getTenYearTreasuryYield(),
      getPriceHistory(upperTicker, 365 * 5),
    ]);

    // Real-time fallback: if no analyst estimates in DB, fetch from FMP and persist
    let estimates: AnalystEstimate[] = dbEstimates;
    if (estimates.length === 0) {
      try {
        const fmpEstimates = await getAnalystEstimates(upperTicker, "annual", 3);
        if (fmpEstimates.length > 0) {
          const currency = company?.reporting_currency || "USD";
          const fxRate = currency !== "USD" ? await getFXRateToUSD(currency) : 1.0;
          await upsertEstimates(
            fmpEstimates.map((e) =>
              convertEstimateToUSD(
                {
                  ticker: upperTicker,
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
          estimates = await getEstimates(upperTicker);
        }
      } catch { /* non-critical: DCF falls back to historical CAGR */ }
    }

    if (!company) {
      return NextResponse.json({ error: `Company ${upperTicker} not found` }, { status: 404 });
    }

    if (historicals.length === 0) {
      return NextResponse.json(
        { error: `No financial data for ${upperTicker}` },
        { status: 404 }
      );
    }

    const currentPrice = (await getLatestPrice(upperTicker)) || company.price;
    if (!currentPrice) {
      return NextResponse.json(
        { error: `No price data for ${upperTicker}` },
        { status: 404 }
      );
    }

    // Get peer data for trading multiples
    const peerCompanies = await resolvePeers(upperTicker, 10);
    const peerResults = await Promise.all(
      peerCompanies.map(async (peer): Promise<PeerComparison | null> => {
        try {
          const [metrics, evMetrics] = await Promise.all([
            getKeyMetrics(peer.ticker, "annual", 1),
            getEVMetrics(peer.ticker, 1),
          ]);
          if (metrics.length > 0) {
            return {
              ticker: peer.ticker,
              name: peer.name,
              market_cap: peer.market_cap,
              trailing_pe: metrics[0].priceToEarningsRatio ?? null,
              forward_pe: null,
              ev_ebitda: evMetrics[0]?.evToEBITDA ?? null,
              forward_ev_ebitda: null,
              price_to_book: metrics[0].priceToBookRatio ?? null,
              price_to_sales: metrics[0].priceToSalesRatio ?? null,
              revenue_growth: null,
              net_margin: null,
              roe: null,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const peers = peerResults.filter((p): p is PeerComparison => p !== null);

    // Compute historical multiples for self-comparison
    const historicalMultiples = computeHistoricalMultiples(historicals, prices);
    const peerEVEBITDAMedian = await getPeerEVEBITDAMedianFromDB(upperTicker).catch(() => null);

    // Compute full valuation
    const summary = computeFullValuation({
      company,
      historicals,
      estimates,
      peers,
      currentPrice,
      riskFreeRate,
      historicalMultiples,
      peerEVEBITDAMedian: peerEVEBITDAMedian ?? undefined,
    });

    // Bust ISR cache so page reflects fresh valuation
    revalidatePath(`/${upperTicker}`, "layout");

    return NextResponse.json(summary);
  } catch (error) {
    console.error(`Valuation error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
