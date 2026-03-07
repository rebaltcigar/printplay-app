// src/hooks/useServiceList.js
// Single Firestore subscription for the services collection.
// Replaces duplicate onSnapshot(collection(db, 'services')) in:
//   Shifts.jsx, ShiftDetailView.jsx, Transactions.jsx
//
// Returns:
//   allServices         - Raw array of all service docs (id + data)
//   serviceMeta         - [{ name, category }] for aggregateShiftTransactions (Shifts.jsx)
//   parentServices      - Parent service objects with id/serviceName/price (ShiftDetailView.jsx)
//   parentServiceNames  - [string] parent names (Transactions.jsx edit dialog)
//   expenseServiceNames - [string] expense sub-service names (ShiftDetailView, Transactions)
//   variantChildren     - All items with a parentServiceId (non-expense). Used by admin dropdowns.
//   loading             - true until first snapshot arrives

import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useServiceList() {
    const [allServices, setAllServices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'services'), orderBy('sortOrder'));
        const unsub = onSnapshot(q, (snap) => {
            setAllServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // { name, category } for aggregateShiftTransactions (Shifts.jsx)
    const serviceMeta = useMemo(() =>
        allServices
            .map(s => ({ name: s.serviceName || '', category: s.category || '' }))
            .filter(s => s.name),
        [allServices]
    );

    // Full parent service objects for ShiftDetailView item dropdown (needs serviceName, price)
    const parentServices = useMemo(() =>
        allServices.filter(s => !s.parentServiceId),
        [allServices]
    );

    // Parent service names + specials for Transactions/admin edit dialog item dropdown
    const parentServiceNames = useMemo(() => {
        const names = parentServices.map(s => s.serviceName).filter(Boolean);
        return Array.from(new Set([...names]));
    }, [allServices]);

    // Expense sub-service name strings for expense type dropdowns
    const expenseServiceNames = useMemo(() => {
        const expensesParent = allServices.find(s => s.serviceName === 'Expenses');
        if (!expensesParent) return [];
        return allServices
            .filter(s => s.parentServiceId === expensesParent.id)
            .map(s => s.serviceName)
            .filter(Boolean);
    }, [allServices]);

    // v0.2.0: all non-expense variant children (have a parentServiceId)
    const variantChildren = useMemo(() => {
        const expensesParent = allServices.find(s => s.serviceName === 'Expenses');
        const expenseParentId = expensesParent?.id ?? null;
        return allServices.filter(s =>
            s.parentServiceId &&
            s.parentServiceId !== expenseParentId
        );
    }, [allServices]);

    return { allServices, serviceMeta, parentServices, parentServiceNames, expenseServiceNames, variantChildren, loading };
}
