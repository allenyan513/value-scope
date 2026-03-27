// ============================================================
// GET /api/valuation/[ticker]
// Compute or return cached valuation for a stock
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCompany, getFinancials, getEstimates, getLatestPrice, getValuations, getPeersByIndustry, getPriceHistory, upsertValuation, upsertEstimates, getPeerEVEBITDAMedianFromDB } from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import type { PeerComparison, ValuationSummary, AnalystEstimate } from "@/types";
import { getKeyMetrics, getAnalystEstimates, getEVMetrics, getFXRateToUSD } from "@/lib/data/fmp";
import { convertEstimateToUSD } from "@/lib/data/fx-convert";
import { VERDICT_THRESHOLD } from "@/lib/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  try {
    // Check if we have a recent cached valuation (less than 1 hour old)
    const cached = await getValuations(upperTicker);
    if (cached.length > 0) {
      const latestComputed = new Date(cached[0].computed_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

      if (latestComputed > hourAgo && !forceRefresh) {
        // Return cached results
        const company = await getCompany(upperTicker);
        const price = await getLatestPrice(upperTicker);
        if (company && price) {
          const primaryModel = cached.find(
            (m) => m.model_type === "dcf_growth_exit_5y"
          );
          const primaryFairValue = primaryModel?.fair_value ?? 0;
          const primaryUpside = primaryModel?.upside_percent ?? 0;
          let verdict: "undervalued" | "fairly_valued" | "overvalued";
          if (primaryUpside > VERDICT_THRESHOLD) verdict = "undervalued";
          else if (primaryUpside < -VERDICT_THRESHOLD) verdict = "overvalued";
          else verdict = "fairly_valued";

          return NextResponse.json({
            ticker: upperTicker,
            company_name: company.name,
            current_price: price,
            primary_fair_value: primaryFairValue,
            primary_upside: primaryUpside,
            models: cached,
            verdict,
            computed_at: cached[0].computed_at,
            cached: true,
          });
        }
      }
    }

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

    // Get peer data for trading multiples (parallel fetch, no redundant getCompany)
    const peerCompanies = await getPeersByIndustry(company.industry, upperTicker, 15);
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
    const [historicalMultiples, peerEVEBITDAMedian] = await Promise.all([
      Promise.resolve(computeHistoricalMultiples(historicals, prices)),
      getPeerEVEBITDAMedianFromDB(upperTicker).catch(() => null),
    ]);

    // Compute full valuation
    const summary: ValuationSummary = computeFullValuation({
      company,
      historicals,
      estimates,
      peers,
      currentPrice,
      riskFreeRate,
      historicalMultiples,
      peerEVEBITDAMedian: peerEVEBITDAMedian ?? undefined,
    });

    // Cache results (parallel upserts)
    await Promise.all(summary.models.map((model) => upsertValuation(upperTicker, model)));

    // Bust ISR cache so page reflects fresh valuation
    revalidatePath(`/${upperTicker}`, "layout");

    return NextResponse.json({ ...summary, cached: false });
  } catch (error) {
    console.error(`Valuation error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
