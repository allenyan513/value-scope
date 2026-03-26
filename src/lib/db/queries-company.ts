// Database queries — Companies

import { createServerClient } from "./supabase";
import type { Company, PeerComparison } from "@/types";

const db = () => createServerClient();

export async function getCompany(ticker: string): Promise<Company | null> {
  const { data } = await db()
    .from("companies")
    .select("*")
    .eq("ticker", ticker)
    .single();
  return data;
}

export async function getAllTickers(): Promise<string[]> {
  const { data } = await db().from("companies").select("ticker").order("ticker");
  return (data ?? []).map((d) => d.ticker);
}

export async function searchCompanies(
  query: string,
  limit = 10
): Promise<Array<{ ticker: string; name: string }>> {
  const { data } = await db()
    .from("companies")
    .select("ticker, name")
    .or(`ticker.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(limit);
  return data ?? [];
}

export async function upsertCompany(company: Partial<Company> & { ticker: string }) {
  await db()
    .from("companies")
    .upsert({ ...company, updated_at: new Date().toISOString() }, {
      onConflict: "ticker",
    });
}

export async function getIndustryPeers(
  ticker: string,
  limit = 10
): Promise<Company[]> {
  const company = await getCompany(ticker);
  if (!company) return [];

  const { data } = await db()
    .from("companies")
    .select("*")
    .eq("industry", company.industry)
    .neq("ticker", ticker)
    .order("market_cap", { ascending: false })
    .limit(limit);
  return (data ?? []) as Company[];
}

/**
 * Compute peer metrics from DB data (no FMP calls).
 * Uses companies + financial_statements to derive P/E, P/B, P/S, EV/EBITDA.
 */
export async function computePeerMetricsFromDB(
  ticker: string,
  limit = 10
): Promise<PeerComparison[]> {
  const peerCompanies = await getIndustryPeers(ticker, limit);
  if (peerCompanies.length === 0) return [];

  const peerTickers = peerCompanies.map((p) => p.ticker);

  // Fetch latest annual financials for all peers in one query
  const { data: financials } = await db()
    .from("financial_statements")
    .select("ticker, revenue, eps_diluted, total_equity, ebitda, total_debt, cash_and_equivalents, net_income, fiscal_year")
    .in("ticker", peerTickers)
    .eq("period_type", "annual")
    .order("fiscal_year", { ascending: false });

  // Group by ticker, take latest year only
  const latestByTicker = new Map<string, typeof financials extends (infer T)[] | null ? T : never>();
  for (const row of financials ?? []) {
    if (!latestByTicker.has(row.ticker)) {
      latestByTicker.set(row.ticker, row);
    }
  }

  return peerCompanies.map((peer) => {
    const fin = latestByTicker.get(peer.ticker);
    const price = peer.price || 0;
    const mcap = peer.market_cap || 0;

    let trailing_pe: number | null = null;
    let price_to_book: number | null = null;
    let price_to_sales: number | null = null;
    let ev_ebitda: number | null = null;
    let net_margin: number | null = null;

    if (fin) {
      if (fin.eps_diluted && fin.eps_diluted > 0 && price > 0) {
        trailing_pe = price / fin.eps_diluted;
      }
      if (fin.total_equity && fin.total_equity > 0 && mcap > 0) {
        price_to_book = mcap / fin.total_equity;
      }
      if (fin.revenue && fin.revenue > 0 && mcap > 0) {
        price_to_sales = mcap / fin.revenue;
      }
      if (fin.ebitda && fin.ebitda > 0) {
        const ev = mcap + (fin.total_debt || 0) - (fin.cash_and_equivalents || 0);
        ev_ebitda = ev / fin.ebitda;
      }
      if (fin.net_income && fin.revenue && fin.revenue > 0) {
        net_margin = fin.net_income / fin.revenue;
      }
    }

    return {
      ticker: peer.ticker,
      name: peer.name,
      market_cap: mcap,
      trailing_pe,
      forward_pe: null,
      ev_ebitda,
      price_to_book,
      price_to_sales,
      revenue_growth: null,
      net_margin,
      roe: null,
    };
  });
}
