// scripts/recalculate-shift-differences.mjs
// Recomputes cash_difference for every shift that has denominations saved.
// Fixes stale values imported from Firebase or saved before the migration was complete.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/recalculate-shift-differences.mjs
//   OR (if .env is present):
//   node --env-file=.env scripts/recalculate-shift-differences.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── helpers (mirrors src/utils/shiftFinancials.js) ──────────────────────────

function sumDenominations(denoms = {}) {
    let total = 0;
    for (const [k, v] of Object.entries(denoms || {})) {
        const m = /^([bc]|bill|coin)_(\d+(?:\.\d+)?)$/i.exec(k);
        if (!m) continue;
        const face = Number(m[2]);
        const count = Number(v || 0);
        if (isFinite(face) && isFinite(count)) total += face * count;
    }
    return Number(total.toFixed(2));
}

const EXPENSE_ITEMS = new Set(['Expenses', 'New Debt']);
const DIGITAL_METHODS = new Set(['GCash', 'Maya', 'Bank Transfer', 'Card']);

/** Returns expectedCash — same logic as computeShiftFinancials in the app. */
function computeExpectedCash(transactions, pcRentalTotal = 0) {
    const pc = Number(pcRentalTotal || 0);

    let pcDigital = 0, pcAr = 0;
    let regularCash = 0, expensesTotal = 0;

    for (const tx of transactions) {
        const amt = Number(tx.total ?? tx.amount ?? 0);
        const isPcRental = String(tx.item ?? '').trim().toLowerCase() === 'pc rental';
        const isExpense = EXPENSE_ITEMS.has(tx.item);
        const isDigital = DIGITAL_METHODS.has(tx.paymentMethod);
        const isCharge = tx.paymentMethod === 'Charge';

        if (isPcRental) {
            if (isDigital) pcDigital += amt;
            else if (isCharge) pcAr += amt;
        } else if (isExpense) {
            expensesTotal += amt;
        } else {
            // Regular sale — only cash (non-digital, non-charge) hits the drawer
            if (!isDigital && !isCharge) regularCash += amt;
        }
    }

    const pcNonCash = pcDigital + pcAr;
    const impliedPcCash = Math.max(0, pc - pcNonCash);
    const expectedCash = (regularCash + impliedPcCash) - expensesTotal;
    return Number(expectedCash.toFixed(2));
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
    const DRY_RUN = process.argv.includes('--dry-run');
    if (DRY_RUN) console.log('DRY RUN — no changes will be written.\n');

    // Fetch all shifts that have had denominations entered (i.e., were consolidated)
    const { data: shifts, error: shiftErr } = await supabase
        .from('shifts')
        .select('id, display_id, start_time, denominations, pc_rental_total, cash_difference')
        .not('denominations', 'is', null)
        .order('start_time', { ascending: false });

    if (shiftErr) throw shiftErr;

    const consolidated = shifts.filter(
        s => s.denominations && Object.keys(s.denominations).length > 0
    );
    console.log(`Shifts with denominations: ${consolidated.length}\n`);

    let updated = 0, unchanged = 0, errors = 0;

    for (const shift of consolidated) {
        const cashOnHand = sumDenominations(shift.denominations);

        const [resOrders, resPc, resEx] = await Promise.all([
            supabase.from('order_items').select('name,amount,payment_method').eq('shift_id', shift.id),
            supabase.from('pc_transactions').select('type,amount,payment_method').eq('shift_id', shift.id),
            supabase.from('expenses').select('amount').eq('shift_id', shift.id),
        ]);

        const transactions = [
            ...(resOrders.data || []).map(d => ({
                item: d.name,
                paymentMethod: d.payment_method,
                total: Number(d.amount),
            })),
            ...(resPc.data || []).map(d => ({
                item: d.type || 'PC Rental',
                paymentMethod: d.payment_method,
                total: Number(d.amount),
            })),
            ...(resEx.data || []).map(d => ({
                item: 'Expenses',
                paymentMethod: 'Cash',
                total: Number(d.amount),
            })),
        ];

        const expectedCash = computeExpectedCash(transactions, shift.pc_rental_total);
        const newDiff = Number((cashOnHand - expectedCash).toFixed(2));
        const oldDiff = shift.cash_difference != null ? Number(shift.cash_difference) : null;

        const label = `[${shift.display_id || shift.id.slice(-6)}]`;

        if (oldDiff === newDiff) {
            console.log(`${label} OK (${newDiff})`);
            unchanged++;
            continue;
        }

        console.log(
            `${label} ${oldDiff} → ${newDiff}` +
            `  (onHand: ${cashOnHand}, expected: ${expectedCash})`
        );

        if (!DRY_RUN) {
            const { error } = await supabase
                .from('shifts')
                .update({ cash_difference: newDiff })
                .eq('id', shift.id);

            if (error) {
                console.error(`  ERROR: ${error.message}`);
                errors++;
            } else {
                updated++;
            }
        } else {
            updated++; // count as "would update" in dry run
        }
    }

    console.log(`\n─── Summary ───`);
    console.log(`  Updated : ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    if (errors) console.log(`  Errors  : ${errors}`);
    if (DRY_RUN) console.log('\n(dry run — rerun without --dry-run to apply)');
}

run().catch(err => { console.error(err); process.exit(1); });
