import { useState, useEffect } from 'react';

/**
 * Hook to manage the shift timer and alert states.
 * 
 * @param {Date|null} shiftStartTime The start time of the shift
 * @param {Object} systemSettings App settings for duration and alerts
 * @returns {Object} Timer state and derived metrics
 */
export const useShiftTimer = (shiftStartTime, systemSettings = {}) => {
    const [shiftStart] = useState(shiftStartTime || null);
    const [elapsed, setElapsed] = useState('00:00:00');
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        if (!shiftStartTime) return;

        const initialDiff = Date.now() - shiftStartTime.getTime();
        setElapsedMs(initialDiff);

        const pad = n => String(n).padStart(2, '0');
        const update = () => {
            const now = Date.now();
            const diffMs = now - shiftStartTime.getTime();
            setElapsedMs(diffMs);

            const h = Math.floor(diffMs / 3600000);
            const m = Math.floor((diffMs % 3600000) / 60000);
            const s = Math.floor((diffMs % 60000) / 1000);
            setElapsed(`${pad(h)}:${pad(m)}:${pad(s)}`);
        };

        update(); // Run immediately
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [shiftStartTime]);

    // Derived: Alert States
    const shiftDurationMs = (systemSettings.shiftDurationHours || 12) * 3600000;
    const alertThresholdMs = (systemSettings.shiftAlertMinutes || 30) * 60000;

    const shiftAlertState = elapsedMs === 0 ? 'normal'
        : elapsedMs >= shiftDurationMs ? 'danger'
            : elapsedMs >= shiftDurationMs - alertThresholdMs ? 'warning'
                : 'normal';

    const minsRemaining = Math.ceil((shiftDurationMs - elapsedMs) / 60000);

    return {
        shiftStart,
        elapsed,
        elapsedMs,
        shiftAlertState,
        minsRemaining
    };
};
