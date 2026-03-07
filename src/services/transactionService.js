import { db } from "../firebase";
import {
    collection, addDoc, serverTimestamp, writeBatch,
    doc, updateDoc
} from "firebase/firestore";
import { generateDisplayId } from "./orderService";

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
    expenseStaffEmail, // ADDED
    quantity = 1,
    price,
    notes,
    userEmail,
    activeShiftId,
    financialCategory = 'OPEX' // Default to OPEX
}) => {
    const displayId = await generateDisplayId("expenses", "EXP");

    // Auto-detect CAPEX if not explicitly provided
    const finalFinancialCategory = (expenseType?.toLowerCase().includes('capital')) ? 'CAPEX' : financialCategory;

    const docRef = await addDoc(collection(db, 'transactions'), {
        displayId,
        item,
        expenseType,
        expenseStaffId: expenseStaffId || null,
        expenseStaffName: expenseStaffName || null,
        expenseStaffEmail: expenseStaffEmail || null, // ADDED
        quantity: Number(quantity),
        price: Number(price),
        total: Number(quantity) * Number(price),
        notes: notes || '',
        timestamp: serverTimestamp(),
        staffEmail: userEmail,
        shiftId: activeShiftId,
        category: 'Credit', // Standardize on 'Credit' for outgoing funds
        financialCategory: finalFinancialCategory,
        isDeleted: false
    });

    return docRef.id;
};

/**
 * Performs a batch soft-delete on a list of transaction IDs.
 * 
 * @param {string[]} ids Array of transaction document IDs
 * @param {string} userEmail Email of the user performing the deletion
 * @param {string} reason Reason for deletion
 * @returns {Promise<void>}
 */
export const deleteTransactions = async (ids, userEmail, reason) => {
    const batch = writeBatch(db);
    ids.forEach(id => {
        batch.update(doc(db, 'transactions', id), {
            isDeleted: true,
            deletedBy: userEmail,
            deleteReason: reason,
            deletedAt: serverTimestamp()
        });
    });
    await batch.commit();
};

/**
 * Updates a transaction document.
 * 
 * @param {string} id Transaction document ID
 * @param {Object} updates Fields to update
 * @returns {Promise<void>}
 */
export const updateTransaction = async (id, updates) => {
    await updateDoc(doc(db, 'transactions', id), updates);
};
