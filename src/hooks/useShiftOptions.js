// src/hooks/useShiftOptions.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { fmtShortDate } from '../utils/formatters';

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
    const fetchShifts = async () => {
      let query = supabase.from('shifts').select('*').order('start_time', { ascending: false });

      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        query = query.gte('start_time', s.toISOString());
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        query = query.lte('start_time', e.toISOString());
      }

      const { data, error } = await query;
      if (data) {
        setRawShifts(data.map(d => ({
          id: d.id,
          startTime: d.start_time,
          staffEmail: d.staff_email,
          shiftPeriod: d.shift_period
        })));
      }
      if (error) console.error("Error fetching shifts:", error);
      setLoading(false);
    };

    fetchShifts();

    const channel = supabase.channel('public:shifts:useShiftOptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchShifts)
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const shiftOptions = useMemo(() =>
    rawShifts.map((v) => {
      const staffName = emailToName[v.staffEmail] || v.staffEmail || 'Unknown';
      const date = v.startTime ? fmtShortDate(v.startTime) : '';
      const displayId = v.id.slice(-8).toUpperCase();
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
