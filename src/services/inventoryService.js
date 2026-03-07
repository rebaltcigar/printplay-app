import { db } from "../firebase";
import {
    collection, addDoc, updateDoc, doc, serverTimestamp,
    writeBatch, increment, query, where, orderBy, limit, getDocs
} from "firebase/firestore";
import { generateDisplayId } from "./orderService";

/**
 * Records a stock adjustment (Damage, Loss, Correction, etc.)
 * Updates the item's stockCount and creates an audit entry in inventory_logs.
 */
export const recordStockAdjustment = async ({ itemId, itemName, qtyChange, type, reason, staffEmail }) => {
    const batch = writeBatch(db);
    const itemRef = doc(db, 'services', itemId);
    const logRef = doc(collection(db, 'inventory_logs'));

    // 1. Update stock count
    batch.update(itemRef, {
        stockCount: increment(qtyChange),
        lastModified: serverTimestamp()
    });

    // 2. Create log entry
    batch.set(logRef, {
        itemId,
        itemName,
        qtyChange,
        type, // 'Adjustment', 'Damage', 'Loss', 'Correction', 'Sale'
        reason,
        staffEmail,
        timestamp: serverTimestamp()
    });

    await batch.commit();
};

/**
 * Handles restocking of an item.
 * Calculates Weighted Average Cost (WAC), updates item, and creates audit log.
 * Also creates an 'InventoryAsset' transaction for financial tracking.
 */
export const restockItem = async ({ item, qtyAdded, unitCost, totalCost, staffEmail }) => {
    const batch = writeBatch(db);
    const itemRef = doc(db, 'services', item.id);
    const logRef = doc(collection(db, 'inventory_logs'));
    const txRef = doc(collection(db, 'transactions'));

    // 1. Weighted Average Cost Calculation
    const oldQty = Number(item.stockCount || 0);
    const oldCost = Number(item.costPrice || 0);
    const oldTotalValue = oldQty * oldCost;

    const newTotalValue = oldTotalValue + totalCost;
    const newTotalQty = oldQty + qtyAdded;
    const newAverageCost = newTotalQty > 0 ? (newTotalValue / newTotalQty) : unitCost;

    // 2. Update Item
    batch.update(itemRef, {
        stockCount: newTotalQty,
        costPrice: newAverageCost,
        lastRestocked: serverTimestamp()
    });

    // 3. Create Audit Log
    batch.set(logRef, {
        itemId: item.id,
        itemName: item.serviceName,
        qtyChange: qtyAdded,
        type: 'Restock',
        reason: 'Manual Restock',
        cost: unitCost,
        totalCost: totalCost,
        staffEmail,
        timestamp: serverTimestamp()
    });

    // 4. Create Financial Transaction (Credit/Asset)
    const displayId = await generateDisplayId("expenses", "EXP");
    batch.set(txRef, {
        displayId,
        item: `Restock: ${item.serviceName}`,
        quantity: qtyAdded,
        price: unitCost,
        total: totalCost,
        financialCategory: 'InventoryAsset',
        category: 'Credit',
        timestamp: serverTimestamp(),
        staffEmail,
        notes: `Restocked ${qtyAdded} units. WAC: ${newAverageCost.toFixed(2)}`,
        inventoryItemId: item.id
    });

    await batch.commit();
    return newAverageCost;
};

/**
 * Fetches inventory logs for a specific item or globally.
 */
export const getInventoryLogs = async (itemId = null, maxLogs = 50) => {
    let q = collection(db, 'inventory_logs');

    if (itemId) {
        q = query(q, where('itemId', '==', itemId), orderBy('timestamp', 'desc'), limit(maxLogs));
    } else {
        q = query(q, orderBy('timestamp', 'desc'), limit(maxLogs));
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
