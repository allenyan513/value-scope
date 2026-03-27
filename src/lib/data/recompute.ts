// ============================================================
// Recompute Valuations — Core Logic
//
// DB-only valuation recompute. ZERO FMP calls.
// Used by: cron route, seed script, manual scripts.
// ============================================================

import { createServerClient } from "@/lib/db/supabase";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import {
  getFinancials,
  getEstimates,
  getPriceHistory,
  computePeerMetricsFromDB,
  upsertValuation,
  upsertValuationHistory,
} from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { median } from "@/lib/valuation/statistics";
import { toDateString } from "@/lib/format";
import { RECOMPUTE_CONCURRENCY } from "@/lib/constants";
import type { Company } from "@/types";

export interface RecomputeResult {
  date: string;
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

/**
 * Recompute valuations for all companies in the DB.
 * Reads all data from DB — zero external API calls (except FRED for risk-free rate).
 */
export async function recomputeAllValuations(): Promise<RecomputeResult> {
  const db = createServerClient();
  const today = toDateString(new Date());

  const { data: companies } = await db
    .from("companies")
    .select("*")
    .order("ticker");

  if (!companies || companies.length === 0) {
    return { date: today, total: 0, success: 0, skipped: 0, errors: 0 };
  }

  console.log(`[recompute] Processing ${companies.length} companies...`);

  const riskFreeRate = await getTenYearTreasuryYield().catch(() => 0.0425);
  let success = 0;
  let skipped = 0;
  let errors = 0;

  async function processCompany(company: Company): Promise<"success" | "skipped" | "error"> {
    try {
      const [historicals, estimates, peers, prices] = await Promise.all([
        getFinancials(company.ticker, "annual", 5),
        getEstimates(company.ticker),
        computePeerMetricsFromDB(company.ticker, 10),
        getPriceHistory(company.ticker, 365 * 5),
      ]);

      // Derive EV/EBITDA median directly from peers — avoids a duplicate DB round-trip
      const validEVEBITDA = peers
        .map((p) => p.ev_ebitda)
        .filter((v): v is number => v !== null && v > 0 && v < 100);
      const peerEVEBITDAMedian = validEVEBITDA.length > 0 ? median(validEVEBITDA) : null;

      if (historicals.length === 0 || (company.price || 0) <= 0) {
        return "skipped";
      }

      const currentPrice = company.price!;
      const historicalMultiples = computeHistoricalMultiples(historicals, prices);

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

      await Promise.all(summary.models.map((model) => upsertValuation(company.ticker, model)));

      await upsertValuationHistory(
        company.ticker,
        today,
        currentPrice,
        summary.primary_fair_value
      );

      return "success";
    } catch (error) {
      console.error(`[recompute] Error for ${company.ticker}:`, error);
      return "error";
    }
  }

  // Process companies in parallel batches to stay within Supabase connection limits
  let lastLogAt = 0;
  for (let i = 0; i < companies.length; i += RECOMPUTE_CONCURRENCY) {
    const batch = (companies as Company[]).slice(i, i + RECOMPUTE_CONCURRENCY);
    const results = await Promise.all(batch.map(processCompany));
    for (const r of results) {
      if (r === "success") success++;
      else if (r === "skipped") skipped++;
      else errors++;
    }

    const processed = success + skipped + errors;
    if (processed - lastLogAt >= 100) {
      console.log(`[recompute] Progress: ${processed}/${companies.length} (${success} ok, ${skipped} skipped, ${errors} errors)`);
      lastLogAt = processed;
    }
  }

  console.log(`[recompute] Done: ${success} success, ${skipped} skipped, ${errors} errors`);

  return { date: today, total: companies.length, success, skipped, errors };
}
