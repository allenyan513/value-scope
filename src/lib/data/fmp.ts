// ============================================================
// Financial Modeling Prep (FMP) API Client
// Docs: https://site.financialmodelingprep.com/developer/docs
// ============================================================

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

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

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
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
  mktCap: number;
  beta: number;
  price: number;
  sharesOutstanding: number; // from key-metrics or calculated
  exchange: string;
  description: string;
  image: string;
}

export async function getCompanyProfile(ticker: string): Promise<FMPProfile | null> {
  const data = await fmpFetch<FMPProfile[]>(`/profile/${ticker}`);
  return data?.[0] ?? null;
}

// --- Income Statement ---
interface FMPIncomeStatement {
  date: string;
  period: string; // "FY" or "Q1"–"Q4"
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
  epsdiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
}

export async function getIncomeStatements(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 10
): Promise<FMPIncomeStatement[]> {
  return fmpFetch<FMPIncomeStatement[]>(`/income-statement/${ticker}`, {
    period,
    limit: String(limit),
  });
}

// --- Balance Sheet ---
interface FMPBalanceSheet {
  date: string;
  period: string;
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
  return fmpFetch<FMPBalanceSheet[]>(`/balance-sheet-statement/${ticker}`, {
    period,
    limit: String(limit),
  });
}

// --- Cash Flow Statement ---
interface FMPCashFlow {
  date: string;
  period: string;
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
  return fmpFetch<FMPCashFlow[]>(`/cash-flow-statement/${ticker}`, {
    period,
    limit: String(limit),
  });
}

// --- Analyst Estimates ---
interface FMPAnalystEstimate {
  date: string;
  estimatedRevenueAvg: number;
  estimatedRevenueLow: number;
  estimatedRevenueHigh: number;
  estimatedEpsAvg: number;
  estimatedEpsLow: number;
  estimatedEpsHigh: number;
  numberAnalystEstimatedRevenue: number;
}

export async function getAnalystEstimates(
  ticker: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<FMPAnalystEstimate[]> {
  return fmpFetch<FMPAnalystEstimate[]>(`/analyst-estimates/${ticker}`, {
    period,
    limit: String(limit),
  });
}

// --- Historical Daily Prices ---
interface FMPHistoricalPrice {
  date: string;
  close: number;
  volume: number;
}

interface FMPHistoricalResponse {
  symbol: string;
  historical: FMPHistoricalPrice[];
}

export async function getHistoricalPrices(
  ticker: string,
  from?: string,
  to?: string
): Promise<FMPHistoricalPrice[]> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  const data = await fmpFetch<FMPHistoricalResponse>(
    `/historical-price-full/${ticker}`,
    params
  );
  return data?.historical ?? [];
}

// --- S&P 500 Constituents ---
interface FMPConstituent {
  symbol: string;
  name: string;
  sector: string;
  subSector: string;
}

export async function getSP500Constituents(): Promise<FMPConstituent[]> {
  return fmpFetch<FMPConstituent[]>("/sp500_constituent");
}

// --- Industry Peers ---
export async function getIndustryPeers(ticker: string): Promise<string[]> {
  const data = await fmpFetch<Array<{ peersList: string[] }>>(
    `/stock_peers?symbol=${ticker}`
  );
  return data?.[0]?.peersList ?? [];
}

// --- Key Metrics (for ratios) ---
interface FMPKeyMetrics {
  date: string;
  peRatio: number;
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
  return fmpFetch<FMPKeyMetrics[]>(`/key-metrics/${ticker}`, {
    period,
    limit: String(limit),
  });
}

// --- Quote (latest price) ---
interface FMPQuote {
  symbol: string;
  price: number;
  marketCap: number;
  sharesOutstanding: number;
  pe: number;
  eps: number;
}

export async function getQuote(ticker: string): Promise<FMPQuote | null> {
  const data = await fmpFetch<FMPQuote[]>(`/quote/${ticker}`);
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
    const data = await fmpFetch<FMPQuote[]>(`/quote/${chunk.join(",")}`);
    results.push(...data);
  }
  return results;
}

// --- Enterprise Value ---
interface FMPEnterpriseValue {
  date: string;
  enterpriseValue: number;
  marketCapitalization: number;
  numberOfShares: number;
}

export async function getEnterpriseValue(
  ticker: string,
  limit = 5
): Promise<FMPEnterpriseValue[]> {
  return fmpFetch<FMPEnterpriseValue[]>(`/enterprise-values/${ticker}`, {
    limit: String(limit),
  });
}
