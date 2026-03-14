// src/services/shiftService.js
import {
    db
} from "../firebase";
import {
    collection,
    addDoc,
    doc,
    deleteDoc,
    updateDoc,
    setDoc,
    serverTimestamp,
    writeBatch,
    getDocs,
    query,
    where,
    Timestamp,
    increment
} from "firebase/firestore";
import { generateDisplayId } from "./orderService";
import { sumDenominations } from "../utils/shiftFinancials";

/**
 * Calculates on-hand cash from denominations.
 * Returns null if no denominations are provided.
 */
export const calculateOnHand = (denoms) => {
    if (!denoms || typeof denoms !== 'object') return null;
    if (Object.keys(denoms).length === 0) return null;
    try {
        return sumDenominations(denoms);
    } catch (e) {
        return null;
    }
};

/**
 * Returns { startStr, endStr } for the current month as "YYYY-MM-DD".
 */
export const getThisMonthDefaults = () => {
    const now = new Date();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().slice(0, 10);
    const endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().slice(0, 10);
    return { startStr, endStr };
};

/**
 * Converts Firestore Timestamp / Date → "YYYY-MM-DDTHH:MM" for datetime-local inputs.
 */
export const toLocalInput = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate()
        : ts?.seconds ? new Date(ts.seconds * 1000)
            : ts instanceof Date ? ts : null;
    if (!d || isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Converts "YYYY-MM-DDTHH:MM" string → Firestore Timestamp.
 */
export const toTimestamp = (str) => {
    if (!str) return null;
    return Timestamp.fromDate(new Date(str));
};

/**
 * Sets the active shift in app_status.
 */
export const resumeShift = async (shiftId, staffEmail) => {
    await setDoc(
        doc(db, "app_status", "current_shift"),
        {
            activeShiftId: shiftId,
            staffEmail,
            resumedAt: serverTimestamp(),
        },
        { merge: true }
    );
};

/**
 * Creates a new shift document.
 */
export const createShift = async (payload) => {
    const displayId = await generateDisplayId("shifts", "SHIFT");
    const fullPayload = {
        displayId,
        pcRentalTotal: 0,
        systemTotal: 0,
        ...payload,
        startTime: toTimestamp(payload.startTime),
        endTime: toTimestamp(payload.endTime),
    };
    const docRef = await addDoc(collection(db, "shifts"), fullPayload);
    return { id: docRef.id, ...fullPayload };
};

/**
 * Updates an existing shift.
 */
export const updateShift = async (shiftId, payload) => {
    const finalPayload = { ...payload };
    if (payload.startTime) finalPayload.startTime = toTimestamp(payload.startTime);
    if (payload.endTime) finalPayload.endTime = toTimestamp(payload.endTime);

    await updateDoc(doc(db, "shifts", shiftId), finalPayload);
};

/**
 * Deletes a shift and either unlinks or purges its transactions.
 * Optionally deletes associated orders (hard-delete) and reverts inventory.
 */
export const deleteShift = async (shiftId, mode = "unlink", deleteOrders = false) => {
    const txSnap = await getDocs(query(collection(db, "transactions"), where("shiftId", "==", shiftId)));
    const txDocs = txSnap.docs;

    let orderDocs = [];
    let activeOrderNumbers = new Set();

    if (deleteOrders) {
        const orderSnap = await getDocs(query(collection(db, "orders"), where("shiftId", "==", shiftId)));
        orderDocs = orderSnap.docs;
        // Collect order numbers of active (non-deleted) orders to revert inventory correctly
        orderDocs.forEach(d => {
            const data = d.data();
            if (!data.isDeleted) activeOrderNumbers.add(data.orderNumber);
        });
    }

    // Helper to chunk array for batches
    const chunk = (arr, size = 500) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
    };

    // Combine transactions and orders for batch deletion if applicable
    const allDocsToDelete = [...txDocs, ...orderDocs];
    const chunksArr = chunk(allDocsToDelete);

    for (const ck of chunksArr) {
        const batch = writeBatch(db);
        ck.forEach((d) => {
            const isTransaction = d.ref.path.startsWith('transactions/');
            const isOrder = d.ref.path.startsWith('orders/');

            if (isTransaction) {
                if (mode === "unlink") {
                    batch.update(d.ref, { shiftId: null, unlinkedFromShift: shiftId });
                } else if (mode === "purge") {
                    const txData = d.data();
                    
                    // If we are also deleting orders, revert inventory for transactions 
                    // that belong to an order that was NOT already soft-deleted.
                    if (deleteOrders && activeOrderNumbers.has(txData.orderNumber)) {
                        const revertStock = (svcId, q) => {
                            if (!svcId) return;
                            batch.update(doc(db, 'services', svcId), { stockCount: increment(q) });
                        };

                        if (txData.serviceId) revertStock(txData.serviceId, Number(txData.quantity));
                        if (txData.consumables && txData.consumables.length > 0) {
                            txData.consumables.forEach(c => {
                                revertStock(c.itemId, Number(c.qty) * Number(txData.quantity));
                            });
                        }
                    }
                    batch.delete(d.ref);
                }
            } else if (isOrder && deleteOrders) {
                batch.delete(d.ref);
            }
        });
        await batch.commit();
    }

    await deleteDoc(doc(db, "shifts", shiftId));
};
