import { supabase } from "../supabase";
import { generateDisplayId, getStaffIdentity } from "../utils/idUtils";

/**
 * Records an expense transaction.
 */
export const recordExpense = async ({
    expenseType,
    expenseStaffId,
    quantity = 1,
    price,
    notes,
    user,
    activeShiftId,
    financialCategory = 'OPEX'
}) => {
    const finalFinancialCategory = (expenseType?.toLowerCase().includes('capital')) ? 'CAPEX' : financialCategory;
    const staffId = expenseStaffId || getStaffIdentity(user);

    const { data, error } = await supabase.rpc('record_expense', {
        p_expense_type: expenseType,
        p_amount: Number(quantity) * Number(price),
        p_quantity: Number(quantity),
        p_staff_id: staffId,
        p_shift_id: activeShiftId,
        p_category: finalFinancialCategory,
        p_notes: notes || ''
    });

    if (error) throw error;
    return data;
};

/**
 * Performs a batch soft-delete on a list of transaction IDs.
 * Routes each ID to its correct table using the ID prefix (OI-, PC-, EX-).
 * Falls back to a triple-write for unrecognised prefixes.
 *
 * @param {string[]} ids Array of transaction document IDs
 * @param {string} userEmail Email of the user performing the deletion
 * @param {string} reason Reason for deletion
 * @returns {Promise<void>}
 */
export const deleteTransactions = async (ids, userEmail, reason) => {
    if (!ids || ids.length === 0) return;

    const payload = { is_deleted: true };
    const oiIds  = ids.filter(id => id.startsWith('OI-'));
    const exIds  = ids.filter(id => id.startsWith('EX-'));
    const pcIds  = ids.filter(id => id.startsWith('PX-'));
    const unknown = ids.filter(id => !id.startsWith('OI-') && !id.startsWith('EX-') && !id.startsWith('PX-'));

    const ops = [];
    if (oiIds.length)  ops.push(supabase.from('order_items').update(payload).in('id', oiIds));
    if (exIds.length)  ops.push(supabase.from('expenses').update(payload).in('id', exIds));
    if (pcIds.length)  ops.push(supabase.from('pc_transactions').update(payload).in('id', pcIds));
    // Unknown prefix — fall back to triple-write so nothing is silently missed
    if (unknown.length) {
        ops.push(
            supabase.from('order_items').update(payload).in('id', unknown),
            supabase.from('pc_transactions').update(payload).in('id', unknown),
            supabase.from('expenses').update(payload).in('id', unknown),
        );
    }

    await Promise.all(ops);
};

// Per-table allowed columns — prevents 400 errors when a field doesn't exist in that table.
const ORDER_ITEM_COLS = new Set([
    'name', 'price', 'cost_price', 'amount', 'quantity',
    'is_deleted', 'is_edited', 'added_by_admin', 'staff_id',
    'shift_id', 'financial_category', 'customer_id',
    'category', 'payment_method', 'invoice_status', 'reconciliation_status',
    'metadata', 'updated_at'
]);
const PC_TX_COLS = new Set([
    'customer_id', 'type', 'category', 'payment_method',
    'amount', 'staff_id', 'shift_id', 'is_deleted', 'financial_category',
    'reconciliation_status', 'metadata'
]);
const EXPENSE_COLS = new Set([
    'expense_type', 'amount', 'quantity',
    'staff_id', 'shift_id', 'is_deleted', 'financial_category', 'notes', 'metadata'
]);
const pick = (obj, cols) => Object.fromEntries(Object.entries(obj).filter(([k]) => cols.has(k)));

/**
 * Updates a transaction document.
 * Strips fields to each table's known columns to avoid 400 errors on unknown fields.
 *
 * @param {string} id Transaction document ID
 * @param {Object} updates Fields to update
 * @returns {Promise<void>}
 */
export const updateTransaction = async (id, updates) => {
    const base = { ...updates };
    if (base.isDeleted !== undefined) {
        base.is_deleted = base.isDeleted;
        delete base.isDeleted;
    }

    const prefix = typeof id === 'string' ? id.split('-')[0] : '';

    if (prefix === 'OI') {
        const payload = pick({ ...base, updated_at: new Date().toISOString() }, ORDER_ITEM_COLS);
        await supabase.from('order_items').update(payload).eq('id', id);
    } else if (prefix === 'EX') {
        const payload = pick(base, EXPENSE_COLS);
        await supabase.from('expenses').update(payload).eq('id', id);
    } else if (prefix === 'PX') {
        const payload = pick(base, PC_TX_COLS);
        await supabase.from('pc_transactions').update(payload).eq('id', id);
    } else {
        // Unknown prefix — fall back to triple-write for safety
        await Promise.all([
            supabase.from('order_items').update(pick({ ...base, updated_at: new Date().toISOString() }, ORDER_ITEM_COLS)).eq('id', id),
            supabase.from('pc_transactions').update(pick(base, PC_TX_COLS)).eq('id', id),
            supabase.from('expenses').update(pick(base, EXPENSE_COLS)).eq('id', id),
        ]);
    }
};
