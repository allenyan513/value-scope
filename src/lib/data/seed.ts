// ============================================================
// S&P 500 Data Seeding Script
// Run via: npx tsx src/lib/data/seed.ts
// ============================================================

import {
  getSP500Constituents,
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

// Rate limiter: FMP Starter allows 300 req/min
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedCompany(ticker: string): Promise<boolean> {
  try {
    // 1. Fetch company profile
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
      market_cap: profile.marketCap,
      beta: profile.beta,
      price: profile.price,
      shares_outstanding: Math.round(profile.marketCap / profile.price),
      exchange: profile.exchange,
      description: profile.description?.slice(0, 1000) || "",
      logo_url: profile.image || null,
    });

    await sleep(200);

    // 2. Fetch financial statements (5 years annual)
    const [incomeStmts, balanceSheets, cashFlows] = await Promise.all([
      getIncomeStatements(ticker, "annual", 7),
      getBalanceSheets(ticker, "annual", 7),
      getCashFlowStatements(ticker, "annual", 7),
    ]);

    await sleep(400);

    // Merge into unified financial statements
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
        // Income Statement
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
        // Balance Sheet
        total_assets: bs?.totalAssets || 0,
        total_liabilities: bs?.totalLiabilities || 0,
        total_equity: bs?.totalStockholdersEquity || 0,
        total_debt: bs?.totalDebt || 0,
        cash_and_equivalents: bs?.cashAndCashEquivalents || 0,
        net_debt: bs?.netDebt || 0,
        accounts_receivable: bs?.netReceivables || 0,
        accounts_payable: bs?.accountPayables || 0,
        inventory: bs?.inventory || 0,
        // Cash Flow
        operating_cash_flow: cf?.operatingCashFlow || 0,
        capital_expenditure: cf?.capitalExpenditure || 0,
        free_cash_flow: cf?.freeCashFlow || 0,
        depreciation_amortization: cf?.depreciationAndAmortization || 0,
        dividends_paid: cf?.dividendsPaid || 0,
        // Derived
        tax_rate: Math.max(0, Math.min(0.5, taxRate)),
        gross_margin: is.revenue > 0 ? is.grossProfit / is.revenue : 0,
        operating_margin: is.revenue > 0 ? is.operatingIncome / is.revenue : 0,
        net_margin: is.revenue > 0 ? is.netIncome / is.revenue : 0,
      });
    }

    if (financialRows.length > 0) {
      await upsertFinancials(financialRows);
    }

    // 3. Fetch analyst estimates
    const estimates = await getAnalystEstimates(ticker, "annual", 5);
    await sleep(200);

    if (estimates.length > 0) {
      await upsertEstimates(
        estimates.map((e) => ({
          ticker,
          period: e.date.split("-")[0], // extract year
          revenue_estimate: e.revenueAvg,
          eps_estimate: e.epsAvg,
          revenue_low: e.revenueLow,
          revenue_high: e.revenueHigh,
          eps_low: e.epsLow,
          eps_high: e.epsHigh,
          number_of_analysts: e.numAnalystsRevenue,
        }))
      );
    }

    // 4. Fetch 2 years of daily prices
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const prices = await getHistoricalPrices(
      ticker,
      twoYearsAgo.toISOString().split("T")[0]
    );
    await sleep(200);

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
  console.log("🚀 Starting S&P 500 data seeding...\n");

  // 1. Get S&P 500 constituent list
  const constituents = await getSP500Constituents();
  console.log(`Found ${constituents.length} S&P 500 companies\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < constituents.length; i++) {
    const { symbol } = constituents[i];
    console.log(`[${i + 1}/${constituents.length}] Seeding ${symbol}...`);

    const ok = await seedCompany(symbol);
    if (ok) success++;
    else failed++;

    // Rate limiting: ~5 API calls per company, pace to stay under 300/min
    await sleep(1200);
  }

  console.log(`\n✅ Seeding complete: ${success} success, ${failed} failed`);
}

// Only run if executed directly
main().catch(console.error);
