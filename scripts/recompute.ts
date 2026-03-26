#!/usr/bin/env npx tsx
/**
 * Manual valuation recompute for all companies.
 * DB-only, zero FMP calls.
 *
 * Usage: npm run recompute
 */

import { recomputeAllValuations } from "../src/lib/data/recompute";

async function main() {
  console.log("📊 Starting valuation recompute...\n");
  const start = Date.now();

  const result = await recomputeAllValuations();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Total: ${result.total} | Computed: ${result.success} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
}

main().catch((err) => {
  console.error("Recompute failed:", err);
  process.exit(1);
});
