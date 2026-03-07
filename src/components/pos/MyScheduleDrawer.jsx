// src/components/pos/MyScheduleDrawer.jsx
// Read-only view of the current staff's upcoming schedule (next 14 days).

import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Chip, CircularProgress, Stack,
} from '@mui/material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { fmtDate as sharedFmtDate } from '../../utils/formatters';
import DetailDrawer from '../common/DetailDrawer';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

function todayPHT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function fmtDate(dateStr) {
  return sharedFmtDate(dateStr + 'T00:00:00');
}

const STATUS_CFG = {
  scheduled: { label: 'Scheduled', color: 'primary' },
  'in-progress': { label: 'On Shift', color: 'success' },
  completed: { label: 'Done', color: 'default' },
  absent: { label: 'Absent', color: 'error' },
  covered: { label: 'Covered', color: 'warning' },
};

export default function MyScheduleDrawer({ open, onClose, userEmail }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userEmail) return;
    setLoading(true);
    (async () => {
      try {
        const today = todayPHT();
        const limit = addDays(today, 14);

        // Query own entries (single-field query, filter date in JS)
        const snap = await getDocs(query(
          collection(db, 'schedules'),
          where('staffEmail', '==', userEmail),
        ));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => e.date >= today && e.date <= limit)
          .sort((a, b) => a.date.localeCompare(b.date));
        setEntries(list);
      } catch (err) {
        console.error('MySchedule fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userEmail]);

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="My Schedule"
      subtitle="Upcoming 14 days"
      width={380}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : entries.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CalendarTodayIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
          <Typography color="text.secondary">No upcoming schedule found.</Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {entries.map(entry => {
            const cfg = STATUS_CFG[entry.status] || STATUS_CFG.scheduled;
            return (
              <Box
                key={entry.id}
                sx={{
                  p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider',
                  bgcolor: 'action.hover',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>{fmtDate(entry.date)}</Typography>
                  <Chip label={cfg.label} color={cfg.color} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                </Stack>
                <Typography variant="body2">{entry.shiftLabel} Shift</Typography>
                {entry.startTime && (
                  <Typography variant="caption" color="text.secondary">
                    {entry.startTime} – {entry.endTime}
                  </Typography>
                )}
                {entry.coveredByName && entry.status === 'covered' && (
                  <Typography variant="caption" color="warning.main" display="block">
                    Covered by {entry.coveredByName}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </DetailDrawer>
  );
}
