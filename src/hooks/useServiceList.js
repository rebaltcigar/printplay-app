// src/hooks/useServiceList.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache = null; // { allServices, setAt }
let _channel = null;
let _channelRefCount = 0;
const _listeners = new Set();

function notifyListeners(data) {
    _listeners.forEach(fn => fn(data));
}

function mapRow(d) {
    return {
        id: d.id,
        ...d,
        serviceName: d.name,
        parentServiceId: d.parent_service_id,
        sortOrder: d.sort_order,
        adminOnly: d.admin_only,
        financialCategory: d.financial_category,
        costPrice: d.cost_price,
    };
}

async function fetchAndCache() {
    const { data, error } = await supabase.rpc('get_pos_catalog');

    if (error) { console.error("Error fetching POS catalog:", error); return; }
    if (!data) return;

    // The RPC might return a single object (JSONB) or an array of rows (RETURNS TABLE)
    // Supabase JS client returns an array for set-returning functions/TABLEs
    const res = Array.isArray(data) ? data[0] : data;
    if (!res) return;

    // We combine products, variants, and expense_types into allServices for backward compatibility
    // We tag items from expense_types so they can be identified even if RPC doesn't return the parent product
    const allRows = [
        ...(res.products || []),
        ...(res.variants || []),
        ...(res.expense_types || []).map(e => ({ ...e, _isExpense: true }))
    ];

    const allServices = allRows.map(mapRow);
    _cache = { allServices, setAt: Date.now() };
    notifyListeners(_cache);
}

function ensureChannel() {
    if (_channel) return;
    _channel = supabase.channel('public:products:useServiceList')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchAndCache())
        .subscribe();
}

function releaseChannel() {
    if (_channelRefCount > 0) return;
    if (_channel) {
        supabase.removeChannel(_channel);
        _channel = null;
    }
}

export function useServiceList() {
    const [allServices, setAllServices] = useState(_cache?.allServices ?? []);
    const [loading, setLoading] = useState(!_cache);

    useEffect(() => {
        const applyCache = (c) => {
            setAllServices(c.allServices);
            setLoading(false);
        };

        _listeners.add(applyCache);
        _channelRefCount++;
        ensureChannel();

        if (_cache && (Date.now() - _cache.setAt) < CACHE_TTL) {
            applyCache(_cache);
        } else {
            fetchAndCache();
        }

        return () => {
            _listeners.delete(applyCache);
            _channelRefCount--;
            releaseChannel();
        };
    }, []);

    // { name, category } for aggregateShiftTransactions (Shifts.jsx)
    const serviceMeta = useMemo(() =>
        allServices
            .map(s => ({ name: s.serviceName || '', category: s.financialCategory || '' }))
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
