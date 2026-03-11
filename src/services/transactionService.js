import { supabase } from "../supabase";

const generateExpId = () => `EXP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

/**
 * Records an expense transaction.
 * 
 * @param {Object} params
 * @param {string} params.item Item name (usually 'Expenses')
 * @param {string} params.expenseType Type of expense (Salary, OPEX, etc.)
 * @param {string} params.expenseStaffId Linked staff ID (for Salary/Advance)
 * @param {string} params.expenseStaffName Linked staff name
 * @param {number} params.quantity Quantity
 * @param {number} params.price Price/Unit Cost
 * @param {string} params.notes Additional notes
 * @param {string} params.userEmail Email of the staff recording the expense
 * @param {string} params.activeShiftId Current shift ID
 * @returns {Promise<string>} The ID of the created transaction
 */
export const recordExpense = async ({
    item = "Expenses",
    expenseType,
    expenseStaffId,
    expenseStaffName,
    expenseStaffEmail,
    quantity = 1,
    price,
    notes,
    userEmail,
    activeShiftId,
    financialCategory = 'OPEX'
}) => {
    const newId = generateExpId();
    const finalFinancialCategory = (expenseType?.toLowerCase().includes('capital')) ? 'CAPEX' : financialCategory;

    const payload = {
        id: newId,
        item,
        expense_type: expenseType,
        quantity: Number(quantity),
        amount: Number(quantity) * Number(price), // 'amount' in supabase instead of price/total
        staff_email: userEmail,
        shift_id: activeShiftId,
        financial_category: finalFinancialCategory,
        category: 'Credit',
        // In Supabase schema v2.0 we dropped the complex staffing names on expenses to unify, 
        // but we can shove it in notes or if the schema accepts it via metadata
        is_deleted: false,
        timestamp: new Date().toISOString(),
        // Just appending extra details to notes securely
        notes: (notes ? notes + '. ' : '') + (expenseStaffName ? `For: ${expenseStaffName} (${expenseStaffEmail || expenseStaffId})` : '')
    };

    const { error } = await supabase.from('expenses').insert([payload]);
    if (error) throw error;

    return newId;
};

/**
 * Performs a batch soft-delete on a list of transaction IDs.
 * Since Supabase split 'transactions' into 3 tables, we safely apply soft-deletes to all.
 * 
 * @param {string[]} ids Array of transaction document IDs
 * @param {string} userEmail Email of the user performing the deletion
 * @param {string} reason Reason for deletion
 * @returns {Promise<void>}
 */
export const deleteTransactions = async (ids, userEmail, reason) => {
    if (!ids || ids.length === 0) return;

    const updatePayload = {
        is_deleted: true,
        // Since different tables might have different schema, we map deletedBy to metadata if needed, 
        // but standard soft delete just sets is_deleted.
    };

    // Concurrent updates across the 3 split tables. 
    // If the ID isn't in the table, Supabase just silently updates 0 rows.
    await Promise.all([
        supabase.from('order_items').update(updatePayload).in('id', ids),
        supabase.from('pc_transactions').update(updatePayload).in('id', ids),
        supabase.from('expenses').update(updatePayload).in('id', ids)
    ]);
};

// Per-table allowed columns — prevents 400 errors when a field doesn't exist in that table.
const ORDER_ITEM_COLS = new Set([
    'name', 'price', 'cost_price', 'amount', 'quantity',
    'is_deleted', 'is_edited', 'added_by_admin', 'staff_email',
    'shift_id', 'financial_category', 'customer_id', 'customer_name',
    'category', 'payment_method', 'invoice_status', 'reconciliation_status',
    'metadata', 'updated_at'
]);
const PC_TX_COLS = new Set([
    'customer_id', 'customer_name', 'type', 'category', 'payment_method',
    'amount', 'staff_email', 'shift_id', 'is_deleted', 'financial_category',
    'reconciliation_status', 'metadata'
]);
const EXPENSE_COLS = new Set([
    'category', 'expense_type', 'item', 'amount', 'quantity',
    'staff_email', 'shift_id', 'is_deleted', 'financial_category', 'notes'
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

    const orderItemPayload = pick({ ...base, updated_at: new Date().toISOString() }, ORDER_ITEM_COLS);
    const pcTxPayload = pick(base, PC_TX_COLS);
    const expensePayload = pick(base, EXPENSE_COLS);

    await Promise.all([
        supabase.from('order_items').update(orderItemPayload).eq('id', id),
        supabase.from('pc_transactions').update(pcTxPayload).eq('id', id),
        supabase.from('expenses').update(expensePayload).eq('id', id)
    ]);
};
