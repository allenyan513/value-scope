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
  getPeerEVEBITDAMedianFromDB,
  upsertValuation,
  upsertValuationHistory,
} from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { toDateString } from "@/lib/format";
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

  for (const company of companies as Company[]) {
    try {
      const [historicals, estimates, peers, prices, peerEVEBITDAMedian] = await Promise.all([
        getFinancials(company.ticker, "annual", 5),
        getEstimates(company.ticker),
        computePeerMetricsFromDB(company.ticker, 10),
        getPriceHistory(company.ticker, 365 * 5),
        getPeerEVEBITDAMedianFromDB(company.ticker).catch(() => null),
      ]);

      if (historicals.length === 0 || (company.price || 0) <= 0) {
        skipped++;
        continue;
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

      success++;

      if (success % 50 === 0) {
        console.log(`[recompute] Progress: ${success}/${companies.length - skipped} ...`);
      }
    } catch (error) {
      console.error(`[recompute] Error for ${company.ticker}:`, error);
      errors++;
    }
  }

  console.log(`[recompute] Done: ${success} success, ${skipped} skipped, ${errors} errors`);

  return { date: today, total: companies.length, success, skipped, errors };
}
