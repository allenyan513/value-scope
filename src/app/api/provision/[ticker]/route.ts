// ============================================================
// POST /api/provision/[ticker]
// Synchronously seed a new ticker and bust ISR cache
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  enqueueDataRequest,
  updateDataRequestStatus,
  getCompany,
  getFinancials,
  getEstimates,
  getLatestPrice,
  getIndustryPeers,
  getPriceHistory,
  upsertValuation,
} from "@/lib/db/queries";
import { seedSingleCompany } from "@/lib/data/seed";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getKeyMetrics } from "@/lib/data/fmp";
import { createServerClient } from "@/lib/db/supabase";
import type { PeerComparison } from "@/types";
import { TICKER_REGEX } from "@/lib/constants";

export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Validate ticker format
  if (!TICKER_REGEX.test(upperTicker)) {
    return NextResponse.json(
      { status: "failed", error: "Invalid ticker format" },
      { status: 400 }
    );
  }

  // Check current status in data_requests
  const db = createServerClient();
  const { data: existing } = await db
    .from("data_requests")
    .select("ticker, status")
    .eq("ticker", upperTicker)
    .single();

  // Already completed — check if company actually has data
  if (existing?.status === "completed") {
    const company = await getCompany(upperTicker);
    if (company) {
      return NextResponse.json({ status: "ready" });
    }
    // Data request marked completed but no company — reset and re-seed
  }

  // Currently being processed by another request
  if (existing?.status === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  try {
    // Enqueue if not already in table, then mark as processing
    await enqueueDataRequest(upperTicker);
    await updateDataRequestStatus(upperTicker, "processing");

    // Seed: fetch profile, financials, estimates, prices from FMP (~3s)
    const result = await seedSingleCompany(upperTicker);

    if (!result.success) {
      await updateDataRequestStatus(upperTicker, "failed", result.error);
      return NextResponse.json(
        { status: "failed", error: result.error },
        { status: 422 }
      );
    }

    // Compute valuation immediately so page has data on refresh
    try {
      const [company, historicals, estimates, riskFreeRate, prices] =
        await Promise.all([
          getCompany(upperTicker),
          getFinancials(upperTicker, "annual", 5),
          getEstimates(upperTicker),
          getTenYearTreasuryYield().catch(() => 0.0425),
          getPriceHistory(upperTicker, 365 * 5),
        ]);

      if (company && historicals.length > 0) {
        const currentPrice =
          (await getLatestPrice(upperTicker)) || company.price || 0;
        const historicalMultiples = computeHistoricalMultiples(
          historicals,
          prices
        );

        // Fetch peer data
        const peers: PeerComparison[] = [];
        const peerCompanies = await getIndustryPeers(upperTicker, 5);
        for (const peer of peerCompanies) {
          try {
            const metrics = await getKeyMetrics(peer.ticker, "annual", 1);
            if (metrics.length > 0) {
              peers.push({
                ticker: peer.ticker,
                name: peer.name,
                market_cap: peer.market_cap,
                trailing_pe: metrics[0].priceToEarningsRatio ?? null,
                forward_pe: null,
                ev_ebitda: null,
                price_to_book: metrics[0].priceToBookRatio ?? null,
                price_to_sales: metrics[0].priceToSalesRatio ?? null,
                revenue_growth: null,
                net_margin: null,
                roe: null,
              });
            }
          } catch {
            // Skip peers with no data
          }
        }

        const summary = computeFullValuation({
          company,
          historicals,
          estimates,
          peers,
          currentPrice,
          riskFreeRate,
          historicalMultiples,
        });

        for (const model of summary.models) {
          await upsertValuation(upperTicker, model);
        }
      }
    } catch (error) {
      // Valuation compute failed — data is still seeded, just no cached valuation
      console.error(`Valuation compute failed for ${upperTicker}:`, error);
    }

    await updateDataRequestStatus(upperTicker, "completed");

    // Bust ISR cache for all pages under /[ticker]
    revalidatePath(`/${upperTicker}`, "layout");

    return NextResponse.json({ status: "ready" });
  } catch (error) {
    console.error(`Provision error for ${upperTicker}:`, error);
    await updateDataRequestStatus(upperTicker, "failed",
      error instanceof Error ? error.message : "Unknown error"
    ).catch(() => {});
    return NextResponse.json(
      { status: "failed", error: "Provisioning failed" },
      { status: 500 }
    );
  }
}
