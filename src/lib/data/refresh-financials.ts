// ============================================================
// Financial Data Refresh — Shared Logic
//
// Refreshes a single company's financials, estimates, profile,
// and price targets from FMP. Used by refresh-after-earnings cron
// and manual refresh scripts.
//
// Extracted from seed.ts to avoid duplicating the 3-statement
// merge logic (income + balance sheet + cash flow → unified row).
// ============================================================

import {
  getCompanyProfile,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAnalystEstimates,
  getPriceTargetConsensus,
  getFXRateToUSD,
} from "./fmp";
import {
  upsertCompany,
  upsertFinancials,
  upsertEstimates,
  upsertPriceTargets,
} from "@/lib/db/queries";
import { convertFinancialToUSD, convertEstimateToUSD } from "./fx-convert";
import { FMP_API_DELAY_MS } from "@/lib/constants";
import type { FinancialStatement } from "@/types";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RefreshResult {
  ticker: string;
  financials: number;
  estimates: number;
  profile: boolean;
  priceTarget: boolean;
}

/**
 * Refresh all financial data for a single ticker from FMP.
 * Fetches income statement, balance sheet, cash flow, analyst estimates,
 * company profile, and price target consensus.
 *
 * FMP calls: 7 (3 statements + estimates + profile + price target + optional FX)
 */
export async function refreshFinancialsForTicker(
  ticker: string,
  reportingCurrency = "USD",
  existingFxRate?: number
): Promise<RefreshResult> {
  const result: RefreshResult = {
    ticker,
    financials: 0,
    estimates: 0,
    profile: false,
    priceTarget: false,
  };

  // Determine FX rate
  let fxRate = existingFxRate ?? 1.0;
  if (!existingFxRate && reportingCurrency.toUpperCase() !== "USD") {
    fxRate = await getFXRateToUSD(reportingCurrency).catch(() => 1.0);
    await sleep(FMP_API_DELAY_MS);
  }

  // 1. Fetch 3 financial statement types
  const incomeStmts = await getIncomeStatements(ticker, "annual", 5);
  await sleep(FMP_API_DELAY_MS);
  const balanceSheets = await getBalanceSheets(ticker, "annual", 5);
  await sleep(FMP_API_DELAY_MS);
  const cashFlows = await getCashFlowStatements(ticker, "annual", 5);
  await sleep(FMP_API_DELAY_MS);

  // 2. Merge into unified rows (same logic as seed.ts)
  const financialRows: Array<Partial<FinancialStatement> & { ticker: string; period: string }> = [];

  for (const is of incomeStmts) {
    const year = parseInt(is.calendarYear);
    const bs = balanceSheets.find((b) => b.calendarYear === is.calendarYear);
    const cf = cashFlows.find((c) => c.calendarYear === is.calendarYear);

    const taxRate =
      is.incomeBeforeTax > 0
        ? is.incomeTaxExpense / is.incomeBeforeTax
        : 0.21;

    const rawRow = {
      ticker,
      period: is.calendarYear,
      period_type: "annual" as const,
      fiscal_year: year,
      fiscal_quarter: null,
      revenue: is.revenue,
      cost_of_revenue: is.costOfRevenue,
      gross_profit: is.grossProfit,
      sga_expense: is.sellingGeneralAndAdministrativeExpenses,
      rnd_expense: is.researchAndDevelopmentExpenses,
      operating_income: is.operatingIncome,
      interest_expense: is.interestExpense,
      income_before_tax: is.incomeBeforeTax,
      income_tax: is.incomeTaxExpense,
      net_income: is.netIncome,
      ebitda: is.ebitda,
      eps: is.eps,
      eps_diluted: is.epsDiluted,
      shares_outstanding: is.weightedAverageShsOutDil,
      total_assets: bs?.totalAssets || 0,
      total_liabilities: bs?.totalLiabilities || 0,
      total_equity: bs?.totalStockholdersEquity || 0,
      total_debt: bs?.totalDebt || 0,
      cash_and_equivalents: bs?.cashAndCashEquivalents || 0,
      net_debt: bs?.netDebt || 0,
      accounts_receivable: bs?.netReceivables || 0,
      accounts_payable: bs?.accountPayables || 0,
      inventory: bs?.inventory || 0,
      operating_cash_flow: cf?.operatingCashFlow || 0,
      capital_expenditure: cf?.capitalExpenditure || 0,
      free_cash_flow: cf?.freeCashFlow || 0,
      depreciation_amortization: cf?.depreciationAndAmortization || 0,
      dividends_paid: cf?.commonDividendsPaid || 0,
      tax_rate: Math.max(0, Math.min(0.5, taxRate)),
      gross_margin: is.revenue > 0 ? is.grossProfit / is.revenue : 0,
      operating_margin: is.revenue > 0 ? is.operatingIncome / is.revenue : 0,
      net_margin: is.revenue > 0 ? is.netIncome / is.revenue : 0,
    };
    financialRows.push(convertFinancialToUSD(rawRow, fxRate));
  }

  if (financialRows.length > 0) {
    await upsertFinancials(financialRows);
    result.financials = financialRows.length;
  }

  // 3. Refresh analyst estimates
  const fmpEstimates = await getAnalystEstimates(ticker, "annual", 5);
  await sleep(FMP_API_DELAY_MS);

  if (fmpEstimates.length > 0) {
    await upsertEstimates(
      fmpEstimates.map((e) =>
        convertEstimateToUSD(
          {
            ticker,
            period: e.date.split("-")[0],
            revenue_estimate: e.revenueAvg,
            eps_estimate: e.epsAvg,
            revenue_low: e.revenueLow,
            revenue_high: e.revenueHigh,
            eps_low: e.epsLow,
            eps_high: e.epsHigh,
            number_of_analysts: e.numAnalystsRevenue,
          },
          fxRate
        )
      )
    );
    result.estimates = fmpEstimates.length;
  }

  // 4. Refresh company profile (beta, shares_outstanding)
  const profile = await getCompanyProfile(ticker);
  await sleep(FMP_API_DELAY_MS);

  if (profile) {
    await upsertCompany({
      ticker: profile.symbol,
      name: profile.companyName,
      sector: profile.sector,
      industry: profile.industry,
      market_cap: profile.marketCap,
      beta: profile.beta,
      price: profile.price,
      shares_outstanding: Math.round(profile.marketCap / profile.price),
      exchange: profile.exchange,
      reporting_currency: reportingCurrency.toUpperCase(),
      fx_rate_to_usd: fxRate,
    });
    result.profile = true;
  }

  // 5. Refresh price target consensus
  const ptConsensus = await getPriceTargetConsensus(ticker);
  if (ptConsensus) {
    await upsertPriceTargets({
      ticker,
      target_high: ptConsensus.targetHigh,
      target_low: ptConsensus.targetLow,
      target_consensus: ptConsensus.targetConsensus,
      target_median: ptConsensus.targetMedian,
      number_of_analysts: 0,
    });
    result.priceTarget = true;
  }

  return result;
}
