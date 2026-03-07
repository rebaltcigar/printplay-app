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
    Timestamp
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
 */
export const deleteShift = async (shiftId, mode = "unlink") => {
    const txSnap = await getDocs(query(collection(db, "transactions"), where("shiftId", "==", shiftId)));
    const txDocs = txSnap.docs;

    // Helper to chunk array for batches
    const chunk = (arr, size = 500) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
    };

    const chunksArr = chunk(txDocs);

    for (const ck of chunksArr) {
        const batch = writeBatch(db);
        if (mode === "unlink") {
            ck.forEach((d) => batch.update(d.ref, { shiftId: null, unlinkedFromShift: shiftId }));
        } else if (mode === "purge") {
            ck.forEach((d) => batch.delete(d.ref));
        }
        await batch.commit();
    }

    await deleteDoc(doc(db, "shifts", shiftId));
};
