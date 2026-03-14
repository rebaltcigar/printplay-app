import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import { getRange } from '../services/analyticsService';
import debounce from 'lodash.debounce';
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
                const { data, error } = await supabase.rpc('get_analytics_data', {
                    p_start_time: startTs,
                    p_end_time: endTs
                });

                if (error) throw error;
                if (!data || data.length === 0) {
                  setTransactions([]);
                  setShifts([]);
                  setInvoices([]);
                  setLoading(false);
                  return;
                }

                const res = data[0]; // Returns a single row with JSON columns

                if (res.earliest_date) {
                    setAllTimeStart(new Date(res.earliest_date));
                }

                setTransactions(res.transactions || []);
                setShifts(res.shifts || []);
                setInvoices(res.invoices || []);
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

        const debouncedFetch = debounce(fetchAnalyticsData, 1500, { leading: true, trailing: true });

        // Subscribe to changes and simply re-fetch the range to ensure data consistency
        const channel = supabase.channel(`analytics_changes_${preset}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, debouncedFetch)
            .subscribe();

        return () => {
            debouncedFetch.cancel();
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
