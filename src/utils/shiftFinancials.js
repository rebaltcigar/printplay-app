// src/utils/shiftFinancials.js
// Single source of truth for all shift financial computations.
// Used by: EndShiftDialog, ShiftConsolidationDialog, Shifts, payrollHelpers.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Legacy string match — used as fallback when pcRentalServiceId is not configured.
// v0.6: this constant will be retired once all callers pass pcRentalServiceId.
const PC_RENTAL_ITEM_FALLBACK = 'pc rental'; // lowercase for case-insensitive compare
const EXPENSE_ITEMS = new Set(['Expenses', 'New Debt']);

// Determine if a transaction is a PC Rental billing transaction.
// Uses OR logic so both new transactions (serviceId) and old ones (item name) always match.
// No data migration needed — old transactions identified by name, new ones by serviceId.
const isPcRentalTx = (tx, pcRentalServiceId) =>
    (pcRentalServiceId ? tx.serviceId === pcRentalServiceId : false) ||
    String(tx.item ?? '').trim().toLowerCase() === PC_RENTAL_ITEM_FALLBACK;

// ---------------------------------------------------------------------------
// Denominations
// ---------------------------------------------------------------------------

/**
 * Sum a denominations object (e.g. { bill_1000: 2, coin_5: 3 } → 2005).
 * Accepts keys like `bill_1000`, `coin_5`, `b_100`, `c_0.25`.
 * @param {Object} denoms
 * @returns {number}
 */
export const sumDenominations = (denoms = {}) => {
    let total = 0;
    for (const [k, v] of Object.entries(denoms || {})) {
        const m = /^([bc]|bill|coin)_(\d+(?:\.\d+)?)$/i.exec(k);
        if (!m) continue;
        const face = Number(m[2]);
        const count = Number(v || 0);
        if (!isFinite(face) || !isFinite(count)) continue;
        total += face * count;
    }
    return Number(total.toFixed(2));
};

// ---------------------------------------------------------------------------
// Transaction Splits
// ---------------------------------------------------------------------------

/**
 * Split a transaction list into PC Rental transactions and everything else.
 * @param {Array}       transactions
 * @param {string|null} pcRentalServiceId - Firestore serviceId of the PC Rental catalog item.
 *   When provided, matching is by serviceId (clean). When null, falls back to item name
 *   string match for backward compatibility with legacy transactions.
 * @returns {{ pcRentalTxs: Array, otherTxs: Array }}
 */
export const splitPcRental = (transactions = [], pcRentalServiceId = null) => {
    const pcRentalTxs = [];
    const otherTxs = [];
    for (const tx of transactions) {
        if (isPcRentalTx(tx, pcRentalServiceId)) pcRentalTxs.push(tx);
        else otherTxs.push(tx);
    }
    return { pcRentalTxs, otherTxs };
};

/**
 * Tally cash/gcash/ar totals from a list of sales transactions
 * (do NOT pass expense transactions here).
 * @param {Array} saleTxs - non-expense, non-PC-rental transactions
 * @returns {{ cash: number, gcash: number, ar: number }}
 */
export const tallyPaymentMethods = (saleTxs = []) => {
    let cash = 0, gcash = 0, ar = 0;
    for (const tx of saleTxs) {
        const amt = Number(tx.total || 0);
        if (tx.paymentMethod === 'GCash') gcash += amt;
        else if (tx.paymentMethod === 'Charge') ar += amt;
        else cash += amt;
    }
    return { cash, gcash, ar };
};

// ---------------------------------------------------------------------------
// Core Shift Financial Summary
// ---------------------------------------------------------------------------

/**
 * Compute the full financial summary for a shift from raw transactions.
 * This is used at shift-end and in any "live" transaction list context.
 *
 * Handles the hybrid PC Rental model:
 *   - PC Rental total comes from a manual user input (pcRentalTotal)
 *   - Logged PC Rental transactions may capture non-cash methods (GCash/Charge)
 *   - The cash portion of PC Rental = pcRentalTotal − logged non-cash PC Rental
 *
 * @param {Array}       transactions     - All shift transactions (raw, unfiltered)
 * @param {number}      pcRentalTotal    - Manual PC Rental total (from timer system)
 * @param {string|null} pcRentalServiceId - Catalog serviceId for PC Rental billing item.
 *   Pass from settings.pcRentalServiceId. Null = fallback to item name string match.
 * @returns {{
 *   servicesTotal:    number,   // non-PC, non-expense sales
 *   expensesTotal:    number,   // Expenses + New Debt
 *   salesBreakdown:   [string, number][], // per-item sorted array
 *   expensesBreakdown:[string, number][], // per-expense-type sorted array
 *   totalCash:        number,   // cash sales + implied PC cash
 *   totalGcash:       number,
 *   totalAr:          number,
 *   systemTotal:      number,   // servicesTotal + pcRentalTotal - expensesTotal
 *   expectedCash:     number,   // totalCash - expensesTotal
 *   loggedPcNonCash:  number,   // GCash + Charge logged as PC Rental
 * }}
 */
export const computeShiftFinancials = (transactions = [], pcRentalTotal = 0, pcRentalServiceId = null) => {
    const pc = Number(pcRentalTotal || 0);
    const { pcRentalTxs, otherTxs } = splitPcRental(transactions, pcRentalServiceId);

    // --- PC Rental logged payment methods ---
    let pcGcash = 0, pcAr = 0;
    for (const tx of pcRentalTxs) {
        const amt = Number(tx.total || 0);
        if (tx.paymentMethod === 'GCash') pcGcash += amt;
        else if (tx.paymentMethod === 'Charge') pcAr += amt;
    }
    const loggedPcNonCash = pcGcash + pcAr;
    const impliedPcCash = Math.max(0, pc - loggedPcNonCash);

    // --- Regular sales and expenses ---
    let servicesTotal = 0;
    let expensesTotal = 0;
    let regularCash = 0, regularGcash = 0, regularAr = 0;
    const salesMap = new Map();
    const expensesMap = new Map();

    for (const tx of otherTxs) {
        const amt = Number(tx.total || 0);
        if (EXPENSE_ITEMS.has(tx.item)) {
            expensesTotal += amt;
            const key = tx.item === 'Expenses'
                ? `Expense: ${tx.expenseType || 'Other'}`
                : 'New Debt';
            expensesMap.set(key, (expensesMap.get(key) || 0) + amt);
        } else {
            servicesTotal += amt;
            salesMap.set(tx.item || '—', (salesMap.get(tx.item || '—') || 0) + amt);
            if (tx.paymentMethod === 'GCash') regularGcash += amt;
            else if (tx.paymentMethod === 'Charge') regularAr += amt;
            else regularCash += amt;
        }
    }

    const totalCash = regularCash + impliedPcCash;
    const totalGcash = regularGcash + pcGcash;
    const totalAr = regularAr + pcAr;
    const systemTotal = servicesTotal + pc - expensesTotal;
    const expectedCash = totalCash - expensesTotal;

    const salesBreakdown = Array.from(salesMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const expensesBreakdown = Array.from(expensesMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    return {
        servicesTotal,
        expensesTotal,
        salesBreakdown,
        expensesBreakdown,
        totalCash,
        totalGcash,
        totalAr,
        systemTotal,
        expectedCash,
        loggedPcNonCash,
    };
};

// ---------------------------------------------------------------------------
// Saved Shift Expected Cash
// ---------------------------------------------------------------------------

/**
 * Compute expected cash for a SAVED shift (used on admin tables and payroll).
 *
 * Priority order:
 *   1. shift.breakdown.cash (set at end-of-shift; most accurate)
 *   2. aggregated cashSales + (pcRentalTotal - pcNonCashSales) fallback
 *
 * @param {Object} shift          - Firestore shift doc
 * @param {Object} [txAgg]        - Aggregated tx data { cashSales, expenses, pcNonCashSales }
 * @returns {number} expectedCash
 */
export const computeExpectedCash = (shift, txAgg = {}) => {
    const pc = Number(shift?.pcRentalTotal || 0);
    const expenses = Number(txAgg?.expenses || shift?.expensesTotal || 0);
    // Deduct non-cash (GCash/Charge) PC Rental transactions from the manual total
    // so those amounts are NOT counted as cash in the drawer.
    const pcNonCash = Number(txAgg?.pcNonCashSales || 0);
    const pcCash = Math.max(0, pc - pcNonCash);

    if (shift?.breakdown?.cash !== undefined) {
        return Number(shift.breakdown.cash || 0) - expenses;
    }
    return (Number(txAgg?.cashSales || 0) + pcCash) - expenses;
};

// ---------------------------------------------------------------------------
// Transaction Aggregation (used by Shifts.jsx admin table)
// ---------------------------------------------------------------------------

/**
 * Aggregate a shift's transactions into totals by service, payment method,
 * and expense category. Used for the Shifts admin table and report views.
 *
 * This intentionally does NOT include PC Rental in the base sales total
 * because PC Rental is entered manually at end-of-shift.
 *
 * @param {Array}       txList            - Shift transactions (filtered, non-deleted)
 * @param {Array}       serviceMeta       - [{ name: string, category: string }] from Firestore
 * @param {string|null} pcRentalServiceId - Catalog serviceId for PC Rental item (null = string fallback)
 * @returns {{
 *   serviceTotals: Object,
 *   sales:         number,
 *   expenses:      number,
 *   systemTotal:   number,
 *   cashSales:     number,
 *   gcashSales:    number,
 *   arSales:       number,
 *   pcNonCashSales: number,  // GCash + Charge logged as PC Rental (NOT cash in drawer)
 * }}
 */
export const aggregateShiftTransactions = (txList = [], serviceMeta = [], pcRentalServiceId = null) => {
    const normalize = (s) => String(s ?? '').trim().toLowerCase();

    // Build serviceName → category lookup from meta
    const nameToCategory = {};
    for (const s of serviceMeta) {
        const n = normalize(s.name);
        if (n) nameToCategory[n] = s.category || '';
    }

    const serviceTotals = {};
    let sales = 0, expenses = 0;
    let cashSales = 0, gcashSales = 0, arSales = 0;
    // Track non-cash PC Rental so expectedCash is not inflated
    let pcNonCashSales = 0;

    for (const tx of txList) {
        if (!tx || tx.isDeleted === true) continue;

        const itemName = normalize(tx.item);
        if (!itemName) continue;

        const isPcRental = isPcRentalTx(tx, pcRentalServiceId);

        // Determine category (sale = revenue, expense = cost)
        // New values: 'Sale' / 'Expense'
        // Legacy fallback: 'debit' (old sale) / 'credit' (old expense)
        let cat = nameToCategory[itemName];
        if (!cat) {
            cat = itemName === 'expenses' ? 'expense' : 'sale';
        }

        let amt = Number(tx.total);
        if (!Number.isFinite(amt)) {
            const p = Number(tx.price), q = Number(tx.quantity);
            amt = Number.isFinite(p) && Number.isFinite(q) ? p * q : 0;
        }
        if (!Number.isFinite(amt)) amt = 0;

        const displayName =
            serviceMeta.find((s) => normalize(s.name) === itemName)?.name ||
            tx.item ||
            'Unknown';

        serviceTotals[displayName] = (serviceTotals[displayName] || 0) + amt;

        if (normalize(cat) === 'sale' || normalize(cat) === 'debit') {
            if (!isPcRental) {
                sales += amt;
            }

            if (tx.paymentMethod === 'GCash') {
                gcashSales += amt;
                if (isPcRental) pcNonCashSales += amt;   // GCash PC Rental → not in drawer
            } else if (tx.paymentMethod === 'Charge') {
                arSales += amt;
                if (isPcRental) pcNonCashSales += amt;   // AR PC Rental → not in drawer
            } else {
                // Cash: only add if NOT PC Rental (PC Rental cash covered by manual total input)
                if (!isPcRental) {
                    cashSales += amt;
                }
            }
        } else {
            expenses += amt;
        }
    }

    return {
        serviceTotals,
        sales,
        expenses,
        systemTotal: sales - expenses,
        cashSales,
        gcashSales,
        arSales,
        pcNonCashSales,
    };
};

// ---------------------------------------------------------------------------
// Difference (shortage/overage)
// ---------------------------------------------------------------------------

/**
 * Compute cash difference: positive = overage, negative = shortage.
 * @param {number} cashOnHand   - Actual counted cash
 * @param {number} expectedCash - Expected cash (from computeExpectedCash)
 * @returns {number}
 */
export const computeDifference = (cashOnHand, expectedCash) =>
    Number((cashOnHand - expectedCash).toFixed(2));
