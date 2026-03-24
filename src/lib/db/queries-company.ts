// Database queries — Companies

import { createServerClient } from "./supabase";
import type { Company } from "@/types";

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
