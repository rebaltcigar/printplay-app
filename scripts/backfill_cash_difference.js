/**
 * backfill_cash_difference.js
 *
 * Backfills the `cash_difference` column on the `shifts` table for all past
 * shifts that were already consolidated (have denominations) but predate the
 * column being added.
 *
 * cash_difference = cashOnHand - expectedCash
 *   Positive = overage, Negative = shortage, NULL = not consolidated.
 *
 * DB schema (confirmed from supabase_schema.sql):
 *   order_items  → item name: "name",  payment: "payment_method"
 *   pc_transactions → NO item column; has "payment_method", "amount"
 *   expenses     → item name: "item",  NO payment method column
 *
 * Usage:
 *   node scripts/backfill_cash_difference.js            # dev
 *   node scripts/backfill_cash_difference.js --prod     # production
 *   node scripts/backfill_cash_difference.js --dry-run  # preview, no writes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const isProd   = process.argv.includes('--prod');
const isDryRun = process.argv.includes('--dry-run');
const envFile  = isProd ? '.env.production' : '.env.development';

dotenv.config({ path: envFile });

const supabaseUrl        = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error(`❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ---------------------------------------------------------------------------
// Financial logic (mirrors src/utils/shiftFinancials.js → computeShiftFinancials)
// ---------------------------------------------------------------------------

const DIGITAL_METHODS = new Set(['GCash', 'Maya', 'Bank Transfer', 'Card']);
const isDigital = (method) => DIGITAL_METHODS.has(method);

const sumDenominations = (denoms = {}) => {
    let total = 0;
    for (const [k, v] of Object.entries(denoms || {})) {
        const m = /^([bc]|bill|coin)_(\d+(?:\.\d+)?)$/i.exec(k);
        if (!m) continue;
        const face  = Number(m[2]);
        const count = Number(v || 0);
        if (!isFinite(face) || !isFinite(count)) continue;
        total += face * count;
    }
    return Number(total.toFixed(2));
};

/**
 * Compute expectedCash from separate transaction buckets + pcRentalTotal.
 *
 * @param {Array} orderItems    - rows from order_items: { name, payment_method, amount }
 * @param {Array} pcTransactions - rows from pc_transactions: { payment_method, amount }
 *   pc_transactions have no "item" column. They are treated as regular service sales
 *   (same behaviour as computeShiftFinancials when no pcRentalServiceId is set and
 *   tx.item is undefined — isPcRentalTx returns false).
 * @param {Array} expenses      - rows from expenses: { amount }
 * @param {number} pcRentalTotal - shift.pc_rental_total (external timer total, 0 if unused)
 */
const computeExpectedCash = (orderItems, pcTransactions, expenses, pcRentalTotal) => {
    const pc = Number(pcRentalTotal || 0);

    // --- order_items: detect "PC Rental" items by name (legacy fallback in shiftFinancials) ---
    // In practice these are rare; most PC rental cash comes from pcRentalTotal.
    let pcDigital = 0, pcAr = 0;
    let regularCash = 0;

    for (const d of orderItems) {
        const itemName = String(d.name ?? '').trim().toLowerCase();
        const amt = Number(d.amount || 0);

        if (itemName === 'pc rental') {
            // Treat as PC rental transaction — track non-cash portion
            if (isDigital(d.payment_method))        pcDigital += amt;
            else if (d.payment_method === 'Charge')  pcAr += amt;
            // Cash PC rental items are handled via impliedPcCash below
        } else {
            // Regular service sale or AR payment — count cash portion
            if (!isDigital(d.payment_method) && d.payment_method !== 'Charge') {
                regularCash += amt;
            }
        }
    }

    // --- pc_transactions: no item column — treated as regular service sales ---
    for (const d of pcTransactions) {
        const amt = Number(d.amount || 0);
        if (!isDigital(d.payment_method) && d.payment_method !== 'Charge') {
            regularCash += amt;
        }
    }

    // --- PC Rental implied cash from external timer ---
    const impliedPcCash = Math.max(0, pc - pcDigital - pcAr);

    // --- Expenses reduce expected cash ---
    const expensesTotal = expenses.reduce((sum, d) => sum + Number(d.amount || 0), 0);

    const totalCash = regularCash + impliedPcCash;
    return Number((totalCash - expensesTotal).toFixed(2));
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const BATCH = 20;

const run = async () => {
    console.log(`\n💰  backfill_cash_difference — ${isProd ? 'PRODUCTION' : 'DEV'}${isDryRun ? ' [DRY RUN]' : ''}`);

    // 1. Fetch consolidated shifts that still have null cash_difference
    console.log('\n📥  Fetching consolidated shifts with null cash_difference...');
    const { data: shifts, error: shiftsErr } = await supabase
        .from('shifts')
        .select('id, denominations, pc_rental_total')
        .not('denominations', 'is', null)
        .is('cash_difference', null);

    if (shiftsErr) {
        console.error('❌  Failed to fetch shifts:', shiftsErr.message);
        process.exit(1);
    }

    const toProcess = (shifts || []).filter(s =>
        s.denominations && Object.keys(s.denominations).length > 0
    );

    console.log(`Found ${(shifts || []).length} shifts with denominations, ${toProcess.length} need backfilling.`);

    if (toProcess.length === 0) {
        console.log('✅  Nothing to backfill.');
        process.exit(0);
    }

    const shiftIds = toProcess.map(s => s.id);

    // 2. Bulk-fetch transactions using the correct columns per table
    console.log('\n📥  Fetching transactions...');
    const [resOrders, resPc, resEx] = await Promise.all([
        supabase.from('order_items')
            .select('shift_id, name, payment_method, amount')
            .in('shift_id', shiftIds),
        supabase.from('pc_transactions')
            .select('shift_id, payment_method, amount')
            .in('shift_id', shiftIds),
        supabase.from('expenses')
            .select('shift_id, amount')
            .in('shift_id', shiftIds),
    ]);

    if (resOrders.error) { console.error('❌  order_items:', resOrders.error.message); process.exit(1); }
    if (resPc.error)     { console.error('❌  pc_transactions:', resPc.error.message); process.exit(1); }
    if (resEx.error)     { console.error('❌  expenses:', resEx.error.message); process.exit(1); }

    // Group by shift_id
    const ordersByShift = {};
    const pcByShift     = {};
    const expByShift    = {};
    shiftIds.forEach(id => { ordersByShift[id] = []; pcByShift[id] = []; expByShift[id] = []; });

    (resOrders.data || []).forEach(d => ordersByShift[d.shift_id]?.push(d));
    (resPc.data     || []).forEach(d => pcByShift[d.shift_id]?.push(d));
    (resEx.data     || []).forEach(d => expByShift[d.shift_id]?.push(d));

    // 3. Compute cash_difference for each shift
    const updates = toProcess.map(s => {
        const cashOnHand     = sumDenominations(s.denominations);
        const expectedCash   = computeExpectedCash(
            ordersByShift[s.id] || [],
            pcByShift[s.id]     || [],
            expByShift[s.id]    || [],
            s.pc_rental_total
        );
        const cashDifference = Number((cashOnHand - expectedCash).toFixed(2));
        return { id: s.id, cashOnHand, expectedCash, cashDifference };
    });

    // 4. Preview
    console.log('\n📋  Preview (first 20):');
    console.table(
        updates.slice(0, 20).map(u => ({
            shift_id:        u.id.slice(-8),
            cash_on_hand:    u.cashOnHand,
            expected_cash:   u.expectedCash,
            cash_difference: u.cashDifference,
            status:          u.cashDifference < 0 ? 'SHORT' : u.cashDifference > 0 ? 'OVER' : 'EXACT',
        }))
    );

    if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more.`);

    const shortCount = updates.filter(u => u.cashDifference < 0).length;
    const overCount  = updates.filter(u => u.cashDifference > 0).length;
    const exactCount = updates.filter(u => u.cashDifference === 0).length;
    console.log(`\n  Short: ${shortCount}  |  Over: ${overCount}  |  Exact: ${exactCount}  |  Total: ${updates.length}`);

    if (isDryRun) {
        console.log('\n✅  Dry run complete — no writes.');
        process.exit(0);
    }

    // 5. Write in batches
    console.log('\n💾  Writing to Supabase...');
    let updated = 0, errors = 0;

    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await Promise.all(batch.map(async (u) => {
            const { error } = await supabase
                .from('shifts')
                .update({ cash_difference: u.cashDifference })
                .eq('id', u.id);
            if (error) { console.error(`  ❌  ${u.id}:`, error.message); errors++; }
            else updated++;
        }));
        console.log(`  ${Math.min(i + BATCH, updates.length)} / ${updates.length}`);
    }

    console.log(`\n✅  Done. Updated: ${updated}  Errors: ${errors}`);
    process.exit(errors > 0 ? 1 : 0);
};

run().catch(err => {
    console.error('💥  Script crashed:', err.message);
    process.exit(1);
});
