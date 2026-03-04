// src/hooks/useShiftOptions.js
// Real-time list of shifts for filter dropdowns.
// Returns shifts with their human-readable displayId (SHIFT-XXXXXX) and staff name.
// Shared by: Transactions filter, admin shift pickers.

import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @param {string} [startDate]        - YYYY-MM-DD to filter shifts from (optional)
 * @param {string} [endDate]          - YYYY-MM-DD to filter shifts to (optional)
 * @param {object} [emailToName={}]   - Map of email → staff name for display labels
 *
 * Returns:
 *   shiftOptions  - Array of { id, displayId, staffEmail, staffName, shiftPeriod, date, label }
 *   loading       - true while first snapshot hasn't arrived
 */
export function useShiftOptions({ startDate, endDate, emailToName = {} } = {}) {
  const [rawShifts, setRawShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let constraints = [orderBy('startTime', 'desc')];

    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      constraints = [where('startTime', '>=', s), ...constraints];
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      constraints = [where('startTime', '<=', e), ...constraints];
    }

    const q = query(collection(db, 'shifts'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setRawShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const shiftOptions = useMemo(() =>
    rawShifts.map((v) => {
      const staffName = emailToName[v.staffEmail] || v.staffEmail || 'Unknown';
      const date = v.startTime?.seconds
        ? new Date(v.startTime.seconds * 1000).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
          })
        : '';
      const displayId = v.displayId || v.id.slice(-8).toUpperCase();
      return {
        id: v.id,
        displayId,
        staffEmail: v.staffEmail || '',
        staffName,
        shiftPeriod: v.shiftPeriod || '',
        date,
        label: [displayId, v.shiftPeriod, staffName, date].filter(Boolean).join(' · '),
      };
    }),
    // rebuild when the name map changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawShifts, JSON.stringify(emailToName)]
  );

  return { shiftOptions, loading };
}
