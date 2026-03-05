// src/components/ClockInDashboard.jsx
// Minimal screen for non-cashier staff who clock in to an existing shift.
// No POS access — just clock out, schedule, and paystubs.

import React, { useState, useEffect } from 'react';
import {
  Box, Card, Typography, Stack, Button, Divider,
  CircularProgress,
} from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import MyScheduleDrawer from './pos/MyScheduleDrawer';
import MyPaystubsDrawer from './pos/MyPaystubsDrawer';
import AccessTimeIcon  from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ReceiptLongIcon  from '@mui/icons-material/ReceiptLong';
import LogoutIcon       from '@mui/icons-material/Logout';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function ClockInDashboard({ user, clockInLogId, onClockOut }) {
  const [profile,     setProfile]     = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [clockInTime] = useState(() => new Date());
  const [scheduleOpen,  setScheduleOpen]  = useState(false);
  const [paystubsOpen,  setPaystubsOpen]  = useState(false);
  const [clockingOut,   setClockingOut]   = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setProfile(snap.data());

        const statusSnap = await getDoc(doc(db, 'app_status', 'current_shift'));
        if (statusSnap.exists()) {
          const lock = statusSnap.data();
          const shiftSnap = await getDoc(doc(db, 'shifts', lock.activeShiftId));
          if (shiftSnap.exists()) {
            // Try to get cashier display name
            let cashierName = lock.staffEmail;
            try {
              const cashierUserSnap = await getDoc(doc(db, 'users', shiftSnap.data().staffUid || ''));
              if (cashierUserSnap.exists()) {
                const d = cashierUserSnap.data();
                cashierName = d.fullName || d.name || lock.staffEmail;
              }
            } catch {}
            setActiveShift({ ...shiftSnap.data(), cashierName });
          }
        }
      } catch (err) { console.error('ClockInDashboard init:', err); }
    })();
  }, [user?.uid]);

  const handleClockOut = async () => {
    setClockingOut(true);
    try { await onClockOut(); }
    catch { setClockingOut(false); }
  };

  const name      = profile?.fullName || profile?.name || user?.email || '';
  const firstName = name.split(' ')[0] || name;

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: 'background.default',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      p: 2,
    }}>
      <Card sx={{
        width: 400, maxWidth: '92vw',
        p: 3.5,
        border: '1px solid', borderColor: 'divider',
        borderRadius: 2,
      }}>
        {/* Greeting + clock-in time */}
        <Typography variant="h5" fontWeight={700}>
          {getGreeting()}, {firstName}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.5, mb: 3 }}>
          <AccessTimeIcon sx={{ fontSize: 14, color: 'success.main' }} />
          <Typography variant="caption" color="success.main" fontWeight={600}>
            Clocked in · {fmtTime(clockInTime)}
          </Typography>
        </Stack>

        {/* Active shift info */}
        {activeShift ? (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Active Shift
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {activeShift.shiftPeriod} Shift
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Cashier: {activeShift.cashierName}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }}>
            <CircularProgress size={14} sx={{ mr: 1 }} />
            <Typography variant="caption" color="text.secondary">Loading shift info…</Typography>
          </Box>
        )}

        <Divider sx={{ mb: 2.5 }} />

        {/* Self-service actions */}
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Button
            fullWidth variant="outlined"
            startIcon={<CalendarMonthIcon />}
            onClick={() => setScheduleOpen(true)}
          >
            My Schedule
          </Button>
          <Button
            fullWidth variant="outlined"
            startIcon={<ReceiptLongIcon />}
            onClick={() => setPaystubsOpen(true)}
          >
            My Paystubs
          </Button>
        </Stack>

        {/* Clock out */}
        <Button
          fullWidth variant="contained"
          color="error"
          startIcon={clockingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutIcon />}
          onClick={handleClockOut}
          disabled={clockingOut}
          sx={{ height: 44 }}
        >
          {clockingOut ? 'Clocking Out…' : 'Clock Out'}
        </Button>
      </Card>

      <MyScheduleDrawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        userEmail={user?.email}
      />
      <MyPaystubsDrawer
        open={paystubsOpen}
        onClose={() => setPaystubsOpen(false)}
        userEmail={user?.email}
      />
    </Box>
  );
}
