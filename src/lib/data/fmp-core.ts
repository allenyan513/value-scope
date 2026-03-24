// FMP API internals — shared fetch helper (not re-exported from barrel)

import { ISR_REVALIDATE_SECONDS } from "@/lib/constants";

const FMP_BASE = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY");
  return key;
}

export async function fmpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FMP_BASE}${path}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const fetchOptions: RequestInit = {};
  // next.revalidate is only available in Next.js runtime
  if (typeof globalThis.process?.env?.NEXT_RUNTIME === "string") {
    (fetchOptions as Record<string, unknown>).next = { revalidate: ISR_REVALIDATE_SECONDS };
  }
  const res = await fetch(url.toString(), fetchOptions);
  if (!res.ok) {
    throw new Error(`FMP API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}
