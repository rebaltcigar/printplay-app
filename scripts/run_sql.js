/**
 * Helper: Execute a SQL file (or string) against a Supabase project
 * via direct pg connection (management API is blocked on this network).
 *
 * Usage:
 *   node scripts/run_sql.js <sql-file> [--prod]
 *   node scripts/run_sql.js --inline "SELECT 1" [--prod]
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const DEV_DB_PASSWORD  = 'jcsYbDrLRpb6ITj4';
const PROD_DB_PASSWORD = 'BT4u1cX3ld56Xy2j';
const DEV_PROJECT_REF  = 'euckwqeyfhtfzbmbdzqg';
const PROD_PROJECT_REF = 'utdkuftaavxvieosqqzz';

const isProd = process.argv.includes('--prod');
const ref    = isProd ? PROD_PROJECT_REF : DEV_PROJECT_REF;
const pass   = isProd ? PROD_DB_PASSWORD : DEV_DB_PASSWORD;

const connectionString = `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/postgres`;

const inlineIdx = process.argv.indexOf('--inline');
let sql;

if (inlineIdx !== -1) {
  sql = process.argv[inlineIdx + 1];
} else {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/run_sql.js <sql-file> [--prod]');
    process.exit(1);
  }
  sql = fs.readFileSync(path.resolve(filePath), 'utf8');
}

console.log(`Targeting: ${isProd ? 'PROD' : 'DEV'} (${ref})`);
console.log(`SQL length: ${sql.length} chars\n`);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const result = await client.query(sql);
  const rows = Array.isArray(result) ? result.flatMap(r => r.rows ?? []) : (result.rows ?? []);
  if (rows.length === 0) {
    console.log('✅ Done (no rows returned — DDL succeeded)');
  } else {
    console.log('✅ Result:', JSON.stringify(rows, null, 2));
  }
} finally {
  await client.end();
}
