// ============================================================
// Daily Update Cron Job
// Schedule: 6:30 PM ET daily (after market close)
// - Fetches latest prices for all tracked companies
// - Recomputes valuations
// - Stores valuation history snapshots
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getBatchQuotes, getPriceTargetConsensus, getAnalystEstimates } from "@/lib/data/fmp";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getFinancials, getEstimates, getIndustryPeers, upsertValuation, upsertValuationHistory, upsertPriceTargets, upsertEstimates } from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { getKeyMetrics } from "@/lib/data/fmp";
import type { PeerComparison } from "@/types";

export const maxDuration = 300; // 5 min max for Vercel Pro

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const today = new Date().toISOString().split("T")[0];

  try {
    // 1. Get all tracked tickers
    const { data: companies } = await db
      .from("companies")
      .select("ticker")
      .order("ticker");

    if (!companies || companies.length === 0) {
      return NextResponse.json({ message: "No companies to update" });
    }

    const tickers = companies.map((c) => c.ticker);
    console.log(`Updating ${tickers.length} companies...`);

    // 2. Fetch latest quotes in batches
    const quotes = await getBatchQuotes(tickers);
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    // 3. Update daily prices
    const priceRows = quotes.map((q) => ({
      ticker: q.symbol,
      date: today,
      close_price: q.price,
      volume: 0,
    }));

    for (let i = 0; i < priceRows.length; i += 500) {
      await db
        .from("daily_prices")
        .upsert(priceRows.slice(i, i + 500), { onConflict: "ticker,date" });
    }

    // Also update company price
    for (const q of quotes) {
      await db
        .from("companies")
        .update({
          price: q.price,
          market_cap: q.marketCap,
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", q.symbol);
    }

    // 4. Recompute valuations for each company
    const riskFreeRate = await getTenYearTreasuryYield().catch(() => 0.0425);
    let valuationSuccess = 0;
    let valuationErrors = 0;

    for (const ticker of tickers) {
      try {
        let [companyData, historicals, estimates] = await Promise.all([
          db.from("companies").select("*").eq("ticker", ticker).single(),
          getFinancials(ticker, "annual", 7),
          getEstimates(ticker),
        ]);

        if (!companyData.data || historicals.length === 0) continue;

        const company = companyData.data;
        const currentPrice = quoteMap.get(ticker)?.price ?? company.price ?? 0;
        if (currentPrice <= 0) continue;

        // Refresh analyst estimates from FMP
        try {
          const fmpEstimates = await getAnalystEstimates(ticker, "annual", 5);
          if (fmpEstimates.length > 0) {
            await upsertEstimates(
              fmpEstimates.map((e) => ({
                ticker,
                period: e.date.split("-")[0],
                revenue_estimate: e.revenueAvg,
                eps_estimate: e.epsAvg,
                revenue_low: e.revenueLow,
                revenue_high: e.revenueHigh,
                eps_low: e.epsLow,
                eps_high: e.epsHigh,
                number_of_analysts: e.numAnalystsRevenue,
              }))
            );
            // Re-fetch estimates from DB so valuation uses fresh data
            estimates = await getEstimates(ticker);
          }
        } catch { /* non-critical: valuation still works with historical CAGR */ }

        // Fetch peers (limited to avoid rate limits)
        const peerCompanies = await getIndustryPeers(ticker, 8);
        const peers: PeerComparison[] = [];
        for (const peer of peerCompanies.slice(0, 5)) {
          try {
            const metrics = await getKeyMetrics(peer.ticker, "annual", 1);
            if (metrics.length > 0) {
              peers.push({
                ticker: peer.ticker,
                name: peer.name,
                market_cap: peer.market_cap,
                trailing_pe: metrics[0].priceToEarningsRatio ?? null,
                forward_pe: null,
                ps_ratio: metrics[0].priceToSalesRatio ?? null,
                pb_ratio: metrics[0].priceToBookRatio ?? null,
              });
            }
          } catch { /* skip */ }
        }

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
          await upsertValuation(ticker, model);
        }

        // Save valuation history snapshot
        await upsertValuationHistory(
          ticker,
          today,
          currentPrice,
          summary.primary_fair_value
        );

        // Refresh price target consensus
        try {
          const ptConsensus = await getPriceTargetConsensus(ticker);
          if (ptConsensus) {
            await upsertPriceTargets({
              ticker,
              target_high: ptConsensus.targetHigh,
              target_low: ptConsensus.targetLow,
              target_consensus: ptConsensus.targetConsensus,
              target_median: ptConsensus.targetMedian,
              number_of_analysts: 0,
            });
          }
        } catch { /* non-critical */ }

        valuationSuccess++;
      } catch (error) {
        console.error(`Valuation error for ${ticker}:`, error);
        valuationErrors++;
      }
    }

    return NextResponse.json({
      message: "Daily update complete",
      date: today,
      prices_updated: priceRows.length,
      valuations_computed: valuationSuccess,
      valuation_errors: valuationErrors,
    });
  } catch (error) {
    console.error("Daily update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
