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
