// ============================================================
// Cron: Update Prices
// Fetches latest quotes for all tracked companies in batch.
// Schedule: 4:30 PM ET weekdays (after market close)
// FMP calls: ~10 (500 stocks) or ~160 (8000 stocks)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getBatchQuotes } from "@/lib/data/fmp";
import { toDateString } from "@/lib/format";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const today = toDateString(new Date());

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
    console.log(`[update-prices] Fetching quotes for ${tickers.length} companies...`);

    // 2. Fetch latest quotes in batches (50 per FMP call)
    const quotes = await getBatchQuotes(tickers);

    // 3. Upsert daily prices in chunks
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

    // 4. Update company price and market_cap
    const updates = quotes.map((q) =>
      db
        .from("companies")
        .update({
          price: q.price,
          market_cap: q.marketCap,
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", q.symbol)
    );

    // Run updates in parallel batches of 50
    for (let i = 0; i < updates.length; i += 50) {
      await Promise.all(updates.slice(i, i + 50));
    }

    console.log(`[update-prices] Updated ${quotes.length} prices`);

    return NextResponse.json({
      message: "Prices updated",
      date: today,
      prices_updated: quotes.length,
    });
  } catch (error) {
    console.error("[update-prices] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
