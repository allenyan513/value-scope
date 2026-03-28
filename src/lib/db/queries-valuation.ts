// Database queries — Valuation Snapshots
//
// Pre-computed valuation results stored in `valuation_snapshots` table.
// Populated by nightly batch job (recompute.ts), read by page/API/MCP handlers.

import { createServerClient } from "./supabase";
import { VERDICT_THRESHOLD } from "@/lib/constants";
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

/**
 * Recalculate price-dependent fields (upside%, verdict) using a live price.
 * Fair value is stable (based on fundamentals); upside% changes with price.
 * Mutates the summary object in place for performance.
 */
export function refreshSummaryWithLivePrice(
  summary: ValuationSummary,
  livePrice: number
): void {
  if (livePrice <= 0) return;

  summary.current_price = livePrice;
  summary.consensus_upside = ((summary.consensus_fair_value - livePrice) / livePrice) * 100;
  summary.primary_upside = ((summary.primary_fair_value - livePrice) / livePrice) * 100;

  // Recalculate verdict
  if (summary.consensus_upside > VERDICT_THRESHOLD) {
    summary.verdict = "undervalued";
  } else if (summary.consensus_upside < -VERDICT_THRESHOLD) {
    summary.verdict = "overvalued";
  } else {
    summary.verdict = "fairly_valued";
  }

  // Update each model's upside
  for (const model of summary.models) {
    if (model.fair_value > 0) {
      model.upside_percent = ((model.fair_value - livePrice) / livePrice) * 100;
    }
  }

  // Update pillar upsides
  for (const pillar of Object.values(summary.pillars)) {
    if (pillar.fairValue > 0) {
      pillar.upside = ((pillar.fairValue - livePrice) / livePrice) * 100;
    }
  }
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
