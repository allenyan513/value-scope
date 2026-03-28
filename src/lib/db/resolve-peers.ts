// Unified peer resolution — single source of truth for all valuation pages.
// Strategy: FMP /stock-peers first (better comparables), DB industry fallback.
// Market cap floor: peers must be >= 1% of subject's market cap.

import { createServerClient } from "./supabase";
import { getCompany, getPeersByIndustry } from "./queries-company";
import { getIndustryPeers as getFMPStockPeers } from "@/lib/data/fmp-financials";
import type { Company } from "@/types";

/**
 * Resolve the best peer companies for a given ticker.
 *
 * 1. FMP /stock-peers → filter to companies in our DB with reasonable market cap
 * 2. Fallback: DB industry/sector matching (same market cap floor)
 */
export async function resolvePeers(ticker: string, limit = 10): Promise<Company[]> {
  const company = await getCompany(ticker);
  if (!company) return [];

  const minMarketCap = Math.floor((company.market_cap || 0) * 0.01);

  // Strategy 1: FMP /stock-peers
  try {
    const fmpTickers = await getFMPStockPeers(ticker);
    if (fmpTickers.length > 0) {
      const { data } = await createServerClient()
        .from("companies")
        .select("*")
        .in("ticker", fmpTickers)
        .neq("ticker", ticker)
        .gte("market_cap", minMarketCap)
        .order("market_cap", { ascending: false })
        .limit(limit);

      const peers = (data ?? []) as Company[];
      if (peers.length >= 3) return peers;
    }
  } catch { /* fall through to DB */ }

  // Strategy 2: DB industry/sector fallback
  const dbPeers = await getPeersByIndustry(
    company.industry,
    ticker,
    limit * 2, // fetch extra, filter by market cap below
    company.sector,
  );

  return dbPeers
    .filter((p) => (p.market_cap || 0) >= minMarketCap)
    .slice(0, limit);
}
