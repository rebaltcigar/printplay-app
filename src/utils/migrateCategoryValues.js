/**
 * migrateCategoryValues.js
 *
 * One-time migration: rename the `category` field values in the `services`
 * Firestore collection from the old accounting-style naming to plain English.
 *
 *   'Debit'  →  'Sale'     (services/retail items that generate revenue)
 *   'Credit' →  'Expense'  (expense types that represent costs)
 *
 * HOW TO RUN:
 *   1. Import this file temporarily in main.jsx or run from the browser console
 *      after the app has loaded (Firebase is initialised).
 *   2. Call: await runCategoryMigration()
 *   3. Remove the import once done.
 *
 * The function is idempotent — safe to re-run; docs already on new values
 * are skipped.
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

export async function runCategoryMigration() {
  console.log('[Migration] Starting category value migration…');

  const snap = await getDocs(collection(db, 'services'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const toDebitFix   = all.filter(d => d.category === 'Debit');   // → 'Sale'
  const toCreditFix  = all.filter(d => d.category === 'Credit');  // → 'Expense'
  const alreadyFixed = all.filter(d => d.category === 'Sale' || d.category === 'Expense');

  console.log(`[Migration] Found:`);
  console.log(`  → ${toDebitFix.length}  docs with category='Debit'  (will rename to 'Sale')`);
  console.log(`  → ${toCreditFix.length} docs with category='Credit' (will rename to 'Expense')`);
  console.log(`  → ${alreadyFixed.length} docs already on new values (skipped)`);

  if (toDebitFix.length === 0 && toCreditFix.length === 0) {
    console.log('[Migration] Nothing to do. All docs are already on new values.');
    return { updated: 0, skipped: alreadyFixed.length };
  }

  // Firestore writeBatch supports up to 500 ops per batch
  const BATCH_SIZE = 400;
  const toUpdate = [
    ...toDebitFix.map(d => ({ id: d.id, category: 'Sale' })),
    ...toCreditFix.map(d => ({ id: d.id, category: 'Expense' })),
  ];

  let updatedCount = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, category }) => {
      batch.update(doc(db, 'services', id), { category });
    });
    await batch.commit();
    updatedCount += chunk.length;
    console.log(`[Migration] Committed ${updatedCount}/${toUpdate.length} docs…`);
  }

  console.log(`[Migration] ✅ Done! Updated ${updatedCount} docs.`);
  return { updated: updatedCount, skipped: alreadyFixed.length };
}
