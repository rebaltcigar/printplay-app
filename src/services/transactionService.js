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

    // Sequential updates across the 3 split tables. 
    // If the ID isn't in the table, Supabase just silently updates 0 rows.
    await supabase.from('order_items').update(updatePayload).in('id', ids);
    await supabase.from('pc_transactions').update(updatePayload).in('id', ids);
    await supabase.from('expenses').update(updatePayload).in('id', ids);
};

/**
 * Updates a transaction document.
 * Tries all 3 tables sequentially since the UI lacks context of which table the generic "transaction ID" belongs to.
 * 
 * @param {string} id Transaction document ID
 * @param {Object} updates Fields to update
 * @returns {Promise<void>}
 */
export const updateTransaction = async (id, updates) => {
    // Map camcelCase to snake_case if necessary for updates
    // Assume caller mapped it or we map common fields
    const payload = { ...updates, updated_at: new Date().toISOString() };
    if (payload.isDeleted !== undefined) {
        payload.is_deleted = payload.isDeleted;
        delete payload.isDeleted;
    }

    await supabase.from('order_items').update(payload).eq('id', id);
    await supabase.from('pc_transactions').update(payload).eq('id', id);
    await supabase.from('expenses').update(payload).eq('id', id);
};
