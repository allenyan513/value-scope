// ============================================================
// FRED (Federal Reserve Economic Data) API Client
// Used for: Risk-free rate (10Y Treasury Yield)
// ============================================================

const FRED_BASE = "https://api.stlouisfed.org/fred";

function apiKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("Missing FRED_API_KEY");
  return key;
}

interface FREDObservation {
  date: string;
  value: string;
}

interface FREDSeriesResponse {
  observations: FREDObservation[];
}

async function fredFetch(seriesId: string, limit = 1): Promise<FREDObservation[]> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) {
    throw new Error(`FRED API error: ${res.status} for series ${seriesId}`);
  }
  const data = (await res.json()) as FREDSeriesResponse;
  return data.observations;
}

/**
 * Get the latest 10-Year Treasury Constant Maturity Rate.
 * Series ID: DGS10
 * Returns the rate as a decimal (e.g., 0.0425 for 4.25%)
 */
export async function getTenYearTreasuryYield(): Promise<number> {
  const obs = await fredFetch("DGS10", 5);
  // FRED sometimes returns "." for missing values, find latest valid
  for (const o of obs) {
    const val = parseFloat(o.value);
    if (!isNaN(val)) {
      return val / 100; // Convert percentage to decimal
    }
  }
  // Fallback to reasonable default
  return 0.0425;
}

/**
 * Get historical 10Y Treasury yields for a date range.
 */
export async function getTreasuryYieldHistory(
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; yield: number }>> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", "DGS10");
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", startDate);
  url.searchParams.set("observation_end", endDate);

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
  const data = (await res.json()) as FREDSeriesResponse;

  return data.observations
    .filter((o) => o.value !== ".")
    .map((o) => ({
      date: o.date,
      yield: parseFloat(o.value) / 100,
    }));
}
