// src/hooks/useCustomers.js
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Real-time hook for fetching the normalized customer database.
 * Orders by fullName natively relying on the newly deployed composite index.
 */
export function useCustomers() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        // Sort ascending by fullName for the DataGrid and Autocomplete
        const q = query(
            collection(db, 'customers'),
            orderBy('fullName', 'asc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Filter out deleted on the client or server, standard is usually client if we don't have a composite index filtering it.
            // Since we don't have a composite index for isDeleted yet, we filter client side.
            const activeDocs = docs.filter(d => d.isDeleted !== true);
            setCustomers(activeDocs);
            setLoading(false);
        }, (err) => {
            console.error('useCustomers error:', err);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    return { customers, loading };
}
