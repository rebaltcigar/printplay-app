import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { getRange } from '../utils/analytics';

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

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Computed Range ---
    const r = useMemo(() => {
        // Pass any custom month/year overrides if we add them later
        return getRange(preset, null, null);
    }, [preset]);

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

        // --- FETCHERS ---
        let unsubTx = () => { };
        let unsubShifts = () => { };

        const fetchData = async () => {
            try {
                if (isHistorical) {
                    console.log(`[Analytics] Performing ONE-TIME fetch for ${preset}...`);
                    const [txSnap, shiftSnap] = await Promise.all([
                        getDocs(txQuery),
                        getDocs(shiftQuery)
                    ]);

                    setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setShifts(shiftSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
                        setLoading(false); // Assume done when both connect, simple approx
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
            unsubTx();
            unsubShifts();
        };

    }, [r.startUtc, r.endUtc, preset]); // Re-run when range changes

    // Memoize the value to prevent unnecessary re-renders of consumers
    const value = useMemo(() => ({
        preset, setPreset,
        range: r,
        transactions,
        shifts,
        services,
        loading,
        error
    }), [preset, r, transactions, shifts, services, loading, error]);

    return (
        <AnalyticsContext.Provider value={value}>
            {children}
        </AnalyticsContext.Provider>
    );
}
