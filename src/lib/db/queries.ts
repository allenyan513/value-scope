// ============================================================
// Database query helpers
// ============================================================

import { createServerClient } from "./supabase";
import type {
  Company,
  FinancialStatement,
  AnalystEstimate,
  DailyPrice,
  ValuationResult,
  ValuationHistoryPoint,
  PriceTargetConsensus,
} from "@/types";

const db = () => createServerClient();

// --- Companies ---
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

// --- Financial Statements ---
export async function getFinancials(
  ticker: string,
  periodType: "annual" | "quarterly" = "annual",
  limit = 10
): Promise<FinancialStatement[]> {
  const { data } = await db()
    .from("financial_statements")
    .select("*")
    .eq("ticker", ticker)
    .eq("period_type", periodType)
    .order("fiscal_year", { ascending: false })
    .limit(limit);
  return (data ?? []) as FinancialStatement[];
}

export async function getLatestFinancial(
  ticker: string
): Promise<FinancialStatement | null> {
  const { data } = await db()
    .from("financial_statements")
    .select("*")
    .eq("ticker", ticker)
    .eq("period_type", "annual")
    .order("fiscal_year", { ascending: false })
    .limit(1)
    .single();
  return data as FinancialStatement | null;
}

// --- Analyst Estimates ---
export async function getEstimates(
  ticker: string
): Promise<AnalystEstimate[]> {
  const { data } = await db()
    .from("analyst_estimates")
    .select("*")
    .eq("ticker", ticker)
    .order("period", { ascending: true });
  return (data ?? []) as AnalystEstimate[];
}

// --- Daily Prices ---
export async function getLatestPrice(ticker: string): Promise<number | null> {
  const { data } = await db()
    .from("daily_prices")
    .select("close_price")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  return data?.close_price ?? null;
}

export async function getPriceHistory(
  ticker: string,
  days = 365 * 5
): Promise<DailyPrice[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await db()
    .from("daily_prices")
    .select("ticker, date, close_price as close, volume")
    .eq("ticker", ticker)
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: true });
  return (data ?? []) as unknown as DailyPrice[];
}

// --- Valuations ---
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

// --- Valuation History ---
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

// --- Bulk Upserts (for seeding) ---
export async function upsertCompany(company: Partial<Company> & { ticker: string }) {
  await db()
    .from("companies")
    .upsert({ ...company, updated_at: new Date().toISOString() }, {
      onConflict: "ticker",
    });
}

export async function upsertFinancials(rows: Array<Partial<FinancialStatement> & { ticker: string; period: string }>) {
  if (rows.length === 0) return;
  await db()
    .from("financial_statements")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "ticker,period" }
    );
}

export async function upsertDailyPrices(
  rows: Array<{ ticker: string; date: string; close_price: number; volume: number }>
) {
  if (rows.length === 0) return;
  // Batch in chunks of 1000
  for (let i = 0; i < rows.length; i += 1000) {
    await db()
      .from("daily_prices")
      .upsert(rows.slice(i, i + 1000), { onConflict: "ticker,date" });
  }
}

export async function upsertEstimates(
  rows: Array<Partial<AnalystEstimate> & { ticker: string; period: string }>
) {
  if (rows.length === 0) return;
  await db()
    .from("analyst_estimates")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "ticker,period" }
    );
}

// --- Price Target Consensus ---
export async function getPriceTargets(
  ticker: string
): Promise<PriceTargetConsensus | null> {
  const { data } = await db()
    .from("price_target_consensus")
    .select("*")
    .eq("ticker", ticker)
    .single();
  return data as PriceTargetConsensus | null;
}

export async function upsertPriceTargets(
  row: PriceTargetConsensus
): Promise<void> {
  await db()
    .from("price_target_consensus")
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "ticker" }
    );
}

// --- Peers (from companies table, same industry) ---
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
