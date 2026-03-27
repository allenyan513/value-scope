// ============================================================
// Sector Beta — Bottom-Up (Sector Median Unlevered) Beta
//
// Pre-computes median unlevered beta per sector from peer data.
// Called by daily cron; consumed by WACC calculator.
// ============================================================

import { createServerClient } from "@/lib/db/supabase";

const DEFAULT_TAX_RATE = 0.21;

interface SectorBetaRow {
  sector: string;
  median_unlevered_beta: number;
  peer_count: number;
}

/**
 * Refresh all sector betas from current company + financial data.
 * For each sector: unlever each company's beta, take median, store result.
 *
 * Unlevered Beta = Beta / (1 + (1 - t) × D/E)
 * where D/E = total_debt / market_cap, t = 21% (fixed for consistency)
 */
export async function refreshAllSectorBetas(): Promise<SectorBetaRow[]> {
  const db = createServerClient();

  // Fetch all companies with valid beta + market_cap, joined with latest annual financials
  const { data: companies, error } = await db
    .from("companies")
    .select("ticker, sector, beta, market_cap")
    .gt("beta", 0)
    .gt("market_cap", 0)
    .not("sector", "is", null);

  if (error || !companies || companies.length === 0) {
    console.warn("[sector-beta] No companies found for sector beta refresh");
    return [];
  }

  // Fetch latest annual total_debt for all tickers in one query
  const tickers = companies.map((c) => c.ticker);
  const { data: financials } = await db
    .from("financial_statements")
    .select("ticker, total_debt, fiscal_year")
    .in("ticker", tickers)
    .eq("period_type", "annual")
    .order("fiscal_year", { ascending: false });

  // Build a map: ticker → latest total_debt
  const debtMap = new Map<string, number>();
  if (financials) {
    for (const f of financials) {
      if (!debtMap.has(f.ticker)) {
        debtMap.set(f.ticker, Math.max(0, f.total_debt || 0));
      }
    }
  }

  // Group by sector, compute unlevered betas
  const sectorMap = new Map<string, number[]>();

  for (const c of companies) {
    if (!c.sector) continue;
    const debt = debtMap.get(c.ticker) ?? 0;
    const marketCap = c.market_cap;

    // D/E ratio
    const deRatio = marketCap > 0 ? debt / marketCap : 0;

    // Unlever: Beta / (1 + (1 - t) × D/E)
    const unlevered = c.beta / (1 + (1 - DEFAULT_TAX_RATE) * deRatio);

    // Sanity check: skip extreme values
    if (unlevered <= 0 || unlevered > 5) continue;

    if (!sectorMap.has(c.sector)) {
      sectorMap.set(c.sector, []);
    }
    sectorMap.get(c.sector)!.push(unlevered);
  }

  // Compute median for each sector and upsert
  const results: SectorBetaRow[] = [];

  for (const [sector, betas] of sectorMap) {
    if (betas.length === 0) continue;

    const sorted = [...betas].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    results.push({
      sector,
      median_unlevered_beta: Math.round(median * 1000) / 1000, // 3 decimal places
      peer_count: betas.length,
    });
  }

  // Upsert all sector betas
  if (results.length > 0) {
    const { error: upsertError } = await db.from("sector_betas").upsert(
      results.map((r) => ({
        sector: r.sector,
        median_unlevered_beta: r.median_unlevered_beta,
        peer_count: r.peer_count,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "sector" }
    );

    if (upsertError) {
      console.error("[sector-beta] Upsert error:", upsertError);
    } else {
      console.log(
        `[sector-beta] Updated ${results.length} sectors`
      );
    }
  }

  return results;
}

export interface SectorBetaStats {
  median_unlevered_beta: number;
  peer_count: number;
  median_wacc: number | null;
  p25_wacc: number | null;
  p75_wacc: number | null;
}

/**
 * Get the pre-computed sector median unlevered beta.
 * Returns null if the sector is not found.
 */
export async function getSectorBeta(
  sector: string
): Promise<number | null> {
  const db = createServerClient();
  const { data } = await db
    .from("sector_betas")
    .select("median_unlevered_beta")
    .eq("sector", sector)
    .single();

  return data?.median_unlevered_beta ?? null;
}

/**
 * Get the full sector beta stats (for WACC page context display).
 */
export async function getSectorBetaStats(
  sector: string
): Promise<SectorBetaStats | null> {
  const db = createServerClient();
  const { data } = await db
    .from("sector_betas")
    .select("median_unlevered_beta, peer_count, median_wacc, p25_wacc, p75_wacc")
    .eq("sector", sector)
    .single();

  return data ?? null;
}

/**
 * Load all sector betas into a Map (for batch operations like cron recompute).
 */
export async function getAllSectorBetas(): Promise<Map<string, number>> {
  const db = createServerClient();
  const { data } = await db
    .from("sector_betas")
    .select("sector, median_unlevered_beta");

  const map = new Map<string, number>();
  if (data) {
    for (const row of data) {
      map.set(row.sector, row.median_unlevered_beta);
    }
  }
  return map;
}
