// src/hooks/usePOSServices.js
// Delegates to useServiceList for shared module-level cache + realtime.
// This prevents a duplicate products fetch when both POS and admin contexts are active.
import { useMemo } from 'react';
import { useServiceList } from './useServiceList';

export function usePOSServices() {
    const { allServices, loading } = useServiceList();

    // Expense parent ID — used to exclude expense items from all POS lists
    const expenseParentId = useMemo(() => {
        const expenseParent = allServices.find(i => i.serviceName === 'Expenses');
        return expenseParent?.id ?? null;
    }, [allServices]);

    // --- v0.2.0: allServicesWithAliases ---
    // Expose POS-specific camelCase aliases for fields useServiceList spreads as snake_case.
    // We do this first so derived lists (posItems, serviceList) benefit from aliases.
    const allServicesWithAliases = useMemo(() =>
        allServices.map(s => ({
            ...s,
            hasVariants: s.has_variants ?? s.hasVariants,
            priceType: s.price_type ?? s.priceType,
            pricingNote: s.pricing_note ?? s.pricingNote,
            trackStock: s.track_stock ?? s.trackStock,
            stockCount: s.stock_count ?? s.stockCount,
            lowStockThreshold: s.low_stock_threshold ?? s.lowStockThreshold,
        })),
        [allServices]
    );

    // --- Legacy: serviceList ---
    const serviceList = useMemo(() => {
        let list = allServicesWithAliases.filter(
            (i) =>
                i.active &&
                i.financialCategory !== 'Expense' &&
                !i._isExpense &&
                (expenseParentId ? (i.id !== expenseParentId && i.parentServiceId !== expenseParentId) : true) &&
                !i.adminOnly
        );

        // PC Rental must always be available
        if (!list.find((s) => s.serviceName === 'PC Rental')) {
            list.push({ id: 'pcrental_hc', serviceName: 'PC Rental', price: 0, active: true });
        }

        list.sort((a, b) => {
            if (a.serviceName === 'PC Rental') return -1;
            if (b.serviceName === 'PC Rental') return 1;
            return 0;
        });

        return list;
    }, [allServicesWithAliases, expenseParentId]);

    // --- Legacy: expenseTypes ---
    const expenseTypes = useMemo(() =>
        allServicesWithAliases.filter(
            (i) => {
                const isExpense = i._isExpense || (expenseParentId && i.parentServiceId === expenseParentId);
                return isExpense && i.active !== false && !i.adminOnly;
            }
        ),
        [allServicesWithAliases, expenseParentId]
    );

    // --- Legacy: categories ---
    const categories = useMemo(() =>
        [...new Set(serviceList.map((s) => s.category).filter(Boolean))].sort(),
        [serviceList]
    );

    // --- v0.2.0: posItems ---
    const posItems = useMemo(() =>
        allServicesWithAliases.filter(i =>
            i.active &&
            i.financialCategory !== 'Expense' &&
            !i._isExpense &&
            (expenseParentId ? (i.id !== expenseParentId && i.parentServiceId !== expenseParentId) : true) &&
            !i.parentServiceId &&
            !i.adminOnly
        ),
        [allServicesWithAliases, expenseParentId]
    );

    // --- v0.2.0: variantMap ---
    const variantMap = useMemo(() => {
        const map = new Map();
        allServicesWithAliases
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
    }, [allServicesWithAliases, expenseParentId]);

    return {
        serviceList,
        expenseTypes,
        categories,
        allServices: allServicesWithAliases,
        loading,
        posItems,
        variantMap,
    };
}
