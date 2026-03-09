// src/utils/shiftFinancials.js
// Single source of truth for all shift financial computations.
// Used by: EndShiftDialog, ShiftConsolidationDialog, Shifts, payrollHelpers.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PC_RENTAL_ITEM_FALLBACK = 'pc rental'; // lowercase for case-insensitive compare
const EXPENSE_ITEMS = new Set(['Expenses', 'New Debt']);

// All non-cash, non-charge payment methods are "digital".
const DIGITAL_METHODS = new Set(['GCash', 'Maya', 'Bank Transfer', 'Card']);

/**
 * Returns true if the payment method is a digital (non-cash, non-charge) method.
 * Used to determine what does NOT go into the physical cash drawer.
 * @param {string} method
 * @returns {boolean}
 */
export const isDigitalPayment = (method) => DIGITAL_METHODS.has(method);

// Determine if a transaction is a PC Rental billing transaction.
const isPcRentalTx = (tx, pcRentalServiceId) =>
    (pcRentalServiceId ? tx.serviceId === pcRentalServiceId : false) ||
    String(tx.item ?? '').trim().toLowerCase() === PC_RENTAL_ITEM_FALLBACK;

// ---------------------------------------------------------------------------
// Denominations
// ---------------------------------------------------------------------------

/**
 * Sum a denominations object (e.g. { bill_1000: 2, coin_5: 3 } → 2005).
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
 * @param {string|null} pcRentalServiceId
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
 * Tally cash/digital/ar totals from a list of sales transactions.
 * (Do NOT pass expense transactions here.)
 * @param {Array} saleTxs
 * @returns {{ cash: number, digital: number, ar: number }}
 */
export const tallyPaymentMethods = (saleTxs = []) => {
    let cash = 0, digital = 0, ar = 0;
    for (const tx of saleTxs) {
        const amt = Number(tx.total || 0);
        if (isDigitalPayment(tx.paymentMethod)) digital += amt;
        else if (tx.paymentMethod === 'Charge') ar += amt;
        else cash += amt;
    }
    return { cash, digital, ar };
};

// ---------------------------------------------------------------------------
// Core Shift Financial Summary
// ---------------------------------------------------------------------------

/**
 * Compute the full financial summary for a shift from raw transactions.
 *
 * @param {Array}       transactions      All shift transactions (raw, unfiltered)
 * @param {number}      pcRentalTotal     Manual PC Rental total (from timer system)
 * @param {string|null} pcRentalServiceId Catalog serviceId for PC Rental item.
 * @returns {{
 *   servicesTotal:    number,
 *   expensesTotal:    number,
 *   salesBreakdown:   [string, number][],
 *   expensesBreakdown:[string, number][],
 *   totalCash:        number,
 *   totalDigital:     number,
 *   totalAr:          number,
 *   systemTotal:      number,
 *   expectedCash:     number,
 *   loggedPcNonCash:  number,
 *   arPaymentsTotal:  number,
 *   arCashTotal:      number,
 *   arDigitalTotal:   number,
 * }}
 */
export const computeShiftFinancials = (transactions = [], pcRentalTotal = 0, pcRentalServiceId = null) => {
    const pc = Number(pcRentalTotal || 0);
    const { pcRentalTxs, otherTxs } = splitPcRental(transactions, pcRentalServiceId);

    // --- PC Rental logged payment methods ---
    let pcDigital = 0, pcAr = 0;
    for (const tx of pcRentalTxs) {
        const amt = Number(tx.total || 0);
        if (isDigitalPayment(tx.paymentMethod)) pcDigital += amt;
        else if (tx.paymentMethod === 'Charge') pcAr += amt;
    }
    const loggedPcNonCash = pcDigital + pcAr;
    const impliedPcCash = Math.max(0, pc - loggedPcNonCash);

    // --- Regular sales and expenses ---
    let servicesTotal = 0;
    let expensesTotal = 0;
    let arPaymentsTotal = 0;
    let arCashTotal = 0;
    let arDigitalTotal = 0;
    let regularCash = 0, regularDigital = 0, regularAr = 0;
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
        } else if (tx.item === 'AR Payment') {
            arPaymentsTotal += amt;
            if (isDigitalPayment(tx.paymentMethod)) {
                regularDigital += amt;
                arDigitalTotal += amt;
            } else if (tx.paymentMethod === 'Charge') {
                regularAr += amt;
            } else {
                regularCash += amt;
                arCashTotal += amt;
            }
        } else {
            servicesTotal += amt;
            salesMap.set(tx.item || '—', (salesMap.get(tx.item || '—') || 0) + amt);
            if (isDigitalPayment(tx.paymentMethod)) regularDigital += amt;
            else if (tx.paymentMethod === 'Charge') regularAr += amt;
            else regularCash += amt;
        }
    }

    const totalCash = regularCash + impliedPcCash;
    const totalDigital = regularDigital + pcDigital;
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
        totalDigital,
        totalAr,
        systemTotal,
        expectedCash,
        loggedPcNonCash,
        arPaymentsTotal,
        arCashTotal: Number(arCashTotal.toFixed(2)),
        arDigitalTotal: Number(arDigitalTotal.toFixed(2)),
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
 * @param {Object} shift
 * @param {Object} [txAgg]
 * @returns {number} expectedCash
 */
export const computeExpectedCash = (shift, txAgg = {}) => {
    const pc = Number(shift?.pcRentalTotal || 0);
    const expenses = Number(txAgg?.expenses || shift?.expensesTotal || 0);
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
 * @param {Array}       txList
 * @param {Array}       serviceMeta       [{ name: string, category: string }]
 * @param {string|null} pcRentalServiceId
 * @returns {{
 *   serviceTotals:  Object,
 *   sales:          number,
 *   expenses:       number,
 *   systemTotal:    number,
 *   cashSales:      number,
 *   digitalSales:   number,
 *   arSales:        number,
 *   pcNonCashSales: number,
 *   arPayments:     number,
 * }}
 */
export const aggregateShiftTransactions = (txList = [], serviceMeta = [], pcRentalServiceId = null) => {
    const normalize = (s) => String(s ?? '').trim().toLowerCase();

    const nameToCategory = {};
    for (const s of serviceMeta) {
        const n = normalize(s.name);
        if (n) nameToCategory[n] = s.category || '';
    }

    const serviceTotals = {};
    let sales = 0, expenses = 0;
    let cashSales = 0, digitalSales = 0, arSales = 0;
    let pcNonCashSales = 0;
    let arPayments = 0;

    for (const tx of txList) {
        if (!tx || tx.isDeleted === true) continue;

        const itemName = normalize(tx.item);
        if (!itemName) continue;

        const isPcRental = isPcRentalTx(tx, pcRentalServiceId);

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

        if (itemName !== 'ar payment') {
            serviceTotals[displayName] = (serviceTotals[displayName] || 0) + amt;
        }

        if (normalize(cat) === 'sale' || normalize(cat) === 'debit') {
            const isArPayment = itemName === 'ar payment';

            if (!isPcRental && !isArPayment) {
                sales += amt;
            }
            if (isArPayment) {
                arPayments += amt;
            }

            if (isDigitalPayment(tx.paymentMethod)) {
                digitalSales += amt;
                if (isPcRental) pcNonCashSales += amt;
            } else if (tx.paymentMethod === 'Charge') {
                arSales += amt;
                if (isPcRental) pcNonCashSales += amt;
            } else {
                // Cash: only add if NOT PC Rental
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
        digitalSales,
        arSales,
        pcNonCashSales,
        arPayments,
    };
};

// ---------------------------------------------------------------------------
// Difference (shortage/overage)
// ---------------------------------------------------------------------------

/**
 * Compute cash difference: positive = overage, negative = shortage.
 * @param {number} cashOnHand
 * @param {number} expectedCash
 * @returns {number}
 */
export const computeDifference = (cashOnHand, expectedCash) =>
    Number((cashOnHand - expectedCash).toFixed(2));
