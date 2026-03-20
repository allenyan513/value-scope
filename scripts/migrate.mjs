// ============================================================
// Database Migration Script (pure JS, no psql needed)
// Uses postgres.js — works anywhere Node.js runs
//
// Usage:
//   node --env-file=.env.local scripts/migrate.mjs
//   node --env-file=.env.local scripts/migrate.mjs src/lib/db/some-migration.sql
// ============================================================

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.local scripts/migrate.mjs');
  process.exit(1);
}

// Build connection string from Supabase URL
// https://xxx.supabase.co -> postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

// Supabase direct connection (port 5432) using service_role JWT as password
// This works with Supabase's built-in pg_bouncer
const connectionString = `postgresql://postgres.${projectRef}:${SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString, {
  ssl: 'require',
  connection: { application_name: 'valuescope-migrate' },
});

// Determine which SQL file to run
const sqlFile = process.argv[2] || 'src/lib/db/schema.sql';
const sqlPath = resolve(sqlFile);

let fileContent;
try {
  fileContent = readFileSync(sqlPath, 'utf-8');
} catch {
  console.error(`Cannot read: ${sqlPath}`);
  process.exit(1);
}

console.log(`📦 Running migration: ${sqlFile}`);
console.log(`🔗 Project: ${projectRef}\n`);

try {
  // Execute entire file as a single transaction
  await sql.unsafe(fileContent);
  console.log('✅ Migration completed successfully!\n');

  // Verify tables were created
  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log('Tables in public schema:');
  for (const t of tables) {
    console.log(`  • ${t.tablename}`);
  }
} catch (err) {
  console.error('❌ Migration failed:\n');
  console.error(err.message);
  process.exit(1);
} finally {
  await sql.end();
}
