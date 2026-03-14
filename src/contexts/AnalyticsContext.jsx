import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, Timestamp, limit } from 'firebase/firestore';
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
                // Check transactions for earliest timestamp
                const qTx = query(collection(db, "transactions"), orderBy("timestamp", "asc"), limit(1));
                const snapTx = await getDocs(qTx);
                if (!snapTx.empty) {
                    const d = snapTx.docs[0].data();
                    const ts = d.timestamp?.seconds ? d.timestamp.seconds * 1000 : d.timestamp;
                    setAllTimeStart(new Date(ts));
                } else {
                    // Fallback to a reasonable product launch date if DB is empty
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
        const unsub = onSnapshot(collection(db, "services"), (snap) => {
            setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Services Error:", err));
        return () => unsub();
    }, []);

    // --- 4. Smart Fetching Strategy ---
    useEffect(() => {
        const startTs = r.startUtc?.getTime();
        const endTs = r.endUtc?.getTime();
        if (!startTs || !endTs) return;

        setLoading(true);
        setError(null);

        const isHistorical = ["lastMonth", "lastYear", "allTime", "customMonth"].includes(preset);

        // --- QUERIES ---
        const txQuery = query(
            collection(db, "transactions"),
            where("timestamp", ">=", Timestamp.fromDate(r.startUtc)),
            where("timestamp", "<=", Timestamp.fromDate(r.endUtc)),
            orderBy("timestamp", "desc")
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
                    
                    // Cleanup existing if any (though effect cleanup handles it, belt & suspenders)
                    if (unsubTx) unsubTx(); 
                    if (unsubShifts) unsubShifts();
                    if (unsubInvoices) unsubInvoices();

                    unsubTx = onSnapshot(txQuery, (snap) => {
                        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
            try { if (unsubTx) unsubTx(); } catch (e) { }
            try { if (unsubShifts) unsubShifts(); } catch (e) { }
            try { if (unsubInvoices) unsubInvoices(); } catch (e) { }
        };

    }, [r.startUtc?.getTime(), r.endUtc?.getTime(), preset]);

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
