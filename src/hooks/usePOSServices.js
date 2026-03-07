// src/hooks/usePOSServices.js
// Single Firestore subscription for the POS service list.
//
// Returns:
//   serviceList      - Legacy flat list for POS.jsx dropdown (until v0.2.1 replaces it).
//                      Active, non-expense, non-credit services. PC Rental always first.
//   expenseTypes     - Active expense sub-services (children of the "Expenses" parent)
//   categories       - Sorted unique category strings from serviceList
//   allServices      - Raw array of all service docs from Firestore
//   loading          - true while the first snapshot hasn't arrived
//
//   posItems         - All active, top-level, non-expense, non-adminOnly items (v0.2.0+).
//                      Includes both service and retail types, both direct items and
//                      variant parents. Used by the POS tile grid (v0.2.1+).
//   variantMap       - Map<parentId, VariantChild[]> sorted by sortOrder (v0.2.0+).
//                      Keys are parentServiceId values; values are the sorted children.

import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function usePOSServices() {
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

    // Expense parent ID — used to exclude expense items from all POS lists
    const expenseParentId = useMemo(() => {
        const expenseParent = allServices.find(i => i.serviceName === 'Expenses');
        return expenseParent?.id ?? null;
    }, [allServices]);

    // --- Legacy: serviceList ---
    // Flat dropdown list used by POS.jsx until the tile grid replaces it in v0.2.1.
    const serviceList = useMemo(() => {
        let list = allServices.filter(
            (i) =>
                i.active &&
                i.category !== 'Expense' &&
                i.id !== expenseParentId &&
                i.parentServiceId !== expenseParentId &&
                i.adminOnly === false
        );

        // PC Rental must always be available
        if (!list.find((s) => s.serviceName === 'PC Rental')) {
            list.push({ id: 'pcrental_hc', serviceName: 'PC Rental', price: 0, active: true });
        }

        // PC Rental always first, then preserve Firestore sortOrder for the rest
        list.sort((a, b) => {
            if (a.serviceName === 'PC Rental') return -1;
            if (b.serviceName === 'PC Rental') return 1;
            return 0;
        });

        return list;
    }, [allServices, expenseParentId]);

    // --- Legacy: expenseTypes ---
    const expenseTypes = useMemo(() =>
        allServices.filter(
            (i) =>
                i.parentServiceId === expenseParentId &&
                i.adminOnly === false
        ),
        [allServices, expenseParentId]
    );

    // --- Legacy: categories ---
    const categories = useMemo(() =>
        [...new Set(serviceList.map((s) => s.category).filter(Boolean))].sort(),
        [serviceList]
    );

    // --- v0.2.0: posItems ---
    // All top-level, active, non-expense, non-adminOnly items for the POS tile grid.
    // Includes variant parents (hasVariants: true) and direct items alike.
    // The POS grid filters by type ('service' vs 'retail') and hasVariants flag to
    // decide which tab to render each item in.
    const posItems = useMemo(() =>
        allServices.filter(i =>
            i.active &&
            i.category !== 'Expense' &&
            i.id !== expenseParentId &&
            i.parentServiceId !== expenseParentId &&
            !i.parentServiceId &&
            i.adminOnly === false
        ),
        [allServices, expenseParentId]
    );

    // --- v0.2.0: variantMap ---
    // Maps each parentServiceId to its sorted array of active variant children.
    // Expense children are excluded. Inactive children are excluded so the picker
    // only shows variants currently available for sale.
    const variantMap = useMemo(() => {
        const map = new Map();
        allServices
            .filter(i =>
                i.parentServiceId &&
                i.active &&
                i.parentServiceId !== expenseParentId
            )
            .forEach(child => {
                if (!map.has(child.parentServiceId)) map.set(child.parentServiceId, []);
                map.get(child.parentServiceId).push(child);
            });
        map.forEach((children, key) => {
            map.set(key, [...children].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
        });
        return map;
    }, [allServices, expenseParentId]);

    return {
        // Legacy outputs — unchanged, backward compatible
        serviceList,
        expenseTypes,
        categories,
        allServices,
        loading,
        // v0.2.0 outputs — used by POS tile grid and variant picker (v0.2.1+)
        posItems,
        variantMap,
    };
}
