// Database queries — Valuations

import { createServerClient } from "./supabase";
import type { ValuationResult, ValuationHistoryPoint } from "@/types";

const db = () => createServerClient();

export async function getValuations(
  ticker: string
): Promise<ValuationResult[]> {
  const { data } = await db()
    .from("valuations")
    .select("*")
    .eq("ticker", ticker);
  return (data ?? []).map((d) => ({
    model_type: d.model_type,
    fair_value: d.fair_value,
    upside_percent: d.upside_percent,
    low_estimate: d.low_estimate,
    high_estimate: d.high_estimate,
    assumptions: d.assumptions,
    details: d.details,
    computed_at: d.computed_at,
  })) as ValuationResult[];
}

export async function upsertValuation(
  ticker: string,
  result: ValuationResult
): Promise<void> {
  await db()
    .from("valuations")
    .upsert(
      {
        ticker,
        model_type: result.model_type,
        fair_value: result.fair_value,
        upside_percent: result.upside_percent,
        low_estimate: result.low_estimate,
        high_estimate: result.high_estimate,
        assumptions: result.assumptions,
        details: result.details,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "ticker,model_type" }
    );
}

export async function getValuationHistory(
  ticker: string,
  days = 365 * 5
): Promise<ValuationHistoryPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await db()
    .from("valuation_history")
    .select("date, close_price, intrinsic_value")
    .eq("ticker", ticker)
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: true });
  return (data ?? []) as ValuationHistoryPoint[];
}

export async function upsertValuationHistory(
  ticker: string,
  date: string,
  closePrice: number,
  intrinsicValue: number
): Promise<void> {
  await db()
    .from("valuation_history")
    .upsert(
      {
        ticker,
        date,
        close_price: closePrice,
        intrinsic_value: intrinsicValue,
      },
      { onConflict: "ticker,date" }
    );
}
