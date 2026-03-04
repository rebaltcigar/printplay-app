// src/hooks/usePOSServices.js
// Single Firestore subscription for the POS service list.
// Identical logic was duplicated in POS.jsx and OrderManagement.jsx.
//
// Returns:
//   serviceList   - Active, non-expense, non-credit services (for the POS grid/dropdown)
//                   PC Rental is always first if present.
//   expenseTypes  - Active expense sub-services (children of the "Expenses" parent)
//   categories    - Sorted unique category strings from serviceList
//   allServices   - Raw array of all service docs from Firestore
//   loading       - true while the first snapshot hasn't arrived

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function usePOSServices() {
    const [allServices, setAllServices] = useState([]);
    const [serviceList, setServiceList] = useState([]);
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'services'), orderBy('sortOrder'));
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // Find the "Expenses" parent service to identify expense children
            const expenseParent = items.find((i) => i.serviceName === 'Expenses');
            const expenseParentId = expenseParent?.id ?? null;

            // Main POS service list:
            //   - Must be active
            //   - Not an Expense (cost) item
            //   - Not "New Debt" or "Paid Debt" internal items
            //   - Not the Expenses parent itself
            //   - Not a child of the Expenses parent
            //   - Not admin-only
            let list = items.filter(
                (i) =>
                    i.active &&
                    i.category !== 'Expense' &&
                    i.serviceName !== 'New Debt' &&
                    i.serviceName !== 'Paid Debt' &&
                    i.id !== expenseParentId &&
                    i.parentServiceId !== expenseParentId &&
                    i.adminOnly === false
            );

            // PC Rental must always be available (hardcode if missing)
            if (!list.find((s) => s.serviceName === 'PC Rental')) {
                list.push({ id: 'pcrental_hc', serviceName: 'PC Rental', price: 0, active: true });
            }

            // PC Rental always first, then preserve Firestore sortOrder for the rest
            list.sort((a, b) => {
                if (a.serviceName === 'PC Rental') return -1;
                if (b.serviceName === 'PC Rental') return 1;
                return 0;
            });

            // Expense sub-types (non-admin children of the Expenses parent)
            const expTypes = items.filter(
                (i) =>
                    i.parentServiceId === expenseParentId &&
                    i.adminOnly === false
            );

            // Unique sorted categories from the service list
            const cats = [...new Set(list.map((s) => s.category).filter(Boolean))].sort();

            setAllServices(items);
            setServiceList(list);
            setExpenseTypes(expTypes);
            setCategories(cats);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    return { serviceList, expenseTypes, categories, allServices, loading };
}
