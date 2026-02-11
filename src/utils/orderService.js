import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export const generateOrderNumber = async () => {
    const counterRef = doc(db, "counters", "orders");
    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentSequence = 1000;
            if (counterDoc.exists()) {
                const data = counterDoc.data();
                currentSequence = (data.currentSequence || 1000) + 1;
            }
            transaction.set(counterRef, { currentSequence }, { merge: true });
            return currentSequence;
        });
        return `ORD-${String(newId).padStart(6, "0")}`;
    } catch (error) {
        console.error("Error generating order number:", error);
        throw error;
    }
};

export const createOrderObject = (
    items, total, paymentMethod, paymentDetails, amountTendered, change, customer, user
) => {
    return {
        items: items.map(i => ({
            itemId: i.id,
            name: i.serviceName,
            price: i.price,
            costPrice: i.costPrice || 0, // CAPTURE COST PRICE
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
    };
};