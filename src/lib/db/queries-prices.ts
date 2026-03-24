// Database queries — Daily prices

import { createServerClient } from "./supabase";
import { DB_BATCH_CHUNK_SIZE } from "@/lib/constants";
import type { DailyPrice } from "@/types";

const db = () => createServerClient();

export async function getLatestPrice(ticker: string): Promise<number | null> {
  const { data } = await db()
    .from("daily_prices")
    .select("close_price")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  return data?.close_price ?? null;
}

export async function getPriceHistory(
  ticker: string,
  days = 365 * 5
): Promise<DailyPrice[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await db()
    .from("daily_prices")
    .select("ticker, date, close:close_price, volume")
    .eq("ticker", ticker)
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: true });
  return (data ?? []) as unknown as DailyPrice[];
}

export async function upsertDailyPrices(
  rows: Array<{ ticker: string; date: string; close_price: number; volume: number }>
) {
  if (rows.length === 0) return;
  // Batch in chunks to avoid payload limits
  for (let i = 0; i < rows.length; i += DB_BATCH_CHUNK_SIZE) {
    await db()
      .from("daily_prices")
      .upsert(rows.slice(i, i + DB_BATCH_CHUNK_SIZE), { onConflict: "ticker,date" });
  }
}
