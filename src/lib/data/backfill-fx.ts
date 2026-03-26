// ============================================================
// One-time backfill: Convert existing non-USD financial data to USD
// Run via: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config src/lib/data/backfill-fx.ts
// ============================================================

import { createServerClient } from "@/lib/db/supabase";
import { getIncomeStatements } from "./fmp";
import { getFXRateToUSD } from "./fmp-fx";

const FMP_DELAY = 400;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Monetary columns in financial_statements that need conversion.
 * Must match MONETARY_FIELDS in fx-convert.ts.
 */
const MONETARY_FINANCIAL_COLS = [
  "revenue", "cost_of_revenue", "gross_profit", "sga_expense", "rnd_expense",
  "operating_income", "interest_expense", "income_before_tax", "income_tax",
  "net_income", "ebitda", "eps", "eps_diluted",
  "total_assets", "total_liabilities", "total_equity", "total_debt",
  "cash_and_equivalents", "net_debt", "accounts_receivable", "accounts_payable", "inventory",
  "operating_cash_flow", "capital_expenditure", "free_cash_flow",
  "depreciation_amortization", "dividends_paid",
];

const MONETARY_ESTIMATE_COLS = [
  "revenue_estimate", "eps_estimate", "revenue_low", "revenue_high", "eps_low", "eps_high",
];

async function main() {
  const db = createServerClient();

  // 1. Get all companies
  const { data: companies } = await db
    .from("companies")
    .select("ticker, reporting_currency")
    .order("ticker");

  if (!companies || companies.length === 0) {
    console.log("No companies found.");
    return;
  }

  // 2. Find companies that need currency detection
  // Companies with reporting_currency already set to non-USD have been converted.
  // We need to check companies with NULL or "USD" — they might actually be non-USD.
  const toCheck = companies.filter(
    (c) => !c.reporting_currency || c.reporting_currency === "USD"
  );

  console.log(`Checking ${toCheck.length} companies for non-USD reporting currency...\n`);

  let converted = 0;

  for (const company of toCheck) {
    try {
      // Fetch one income statement to check reportedCurrency
      const stmts = await getIncomeStatements(company.ticker, "annual", 1);
      await sleep(FMP_DELAY);

      if (!stmts[0]) continue;

      const currency = stmts[0].reportedCurrency;
      if (!currency || currency.toUpperCase() === "USD") continue;

      // Non-USD company found — get FX rate
      const fxRate = await getFXRateToUSD(currency);
      await sleep(FMP_DELAY);

      console.log(`[${company.ticker}] ${currency} → USD (rate: ${fxRate})`);

      // 3. Update companies table
      await db
        .from("companies")
        .update({ reporting_currency: currency.toUpperCase(), fx_rate_to_usd: fxRate })
        .eq("ticker", company.ticker);

      // 4. Convert financial_statements
      const { data: financials } = await db
        .from("financial_statements")
        .select("*")
        .eq("ticker", company.ticker);

      if (financials && financials.length > 0) {
        for (const row of financials) {
          const updates: Record<string, number> = {};
          for (const col of MONETARY_FINANCIAL_COLS) {
            const val = row[col];
            if (typeof val === "number" && val !== 0) {
              updates[col] = val * fxRate;
            }
          }
          // Recompute margins after converting monetary fields
          const newRevenue = updates.revenue ?? row.revenue;
          if (newRevenue > 0) {
            updates.gross_margin = (updates.gross_profit ?? row.gross_profit) / newRevenue;
            updates.operating_margin = (updates.operating_income ?? row.operating_income) / newRevenue;
            updates.net_margin = (updates.net_income ?? row.net_income) / newRevenue;
          }
          if (Object.keys(updates).length > 0) {
            await db
              .from("financial_statements")
              .update(updates)
              .eq("ticker", company.ticker)
              .eq("period", row.period);
          }
        }
        console.log(`  → Converted ${financials.length} financial rows`);
      }

      // 5. Convert analyst_estimates
      const { data: estimates } = await db
        .from("analyst_estimates")
        .select("*")
        .eq("ticker", company.ticker);

      if (estimates && estimates.length > 0) {
        for (const row of estimates) {
          const updates: Record<string, number> = {};
          for (const col of MONETARY_ESTIMATE_COLS) {
            const val = row[col];
            if (typeof val === "number" && val !== 0) {
              updates[col] = val * fxRate;
            }
          }
          if (Object.keys(updates).length > 0) {
            await db
              .from("analyst_estimates")
              .update(updates)
              .eq("ticker", company.ticker)
              .eq("period", row.period);
          }
        }
        console.log(`  → Converted ${estimates.length} estimate rows`);
      }

      converted++;
    } catch (error) {
      console.error(`[${company.ticker}] Error:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\nDone. Converted ${converted} non-USD companies.`);
  if (converted > 0) {
    console.log("Run the recompute-valuations cron to update fair values for converted tickers.");
  }
}

main().catch(console.error);
