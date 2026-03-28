// Database queries — Valuation Snapshots
//
// Pre-computed valuation results stored in `valuation_snapshots` table.
// Populated by nightly batch job (recompute.ts), read by page/API/MCP handlers.

import { createServerClient } from "./supabase";
import type { ValuationSummary, PeerComparison } from "@/types";

const db = () => createServerClient();

export interface ValuationSnapshot {
  ticker: string;
  fair_value: number;
  upside_pct: number;
  verdict: string;
  current_price: number;
  summary: ValuationSummary;
  peers: PeerComparison[];
  computed_at: string;
  updated_at: string;
}

export async function getValuationSnapshot(
  ticker: string
): Promise<ValuationSnapshot | null> {
  const { data } = await db()
    .from("valuation_snapshots")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .single();
  return data as ValuationSnapshot | null;
}

export async function upsertValuationSnapshot(
  row: Omit<ValuationSnapshot, "updated_at">
): Promise<void> {
  await db()
    .from("valuation_snapshots")
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "ticker" }
    );
}
