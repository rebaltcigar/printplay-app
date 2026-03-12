/**
 * repair_expenses.js
 *
 * Re-reads expense records from Firebase Firestore and patches the Supabase
 * `expenses` table with correct `amount` and `quantity` values.
 *
 * Why this is needed:
 *   The original migrate.js saved `amount = d.total || d.amount || d.price`.
 *   If a Firebase expense doc had no `total` field it fell back to `d.price`
 *   (unit price), so multi-quantity expenses ended up with amount = unit_price
 *   instead of amount = qty * unit_price.
 *
 * Usage:
 *   node scripts/repair_expenses.js          # dev
 *   node scripts/repair_expenses.js --prod   # production
 *   node scripts/repair_expenses.js --dry-run # preview only, no writes
 */

import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const isProd = process.argv.includes('--prod');
const isDryRun = process.argv.includes('--dry-run');
const envFile = isProd ? '.env.production' : '.env.development';
const serviceAccountPath = isProd
    ? './firebase-service-account-prod.json'
    : './firebase-service-account-dev.json';

dotenv.config({ path: envFile });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error(`❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

try {
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
    console.error('❌ Firebase service account error:', e.message);
    process.exit(1);
}

const db = admin.firestore();

const mapTimestamp = (ts) => {
    if (!ts) return null;
    if (typeof ts === 'string') return ts;
    if (ts.toDate) return ts.toDate().toISOString();
    const seconds = ts._seconds ?? ts.seconds;
    if (seconds != null) return new Date(seconds * 1000).toISOString();
    return null;
};

const resolveId = (d) => {
    const raw = d.displayId || d.display_id || d.id || d.fsId;
    return String(raw).trim().replace(/\s+/g, '_');
};

const run = async () => {
    console.log(`\n🔧 Expense repair — ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}${isDryRun ? ' [DRY RUN]' : ''}`);

    // 1. Pull all transactions from Firebase
    console.log('\n📥 Fetching transactions from Firestore...');
    const snapshot = await db.collection('transactions').get();
    if (snapshot.empty) {
        console.log('No transactions found in Firestore.');
        process.exit(0);
    }

    const allDocs = snapshot.docs.map(doc => ({ fsId: doc.id, ...doc.data() }));

    // 2. Filter to expense records only (EXP-* prefix)
    const expenseDocs = allDocs.filter(d => {
        const id = resolveId(d);
        return id.startsWith('EXP-') || id.startsWith('EXP_');
    });

    console.log(`Found ${allDocs.length} total transactions, ${expenseDocs.length} expenses.`);

    if (expenseDocs.length === 0) {
        console.log('No expense records to repair.');
        process.exit(0);
    }

    // 3. For each expense, compute the correct amount
    const repairs = [];
    const skipped = [];

    for (const d of expenseDocs) {
        const id = resolveId(d);
        const qty = Number(d.quantity) || 1;
        const price = Number(d.price) || 0;
        const fbTotal = Number(d.total) || 0;

        // Correct amount: prefer explicit total, otherwise qty * price
        const correctAmount = fbTotal > 0 ? fbTotal : qty * price;

        repairs.push({
            id,
            quantity: qty,
            amount: correctAmount,
            // For reference / logging
            _fbTotal: fbTotal,
            _fbPrice: price,
            _fbQty: qty,
        });
    }

    // 4. Show a preview
    const changed = repairs.filter(r => {
        // We'll flag ones where qty>1 and fbTotal was 0 (fell back to price)
        return r._fbTotal === 0 && r._fbQty > 1;
    });

    console.log(`\n📋 Records where total was missing in Firebase (fell back to price * qty):`);
    if (changed.length === 0) {
        console.log('  None — all expense records had an explicit total in Firebase.');
    } else {
        console.table(changed.map(r => ({
            id: r.id,
            qty: r._fbQty,
            price: r._fbPrice,
            fb_total: r._fbTotal,
            corrected_amount: r.amount,
        })));
    }

    console.log(`\n📋 All ${repairs.length} expense records will be patched with qty + amount from Firebase.`);

    if (isDryRun) {
        console.log('\n✅ Dry run complete — no changes written.');
        process.exit(0);
    }

    // 5. Apply updates to Supabase in batches
    console.log('\n💾 Applying patches to Supabase...');
    let updated = 0;
    let errors = 0;
    const BATCH = 50;

    for (let i = 0; i < repairs.length; i += BATCH) {
        const batch = repairs.slice(i, i + BATCH);
        await Promise.all(batch.map(async (r) => {
            const { error } = await supabase
                .from('expenses')
                .update({ amount: r.amount, quantity: r.quantity })
                .eq('id', r.id);
            if (error) {
                console.error(`  ❌ Failed to update ${r.id}:`, error.message);
                errors++;
            } else {
                updated++;
            }
        }));
        console.log(`  Processed ${Math.min(i + BATCH, repairs.length)} / ${repairs.length}...`);
    }

    console.log(`\n✅ Done. Updated: ${updated}, Errors: ${errors}`);
    process.exit(errors > 0 ? 1 : 0);
};

run().catch(err => {
    console.error('💥 Script crashed:', err.message);
    process.exit(1);
});
