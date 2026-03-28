// Database queries — Companies

import { createServerClient } from "./supabase";
import type { Company, PeerComparison, PeerEBITDARow } from "@/types";
import { getIndustryPeers as getFMPStockPeers } from "@/lib/data/fmp-financials";
import { median } from "@/lib/valuation/statistics";

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

/**
 * Get industry peers by industry name directly (avoids redundant getCompany() call).
 * Preferred when caller already has company data.
 */
export async function getPeersByIndustry(
  industry: string,
  excludeTicker: string,
  limit = 10,
  sector?: string,
): Promise<Company[]> {
  const { data } = await db()
    .from("companies")
    .select("*")
    .eq("industry", industry)
    .neq("ticker", excludeTicker)
    .order("market_cap", { ascending: false })
    .limit(limit);
  const peers = (data ?? []) as Company[];

  // Fallback to sector peers when industry has too few matches
  if (peers.length < 3 && sector) {
    const { data: sectorData } = await db()
      .from("companies")
      .select("*")
      .eq("sector", sector)
      .neq("ticker", excludeTicker)
      .order("market_cap", { ascending: false })
      .limit(limit);
    return (sectorData ?? []) as Company[];
  }

  return peers;
}

/**
 * Get industry peers by ticker (convenience wrapper — calls getCompany internally).
 * Use getPeersByIndustry() when you already have the company object.
 */
export async function getIndustryPeers(
  ticker: string,
  limit = 10
): Promise<Company[]> {
  const company = await getCompany(ticker);
  if (!company) return [];
  return getPeersByIndustry(company.industry, ticker, limit, company.sector);
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

  // Fetch latest annual financials + analyst estimates for all peers in parallel
  const [{ data: financials }, { data: estimates }] = await Promise.all([
    db()
      .from("financial_statements")
      .select("ticker, revenue, eps_diluted, total_equity, ebitda, total_debt, cash_and_equivalents, net_income, fiscal_year")
      .in("ticker", peerTickers)
      .eq("period_type", "annual")
      .order("fiscal_year", { ascending: false }),
    db()
      .from("analyst_estimates")
      .select("ticker, eps_estimate, revenue_estimate, period")
      .in("ticker", peerTickers)
      .order("period", { ascending: true }),
  ]);

  // Group by ticker, take latest year only
  const latestByTicker = new Map<string, typeof financials extends (infer T)[] | null ? T : never>();
  for (const row of financials ?? []) {
    if (!latestByTicker.has(row.ticker)) {
      latestByTicker.set(row.ticker, row);
    }
  }

  // Group estimates by ticker, take first (nearest year) estimate
  const estimateByTicker = new Map<string, { eps_estimate: number; revenue_estimate: number }>();
  for (const row of estimates ?? []) {
    if (!estimateByTicker.has(row.ticker) && row.eps_estimate && row.revenue_estimate) {
      estimateByTicker.set(row.ticker, row);
    }
  }

  return peerCompanies.map((peer) => {
    const fin = latestByTicker.get(peer.ticker);
    const est = estimateByTicker.get(peer.ticker);
    const price = peer.price || 0;
    const mcap = peer.market_cap || 0;

    let trailing_pe: number | null = null;
    let forward_pe: number | null = null;
    let price_to_book: number | null = null;
    let price_to_sales: number | null = null;
    let ev_ebitda: number | null = null;
    let forward_ev_ebitda: number | null = null;
    let net_margin: number | null = null;

    if (fin) {
      if (fin.eps_diluted && fin.eps_diluted > 0 && price > 0) {
        trailing_pe = price / fin.eps_diluted;
        if (trailing_pe > 200) trailing_pe = null; // cap extreme
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
        if (ev_ebitda > 100) ev_ebitda = null; // cap extreme
      }
      if (fin.net_income && fin.revenue && fin.revenue > 0) {
        net_margin = fin.net_income / fin.revenue;
      }

      // Forward multiples from analyst estimates
      if (est && price > 0) {
        if (est.eps_estimate > 0) {
          const fpe = price / est.eps_estimate;
          forward_pe = fpe <= 200 ? fpe : null;
        }
        if (fin.ebitda && fin.revenue && fin.revenue > 0 && est.revenue_estimate > 0) {
          const ebitdaMargin = fin.ebitda / fin.revenue;
          const forwardEBITDA = est.revenue_estimate * ebitdaMargin;
          if (forwardEBITDA > 0) {
            const ev = mcap + (fin.total_debt || 0) - (fin.cash_and_equivalents || 0);
            const fevEbitda = ev / forwardEBITDA;
            forward_ev_ebitda = fevEbitda <= 100 ? fevEbitda : null;
          }
        }
      }
    }

    return {
      ticker: peer.ticker,
      name: peer.name,
      market_cap: mcap,
      trailing_pe,
      forward_pe,
      ev_ebitda,
      forward_ev_ebitda,
      price_to_book,
      price_to_sales,
      revenue_growth: null,
      net_margin,
      roe: null,
    };
  });
}

/**
 * Median EV/EBITDA for industry peers.
 * Tries DB industry matching first; falls back to FMP /stock-peers when DB yields no valid values.
 * Used by summary.ts to provide terminal value anchor for EBITDA Exit model.
 */
export async function getPeerEVEBITDAMedianFromDB(
  ticker: string,
  limit = 10
): Promise<number | null> {
  // Try DB industry peers first (fast, no FMP call)
  const dbPeers = await computePeerMetricsFromDB(ticker, limit);
  const dbValid = dbPeers
    .map((p) => p.ev_ebitda)
    .filter((v): v is number => v !== null && v > 0 && v < 100);
  if (dbValid.length > 0) return median(dbValid);

  // Fallback: FMP /stock-peers → look up their financials in DB
  try {
    const fmpTickers = await getFMPStockPeers(ticker);
    if (fmpTickers.length === 0) return null;
    const peerTickers = fmpTickers.slice(0, limit);
    const [companiesRes, finRes] = await Promise.all([
      db().from("companies").select("ticker, market_cap").in("ticker", peerTickers),
      db()
        .from("financial_statements")
        .select("ticker, ebitda, total_debt, cash_and_equivalents, fiscal_year")
        .in("ticker", peerTickers)
        .eq("period_type", "annual")
        .order("fiscal_year", { ascending: false }),
    ]);
    const compMap = new Map((companiesRes.data ?? []).map((c) => [c.ticker, c.market_cap as number]));
    const latestFin = new Map<string, { ebitda: number | null; total_debt: number | null; cash_and_equivalents: number | null }>();
    for (const row of finRes.data ?? []) {
      if (!latestFin.has(row.ticker)) latestFin.set(row.ticker, row);
    }
    const fmpValid: number[] = [];
    for (const t of peerTickers) {
      const mcap = compMap.get(t);
      const fin = latestFin.get(t);
      if (mcap && fin && fin.ebitda && fin.ebitda > 0) {
        const ev = mcap + (fin.total_debt ?? 0) - (fin.cash_and_equivalents ?? 0);
        const evEbitda = ev / fin.ebitda;
        if (evEbitda > 0 && evEbitda < 100) fmpValid.push(evEbitda);
      }
    }
    return fmpValid.length > 0 ? median(fmpValid) : null;
  } catch {
    return null;
  }
}

/**
 * Peer EBITDA multiples for the EBITDA Exit DCF model page.
 * Uses FMP /stock-peers first, falls back to DB industry matching.
 * Returns subject company (first row) + peers, with trailing and forward EV/EBITDA.
 */
export async function computePeerEBITDAMultiples(
  ticker: string,
  limit = 10
): Promise<PeerEBITDARow[]> {
  const db = createServerClient();

  // 1. Resolve peer tickers: FMP /stock-peers first, DB industry fallback
  let peerTickers: string[] = [];
  try {
    const fmpPeers = await getFMPStockPeers(ticker);
    if (fmpPeers.length > 0) {
      peerTickers = fmpPeers.slice(0, limit);
    }
  } catch { /* fall through to DB */ }

  if (peerTickers.length === 0) {
    const dbPeers = await getIndustryPeers(ticker, limit);
    peerTickers = dbPeers.map((p) => p.ticker);
  }

  // Ensure subject ticker isn't duplicated if FMP includes it in peers
  peerTickers = peerTickers.filter((t) => t !== ticker);

  const allTickers = [ticker, ...peerTickers];

  // 2. Fetch company data + latest financials + next-year revenue estimate in parallel
  const [companiesResult, financialsResult, estimatesResult] = await Promise.all([
    db.from("companies").select("ticker, name, market_cap, price").in("ticker", allTickers),
    db
      .from("financial_statements")
      .select("ticker, revenue, ebitda, total_debt, cash_and_equivalents, fiscal_year")
      .in("ticker", allTickers)
      .eq("period_type", "annual")
      .order("fiscal_year", { ascending: false }),
    db
      .from("analyst_estimates")
      .select("ticker, period, revenue_estimate")
      .in("ticker", allTickers)
      .order("period", { ascending: false }),
  ]);

  const companies = companiesResult.data ?? [];
  const financials = financialsResult.data ?? [];
  const estimates = estimatesResult.data ?? [];

  // Latest annual financials per ticker
  const latestFin = new Map<string, typeof financials[0]>();
  for (const row of financials) {
    if (!latestFin.has(row.ticker)) latestFin.set(row.ticker, row);
  }

  // Historical EBITDA margin (avg last 3 years) per ticker
  const ebitdaMargins = new Map<string, number>();
  const finByTicker = new Map<string, typeof financials>();
  for (const row of financials) {
    const arr = finByTicker.get(row.ticker) ?? [];
    arr.push(row);
    finByTicker.set(row.ticker, arr);
  }
  for (const [t, rows] of finByTicker.entries()) {
    const recent = rows.slice(0, 3).filter((r) => r.revenue > 0 && r.ebitda > 0);
    if (recent.length > 0) {
      const avgMargin = recent.reduce((s, r) => s + r.ebitda / r.revenue, 0) / recent.length;
      ebitdaMargins.set(t, avgMargin);
    }
  }

  // Next-year revenue estimate per ticker
  const nextRevEst = new Map<string, number>();
  for (const row of estimates) {
    if (!nextRevEst.has(row.ticker) && row.revenue_estimate > 0) {
      nextRevEst.set(row.ticker, row.revenue_estimate);
    }
  }

  // Build rows: subject company first, then peers in FMP order
  const companyMap = new Map(companies.map((c) => [c.ticker, c]));

  return allTickers
    .map((t) => {
      const co = companyMap.get(t);
      const fin = latestFin.get(t);
      if (!co) return null;

      const mcap = co.market_cap ?? 0;
      const ev = fin ? mcap + (fin.total_debt ?? 0) - (fin.cash_and_equivalents ?? 0) : null;

      let trailing_ev_ebitda: number | null = null;
      if (ev !== null && fin?.ebitda && fin.ebitda > 0) {
        const raw = ev / fin.ebitda;
        trailing_ev_ebitda = raw > 0 && raw < 200 ? Math.round(raw * 10) / 10 : null;
      }

      let forward_ev_ebitda: number | null = null;
      const margin = ebitdaMargins.get(t);
      const revEst = nextRevEst.get(t);
      if (ev !== null && margin && revEst && revEst > 0) {
        const fwdEBITDA = revEst * margin;
        const raw = ev / fwdEBITDA;
        forward_ev_ebitda = raw > 0 && raw < 200 ? Math.round(raw * 10) / 10 : null;
      }

      return { ticker: t, name: co.name, market_cap: mcap, trailing_ev_ebitda, forward_ev_ebitda };
    })
    .filter((r): r is PeerEBITDARow => r !== null);
}
