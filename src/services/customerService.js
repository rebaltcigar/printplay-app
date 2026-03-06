import { db } from "../firebase";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot
} from "firebase/firestore";

const COLLECTION_NAME = 'customers';

/**
 * Creates a new customer profile.
 */
export const createCustomer = async (customerData) => {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...customerData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false
    });
    return { id: docRef.id, ...customerData };
};

/**
 * Updates an existing customer profile.
 */
export const updateCustomer = async (customerId, customerData) => {
    const ref = doc(db, COLLECTION_NAME, customerId);
    await updateDoc(ref, {
        ...customerData,
        updatedAt: serverTimestamp()
    });
    return { id: customerId, ...customerData };
};

/**
 * Marks a customer as deleted (soft delete).
 */
export const deleteCustomer = async (customerId) => {
    const ref = doc(db, COLLECTION_NAME, customerId);
    await updateDoc(ref, {
        isDeleted: true,
        updatedAt: serverTimestamp()
    });
};
