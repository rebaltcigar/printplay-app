// src/services/orderService.js
import {
    doc, runTransaction, getDoc, serverTimestamp,
    writeBatch, collection, where, query, getDocs
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
    items, total, paymentMethod, paymentDetails, amountTendered, change, customer, user
) => {
    return {
        items: items.map(i => ({
            itemId: i.id,
            name: i.serviceName || i.name,
            price: i.price,
            costPrice: i.costPrice || 0,
            quantity: i.quantity || 1,
            subtotal: (i.price || 0) * (i.quantity || 1),
        })),
        subtotal: total,
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
