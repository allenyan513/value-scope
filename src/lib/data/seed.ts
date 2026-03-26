// ============================================================
// S&P 500 Data Seeding Script
// Run via: npx tsx src/lib/data/seed.ts
// ============================================================

import {
  getCompanyProfile,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAnalystEstimates,
  getHistoricalPrices,
} from "./fmp";
import { SP500_TICKERS } from "./sp500-tickers";
import {
  upsertCompany,
  upsertFinancials,
  upsertDailyPrices,
  upsertEstimates,
} from "../db/queries";
import type { FinancialStatement } from "@/types";
import { FMP_API_DELAY_MS, DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import { toDateString } from "@/lib/format";
import { createServerClient } from "@/lib/db/supabase";

// Rate limiter: FMP Starter allows 300 req/min
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Seed a single company's data from FMP into Supabase.
 * Used both by batch seeding and on-demand provisioning.
 */
export async function seedSingleCompany(ticker: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch company profile
    const profile = await getCompanyProfile(ticker);
    if (!profile) {
      console.warn(`  [SKIP] No profile for ${ticker}`);
      return { success: false, error: "No profile found — ticker may not exist" };
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
      description: profile.description?.slice(0, DESCRIPTION_MAX_LENGTH) || "",
      logo_url: profile.image || null,
    });

    await sleep(FMP_API_DELAY_MS);

    // 2. Fetch financial statements sequentially to avoid rate limits
    const incomeStmts = await getIncomeStatements(ticker, "annual", 5);
    await sleep(FMP_API_DELAY_MS);
    const balanceSheets = await getBalanceSheets(ticker, "annual", 5);
    await sleep(FMP_API_DELAY_MS);
    const cashFlows = await getCashFlowStatements(ticker, "annual", 5);
    await sleep(FMP_API_DELAY_MS);

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
        dividends_paid: cf?.commonDividendsPaid || 0,
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
      toDateString(twoYearsAgo)
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
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  [ERROR] ${ticker}:`, msg);
    return { success: false, error: msg };
  }
}

async function main() {
  console.log("🚀 Starting S&P 500 data seeding...\n");

  // 1. Use static S&P 500 ticker list (FMP /sp500-constituent requires higher plan)
  const allTickers = [...SP500_TICKERS];
  console.log(`S&P 500 list: ${allTickers.length} companies\n`);

  // 2. Fetch existing tickers from DB to enable resume (skip already-seeded)
  const db = createServerClient();
  const { data: existingRows } = await db.from("companies").select("ticker");
  const existingTickers = new Set((existingRows ?? []).map((r) => r.ticker));
  const toSeed = allTickers.filter((t) => !existingTickers.has(t));
  console.log(`${existingTickers.size} already in DB, ${toSeed.length} to seed\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toSeed.length; i++) {
    const symbol = toSeed[i];
    console.log(`[${i + 1}/${toSeed.length}] Seeding ${symbol}...`);

    const result = await seedSingleCompany(symbol);
    if (result.success) success++;
    else failed++;

    // Rate limiting: ~5 API calls per company, pace to stay under 300/min
    await sleep(1200);
  }

  console.log(`\n✅ Seeding complete: ${success} success, ${failed} failed (${existingTickers.size} skipped)`);
}

// Only run if executed directly via: npx tsx src/lib/data/seed.ts
// Check if this file is the entry point (not imported as a module)
const isDirectRun = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  main().catch(console.error);
}
