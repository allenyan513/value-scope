// FMP API — Historical prices and quotes

import { fmpFetch } from "./fmp-core";

// --- Historical Daily Prices ---
interface FMPHistoricalPrice {
  date: string;
  close: number;
  volume: number;
}

export async function getHistoricalPrices(
  ticker: string,
  from?: string,
  to?: string
): Promise<FMPHistoricalPrice[]> {
  const params: Record<string, string> = { symbol: ticker };
  if (from) params.from = from;
  if (to) params.to = to;
  const data = await fmpFetch<FMPHistoricalPrice[]>(
    "/historical-price-eod/full",
    params
  );
  return data ?? [];
}

// --- Quote (latest price) ---
interface FMPQuote {
  symbol: string;
  price: number;
  marketCap: number;
  exchange: string;
  volume: number;
  eps: number;
  pe: number;
  previousClose: number;
}

export async function getQuote(ticker: string): Promise<FMPQuote | null> {
  const data = await fmpFetch<FMPQuote[]>("/quote", { symbol: ticker });
  return data?.[0] ?? null;
}

// --- Batch Quotes ---
export async function getBatchQuotes(tickers: string[]): Promise<FMPQuote[]> {
  // FMP supports comma-separated tickers (max ~50 per request)
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 50) {
    chunks.push(tickers.slice(i, i + 50));
  }
  const results: FMPQuote[] = [];
  for (const chunk of chunks) {
    const data = await fmpFetch<FMPQuote[]>("/quote", {
      symbol: chunk.join(","),
    });
    results.push(...data);
  }
  return results;
}
