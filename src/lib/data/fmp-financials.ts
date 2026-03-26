// FMP API — Company search, profile, and financial statements

import { fmpFetch } from "./fmp-core";

// --- Company Search ---
interface FMPSearchResult {
  symbol: string;
  name: string;
  exchangeShortName: string;
}

export async function searchTickers(
  query: string,
  limit = 8
): Promise<Array<{ ticker: string; name: string; exchange: string }>> {
  try {
    const data = await fmpFetch<FMPSearchResult[]>("/search", {
      query,
      limit: String(limit),
    });
    return (data || [])
      .filter((d) => d.exchangeShortName === "NYSE" || d.exchangeShortName === "NASDAQ" || d.exchangeShortName === "AMEX")
      .map((d) => ({
        ticker: d.symbol,
        name: d.name,
        exchange: d.exchangeShortName,
      }));
  } catch {
    return [];
  }
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
  /** FMP stable API uses commonDividendsPaid (not dividendsPaid) */
  commonDividendsPaid: number;
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
