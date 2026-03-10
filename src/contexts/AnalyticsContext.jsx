import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import { getRange } from '../services/analyticsService';
import dayjs from 'dayjs';

const AnalyticsContext = createContext();

export function useAnalytics() {
    return useContext(AnalyticsContext);
}

export function AnalyticsProvider({ children }) {
    // --- Global Controls ---
    const [preset, setPreset] = useState("thisMonth");
    const [selectedMonthYear, setSelectedMonthYear] = useState(dayjs());
    const [allTimeStart, setAllTimeStart] = useState(null);

    // --- Data State ---
    const [transactions, setTransactions] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [services, setServices] = useState([]);
    const [invoices, setInvoices] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- 1. Fetch Baseline Earliest Date ONCE ---
    useEffect(() => {
        const fetchEarliest = async () => {
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select('timestamp')
                    .order('timestamp', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (data && data.timestamp) {
                    setAllTimeStart(new Date(data.timestamp));
                } else {
                    setAllTimeStart(new Date("2024-01-01"));
                }
            } catch (err) {
                console.warn("[Analytics] Error fetching earliest date:", err);
                setAllTimeStart(new Date("2024-01-01"));
            }
        };
        fetchEarliest();
    }, []);

    // --- 2. Computed Range (Stable) ---
    const r = useMemo(() => {
        return getRange(preset, selectedMonthYear.toDate(), allTimeStart);
    }, [preset, selectedMonthYear, allTimeStart]);

    // --- 3. Fetch Services (Static / Rare Update) ---
    useEffect(() => {
        const fetchServices = async () => {
            const { data } = await supabase.from('products').select('*');
            if (data) setServices(data);
        };
        fetchServices();

        const channel = supabase.channel('public:products')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchServices)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    // --- 4. Smart Fetching Strategy ---
    useEffect(() => {
        const startTs = r.startUtc?.toISOString();
        const endTs = r.endUtc?.toISOString();
        if (!startTs || !endTs) return;

        setLoading(true);
        setError(null);

        const isHistorical = ["lastMonth", "lastYear", "allTime", "customMonth"].includes(preset);

        const fetchAnalyticsData = async () => {
            try {
                // Fetch transactions (order_items)
                const txPromise = supabase
                    .from('order_items')
                    .select('*')
                    .gte('timestamp', startTs)
                    .lte('timestamp', endTs)
                    .order('timestamp', { ascending: false });

                // Fetch shifts
                const shiftPromise = supabase
                    .from('shifts')
                    .select('*')
                    .gte('start_time', startTs)
                    .lte('start_time', endTs);

                // Fetch invoices
                const invPromise = supabase
                    .from('invoices')
                    .select('*')
                    .gte('created_at', startTs)
                    .lte('created_at', endTs);

                const [txRes, shiftRes, invRes] = await Promise.all([txPromise, shiftPromise, invPromise]);

                if (txRes.error) throw txRes.error;
                if (shiftRes.error) throw shiftRes.error;
                if (invRes.error) throw invRes.error;

                // Map Supabase snake_case back to expected camelCase for Analytics
                const mappedTx = (txRes.data || []).map(t => ({
                    ...t,
                    item: t.name,
                    price: t.price,
                    quantity: t.quantity,
                    total: t.amount,
                    timestamp: t.timestamp,
                    financialCategory: t.financial_category,
                    isDeleted: t.is_deleted,
                    serviceId: t.product_id
                }));

                const mappedShifts = (shiftRes.data || []).map(s => ({
                    ...s,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    pcRentalTotal: s.pc_rental_total
                }));

                const mappedInvoices = (invRes.data || []).map(i => ({
                    ...i,
                    createdAt: i.created_at,
                    invoiceNumber: i.invoice_number,
                    amountPaid: i.amount_paid
                }));

                setTransactions(mappedTx);
                setShifts(mappedShifts);
                setInvoices(mappedInvoices);
                setLoading(false);
            } catch (err) {
                console.error("[Analytics] Fetch Error:", err);
                setError(err);
                setLoading(false);
            }
        };

        fetchAnalyticsData();

        if (isHistorical) {
            console.log(`[Analytics] Performing ONE-TIME fetch for ${preset}...`);
            return;
        }

        console.log(`[Analytics] Subscribing to REAL-TIME updates for ${preset}...`);

        // Subscribe to changes and simply re-fetch the range to ensure data consistency
        const channel = supabase.channel(`analytics_changes_${preset}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchAnalyticsData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchAnalyticsData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchAnalyticsData)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [r.startUtc?.toISOString(), r.endUtc?.toISOString(), preset]);

    const value = useMemo(() => ({
        preset, setPreset,
        selectedMonthYear, setSelectedMonthYear,
        range: r,
        transactions,
        shifts,
        services,
        invoices,
        loading,
        error
    }), [preset, selectedMonthYear, r, transactions, shifts, services, invoices, loading, error]);

    return (
        <AnalyticsContext.Provider value={value}>
            {children}
        </AnalyticsContext.Provider>
    );
}
