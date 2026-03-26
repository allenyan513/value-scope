#!/usr/bin/env npx tsx
/**
 * ValuScope Data Quality Audit
 *
 * Scans ALL tickers in the database for valuation anomalies.
 * Outputs a structured report to console (summary) + file (details).
 *
 * Usage: npm run audit
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
// env vars loaded via --env-file flag in npm script

// --- Config ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Types ---
type Severity = "CRITICAL" | "WARNING" | "INFO";

interface AuditIssue {
  severity: Severity;
  ticker: string;
  company: string;
  model: string;
  issue: string;
  details: string;
}

// --- Thresholds ---
const EXTREME_HIGH_RATIO = 50;   // FV > 50x price
const EXTREME_LOW_RATIO = 0.02;  // FV < 0.02x price
const ADR_HIGH_RATIO = 10;       // ADR FV > 10x price
const ANALYST_DIVERGE_LOW = 0.2; // Our FV < 0.2x analyst target
const ANALYST_DIVERGE_HIGH = 5;  // Our FV > 5x analyst target
const MODEL_SPREAD_RATIO = 20;   // Max/min model FV > 20x
const MIN_MODELS_EXPECTED = 5;   // Should have at least 5 of 9 models
const STALE_DAYS = 7;            // Data older than 7 days

// --- Audit Checks ---
async function runAudit(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];

  console.log("Fetching data...");

  // Fetch all companies
  const { data: companies } = await db
    .from("companies")
    .select("ticker, name, price, market_cap, reporting_currency, fx_rate_to_usd");

  if (!companies || companies.length === 0) {
    console.error("No companies found in database");
    process.exit(1);
  }

  // Fetch all valuations
  const { data: valuations } = await db
    .from("valuations")
    .select("ticker, model_type, fair_value, upside_percent, computed_at, assumptions");

  // Fetch price target consensus
  const { data: priceTargets } = await db
    .from("price_target_consensus")
    .select("ticker, target_consensus");

  const companyMap = new Map(companies.map((c) => [c.ticker, c]));
  const ptMap = new Map((priceTargets ?? []).map((p) => [p.ticker, p.target_consensus]));

  // Group valuations by ticker
  const valByTicker = new Map<string, typeof valuations>();
  for (const v of valuations ?? []) {
    const list = valByTicker.get(v.ticker) ?? [];
    list.push(v);
    valByTicker.set(v.ticker, list);
  }

  const currentModels = new Set([
    "dcf_3stage", "dcf_pe_exit_10y", "dcf_ebitda_exit_fcfe_10y",
    "pe_multiples", "ev_ebitda_multiples", "pb_multiples", "ps_multiples", "p_fcf_multiples",
    "peg",
  ]);

  console.log(`Scanning ${companies.length} tickers...\n`);

  for (const company of companies) {
    const ticker = company.ticker;
    const price = company.price || 0;
    const models = valByTicker.get(ticker) ?? [];
    const validModels = models.filter((m) => currentModels.has(m.model_type) && m.fair_value > 0);
    const isADR = company.reporting_currency && company.reporting_currency !== "USD";

    // --- Check 1: No valuations ---
    if (models.length === 0) {
      issues.push({
        severity: "CRITICAL",
        ticker,
        company: company.name,
        model: "-",
        issue: "No valuations",
        details: `No valuation results in DB. Currency: ${company.reporting_currency || "USD"}`,
      });
      continue;
    }

    // --- Check 2: Extreme fair values ---
    for (const m of validModels) {
      if (price <= 0) continue;
      const ratio = m.fair_value / price;

      if (ratio > EXTREME_HIGH_RATIO || ratio < EXTREME_LOW_RATIO) {
        issues.push({
          severity: "CRITICAL",
          ticker,
          company: company.name,
          model: m.model_type,
          issue: ratio > 1 ? `FV ${ratio.toFixed(1)}x price` : `FV ${ratio.toFixed(4)}x price`,
          details: `Price=$${price.toFixed(2)}, FV=$${m.fair_value.toFixed(2)}`,
        });
      }
    }

    // --- Check 3: ADR currency suspect ---
    if (isADR) {
      for (const m of validModels) {
        if (price <= 0) continue;
        const ratio = m.fair_value / price;
        if (ratio > ADR_HIGH_RATIO) {
          issues.push({
            severity: "CRITICAL",
            ticker,
            company: company.name,
            model: m.model_type,
            issue: `ADR: FV ${ratio.toFixed(1)}x price`,
            details: `Currency=${company.reporting_currency}, FX=${company.fx_rate_to_usd}, FV=$${m.fair_value.toFixed(2)}`,
          });
        }
      }
    }

    // --- Check 4: Model spread (max/min ratio) ---
    if (validModels.length >= 3) {
      const fairValues = validModels.map((m) => m.fair_value);
      const maxFV = Math.max(...fairValues);
      const minFV = Math.min(...fairValues);
      const spread = minFV > 0 ? maxFV / minFV : Infinity;

      if (spread > MODEL_SPREAD_RATIO) {
        issues.push({
          severity: "CRITICAL",
          ticker,
          company: company.name,
          model: "cross-model",
          issue: `Model spread ${spread.toFixed(1)}x`,
          details: `Min=$${minFV.toFixed(2)}, Max=$${maxFV.toFixed(2)}`,
        });
      }
    }

    // --- Check 5: vs Analyst price target ---
    const analystTarget = ptMap.get(ticker);
    if (analystTarget && analystTarget > 0 && validModels.length > 0) {
      const fairValues = validModels.map((m) => m.fair_value).sort((a, b) => a - b);
      const medianFV = fairValues[Math.floor(fairValues.length / 2)];
      const ratio = medianFV / analystTarget;

      if (ratio < ANALYST_DIVERGE_LOW || ratio > ANALYST_DIVERGE_HIGH) {
        issues.push({
          severity: "WARNING",
          ticker,
          company: company.name,
          model: "consensus",
          issue: `FV ${ratio.toFixed(2)}x analyst target`,
          details: `Median FV=$${medianFV.toFixed(2)}, Analyst=$${analystTarget.toFixed(2)}`,
        });
      }
    }

    // --- Check 6: Peer-based with small peer count ---
    for (const m of models) {
      const assumptions = m.assumptions as Record<string, unknown> | null;
      if (assumptions?.method === "peer_comparison") {
        const peerCount = (assumptions.peer_count as number) ?? 0;
        if (peerCount < 3 && m.fair_value > 0) {
          issues.push({
            severity: "WARNING",
            ticker,
            company: company.name,
            model: m.model_type,
            issue: `Peer-based with only ${peerCount} peers`,
            details: `Industry: ${assumptions.industry ?? "unknown"}`,
          });
        }
      }
    }

    // --- Check 7: Missing models ---
    const activeModelCount = models.filter((m) => currentModels.has(m.model_type)).length;
    if (activeModelCount < MIN_MODELS_EXPECTED) {
      issues.push({
        severity: "WARNING",
        ticker,
        company: company.name,
        model: "-",
        issue: `Only ${activeModelCount}/9 models`,
        details: `Missing models may indicate data gaps`,
      });
    }

    // --- Check 8: Stale data ---
    const latestCompute = models
      .map((m) => new Date(m.computed_at).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    const daysSinceCompute = (Date.now() - latestCompute) / (1000 * 60 * 60 * 24);

    if (daysSinceCompute > STALE_DAYS) {
      issues.push({
        severity: "INFO",
        ticker,
        company: company.name,
        model: "-",
        issue: `Data ${Math.round(daysSinceCompute)} days old`,
        details: `Last computed: ${new Date(latestCompute).toISOString().split("T")[0]}`,
      });
    }

    // --- Check 9: Orphaned model types ---
    for (const m of models) {
      if (!currentModels.has(m.model_type)) {
        issues.push({
          severity: "INFO",
          ticker,
          company: company.name,
          model: m.model_type,
          issue: "Orphaned model type",
          details: `Not in current 9-model suite`,
        });
      }
    }
  }

  return issues;
}

// --- Report Generation ---
function generateReport(issues: AuditIssue[], totalTickers: number): string {
  const critical = issues.filter((i) => i.severity === "CRITICAL");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const info = issues.filter((i) => i.severity === "INFO");

  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [];

  lines.push(`# ValuScope Data Quality Audit — ${date}`);
  lines.push("");
  lines.push(`> Scanned: ${totalTickers} tickers | ${critical.length} CRITICAL | ${warnings.length} WARNING | ${info.length} INFO`);
  lines.push("");

  const formatSection = (title: string, items: AuditIssue[]) => {
    lines.push(`## ${title} (${items.length})`);
    lines.push("");
    if (items.length === 0) {
      lines.push("None.");
      lines.push("");
      return;
    }
    lines.push("| Ticker | Company | Model | Issue | Details |");
    lines.push("|--------|---------|-------|-------|---------|");
    for (const item of items) {
      lines.push(`| ${item.ticker} | ${item.company} | ${item.model} | ${item.issue} | ${item.details} |`);
    }
    lines.push("");
  };

  formatSection("CRITICAL — Likely Bugs", critical);
  formatSection("WARNING — Worth Investigating", warnings);
  formatSection("INFO — Edge Cases", info);

  return lines.join("\n");
}

function printSummary(issues: AuditIssue[], totalTickers: number) {
  const critical = issues.filter((i) => i.severity === "CRITICAL");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const info = issues.filter((i) => i.severity === "INFO");

  console.log("=== ValuScope Data Quality Audit ===\n");
  console.log(`Scanned: ${totalTickers} tickers`);
  console.log(`Results: ${critical.length} CRITICAL | ${warnings.length} WARNING | ${info.length} INFO\n`);

  if (critical.length > 0) {
    console.log("CRITICAL:");
    for (const c of critical.slice(0, 20)) {
      console.log(`  ${c.ticker.padEnd(6)} ${c.model.padEnd(25)} ${c.issue}`);
    }
    if (critical.length > 20) console.log(`  ... and ${critical.length - 20} more`);
    console.log("");
  }

  if (warnings.length > 0) {
    console.log("WARNING:");
    for (const w of warnings.slice(0, 15)) {
      console.log(`  ${w.ticker.padEnd(6)} ${w.model.padEnd(25)} ${w.issue}`);
    }
    if (warnings.length > 15) console.log(`  ... and ${warnings.length - 15} more`);
    console.log("");
  }

  if (info.length > 0) {
    console.log(`INFO: ${info.length} items (see full report for details)`);
    console.log("");
  }
}

// --- Main ---
async function main() {
  const startTime = Date.now();

  const issues = await runAudit();

  // Get total ticker count
  const { count } = await db.from("companies").select("*", { count: "exact", head: true });
  const totalTickers = count ?? 0;

  // Console summary
  printSummary(issues, totalTickers);

  // Write full report
  const report = generateReport(issues, totalTickers);
  const date = new Date().toISOString().split("T")[0];
  const reportPath = path.join(__dirname, "..", "reports", `audit-${date}.md`);
  fs.writeFileSync(reportPath, report);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Report saved: reports/audit-${date}.md`);
  console.log(`Completed in ${elapsed}s`);

  // Exit with error code if critical issues found
  if (issues.filter((i) => i.severity === "CRITICAL").length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(2);
});
