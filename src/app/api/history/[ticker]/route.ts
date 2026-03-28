// GET /api/history/[ticker]?days=1825
// Returns price history with synthetic EMA intrinsic value for chart
import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/db/queries";
import { getHistoricalPrices } from "@/lib/data/fmp";
import { DEFAULT_HISTORY_DAYS, MAX_EMA_SPAN, HISTORY_SAMPLE_MAX } from "@/lib/constants";
import { toDateString } from "@/lib/format";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const days = parseInt(request.nextUrl.searchParams.get("days") || String(DEFAULT_HISTORY_DAYS));

  // Try daily_prices table first
  let closePrices: { date: string; close: number }[] = [];
  const dbPrices = await getPriceHistory(upperTicker, days);
  if (dbPrices.length > 0) {
    closePrices = dbPrices.map((p) => ({ date: p.date, close: p.close }));
  }

  // Fallback: fetch from FMP API directly
  if (closePrices.length === 0) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = toDateString(fromDate);
    const to = toDateString(new Date());

    try {
      const fmpPrices = await getHistoricalPrices(upperTicker, from, to);
      // FMP returns newest first, we need ascending
      closePrices = fmpPrices
        .map((p) => ({ date: p.date, close: p.close }))
        .reverse();
    } catch {
      // FMP unavailable
    }
  }

  if (closePrices.length === 0) {
    return NextResponse.json([]);
  }

  // Generate synthetic intrinsic value as a smoothed trend line (EMA)
  const prices = closePrices.map((p) => p.close);
  const emaSpan = Math.min(MAX_EMA_SPAN, Math.floor(prices.length / 3));
  const alpha = 2 / (emaSpan + 1);

  let ema = prices[0];
  const emaValues: number[] = [];
  for (const price of prices) {
    ema = alpha * price + (1 - alpha) * ema;
    emaValues.push(ema);
  }

  // Discount factor: intrinsic value typically trails market price
  const lastEma = emaValues[emaValues.length - 1];
  const lastPrice = prices[prices.length - 1];
  const discountFactor =
    lastPrice > 0 ? Math.min(lastEma / lastPrice, 0.95) : 0.7;

  const syntheticHistory = closePrices.map((p, i) => ({
    date: p.date,
    close_price: p.close,
    intrinsic_value: Math.round(emaValues[i] * discountFactor * 100) / 100,
  }));

  // Sample to ~500 points max to keep response small
  if (syntheticHistory.length > HISTORY_SAMPLE_MAX) {
    const step = Math.ceil(syntheticHistory.length / HISTORY_SAMPLE_MAX);
    const sampled = syntheticHistory.filter((_, i) => i % step === 0);
    // Always include last point
    if (sampled[sampled.length - 1] !== syntheticHistory[syntheticHistory.length - 1]) {
      sampled.push(syntheticHistory[syntheticHistory.length - 1]);
    }
    return NextResponse.json(sampled);
  }

  return NextResponse.json(syntheticHistory);
}
