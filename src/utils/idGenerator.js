import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Generates a sequential ID (e.g., "SHIFT-000005").
 * Uses a 'counters' collection in Firestore to maintain atomicity.
 * 
 * @param {string} counterName The name of the counter doc (e.g. 'shifts', 'payroll', 'expenses')
 * @param {string} prefix The prefix for the ID (e.g. 'SHIFT', 'PAY', 'EXP')
 * @param {number} padding Number of digits (default 6)
 * @returns {Promise<string>} The formatted ID
 */
export const generateDisplayId = async (counterName, prefix = "ID", padding = 6) => {
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
        // Fallback: use timestamp if transaction fails (rare, but prevents app crash)
        return `${prefix}-${Date.now().toString().slice(-padding)}`;
    }
};

/**
 * Reserves a block of IDs for batch processing.
 * Much more efficient for migration scripts.
 * 
 * @param {string} counterName 
 * @param {string} prefix 
 * @param {number} count Number of IDs to reserve
 * @param {number} padding 
 * @returns {Promise<string[]>} Array of generated IDs
 */
export const generateBatchIds = async (counterName, prefix, count, padding = 6) => {
    if (count <= 0) return [];

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
            // Return the *first* new ID in this batch
            // e.g. current=5. count=3. new=8. IDs are 6, 7, 8.
            // We return currentSequence + 1.
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
