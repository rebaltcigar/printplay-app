// src/hooks/useStaffList.js
// Single Firestore subscription for the users/staff list.
// Identical onSnapshot(collection(db, 'users')) was duplicated in 6 components:
//   Transactions, Shifts, ShiftDetailView, POS, ExpenseManagement, OrderManagement
//
// Returns:
//   staffOptions - [{ id, email, fullName }] sorted alphabetically by fullName
//   userMap      - { [email]: fullName } lookup map (for display-only use)
//   loading      - true while the first snapshot hasn't arrived

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useStaffList() {
    const [staffOptions, setStaffOptions] = useState([]);
    const [userMap, setUserMap] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
            const map = {};
            const opts = [];

            snap.forEach((d) => {
                const v = d.data() || {};
                if (!v.email) return;
                const fullName = v.fullName || v.name || v.displayName || v.email;
                map[v.email] = fullName;
                opts.push({
                    id: d.id,
                    uid: d.id,
                    email: v.email,
                    fullName,
                    role: v.role || 'staff',
                });
            });

            opts.sort((a, b) =>
                (a.fullName || '').localeCompare(b.fullName || '', 'en', { sensitivity: 'base' })
            );

            setUserMap(map);
            setStaffOptions(opts);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    return { staffOptions, userMap, loading };
}
