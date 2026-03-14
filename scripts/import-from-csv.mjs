// scripts/import-from-csv.mjs
// CSV → Supabase import. Reads from ./exports/*.csv, writes to dev Supabase.
// Run AFTER: migrate_auth.js (profiles must exist first).
// Run BEFORE: post-import.sql, resolve-staff-ids.sql, sync-counters.sql

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// =============================================================================
// CSV PARSER — handles quoted fields, "" escapes, embedded commas, BOM
// =============================================================================
function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    let i = 0;
    const n = text.length;
    let headers = null;
    const records = [];

    function readField() {
        if (i >= n) return '';
        if (text[i] === '"') {
            i++;
            let f = '';
            while (i < n) {
                if (text[i] === '"' && text[i + 1] === '"') { f += '"'; i += 2; }
                else if (text[i] === '"') { i++; break; }
                else f += text[i++];
            }
            return f;
        }
        let f = '';
        while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') f += text[i++];
        return f;
    }

    while (i < n) {
        const fields = [];
        while (i < n && text[i] !== '\r' && text[i] !== '\n') {
            fields.push(readField());
            if (i < n && text[i] === ',') i++;
            else break;
        }
        while (i < n && (text[i] === '\r' || text[i] === '\n')) i++;

        if (!fields.length || (fields.length === 1 && !fields[0])) continue;
        if (!headers) { headers = fields; }
        else {
            const obj = {};
            headers.forEach((h, j) => { obj[h] = fields[j] ?? ''; });
            records.push(obj);
        }
    }
    return records;
}

// =============================================================================
// UTILITIES
// =============================================================================
function readCSV(filename) {
    return parseCSV(fs.readFileSync(path.join(root, 'exports', filename), 'utf8'));
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function num(v, def = 0)  { const n = parseFloat(v); return isNaN(n) ? def : n; }
function int(v, def = 0)  { const n = parseInt(v, 10); return isNaN(n) ? def : n; }
function bool(v)           { return v === 'true'; }
function str(v)            { return v || null; }
function ts(v)             { return v || null; }
function jsonParse(v, def) { if (!v?.trim()) return def; try { return JSON.parse(v); } catch { return def; } }

const results = {};
let totalErrors = 0;

async function batchInsert(table, rows) {
    if (!rows.length) return;
    let inserted = 0, errors = 0;
    for (const batch of chunk(rows, 500)) {
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
            console.error(`    ❌ [${table}] batch error: ${error.message}`);
            errors += batch.length;
            totalErrors += batch.length;
        } else {
            inserted += batch.length;
        }
    }
    results[table] = { inserted, errors };
    const tag = errors ? `⚠️  ${inserted} ok / ${errors} errors` : `✅ ${inserted} rows`;
    console.log(`    ${tag}`);
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    console.log('=== CSV → Supabase Import ===');
    console.log(`    Target: ${process.env.VITE_SUPABASE_URL}\n`);

    // ------------------------------------------------------------------
    // Pre-load ID sets for FK validation (prevents FK violation errors)
    // ------------------------------------------------------------------
    const productIds  = new Set(readCSV('services.csv').map(r => r._id));
    const customerIds = new Set(readCSV('customers.csv').map(r => r._id));
    const shiftIds    = new Set(readCSV('shifts.csv').map(r => r._id));

    // ------------------------------------------------------------------
    // 1. products (services.csv)
    // ------------------------------------------------------------------
    console.log('1. products');
    await batchInsert('products', readCSV('services.csv').map(r => ({
        id:                 r._id,
        name:               r.serviceName,
        category:           str(r.type),              // Firebase `type` → schema `category`
        financial_category: str(r.financialCategory), // Firebase `financialCategory` → schema `financial_category`
        parent_service_id:  str(r.parentServiceId),
        price:              num(r.price),
        cost_price:         num(r.costPrice),
        active:             bool(r.active),
        admin_only:         bool(r.adminOnly),
        sort_order:         int(r.sortOrder),
        track_stock:        bool(r.trackStock),
        stock_count:        int(r.stockCount),
        low_stock_threshold: int(r.lowStockThreshold) || 5,
        has_variants:       bool(r.hasVariants),
        pos_icon:           str(r.posIcon),
        price_type:         str(r.priceType) || 'fixed',
        pricing_note:       str(r.pricingNote),
        variant_group:      str(r.variantGroup),
        pos_label:          str(r.posLabel),
        consumables:        [],
        created_at:         ts(r.lastUpdated),
        updated_at:         ts(r.lastUpdated),
    })));

    // ------------------------------------------------------------------
    // 2. customers (customers.csv)
    // ------------------------------------------------------------------
    console.log('2. customers');
    await batchInsert('customers', readCSV('customers.csv').map(r => ({
        id:                  r._id,
        full_name:           r.fullName,
        username:            str(r.username),
        phone:               null,
        address:             null,
        email:               null,
        tin:                 null,
        lifetime_value:      0,
        outstanding_balance: 0,
        total_orders:        0,
        created_at:          ts(r.createdAt),
    })));

    // ------------------------------------------------------------------
    // 3. settings (settings.csv)
    // ------------------------------------------------------------------
    console.log('3. settings');
    await batchInsert('settings', readCSV('settings.csv').map(r => {
        // Reassemble payment_methods from flattened columns
        const pm = {};
        for (const [k, v] of Object.entries(r)) {
            if (!k.startsWith('paymentMethods.')) continue;
            const parts = k.replace('paymentMethods.', '').split('.');
            let cur = pm;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]]) cur[parts[i]] = {};
                cur = cur[parts[i]];
            }
            const last = parts[parts.length - 1];
            if (v === 'true')       cur[last] = true;
            else if (v === 'false') cur[last] = false;
            else if (v.startsWith('[') || v.startsWith('{')) cur[last] = jsonParse(v, v);
            else if (v !== '' && !isNaN(v)) cur[last] = Number(v);
            else cur[last] = v || null;
        }

        return {
            id:                         'main',
            store_name:                  str(r.storeName),
            logo_url:                    str(r.logoUrl),
            address:                     str(r.address),
            phone:                       str(r.phone),
            mobile:                      str(r.mobile),
            email:                       str(r.email),
            tin:                         str(r.tin),
            currency_symbol:             r.currencySymbol || '₱',
            tax_rate:                    num(r.taxRate),
            receipt_footer:              str(r.receiptFooter),
            show_tax_breakdown:          bool(r.showTaxBreakdown),
            drawer_hotkey: {
                code:   r['drawerHotkey.code']   || null,
                altKey: bool(r['drawerHotkey.altKey']),
                display: r['drawerHotkey.display'] || null,
            },
            checkout_hotkey: {
                code:   r['checkoutHotkey.code']  || null,
                key:    r['checkoutHotkey.key']   || null,
                display: r['checkoutHotkey.display'] || null,
            },
            id_prefixes: {
                shifts:       r['idPrefixes.shifts']       || null,
                expenses:     r['idPrefixes.expenses']     || null,
                transactions: r['idPrefixes.transactions'] || null,
                payroll:      r['idPrefixes.payroll']      || null,
            },
            shift_duration_hours:        int(r.shiftDurationHours) || 12,
            shift_alert_minutes:         int(r.shiftAlertMinutes)  || 30,
            schedule_posting_frequency:  r.schedulePostingFrequency || 'weekly',
            pc_rental_enabled:           bool(r.pcRentalEnabled),
            pc_rental_mode:              r.pcRentalMode || 'prepaid',
            pc_rental_service_id:        str(r.pcRentalServiceId),
            invoice_due_days:            int(r.invoiceDueDays) || 30,
            payment_methods:             pm,
            drawer_signal_type:          'usb',
        };
    }));

    // ------------------------------------------------------------------
    // 4. app_status (app_status.csv)
    //    staff_id written as raw email; resolved to ST-xxx in post-import
    // ------------------------------------------------------------------
    console.log('4. app_status');
    await batchInsert('app_status', readCSV('app_status.csv').map(r => ({
        id:              r._id || 'current_shift',
        active_shift_id: str(r.activeShiftId),
        staff_id:        str(r.staffEmail),
        updated_at:      new Date().toISOString(),
    })));

    // ------------------------------------------------------------------
    // 5. daily_stats (stats_daily.csv)
    // ------------------------------------------------------------------
    console.log('5. daily_stats');
    await batchInsert('daily_stats', readCSV('stats_daily.csv').map(r => ({
        date:       r.date,
        sales:      num(r.sales),
        expenses:   num(r.expenses),
        tx_count:   int(r.txCount),
        breakdown:  {},
        updated_at: ts(r.updatedAt),
    })));

    // ------------------------------------------------------------------
    // 6. shift_templates (shiftTemplates.csv)
    // ------------------------------------------------------------------
    console.log('6. shift_templates');
    await batchInsert('shift_templates', readCSV('shiftTemplates.csv').map(r => ({
        id:         r._id,
        name:       r.name,
        start_time: str(r.startTime),
        end_time:   str(r.endTime),
        is_default: bool(r.isDefault),
        disabled:   bool(r.disabled),
        created_at: ts(r.createdAt),
    })));

    // ------------------------------------------------------------------
    // 7. shifts (shifts.csv)
    //    staff_id written as raw email; resolved in post-import
    //    denominations reassembled from ~20 flattened CSV keys
    //    total_digital ← totalDigital || totalGcash (field was renamed)
    // ------------------------------------------------------------------
    console.log('7. shifts');
    await batchInsert('shifts', readCSV('shifts.csv').map(r => {
        const denoms = {};
        for (const [k, v] of Object.entries(r)) {
            if (!k.startsWith('denominations.')) continue;
            const key = k.replace('denominations.', '');
            const n = parseFloat(v);
            if (!isNaN(n) && n !== 0) denoms[key] = n;
        }
        return {
            id:                   r._id,
            display_id:           str(r.displayId),
            staff_id:             str(r.staffEmail),
            shift_period:         str(r.shiftPeriod),
            notes:                str(r.notes),
            schedule_id:          str(r.scheduleId),
            start_time:           ts(r.startTime),
            end_time:             ts(r.endTime),
            system_total:         num(r.systemTotal),
            pc_rental_total:      num(r.pcRentalTotal),
            services_total:       num(r.servicesTotal),
            expenses_total:       num(r.expensesTotal),
            total_ar:             num(r.totalAr),
            total_cash:           num(r.totalCash),
            total_digital:        num(r.totalDigital || r.totalGcash),
            ar_payments_total:    num(r.arPaymentsTotal),
            denominations:        denoms,
            last_consolidated_at: ts(r.lastConsolidatedAt),
            cash_difference:      r.cashDifference !== '' ? num(r.cashDifference, null) : null,
            // discarded: payrollRunId, endedBy, status
        };
    }));

    // ------------------------------------------------------------------
    // 8. payroll_runs — SKIPPED
    //    All payroll tables (payroll_runs, payroll_line_items, paystubs) are
    //    intentionally left blank. Payroll will start fresh post-launch.
    // ------------------------------------------------------------------
    console.log('8. payroll_runs — SKIPPED (payroll tables start blank)');

    // ------------------------------------------------------------------
    // 9. orders (orders.csv)
    //    staff_id written as staffId || staffEmail (raw); resolved in post-import
    //    Build ordersMap: orderNumber → id (Firebase doc ID) for order_items FK
    // ------------------------------------------------------------------
    console.log('9. orders');
    const ordersMap = new Map();
    const ordersRaw = readCSV('orders.csv');
    ordersRaw.forEach(r => { if (r.orderNumber) ordersMap.set(r.orderNumber, r._id); });

    await batchInsert('orders', ordersRaw.map(r => ({
        id:               r._id,
        order_number:     r.orderNumber,
        customer_id:      customerIds.has(r.customerId) ? str(r.customerId) : null,
        // customer_name, customer_address, customer_tin NOT imported (derive from customers FK)
        customer_phone:   str(r.customerPhone),
        staff_id:         str(r.staffId) || str(r.staffEmail),
        staff_name:       str(r.staffName),
        shift_id:         shiftIds.has(r.shiftId) ? str(r.shiftId) : null,
        subtotal:         num(r.subtotal),
        discount: {
            type:   r['discount.type']   || null,
            value:  num(r['discount.value']),
            amount: num(r['discount.amount']),
        },
        total:            num(r.total),
        amount_tendered:  num(r.amountTendered),
        change:           num(r.change),
        payment_method:   str(r.paymentMethod),
        payment_details: {
            refNumber: str(r['paymentDetails.refNumber']),
            phone:     str(r['paymentDetails.phone']),
            bankId:    str(r['paymentDetails.bankId']),
            bankName:  str(r['paymentDetails.bankName']),
        },
        invoice_status: str(r.invoiceStatus),
        status:         r.status || 'completed',
        items:          jsonParse(r.items, []),
        is_deleted:     bool(r.isDeleted),
        deleted_by:     str(r.deletedBy),
        timestamp:      ts(r.timestamp),
        updated_at:     ts(r.updatedAt),
        // discarded: editReason, editedBy, isEdited, lastUpdatedAt, deleteReason, deletedAt, staffEmail
    })));

    // Build order ID set for order_items FK validation
    const orderIdSet = new Set(ordersRaw.map(r => r._id));

    // ------------------------------------------------------------------
    // 10 + 11. order_items + expenses (transactions.csv)
    //    Split by displayId prefix: TX → order_items, EXP → expenses
    //    Rows with empty displayId AND empty expenseType → discard (~50 artifacts)
    // ------------------------------------------------------------------
    console.log('10. order_items + 11. expenses (transactions.csv)');
    const txRows     = readCSV('transactions.csv');
    const orderItems = [];
    const expenses   = [];
    let discarded    = 0;

    for (const r of txRows) {
        const displayId   = r.displayId   || '';
        const expenseType = r.expenseType || '';

        if (displayId.startsWith('TX')) {
            orderItems.push({
                id:                   r._id,
                parent_order_id:      orderIdSet.has(ordersMap.get(r.orderNumber)) ? (ordersMap.get(r.orderNumber) || null) : null,
                product_id:           productIds.has(r.serviceId) ? str(r.serviceId) : null,
                name:                 str(r.item),
                price:                num(r.price),
                cost_price:           num(r.costPrice) || num(r.unitCost),
                amount:               num(r.total),
                quantity:             int(r.quantity) || 1,
                is_deleted:           bool(r.isDeleted),
                is_edited:            bool(r.isEdited),
                added_by_admin:       bool(r.addedByAdmin),
                staff_id:             str(r.staffEmail),
                shift_id:             shiftIds.has(r.shiftId) ? str(r.shiftId) : null,
                financial_category:   str(r.financialCategory),
                customer_id:          customerIds.has(r.customerId) ? str(r.customerId) : null,
                category:             str(r.category),
                payment_method:       str(r.paymentMethod),
                invoice_status:       str(r.invoiceStatus),
                reconciliation_status: r.reconciliationStatus || 'Verified',
                metadata: {
                    note:             str(r.note),
                    parentServiceId:  str(r.parentServiceId),
                    variantGroup:     str(r.variantGroup),
                    variantLabel:     str(r.variantLabel),
                    paymentDetails: {
                        refNumber: str(r['paymentDetails.refNumber']),
                        phone:     str(r['paymentDetails.phone']),
                        bankId:    str(r['paymentDetails.bankId']),
                        bankName:  str(r['paymentDetails.bankName']),
                    },
                    consumables: jsonParse(r.consumables, []),
                },
                timestamp:  ts(r.timestamp),
                updated_at: ts(r.lastUpdatedAt),
            });

        } else if (displayId.startsWith('EXP') || expenseType !== '') {
            expenses.push({
                id:                 r._id,
                category:           str(r.category),
                expense_type:       str(r.expenseType),
                item:               r.item || 'Expense',
                amount:             num(r.total),
                quantity:           int(r.quantity) || 1,
                staff_id:           str(r.expenseStaffEmail) || str(r.staffEmail),
                shift_id:           shiftIds.has(r.shiftId) ? str(r.shiftId) : null,
                is_deleted:         bool(r.isDeleted),
                financial_category: str(r.financialCategory),
                notes:              str(r.notes) || str(r.note),
                metadata: {
                    payrollRunId: str(r.payrollRunId),
                    source:       str(r.source),
                },
                timestamp: ts(r.timestamp),
            });

        } else {
            discarded++;
        }
    }

    console.log(`    (${orderItems.length} TX, ${expenses.length} EXP, ${discarded} discarded)`);
    await batchInsert('order_items', orderItems);
    await batchInsert('expenses', expenses);

    // ------------------------------------------------------------------
    // 12. invoices (invoices.csv)
    //    order_id and customer_name removed in schema v3.1 — not inserted
    //    staff_id written as raw email; resolved in post-import
    // ------------------------------------------------------------------
    console.log('12. invoices');
    await batchInsert('invoices', readCSV('invoices.csv').map(r => ({
        id:              r._id,
        invoice_number:  r.invoiceNumber,
        customer_id:     customerIds.has(r.customerId) ? str(r.customerId) : null,
        // removed: customerName, customerEmail, customerPhone, orderId, orderNumber
        items:           jsonParse(r.items, []),
        subtotal:        num(r.subtotal),
        tax_amount:      num(r.taxAmount),
        discount_amount: num(r.discountAmount),
        total:           num(r.total),
        amount_paid:     num(r.amountPaid),
        balance:         num(r.balance),
        payments:        jsonParse(r.payments, []),
        status:          r.status || 'UNPAID',
        due_date:        ts(r.dueDate),
        notes:           str(r.notes),
        shift_id:        shiftIds.has(r.shiftId) ? str(r.shiftId) : null,
        staff_id:        str(r.staffEmail),
        created_at:      ts(r.createdAt),
    })));

    // ------------------------------------------------------------------
    // 13. payroll_line_items — SKIPPED (payroll starts blank)
    // 14. paystubs           — SKIPPED (payroll starts blank)
    // ------------------------------------------------------------------
    console.log('13. payroll_line_items — SKIPPED');
    console.log('14. paystubs           — SKIPPED');

    // =============================================================================
    // SUMMARY
    // =============================================================================
    console.log('\n=== Import Summary ===');
    for (const [table, { inserted, errors }] of Object.entries(results)) {
        const tag = errors
            ? `⚠️  ${String(inserted).padStart(5)} ok  /  ${errors} errors`
            : `✅ ${String(inserted).padStart(5)} rows`;
        console.log(`  ${table.padEnd(26)} ${tag}`);
    }

    if (totalErrors > 0) {
        console.log(`\n⚠️  ${totalErrors} total errors. Review logs above before proceeding.`);
    } else {
        console.log('\n✅ All rows imported successfully.');
    }

    console.log('\nNext steps (run in dev Supabase SQL Editor):');
    console.log('  Phase 3:  scripts/post-import.sql        — resequence IDs + update FKs (CU/SH/OR/IV/EX/PR/OI)');
    console.log('  Phase 4:  scripts/resolve-staff-ids.sql  — email → staff_id (ST-xxxxxxxx)');
    console.log('  Phase 5:  scripts/sync-counters.sql      — set counter current_value');
    console.log('  Phase 6a: scripts/backfill-customer-stats.sql');
    console.log('  Phase 6b: node scripts/backfill_cash_difference.js');
    console.log('  Phase 7:  ALTER TABLE expenses DROP COLUMN item;');
    console.log('  Phase 7:  ALTER TABLE invoices DROP COLUMN invoice_number;');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
