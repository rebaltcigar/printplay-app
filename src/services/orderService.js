// src/services/orderService.js
import {
    doc, runTransaction, getDoc, serverTimestamp,
    writeBatch, collection, where, query, getDocs, increment
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------------
// 1. ID Generation Logic (Consolidated from idGenerator.js)
// ---------------------------------------------------------------------------

/**
 * Generates a sequential ID (e.g., "SHIFT-000005").
 * Uses a 'counters' collection in Firestore to maintain atomicity.
 */
export const generateDisplayId = async (counterName, defaultPrefix = "ID", padding = 6) => {
    let prefix = defaultPrefix;
    try {
        const configRef = doc(db, 'settings', 'config');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const data = configSnap.data();
            if (data.idPrefixes && data.idPrefixes[counterName]) {
                prefix = data.idPrefixes[counterName];
            }
        }
    } catch (e) {
        console.warn("Failed to fetch ID prefix config, using default:", e);
    }

    const counterRef = doc(db, "counters", counterName);

    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentSequence = 0;

            if (counterDoc.exists()) {
                const data = counterDoc.data();
                currentSequence = data.currentSequence || 0;
            }

            const nextSequence = currentSequence + 1;
            transaction.set(counterRef, { currentSequence: nextSequence }, { merge: true });
            return nextSequence;
        });

        return `${prefix}-${String(newId).padStart(padding, "0")}`;
    } catch (error) {
        console.error(`Error generating ID for ${counterName}:`, error);
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `${prefix}-ERR-${Date.now()}-${rand}`;
    }
};

/**
 * Reserves a block of IDs for batch processing.
 */
export const generateBatchIds = async (counterName, defaultPrefix, count, padding = 6) => {
    if (count <= 0) return [];

    let prefix = defaultPrefix;
    try {
        const configRef = doc(db, 'settings', 'config');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const data = configSnap.data();
            if (data.idPrefixes && data.idPrefixes[counterName]) {
                prefix = data.idPrefixes[counterName];
            }
        }
    } catch (e) {
        console.warn("Failed to fetch ID prefix config, using default:", e);
    }

    const counterRef = doc(db, "counters", counterName);

    try {
        const startSeq = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentSequence = 0;

            if (counterDoc.exists()) {
                const data = counterDoc.data();
                currentSequence = data.currentSequence || 0;
            }

            const nextSequence = currentSequence + count;
            transaction.set(counterRef, { currentSequence: nextSequence }, { merge: true });
            return currentSequence + 1;
        });

        const ids = [];
        for (let i = 0; i < count; i++) {
            ids.push(`${prefix}-${String(startSeq + i).padStart(padding, "0")}`);
        }
        return ids;
    } catch (error) {
        console.error(`Error generating batch IDs for ${counterName}:`, error);
        return [];
    }
};

/**
 * Specifically for legacy order number generation (counter: orders, prefix: ORD).
 */
export const generateOrderNumber = () => generateDisplayId('orders', 'ORD');

// ---------------------------------------------------------------------------
// 2. Order Factory Logic
// ---------------------------------------------------------------------------

/**
 * Creates a normalized order object for Firestore 'orders' collection.
 */
export const createOrderObject = (
    items, total, paymentMethod, paymentDetails, amountTendered, change, customer, user, discount = null, subtotal = null
) => {
    return {
        items: items.map(i => ({
            itemId: i.id,
            name: i.serviceName || i.name,
            note: i.note || '',
            price: i.price,
            costPrice: i.costPrice || 0,
            quantity: i.quantity || 1,
            subtotal: (i.price || 0) * (i.quantity || 1),
        })),
        subtotal: subtotal || total,
        discount: discount || { type: 'none', value: 0, amount: 0 },
        total: total,
        paymentMethod: paymentMethod,
        paymentDetails: paymentDetails || {},
        amountTendered: Number(amountTendered),
        change: Number(change),
        customerId: customer?.id || 'walk-in',
        customerName: customer?.fullName || 'Walk-in Customer',
        customerPhone: customer?.phone || '',
        customerAddress: customer?.address || '',
        customerTin: customer?.tin || '',
        staffId: user?.uid || 'unknown',
        staffEmail: user?.email || 'unknown',
        staffName: user?.displayName || user?.email || 'Staff',
        timestamp: serverTimestamp(),
        status: 'completed',
        isDeleted: false
    };
};

/**
 * Soft-deletes an order and its linked transactions in a single batch.
 * 
 * @param {string} orderId The document ID of the order to delete
 * @param {string} orderNumber The display number of the order
 * @param {string} shiftId The active shift ID
 * @param {string} userEmail Email of the user performing deletion
 * @param {string} reason Reason for deletion
 * @returns {Promise<void>}
 */
export const deleteOrder = async (orderId, orderNumber, shiftId, userEmail, reason) => {
    const batch = writeBatch(db);

    // 1. Mark order as deleted
    batch.update(doc(db, 'orders', orderId), {
        isDeleted: true,
        deletedBy: userEmail,
        deleteReason: reason,
        deletedAt: serverTimestamp()
    });

    // 2. Cascade: soft-delete all linked transactions
    const txSnap = await getDocs(query(
        collection(db, 'transactions'),
        where('orderNumber', '==', orderNumber),
        where('shiftId', '==', shiftId)
    ));

    txSnap.forEach(d => {
        const txData = d.data();
        batch.update(d.ref, {
            isDeleted: true,
            deletedBy: userEmail,
            deleteReason: reason,
            deletedAt: serverTimestamp()
        });

        // REVERT INVENTORY
        const revertStock = (svcId, q) => {
            if (!svcId) return;
            const ref = doc(db, 'services', svcId);
            batch.update(ref, { stockCount: increment(q) });
        };

        // 1. Revert main item
        if (txData.serviceId) {
            revertStock(txData.serviceId, Number(txData.quantity));
        }

        // 2. Revert snapshotted consumables
        if (txData.consumables && txData.consumables.length > 0) {
            txData.consumables.forEach(c => {
                revertStock(c.itemId, Number(c.qty) * Number(txData.quantity));
            });
        }
    });

    await batch.commit();
};

/**
 * Restores a soft-deleted order and its linked transactions.
 * Deducts inventory again as if the order was just made.
 */
export const restoreOrder = async (orderId, orderNumber, userEmail, reason) => {
    const batch = writeBatch(db);

    // 1. Mark order as restored
    batch.update(doc(db, 'orders', orderId), {
        isDeleted: false,
        status: deleteField(), // Fallback to paymentMethod based display
        voidReason: deleteField(),
        voidedAt: deleteField(),
        restoredAt: serverTimestamp(),
        restoreReason: reason,
        restoredBy: userEmail
    });

    // 2. Restore all linked transactions
    const q = query(
        collection(db, 'transactions'),
        where('orderNumber', '==', orderNumber),
        where('isDeleted', '==', true)
    );
    const txSnap = await getDocs(q);

    txSnap.forEach(d => {
        const txData = d.data();
        
        // Skip transactions that were replaced by an edit
        if (txData.replacedByEdit) return;

        batch.update(d.ref, {
            isDeleted: false,
            restoredAt: serverTimestamp(),
            restoreReason: reason,
            restoredBy: userEmail
        });

        // DEDUCT INVENTORY (Re-apply the impact of the order)
        const deductStock = (svcId, q) => {
            if (!svcId) return;
            const ref = doc(db, 'services', svcId);
            batch.update(ref, { stockCount: increment(-q) });
        };

        // 1. Deduct main item
        if (txData.serviceId) {
            deductStock(txData.serviceId, Number(txData.quantity));
        }

        // 2. Deduct snapshotted consumables
        if (txData.consumables && txData.consumables.length > 0) {
            txData.consumables.forEach(c => {
                deductStock(c.itemId, Number(c.qty) * Number(txData.quantity));
            });
        }
    });

    await batch.commit();
};

/**
 * Fetches live (non-deleted) transactions for an order and maps them to the
 * items format used by the print/invoice layer.
 * Returns null if no transactions exist (caller should fall back to order.items).
 */
export const fetchLiveItemsForOrder = async (orderNumber) => {
    if (!orderNumber) return null;
    const snap = await getDocs(query(
        collection(db, 'transactions'),
        where('orderNumber', '==', orderNumber),
        where('isDeleted', '!=', true)
    ));
    if (snap.empty) return null;
    return snap.docs.map(d => {
        const t = d.data();
        const rawQty = t.quantity ?? t.qty ?? 1;
        const qty = isNaN(Number(rawQty)) ? 1 : Number(rawQty);
        const price = Number(t.price) || 0;
        return {
            name: t.item || t.name || t.serviceName || 'Item',
            quantity: qty,
            price,
            subtotal: qty * price,
            total: qty * price,
            note: t.notes || t.note || '',
            unit: t.unit || 'pc',
            description: t.description || '',
        };
    });
};
