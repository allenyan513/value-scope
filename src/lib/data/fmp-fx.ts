// FMP API — Forex exchange rates for ADR currency conversion

import { fmpFetch } from "./fmp-core";

// Fallback rates (approximate) in case FMP forex endpoint is unavailable on Starter plan.
// Updated periodically — used only as a safety net.
const FALLBACK_FX_RATES: Record<string, number> = {
  // Major developed
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.13,
  CAD: 0.74,
  AUD: 0.65,
  JPY: 0.0067,
  // Nordics
  DKK: 0.145,
  SEK: 0.096,
  NOK: 0.094,
  // Asia-Pacific (critical for ADR universe)
  CNY: 0.138, // Chinese ADRs: BABA, PDD, JD, BIDU, NIO
  HKD: 0.128, // HK-listed ADRs
  TWD: 0.031, // TSM etc.
  KRW: 0.00073, // Korean ADRs
  INR: 0.012, // Indian ADRs: WIT, INFY, HDB
  SGD: 0.74,
  // Latin America
  BRL: 0.17, // PBR, VALE, ITUB
  MXN: 0.050,
  CLP: 0.001,
  COP: 0.00023,
  ARS: 0.00089,
  // Other
  ILS: 0.28,
  ZAR: 0.054,
  TRY: 0.030,
};

interface FMPForexQuote {
  symbol: string;
  price: number;
}

/**
 * Get the exchange rate to convert from `currency` to USD.
 * Returns a multiplier such that: amount_in_currency * rate = amount_in_USD.
 * Returns 1.0 for USD (no API call).
 */
export async function getFXRateToUSD(currency: string): Promise<number> {
  if (!currency || currency.toUpperCase() === "USD") return 1.0;

  const pair = `${currency.toUpperCase()}USD`;

  try {
    const data = await fmpFetch<FMPForexQuote[]>("/forex-quote", { symbol: pair });
    if (data?.[0]?.price && data[0].price > 0) {
      return data[0].price;
    }
  } catch {
    // Forex endpoint may not be available on Starter plan — use fallback
  }

  const fallback = FALLBACK_FX_RATES[currency.toUpperCase()];
  if (fallback) {
    console.warn(`[FX] Using fallback rate for ${currency}: ${fallback}`);
    return fallback;
  }

  console.error(`[FX] No rate available for ${currency}, defaulting to 1.0 (DATA MAY BE WRONG)`);
  return 1.0;
}
