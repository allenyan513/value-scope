// Database queries — Financial statements, estimates, price targets

import { createServerClient } from "./supabase";
import type { FinancialStatement, AnalystEstimate, PriceTargetConsensus } from "@/types";

const db = () => createServerClient();

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

export async function upsertFinancials(rows: Array<Partial<FinancialStatement> & { ticker: string; period: string }>) {
  if (rows.length === 0) return;
  await db()
    .from("financial_statements")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "ticker,period" }
    );
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
