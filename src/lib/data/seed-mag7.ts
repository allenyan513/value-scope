// Seed only Magnificent 7 stocks
// Run via: npx tsx src/lib/data/seed-mag7.ts

import {
  getCompanyProfile,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAnalystEstimates,
  getHistoricalPrices,
} from "./fmp";
import {
  upsertCompany,
  upsertFinancials,
  upsertDailyPrices,
  upsertEstimates,
} from "../db/queries";
import type { FinancialStatement } from "@/types";

const MAG7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedCompany(ticker: string): Promise<boolean> {
  try {
    const profile = await getCompanyProfile(ticker);
    if (!profile) {
      console.warn(`  [SKIP] No profile for ${ticker}`);
      return false;
    }

    await upsertCompany({
      ticker: profile.symbol,
      name: profile.companyName,
      sector: profile.sector,
      industry: profile.industry,
      market_cap: profile.mktCap,
      beta: profile.beta,
      price: profile.price,
      shares_outstanding: Math.round(profile.mktCap / profile.price),
      exchange: profile.exchange,
      description: profile.description?.slice(0, 1000) || "",
      logo_url: profile.image || null,
    });

    await sleep(1000);

    // Fetch sequentially to avoid rate limits
    const incomeStmts = await getIncomeStatements(ticker, "annual", 5);
    await sleep(1000);
    const balanceSheets = await getBalanceSheets(ticker, "annual", 5);
    await sleep(1000);
    const cashFlows = await getCashFlowStatements(ticker, "annual", 5);
    await sleep(1000);

    const financialRows: Array<Partial<FinancialStatement> & { ticker: string; period: string }> = [];

    for (const is of incomeStmts) {
      const year = parseInt(is.calendarYear);
      const bs = balanceSheets.find((b) => b.calendarYear === is.calendarYear);
      const cf = cashFlows.find((c) => c.calendarYear === is.calendarYear);

      const taxRate =
        is.incomeBeforeTax > 0
          ? is.incomeTaxExpense / is.incomeBeforeTax
          : 0.21;

      financialRows.push({
        ticker,
        period: is.calendarYear,
        period_type: "annual",
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
        eps_diluted: is.epsdiluted,
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
        dividends_paid: cf?.dividendsPaid || 0,
        tax_rate: Math.max(0, Math.min(0.5, taxRate)),
        gross_margin: is.revenue > 0 ? is.grossProfit / is.revenue : 0,
        operating_margin: is.revenue > 0 ? is.operatingIncome / is.revenue : 0,
        net_margin: is.revenue > 0 ? is.netIncome / is.revenue : 0,
      });
    }

    if (financialRows.length > 0) {
      await upsertFinancials(financialRows);
    }

    const estimates = await getAnalystEstimates(ticker, "annual", 3);
    await sleep(1000);

    if (estimates.length > 0) {
      await upsertEstimates(
        estimates.map((e) => ({
          ticker,
          period: e.date.split("-")[0],
          revenue_estimate: e.estimatedRevenueAvg,
          eps_estimate: e.estimatedEpsAvg,
          revenue_low: e.estimatedRevenueLow,
          revenue_high: e.estimatedRevenueHigh,
          eps_low: e.estimatedEpsLow,
          eps_high: e.estimatedEpsHigh,
          number_of_analysts: e.numberAnalystEstimatedRevenue,
        }))
      );
    }

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const prices = await getHistoricalPrices(
      ticker,
      twoYearsAgo.toISOString().split("T")[0]
    );
    await sleep(1000);

    if (prices.length > 0) {
      await upsertDailyPrices(
        prices.map((p) => ({
          ticker,
          date: p.date,
          close_price: p.close,
          volume: p.volume,
        }))
      );
    }

    console.log(
      `  [OK] ${ticker}: ${financialRows.length} years financials, ${estimates.length} estimates, ${prices.length} daily prices`
    );
    return true;
  } catch (error) {
    console.error(`  [ERROR] ${ticker}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  console.log("🚀 Seeding Magnificent 7...\n");

  let success = 0;
  let failed = 0;

  for (let i = 0; i < MAG7.length; i++) {
    const ticker = MAG7[i];
    console.log(`[${i + 1}/${MAG7.length}] Seeding ${ticker}...`);

    const ok = await seedCompany(ticker);
    if (ok) success++;
    else failed++;

    await sleep(2000);
  }

  console.log(`\n✅ Done: ${success} success, ${failed} failed`);
}

main().catch(console.error);
