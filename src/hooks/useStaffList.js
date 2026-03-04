// src/hooks/useStaffList.js
// Single Firestore subscription for the users/staff list.
// Identical onSnapshot(collection(db, 'users')) was duplicated in 6 components:
//   Transactions, Shifts, ShiftDetailView, POS, ExpenseManagement, OrderManagement
//
// Returns:
//   staffOptions - [{ id, email, fullName }] sorted alphabetically by fullName
//   userMap      - { [email]: fullName } lookup map (alias for emailToName, kept for back-compat)
//   emailToName  - { [email]: fullName } lookup map (canonical name)
//   idToName     - { [uid]: fullName } lookup by Firestore doc id
//   loading      - true while the first snapshot hasn't arrived

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useStaffList() {
    const [staffOptions, setStaffOptions] = useState([]);
    const [emailToName, setEmailToName] = useState({});
    const [idToName, setIdToName] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
            const byEmail = {};
            const byId = {};
            const opts = [];

            snap.forEach((d) => {
                const v = d.data() || {};
                if (!v.email) return;
                const fullName = v.fullName || v.name || v.displayName || v.email;
                byEmail[v.email] = fullName;
                byId[d.id] = fullName;
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

            setEmailToName(byEmail);
            setIdToName(byId);
            setStaffOptions(opts);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    // userMap kept as alias for back-compat
    return { staffOptions, userMap: emailToName, emailToName, idToName, loading };
}
