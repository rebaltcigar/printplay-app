/**
 * export-to-csv.mjs
 *
 * Exports all Firestore collections to CSV files.
 *
 * Prerequisites:
 *   npm install firebase-admin   (run once inside the scripts/ folder, or at project root)
 *
 * Usage:
 *   node scripts/export-to-csv.mjs --key=path/to/serviceAccountKey.json [--env=prod|dev] [--out=./exports]
 *
 * Options:
 *   --key   Path to your Firebase service account JSON key (required)
 *   --env   "prod" (default) or "dev" — selects which project to export from
 *   --out   Output directory for CSV files (default: ./exports)
 *
 * How to get a service account key:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createWriteStream, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';

// --------------------------------------------------------------------------
// Parse CLI args
// --------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  })
);

const keyPath   = args.key ?? './firebase-service-account-prod.json';
const outDir    = resolve(args.out ?? './exports');

// --------------------------------------------------------------------------
// Collections to export  (top-level only — subcollections listed separately)
// --------------------------------------------------------------------------
const TOP_LEVEL_COLLECTIONS = [
  'users',
  'shifts',
  'transactions',
  'orders',
  'customers',
  'invoices',
  'services',
  'inventory_logs',
  'drawer_logs',
  'payroll_logs',
  'payPeriods',
  'paySchedules',
  'payrollRuns',
  'shiftTemplates',
  'schedules',
  'counters',
  'settings',
  'app_status',
  'stats_daily',
];

// Subcollections: { parent: collectionId, sub: subCollectionId }
// These are fetched per-document and merged into a flat CSV.
const SUBCOLLECTIONS = [
  { parent: 'payrollRuns', sub: 'lines' },
  { parent: 'payrollRuns', sub: 'paystubs' },
  { parent: 'payrollRuns', sub: 'shifts' },
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Flatten a Firestore document (nested objects → dot-notation keys) */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor?.name !== 'Timestamp') {
      Object.assign(out, flatten(v, key));
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else if (v && v.constructor?.name === 'Timestamp') {
      out[key] = v.toDate().toISOString();
    } else {
      out[key] = v ?? '';
    }
  }
  return out;
}

/** Escape a single CSV cell value */
function escapeCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Write an array of flat objects to a CSV file */
function writeCsv(filePath, rows) {
  if (rows.length === 0) {
    console.log(`  (empty — skipped)`);
    return;
  }

  // Collect all column headers across all rows
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];

  const stream = createWriteStream(filePath, { encoding: 'utf8' });
  stream.write('\uFEFF'); // BOM for Excel compatibility
  stream.write(headers.map(escapeCell).join(',') + '\n');
  for (const row of rows) {
    stream.write(headers.map(h => escapeCell(row[h])).join(',') + '\n');
  }
  stream.end();
  console.log(`  ✓  ${rows.length} rows → ${filePath}`);
}

// --------------------------------------------------------------------------
// Main export logic
// --------------------------------------------------------------------------

async function exportCollection(db, collectionId, outDir) {
  console.log(`\nExporting: ${collectionId}`);
  const snap = await db.collection(collectionId).get();
  const rows = snap.docs.map(doc => ({ _id: doc.id, ...flatten(doc.data()) }));
  writeCsv(join(outDir, `${collectionId}.csv`), rows);
  return snap.docs; // return docs for subcollection fetching
}

async function exportSubcollection(db, docs, parentId, subId, outDir) {
  console.log(`\nExporting: ${parentId}/${subId}`);
  const rows = [];
  for (const doc of docs) {
    const subSnap = await db.collection(parentId).doc(doc.id).collection(subId).get();
    for (const subDoc of subSnap.docs) {
      rows.push({
        _parent_id: doc.id,
        _id: subDoc.id,
        ...flatten(subDoc.data()),
      });
    }
  }
  writeCsv(join(outDir, `${parentId}__${subId}.csv`), rows);
}

async function main() {
  // Load service account
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
  } catch (e) {
    console.error(`Error reading key file: ${e.message}`);
    process.exit(1);
  }

  // Determine project ID from key (override possible via --env if needed)
  const projectId = serviceAccount.project_id;
  console.log(`\nConnecting to Firestore project: ${projectId}`);
  console.log(`Output directory: ${outDir}\n`);

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  mkdirSync(outDir, { recursive: true });

  // Track docs for subcollection exports
  const docsByCollection = {};

  for (const col of TOP_LEVEL_COLLECTIONS) {
    try {
      docsByCollection[col] = await exportCollection(db, col, outDir);
    } catch (e) {
      console.warn(`  ! Could not export ${col}: ${e.message}`);
    }
  }

  for (const { parent, sub } of SUBCOLLECTIONS) {
    if (!docsByCollection[parent]) continue;
    try {
      await exportSubcollection(db, docsByCollection[parent], parent, sub, outDir);
    } catch (e) {
      console.warn(`  ! Could not export ${parent}/${sub}: ${e.message}`);
    }
  }

  console.log('\n✅ Export complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
