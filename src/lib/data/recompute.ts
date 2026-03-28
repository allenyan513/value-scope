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
} from "@/lib/db/queries";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { median } from "@/lib/valuation/statistics";
import { getAllSectorBetas } from "@/lib/data/sector-beta";
import { toDateString } from "@/lib/format";
import { RECOMPUTE_CONCURRENCY } from "@/lib/constants";
import { upsertValuationSnapshot } from "@/lib/db/queries-valuation";
import type { Company } from "@/types";

export interface RecomputeResult {
  date: string;
  total: number;
  success: number;
  skipped: number;
  errors: number;
}

async function recomputeForCompanies(
  companies: Company[],
  riskFreeRate: number,
  sectorBetaMap: Map<string, number>
): Promise<RecomputeResult> {
  const today = toDateString(new Date());

  if (companies.length === 0) {
    return { date: today, total: 0, success: 0, skipped: 0, errors: 0 };
  }

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
        sectorUnleveredBeta: sectorBetaMap.get(company.sector) ?? undefined,
      });

      // Persist to valuation_snapshots table
      await upsertValuationSnapshot({
        ticker: company.ticker,
        fair_value: summary.consensus_fair_value,
        upside_pct: summary.consensus_upside,
        verdict: summary.verdict,
        current_price: currentPrice,
        summary,
        peers,
        computed_at: summary.computed_at,
      });

      return "success";
    } catch (error) {
      console.error(`[recompute] Error for ${company.ticker}:`, error);
      return "error";
    }
  }

  // Process companies in parallel batches to stay within Supabase connection limits
  let lastLogAt = 0;
  for (let i = 0; i < companies.length; i += RECOMPUTE_CONCURRENCY) {
    const batch = companies.slice(i, i + RECOMPUTE_CONCURRENCY);
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

/**
 * Recompute valuations for all companies in the DB.
 * Reads all data from DB — zero external API calls (except FRED for risk-free rate).
 */
export async function recomputeAllValuations(): Promise<RecomputeResult> {
  const db = createServerClient();

  const { data: companies } = await db
    .from("companies")
    .select("*")
    .order("ticker");

  console.log(`[recompute] Processing ${companies?.length ?? 0} companies (full)...`);

  const [riskFreeRate, sectorBetaMap] = await Promise.all([
    getTenYearTreasuryYield().catch(() => 0.0425),
    getAllSectorBetas(),
  ]);

  return recomputeForCompanies((companies ?? []) as Company[], riskFreeRate, sectorBetaMap);
}

/**
 * Recompute valuations for a specific set of tickers (e.g. after earnings).
 * Also includes their current peers so peer-comparison data stays fresh.
 * Much cheaper than a full recompute at scale — O(tickers × peers) vs O(all).
 */
export async function recomputeValuationsForTickers(tickers: string[]): Promise<RecomputeResult> {
  if (tickers.length === 0) {
    return { date: toDateString(new Date()), total: 0, success: 0, skipped: 0, errors: 0 };
  }

  const db = createServerClient();

  // Expand: also recompute peers of the changed tickers, since their peer-comparison
  // data (EV/EBITDA multiples, P/E) is derived from the reporters' fresh financials.
  const { data: snapshots } = await db
    .from("valuation_snapshots")
    .select("peers")
    .in("ticker", tickers);

  const expandedSet = new Set<string>(tickers);
  for (const snap of snapshots ?? []) {
    for (const peer of (snap.peers ?? []) as Array<{ ticker: string }>) {
      if (peer.ticker) expandedSet.add(peer.ticker);
    }
  }

  const expandedTickers = [...expandedSet];
  console.log(
    `[recompute] Targeted recompute: ${tickers.length} earnings tickers → ${expandedTickers.length} total (inc. peers)...`
  );

  const { data: companies } = await db
    .from("companies")
    .select("*")
    .in("ticker", expandedTickers);

  const [riskFreeRate, sectorBetaMap] = await Promise.all([
    getTenYearTreasuryYield().catch(() => 0.0425),
    getAllSectorBetas(),
  ]);

  return recomputeForCompanies((companies ?? []) as Company[], riskFreeRate, sectorBetaMap);
}
