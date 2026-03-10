// src/hooks/useServiceList.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

export function useServiceList() {
    const [allServices, setAllServices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchServices = async () => {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('sort_order', { ascending: true });

            if (data) {
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
            if (error) console.error("Error fetching services:", error);
            setLoading(false);
        };

        fetchServices();

        const channel = supabase.channel('public:products:useServiceList')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchServices)
            .subscribe();

        return () => supabase.removeChannel(channel);
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
