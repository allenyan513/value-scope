// ============================================================
// Financial Modeling Prep (FMP) API Client — Stable API
// Docs: https://site.financialmodelingprep.com/developer/docs
// ============================================================

const FMP_BASE = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY");
  return key;
}

async function fmpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FMP_BASE}${path}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const fetchOptions: RequestInit = {};
  // next.revalidate is only available in Next.js runtime
  if (typeof globalThis.process?.env?.NEXT_RUNTIME === "string") {
    (fetchOptions as Record<string, unknown>).next = { revalidate: 3600 };
  }
  const res = await fetch(url.toString(), fetchOptions);
  if (!res.ok) {
    throw new Error(`FMP API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

// --- Company Profile ---
interface FMPProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  beta: number;
  price: number;
  exchange: string;
  description: string;
  image: string;
}

export async function getCompanyProfile(ticker: string): Promise<FMPProfile | null> {
  const data = await fmpFetch<FMPProfile[]>("/profile", { symbol: ticker });
  if (!data?.[0]) return null;
  const p = data[0];
  // Normalize to match legacy field names used by seed scripts
  return {
    ...p,
    mktCap: p.marketCap,
  } as FMPProfile & { mktCap: number };
}

// --- Income Statement ---
interface FMPIncomeStatement {
  date: string;
  period: string; // "FY" or "Q1"–"Q4"
  fiscalYear: string;
  calendarYear: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  sellingGeneralAndAdministrativeExpenses: number;
  researchAndDevelopmentExpenses: number;
  operatingIncome: number;
  interestExpense: number;
  incomeBeforeTax: number;
  incomeTaxExpense: number;
  netIncome: number;
  ebitda: number;
  eps: number;
  epsDiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
}

export async function getIncomeStatements(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 10
): Promise<FMPIncomeStatement[]> {
  const data = await fmpFetch<FMPIncomeStatement[]>("/income-statement", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
  // Stable API uses fiscalYear, normalize to calendarYear for seed compatibility
  return data.map((d) => ({
    ...d,
    calendarYear: d.calendarYear || d.fiscalYear,
    epsdiluted: d.epsDiluted,
  })) as (FMPIncomeStatement & { epsdiluted: number })[];
}

// --- Balance Sheet ---
interface FMPBalanceSheet {
  date: string;
  period: string;
  fiscalYear: string;
  calendarYear: string;
  totalAssets: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  totalDebt: number;
  cashAndCashEquivalents: number;
  netDebt: number;
  netReceivables: number;
  accountPayables: number;
  inventory: number;
  shortTermDebt: number;
  longTermDebt: number;
}

export async function getBalanceSheets(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 10
): Promise<FMPBalanceSheet[]> {
  const data = await fmpFetch<FMPBalanceSheet[]>("/balance-sheet-statement", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
  return data.map((d) => ({
    ...d,
    calendarYear: d.calendarYear || d.fiscalYear,
  }));
}

// --- Cash Flow Statement ---
interface FMPCashFlow {
  date: string;
  period: string;
  fiscalYear: string;
  calendarYear: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  depreciationAndAmortization: number;
  dividendsPaid: number;
}

export async function getCashFlowStatements(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 10
): Promise<FMPCashFlow[]> {
  const data = await fmpFetch<FMPCashFlow[]>("/cash-flow-statement", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
  return data.map((d) => ({
    ...d,
    calendarYear: d.calendarYear || d.fiscalYear,
  }));
}

// --- Analyst Estimates ---
interface FMPAnalystEstimate {
  date: string;
  revenueAvg: number;
  revenueLow: number;
  revenueHigh: number;
  epsAvg: number;
  epsLow: number;
  epsHigh: number;
  numAnalystsRevenue: number;
  numAnalystsEps: number;
}

export async function getAnalystEstimates(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<FMPAnalystEstimate[]> {
  const data = await fmpFetch<FMPAnalystEstimate[]>("/analyst-estimates", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
  // Normalize field names for seed compatibility
  return data.map((d) => ({
    ...d,
    estimatedRevenueAvg: d.revenueAvg,
    estimatedRevenueLow: d.revenueLow,
    estimatedRevenueHigh: d.revenueHigh,
    estimatedEpsAvg: d.epsAvg,
    estimatedEpsLow: d.epsLow,
    estimatedEpsHigh: d.epsHigh,
    numberAnalystEstimatedRevenue: d.numAnalystsRevenue,
  })) as (FMPAnalystEstimate & {
    estimatedRevenueAvg: number;
    estimatedRevenueLow: number;
    estimatedRevenueHigh: number;
    estimatedEpsAvg: number;
    estimatedEpsLow: number;
    estimatedEpsHigh: number;
    numberAnalystEstimatedRevenue: number;
  })[];
}

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

// --- S&P 500 Constituents ---
interface FMPConstituent {
  symbol: string;
  name: string;
  sector: string;
  subSector: string;
}

export async function getSP500Constituents(): Promise<FMPConstituent[]> {
  return fmpFetch<FMPConstituent[]>("/sp500-constituent");
}

// --- Industry Peers ---
interface FMPPeer {
  symbol: string;
  companyName: string;
  price: number;
  mktCap: number;
}

export async function getIndustryPeers(ticker: string): Promise<string[]> {
  const data = await fmpFetch<FMPPeer[]>("/stock-peers", { symbol: ticker });
  return (data ?? []).map((p) => p.symbol);
}

// --- Key Metrics (for ratios) ---
interface FMPKeyMetrics {
  date: string;
  peRatio: number;
  priceToSalesRatio: number;
  priceBookValueRatio: number;
  enterpriseValueOverEBITDA: number;
  dividendYield: number;
  marketCap: number;
  enterpriseValue: number;
}

export async function getKeyMetrics(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<FMPKeyMetrics[]> {
  return fmpFetch<FMPKeyMetrics[]>("/key-metrics", {
    symbol: ticker,
    period,
    limit: String(limit),
  });
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
