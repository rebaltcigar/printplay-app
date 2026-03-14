import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env.development';
const serviceAccountPath = isProd
    ? './firebase-service-account-prod.json'
    : './firebase-service-account-dev.json';

dotenv.config({ path: envFile });

console.log(`🚀 Running Comprehensive Migration (v2.0) in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode referencing ${envFile}`);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey || !supabaseUrl) {
    console.error(`❌ SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL is missing from ${envFile}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Try to initialize Firebase Admin
try {
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error("Firebase SA error: ", e);
    process.exit(1);
}
const db = admin.firestore();

// Identity Registry
const registry = {
    customers: new Set(),
    shifts: new Set(),
    shiftFsIdMap: new Map(), // Firebase fsId → displayId (for FK resolution in orders/expenses)
    orders: new Set(),
    orderIds: new Map(), // orderNumber → order displayId
    products: new Set(),
    zones: new Set(),
    rates: new Set(),
    stations: new Set(),
    users: new Set(),
    payroll_runs: new Set()
};

// --- HELPERS ---

const mapTimestamp = (ts) => {
    if (!ts) return null;
    let target = ts;
    if (typeof ts === 'string' && ts.trim().startsWith('{')) {
        try { target = JSON.parse(ts); } catch (e) { return ts; }
    }
    if (typeof target === 'string') return target;
    if (target.toDate) return target.toDate().toISOString();
    const seconds = target._seconds !== undefined ? target._seconds : target.seconds;
    if (seconds !== undefined && seconds !== null) return new Date(seconds * 1000).toISOString();
    if (target._type === 'serverTimestamp' || target.type === 'serverTimestamp') return new Date().toISOString();
    return null;
};

const resolveId = (d) => {
    const idValue = d.displayId || d.display_id || d.id || d.fsId;
    return String(idValue).trim().replace(/\s+/g, '_');
};

const resolveOrderNumber = (numStr) => {
    return String(numStr).trim().replace(/\s+/g, '_');
};

const extractDocuments = async (firestoreCol) => {
    const snapshot = await db.collection(firestoreCol).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ fsId: doc.id, ...doc.data() }));
};

const batchUpsert = async (supabaseTable, mappings) => {
    if (mappings.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        const { error } = await supabase.from(supabaseTable).upsert(batch, { onConflict: 'id' }).select('id');
        if (error) {
            console.error(`❌ Batch error in ${supabaseTable}:`, error.message);
            console.log("Sample that failed: ", batch[0]);
            throw error;
        }
    }
    console.log(`✅ Upserted ${mappings.length} records into [${supabaseTable}].`);
};

const batchUpsertCustomPk = async (supabaseTable, pkCol, mappings) => {
    if (mappings.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        const { error } = await supabase.from(supabaseTable).upsert(batch, { onConflict: pkCol }).select(pkCol);
        if (error) {
            console.error(`❌ Batch error in custom PK ${supabaseTable} ON CONFLICT ${pkCol}:`, error.message);
            console.log("Sample that failed: ", batch[0]);
            throw error;
        }
    }
    console.log(`✅ Upserted ${mappings.length} records into [${supabaseTable}].`);
};

// --- MAPPERS ---

const mapDailyStats = (d) => ({
    date: d.fsId,
    sales: Number(d.sales) || 0,
    expenses: Number(d.expenses) || 0,
    tx_count: Number(d.txCount) || 0,
    breakdown: d.breakdown || {},
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const mapAppStatus = (d) => ({
    id: d.fsId,
    active_shift_id: d.activeShiftId,
    staff_email: d.staffEmail
});

const mapSettings = (d) => ({
    id: d.fsId,
    store_name: d.storeName,
    logo_url: d.logoUrl,
    address: d.address,
    phone: d.phone,
    mobile: d.mobile,
    email: d.email,
    tin: d.tin,
    currency_symbol: d.currencySymbol || '₱',
    tax_rate: Number(d.taxRate) || 0,
    receipt_footer: d.receiptFooter,
    show_tax_breakdown: d.showTaxBreakdown === true,
    drawer_hotkey: d.drawerHotkey || {},
    checkout_hotkey: d.checkoutHotkey || {},
    id_prefixes: d.idPrefixes || {},
    shift_duration_hours: Number(d.shiftDurationHours) || 12,
    shift_alert_minutes: Number(d.shiftAlertMinutes) || 30,
    schedule_posting_frequency: d.schedulePostingFrequency || 'weekly',
    pc_rental_enabled: d.pcRentalEnabled === true,
    pc_rental_mode: d.pcRentalMode || 'prepaid',
    pc_rental_service_id: d.pcRentalServiceId,
    invoice_due_days: Number(d.invoiceDueDays) || 30,
    payment_methods: d.paymentMethods || {},
    drawer_signal_type: d.drawerSignalType || 'usb'
});

const mapCustomer = (d) => ({
    id: d.fsId,
    full_name: d.name || d.fullName || 'Unknown',
    username: d.username,
    phone: d.phone,
    address: d.address,
    lifetime_value: Number(d.totalSpent) || 0,
    outstanding_balance: Number(d.balance) || 0,
    total_orders: Number(d.totalOrders) || 0,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString()
});

const mapZone = (d) => ({
    id: d.fsId,
    name: d.name || 'Unknown Zone',
    color: d.color,
    sort_order: Number(d.sortOrder) || 0,
    rate_id: registry.rates.has(d.rateId) ? d.rateId : null,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const mapRate = (d) => ({
    id: d.fsId,
    name: d.name || 'Standard Rate',
    type: d.type,
    rate_per_minute: Number(d.ratePerMinute) || 0,
    minimum_minutes: Number(d.minimumMinutes) || 0,
    rounding_policy: d.roundingPolicy,
    is_active: d.isActive !== false,
    schedules: d.schedules || [],
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const mapShiftTemplate = (d) => ({
    id: d.fsId,
    name: d.name || 'Template',
    start_time: d.startTime,
    end_time: d.endTime,
    is_default: d.isDefault === true,
    disabled: d.disabled === true,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString()
});

const mapProduct = (d) => ({
    id: d.fsId,
    name: d.name || d.serviceName || 'Unnamed',
    category: d.category,
    parent_service_id: d.parentServiceId,
    financial_category: d.financialCategory,
    price: Number(d.price) || 0,
    cost_price: Number(d.costPrice) || 0,
    active: d.active !== false,
    admin_only: d.adminOnly === true,
    sort_order: Number(d.sortOrder) || 0,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const mapStation = (d) => ({
    id: d.fsId,
    zone_id: registry.zones.has(d.zoneId) ? d.zoneId : null,
    rate_id: registry.rates.has(d.rateId) ? d.rateId : null,
    name: d.name || d.fsId,
    label: d.label,
    mac_address: d.macAddress,
    ip_address: d.ipAddress,
    specs: d.specs || {},
    agent_version: d.agentVersion,
    tamper_alert: d.tamperAlert === true,
    agent_email: d.agentEmail,
    agent_uid: d.agentUid,
    is_online: d.isOnline === true,
    is_locked: d.isLocked !== false,
    status: d.status || 'available',
    current_session_id: d.currentSessionId,
    command: d.command || {},
    last_ping: mapTimestamp(d.lastPing) || mapTimestamp(d.agentLastPing),
    provisioned_at: mapTimestamp(d.provisionedAt),
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const mapShift = (d) => ({
    id: resolveId(d),
    staff_email: d.staffEmail || 'unknown',
    shift_period: d.shiftPeriod,
    notes: d.notes,
    schedule_id: d.scheduleId,
    start_time: mapTimestamp(d.startTime) || new Date().toISOString(),
    end_time: mapTimestamp(d.endTime),
    system_total: Number(d.systemTotal) || 0,
    pc_rental_total: Number(d.pcRentalTotal) || 0,
    services_total: Number(d.servicesTotal) || 0,
    expenses_total: Number(d.expensesTotal) || 0,
    total_ar: Number(d.totalAr) || 0,
    total_cash: Number(d.totalCash) || 0,
    total_digital: Number(d.totalGcash) || 0,
    ar_payments_total: Number(d.arPaymentsTotal) || 0,
    denominations: d.denominations || {},
    last_consolidated_at: mapTimestamp(d.lastConsolidatedAt)
});

const mapSession = (d) => ({
    id: resolveId(d),
    station_id: registry.stations.has(d.stationId) ? d.stationId : null,
    station_name: d.stationName,
    customer_id: registry.customers.has(d.customerId) ? d.customerId : null,
    customer_name: d.customerName,
    type: d.type,
    rate_id: registry.rates.has(d.rateId) ? d.rateId : null,
    rate_snapshot: d.rateSnapshot || {},
    package_id: d.packageId,
    package_snapshot: d.packageSnapshot || {},
    minutes_allotted: Number(d.minutesAllotted) || 0,
    minutes_used: Number(d.minutesUsed) || 0,
    minutes_paused: Number(d.minutesPaused) || 0,
    rate_per_minute_applied: Number(d.ratePerMinuteApplied) || null,
    amount_charged: Number(d.amountCharged) || 0,
    amount_paid: Number(d.amountPaid) || 0,
    discount: d.discount || {},
    discount_amount: Number(d.discountAmount) || 0,
    discount_reason: d.discountReason,
    payment_method: d.paymentMethod,
    payment_details: d.paymentDetails,
    staff_id: d.staffId,
    shift_id: registry.shifts.has(d.shiftId) ? d.shiftId : null,
    open_ended: d.openEnded === true,
    estimated_limit: mapTimestamp(d.estimatedLimit),
    notes: d.notes,
    status: d.status || 'completed',
    paused_at: mapTimestamp(d.pausedAt),
    resumed_at: mapTimestamp(d.resumedAt),
    last_heartbeat_at: mapTimestamp(d.lastHeartbeatAt),
    start_time: mapTimestamp(d.startedAt) || mapTimestamp(d.createdAt) || new Date().toISOString(),
    end_time: mapTimestamp(d.endedAt),
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

const resolveShiftId = (rawShiftId) => {
    if (!rawShiftId) return null;
    // Direct match (shiftId is already the displayId)
    if (registry.shifts.has(rawShiftId)) return rawShiftId;
    // Indirect: Firebase fsId → displayId
    const mapped = registry.shiftFsIdMap.get(rawShiftId);
    if (mapped && registry.shifts.has(mapped)) return mapped;
    return null;
};

const mapOrder = (d) => {
    let customerId = d.customerId;
    if (customerId === 'walk-in') customerId = null;
    return {
        id: resolveId(d),
        order_number: d.orderNumber || resolveId(d),
        customer_id: registry.customers.has(customerId) ? customerId : null,
        customer_name: d.customerName,
        customer_phone: d.customerPhone,
        customer_address: d.customerAddress,
        customer_tin: d.customerTin,
        // staff_id intentionally omitted — Firebase UID is useless here.
        // resequence_data.sql resolves staff_email → sequential_id after migration.
        staff_email: d.staffEmail,
        staff_name: d.staffName,
        shift_id: resolveShiftId(d.shiftId),
        subtotal: Number(d.subtotal) || 0,
        total: Number(d.total) || 0,
        amount_tendered: Number(d.amountTendered) || 0,
        change: Number(d.change) || 0,
        payment_method: d.paymentMethod,
        payment_details: d.paymentDetails || {},
        invoice_status: d.invoiceStatus,
        status: d.status || 'completed',
        timestamp: mapTimestamp(d.timestamp) || mapTimestamp(d.createdAt) || new Date().toISOString()
    };
};

// --- TRANSACTION SORTER ---

const processTransactions = (allTx) => {
    const orderItems = [];
    const pcTx = [];
    const expenses = [];
    let pcCounter = 1;
    const seenIds = {};

    allTx.forEach(d => {
        let originalRawId = resolveId(d);
        let prefix = 'RAW';
        if (originalRawId.includes('-')) {
            prefix = originalRawId.split('-')[0];
        }

        // --- ID Deduplication ---
        let rawId = originalRawId;
        if (seenIds[originalRawId]) {
            seenIds[originalRawId]++;
            rawId = `${originalRawId}_${seenIds[originalRawId]}`;
        } else {
            seenIds[originalRawId] = 1;
        }

        const itemObj = {
            id: rawId,
            staff_email: d.staffEmail,
            shift_id: resolveShiftId(d.shiftId),
            financial_category: d.financialCategory,
            timestamp: mapTimestamp(d.timestamp) || mapTimestamp(d.date) || new Date().toISOString(),
            is_deleted: d.isDeleted === true,
            amount: Number(d.total) || Number(d.amount) || Number(d.price) || 0,
            reconciliation_status: d.reconciliationStatus || 'Verified'
        };

        const custId = registry.customers.has(d.customerId) ? d.customerId : null;

        if (prefix === 'EXP') {
            const expObj = { ...itemObj };
            delete expObj.reconciliation_status;

            expenses.push({
                ...expObj,
                item: d.item || d.description || 'Unknown Expense',
                category: d.category,
                expense_type: d.expenseType,
                quantity: Number(d.quantity) || 1
            });
            return;
        }

        if (prefix === 'TX') {
            let parent_order_id = null;
            if (d.orderNumber && registry.orders.has(resolveOrderNumber(d.orderNumber))) {
                parent_order_id = registry.orderIds.get(resolveOrderNumber(d.orderNumber)) || null;
            }
            orderItems.push({
                ...itemObj,
                price: Number(d.price) || 0,
                cost_price: Number(d.costPrice) || 0,
                quantity: Number(d.quantity) || 1,
                parent_order_id,
                product_id: registry.products.has(d.serviceId) ? d.serviceId : null,
                name: d.item || d.description || 'Unknown',
                customer_id: custId,
                customer_name: d.customerName,
                category: d.category,
                payment_method: d.paymentMethod,
                invoice_status: d.invoiceStatus,
                is_edited: d.isEdited === true,
                added_by_admin: d.addedByAdmin === true
            });
            return;
        }

        // Catch-all: the raw Firebase IDs -> PC Transactions
        const newTxnId = `TXN-` + String(pcCounter++).padStart(4, '0');
        pcTx.push({
            ...itemObj,
            id: newTxnId,
            customer_id: custId,
            customer_name: d.customerName,
            type: d.type || 'time',
            category: d.category || 'PC Rental',
            payment_method: d.paymentMethod || 'Cash',
            metadata: { ...d.metadata, original_fs_id: rawId }
        });
    });

    return { orderItems, pcTx, expenses };
};

const mapInvoice = (d) => ({
    id: d.fsId,
    invoice_number: d.invoiceNumber || d.fsId,
    order_id: d.orderId,
    order_number: d.orderNumber,
    customer_id: registry.customers.has(d.customerId) ? d.customerId : null,
    customer_name: d.customerName,
    customer_email: d.customerEmail,
    customer_phone: d.customerPhone,
    customer_address: d.customerAddress,
    customer_tin: d.customerTin,
    items: d.items || [],
    subtotal: Number(d.subtotal) || 0,
    tax_amount: Number(d.taxAmount) || 0,
    discount_amount: Number(d.discountAmount) || 0,
    total: Number(d.total) || 0,
    amount_paid: Number(d.amountPaid) || 0,
    balance: Number(d.balance) || 0,
    payments: d.payments || [],
    status: d.status || 'UNPAID',
    due_date: mapTimestamp(d.dueDate),
    notes: d.notes,
    shift_id: registry.shifts.has(d.shiftId) ? d.shiftId : null,
    staff_email: d.staffEmail,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString()
});

const mapPayrollRun = (d) => ({
    id: d.fsId,
    period_start: mapTimestamp(d.periodStart),
    period_end: mapTimestamp(d.periodEnd),
    pay_date: mapTimestamp(d.payDate),
    status: d.status || 'draft',
    expense_mode: d.expenseMode,
    totals: d.totals || {},
    created_by: d.createdBy,
    updated_by: d.updatedBy,
    created_at: mapTimestamp(d.createdAt) || new Date().toISOString(),
    updated_at: mapTimestamp(d.updatedAt) || new Date().toISOString()
});

// --- EXECUTION ---

const runMigration = async () => {
    try {
        console.log('🏁 Starting WAVE-BASED Migration (v2.0)...');

        // ==========================================
        // WAVE 1: Core Definitions (No FK deps to staff/zones)
        // ==========================================
        console.log('\n--- WAVE 1: Core Definitions ---');
        let raw = await extractDocuments('settings');
        await batchUpsert('settings', raw.map(mapSettings));

        raw = await extractDocuments('app_status');
        await batchUpsert('app_status', raw.map(mapAppStatus));

        raw = await extractDocuments('stats_daily');
        await batchUpsertCustomPk('daily_stats', 'date', raw.map(mapDailyStats));

        raw = await extractDocuments('shiftTemplates');
        await batchUpsert('shift_templates', raw.map(mapShiftTemplate));

        raw = await extractDocuments('rates');
        const mkRates = raw.map(mapRate);
        mkRates.forEach(x => registry.rates.add(x.id));
        await batchUpsert('rates', mkRates);

        raw = await extractDocuments('services');
        const mkProducts = raw.map(mapProduct);
        mkProducts.forEach(x => registry.products.add(x.id));
        await batchUpsert('products', mkProducts);

        // ==========================================
        // WAVE 2: Entities & Auth Dependencies
        // ==========================================
        console.log('\n--- WAVE 2: Entities ---');
        raw = await extractDocuments('zones');
        const mkZones = raw.map(mapZone);
        mkZones.forEach(x => registry.zones.add(x.id));
        await batchUpsert('zones', mkZones);

        raw = await extractDocuments('customers');
        const mkCustomers = raw.map(mapCustomer);
        mkCustomers.forEach(x => registry.customers.add(x.id));
        await batchUpsert('customers', mkCustomers);

        raw = await extractDocuments('stations');
        const mkStations = raw.map(mapStation);
        mkStations.forEach(x => registry.stations.add(x.id));
        await batchUpsert('stations', mkStations);

        // Optional logic placeholder:
        // profiles => relies on auth.users mapping first using supabase.auth.admin.createUser
        // We will skip raw user imports here as they require Auth Admin API creation

        // ==========================================
        // WAVE 3: Shifts and Sessions
        // ==========================================
        console.log('\n--- WAVE 3: Shifts & Sessions ---');
        raw = await extractDocuments('shifts');
        const mkShifts = raw.map(mapShift);
        raw.forEach((d, i) => {
            const displayId = mkShifts[i].id;
            registry.shifts.add(displayId);
            // Map the raw Firebase doc ID to the displayId so orders/expenses can resolve it
            if (d.fsId && d.fsId !== displayId) {
                registry.shiftFsIdMap.set(d.fsId, displayId);
            }
        });
        await batchUpsert('shifts', mkShifts);

        raw = await extractDocuments('sessions');
        await batchUpsert('sessions', raw.map(mapSession));

        // ==========================================
        // WAVE 4: The Order & Transaction Knot
        // ==========================================
        console.log('\n--- WAVE 4: Financials ---');
        raw = await extractDocuments('orders');
        const mkOrders = raw.map(mapOrder);
        mkOrders.forEach(x => {
            registry.orders.add(x.order_number);
            registry.orderIds.set(x.order_number, x.id);
        });
        await batchUpsert('orders', mkOrders);

        raw = await extractDocuments('transactions');
        const { orderItems, pcTx, expenses } = processTransactions(raw);
        console.log(`Found: ${orderItems.length} order items, ${pcTx.length} PC Tx, ${expenses.length} Expenses`);

        await batchUpsert('order_items', orderItems);
        await batchUpsert('pc_transactions', pcTx);
        await batchUpsert('expenses', expenses);

        raw = await extractDocuments('invoices');
        await batchUpsert('invoices', raw.map(mapInvoice));

        // ==========================================
        // WAVE 5: Payroll & Miscellaneous
        // ==========================================
        console.log('\n--- WAVE 5: Extraneous Logs & Payroll ---');
        raw = await extractDocuments('payrollRuns');
        const mkRuns = raw.map(mapPayrollRun);
        mkRuns.forEach(x => registry.payroll_runs.add(x.id));
        await batchUpsert('payroll_runs', mkRuns);

        // Fetch subcollections inside payrollRuns
        for (const runId of registry.payroll_runs) {
            const linesSnap = await db.collection(`payrollRuns/${runId}/lines`).get();
            if (!linesSnap.empty) {
                const mapLines = linesSnap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        run_id: runId,
                        staff_id: d.staffId,
                        staff_name: d.staffName,
                        staff_email: d.staffEmail,
                        role: d.role,
                        base_pay: Number(d.basePay) || 0,
                        regular_hours: Number(d.regularHours) || 0,
                        overtime_hours: Number(d.overtimeHours) || 0,
                        total_pay: Number(d.totalPay) || 0,
                        deductions: d.deductions || [],
                        additions: d.additions || [],
                        shifts: d.shifts || [],
                        status: d.status || 'pending'
                    };
                });
                await batchUpsert('payroll_line_items', mapLines);
            }

            const stubsSnap = await db.collection(`payrollRuns/${runId}/paystubs`).get();
            if (!stubsSnap.empty) {
                const mapStubs = stubsSnap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        run_id: runId,
                        staff_id: d.staffId,
                        staff_email: d.staffEmail,
                        paystub_data: d.paystubData || {},
                        created_at: mapTimestamp(d.createdAt) || new Date().toISOString()
                    };
                });
                await batchUpsert('paystubs', mapStubs);
            }
        }

        raw = await extractDocuments('drawer_logs');
        await batchUpsert('drawer_logs', raw.map(d => ({
            id: d.fsId,
            staff_email: d.staffEmail,
            trigger_type: d.triggerType,
            signal_type: d.signalType,
            success: d.success === true,
            error_message: d.errorMessage,
            device: d.device,
            timestamp: mapTimestamp(d.timestamp) || new Date().toISOString()
        })));

        raw = await extractDocuments('station_logs');
        await batchUpsert('station_logs', raw.map(d => ({
            id: d.fsId,
            station_id: registry.stations.has(d.stationId) ? d.stationId : null,
            session_id: d.sessionId,
            event: d.event,
            severity: d.severity,
            staff_id: d.staffId,
            metadata: d.metadata || {},
            timestamp: mapTimestamp(d.timestamp) || new Date().toISOString()
        })));

        // Firebase collection may be camelCase — try both
        raw = await extractDocuments('payrollLogs');
        if (raw.length === 0) raw = await extractDocuments('payroll_logs');
        await batchUpsert('payroll_logs', raw.map(d => ({
            id: d.fsId,
            staff_id: d.staffId || d.staffUid,
            staff_uid: d.staffUid,
            staff_email: d.staffEmail,
            staff_name: d.staffName,
            shift_id: d.shiftId,
            type: d.type,
            action: d.action,
            method: d.method,
            clock_in: mapTimestamp(d.clockIn),
            clock_out: mapTimestamp(d.clockOut),
            timestamp: mapTimestamp(d.timestamp) || new Date().toISOString()
        })));


        console.log('\n✨ COMPLETE REFACTOR MIGRATION FINISHED!');
        process.exit(0);
    } catch (err) {
        console.error('\n💥 Migration crashed:', err.message);
        process.exit(1);
    }
};

runMigration();
