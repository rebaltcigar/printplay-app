// src/hooks/usePOSServices.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

export function usePOSServices() {
    const [allServices, setAllServices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchServices = async () => {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('sort_order', { ascending: true });

            if (data) {
                // Map Supabase snake_case back to frontend expected camelCase
                const mapped = data.map(d => ({
                    id: d.id,
                    ...d,
                    serviceName: d.name,
                    parentServiceId: d.parent_service_id,
                    sortOrder: d.sort_order,
                    adminOnly: d.admin_only,
                    financialCategory: d.financial_category,
                    costPrice: d.cost_price
                }));
                setAllServices(mapped);
            }
            if (error) {
                console.error("Error fetching POS services:", error);
            }
            setLoading(false);
        };

        fetchServices();

        const channel = supabase.channel('public:products:usePOSServices')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchServices)
            .subscribe();

        return () => supabase.removeChannel(channel);
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

        // PC Rental always first, then preserve project sortOrder for the rest
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
        serviceList,
        expenseTypes,
        categories,
        allServices,
        loading,
        posItems,
        variantMap,
    };
}
