// FMP API — Financial ratios and EV-based multiples

import { fmpFetch } from "./fmp-core";

// --- Financial Ratios (P/E, P/S, P/B etc.) ---
interface FMPRatios {
  date: string;
  priceToEarningsRatio: number | null;
  priceToSalesRatio: number | null;
  priceToBookRatio: number | null;
  dividendYieldPercentage: number | null;
}

export async function getKeyMetrics(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<FMPRatios[]> {
  return fmpFetch<FMPRatios[]>("/ratios", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
}

// --- Enterprise Value (via key-metrics) ---
interface FMPEnterpriseValue {
  date: string;
  enterpriseValue: number;
  marketCap: number;
}

export async function getEnterpriseValue(
  ticker: string,
  limit = 5
): Promise<FMPEnterpriseValue[]> {
  const data = await fmpFetch<
    Array<{ date: string; enterpriseValue: number; marketCap: number }>
  >("/key-metrics", {
    symbol: ticker,
    period: "annual",
    limit: String(limit),
  });
  return (data ?? []).map((d) => ({
    date: d.date,
    enterpriseValue: d.enterpriseValue,
    marketCap: d.marketCap,
    marketCapitalization: d.marketCap,
    numberOfShares: 0,
  }));
}

// --- EV-based Multiples (via key-metrics) ---
export interface FMPEVMetrics {
  evToEBITDA: number | null;
  evToOperatingCashFlow: number | null;
  evToFreeCashFlow: number | null;
}

export async function getEVMetrics(
  ticker: string,
  limit = 1
): Promise<FMPEVMetrics[]> {
  const data = await fmpFetch<
    Array<{ evToEBITDA?: number; evToOperatingCashFlow?: number; evToFreeCashFlow?: number }>
  >("/key-metrics", {
    symbol: ticker,
    period: "annual",
    limit: String(limit),
  });
  return (data ?? []).map((d) => ({
    evToEBITDA: d.evToEBITDA ?? null,
    evToOperatingCashFlow: d.evToOperatingCashFlow ?? null,
    evToFreeCashFlow: d.evToFreeCashFlow ?? null,
  }));
}
