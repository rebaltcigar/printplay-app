import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { getRange, getEarliestDate } from '../services/analyticsService';

const AnalyticsContext = createContext();

export function useAnalytics() {
    return useContext(AnalyticsContext);
}

export function AnalyticsProvider({ children }) {
    // --- Global Controls ---
    const [preset, setPreset] = useState("thisMonth");
    const [customRange, setCustomRange] = useState(null); // { start, end } if needed

    // --- Data State ---
    const [transactions, setTransactions] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [services, setServices] = useState([]);
    const [invoices, setInvoices] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const allTimeStart = useMemo(() => {
        // We find the earliest date once we have some data, 
        // but for initial fetch of 'allTime', we need a reasonable baseline.
        // If we haven't fetched allTime yet, we might not know the REAL start.
        // However, we can use a "metadata" approach if needed.
        // FOR NOW: allow the context to refine the range once data is loaded.
        const earliest = getEarliestDate(transactions, shifts);
        return earliest;
    }, [transactions, shifts]);

    // --- Computed Range ---
    const r = useMemo(() => {
        return getRange(preset, null, allTimeStart);
    }, [preset, allTimeStart]);

    // --- 1. Fetch Services (Static / Rare Update) ---
    useEffect(() => {
        // Services don't change often, so snapshot is fine, or we could fetch once.
        // Let's keep snapshot for now to support dynamic price changes appearing instantly.
        const unsub = onSnapshot(collection(db, "services"), (snap) => {
            setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Services Error:", err));
        return () => unsub();
    }, []);

    // --- 2. Smart Fetching Strategy ---
    useEffect(() => {
        if (!r.startUtc || !r.endUtc) return;

        setLoading(true);
        setError(null);

        // STRATEGY: 
        // If range is "Live" (Today/Yesterday/ThisWeek/ThisMonth) -> USE SNAPSHOT (Realtime)
        // If range is "Historical" (LastMonth/LastYear/AllTime) -> USE GET (One-time fetch)

        const isHistorical = ["lastMonth", "lastYear", "allTime"].includes(preset);

        // --- QUERIES ---
        const txQuery = query(
            collection(db, "transactions"),
            where("timestamp", ">=", Timestamp.fromDate(r.startUtc)),
            where("timestamp", "<=", Timestamp.fromDate(r.endUtc)),
            orderBy("timestamp", "desc") // Default desc for lists
        );

        const shiftQuery = query(
            collection(db, "shifts"),
            where("startTime", ">=", Timestamp.fromDate(r.startUtc)),
            where("startTime", "<=", Timestamp.fromDate(r.endUtc))
        );

        const invoiceQuery = query(
            collection(db, "invoices"),
            where("createdAt", ">=", Timestamp.fromDate(r.startUtc)),
            where("createdAt", "<=", Timestamp.fromDate(r.endUtc))
        );

        // --- FETCHERS ---
        let unsubTx = () => { };
        let unsubShifts = () => { };
        let unsubInvoices = () => { };

        const fetchData = async () => {
            try {
                if (isHistorical) {
                    console.log(`[Analytics] Performing ONE-TIME fetch for ${preset}...`);
                    const [txSnap, shiftSnap, invSnap] = await Promise.all([
                        getDocs(txQuery),
                        getDocs(shiftQuery),
                        getDocs(invoiceQuery)
                    ]);

                    setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setShifts(shiftSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setLoading(false);
                } else {
                    console.log(`[Analytics] Subscribing to REAL-TIME updates for ${preset}...`);
                    // Real-time Listeners
                    unsubTx = onSnapshot(txQuery, (snap) => {
                        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        // We set loading false after first tx load, but wait for shifts too?
                        // Actually, simplified:
                    }, (err) => setError(err));

                    unsubShifts = onSnapshot(shiftQuery, (snap) => {
                        setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }, (err) => setError(err));

                    unsubInvoices = onSnapshot(invoiceQuery, (snap) => {
                        setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        setLoading(false);
                    }, (err) => setError(err));
                }
            } catch (err) {
                console.error("Fetch Error:", err);
                setError(err);
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            try { if (unsubTx) unsubTx(); } catch (e) { console.warn("Firebase unsub err:", e); }
            try { if (unsubShifts) unsubShifts(); } catch (e) { console.warn("Firebase unsub err:", e); }
            try { if (unsubInvoices) unsubInvoices(); } catch (e) { console.warn("Firebase unsub err:", e); }
        };

    }, [r.startUtc, r.endUtc, preset]); // Re-run when range changes

    // Memoize the value to prevent unnecessary re-renders of consumers
    const value = useMemo(() => ({
        preset, setPreset,
        range: r,
        transactions,
        shifts,
        services,
        invoices,
        loading,
        error
    }), [preset, r, transactions, shifts, services, invoices, loading, error]);

    return (
        <AnalyticsContext.Provider value={value}>
            {children}
        </AnalyticsContext.Provider>
    );
}
