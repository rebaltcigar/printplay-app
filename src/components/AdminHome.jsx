import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, Typography, Grid, TextField, Stack, Divider, Paper,
} from '@mui/material';
import { db } from '../firebase';
import {
  collection, onSnapshot, orderBy, query, where, Timestamp,
} from 'firebase/firestore';

// Recharts
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';

/**
 * AdminHome
 * - Month selector (type="month") — default to current month
 * - KPIs: Total Sales, Total Expenses, Projected Profit
 * - Area chart: MTD daily totals (sales vs expenses)
 * - Bar chart: Sales breakdown by service
 * - Average Sales per Shift
 */
export default function AdminHome() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`; // YYYY-MM
  });

  const [shifts, setShifts] = useState([]);

  // Compute [start, end] of selected month
  const { startDate, endDate } = useMemo(() => {
    if (!month) return { startDate: null, endDate: null };
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999); // last day of month
    return { startDate: start, endDate: end };
  }, [month]);

  // Live subscribe to shifts in the month
  useEffect(() => {
    if (!startDate || !endDate) return;
    let qRef = query(
      collection(db, 'shifts'),
      where('startTime', '>=', Timestamp.fromDate(startDate)),
      where('startTime', '<=', Timestamp.fromDate(endDate)),
      orderBy('startTime', 'asc')
    );

    const unsub = onSnapshot(qRef, (snap) => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Error loading monthly shifts:', err);
      setShifts([]);
      if (err?.code === 'failed-precondition') {
        // If Firestore asks for an index, the devtools will show a link.
        // We intentionally avoid alert spam here for admin views.
      }
    });

    return () => unsub();
  }, [startDate, endDate]);

  // Sum helpers with fallbacks for legacy shifts
  const monthlySales = useMemo(() => {
    // prefer shift.totalSales; else sum of salesBreakdown; else 0
    return shifts.reduce((sum, s) => {
      if (typeof s.totalSales === 'number') return sum + s.totalSales;
      const sb = s.salesBreakdown || {};
      const sbSum = Object.values(sb).reduce((a, b) => a + (b || 0), 0);
      return sum + sbSum;
    }, 0);
  }, [shifts]);

  const monthlyExpenses = useMemo(() => {
    // prefer shift.totalExpenses; else sum of creditsBreakdown + Debt fallback; else 0
    return shifts.reduce((sum, s) => {
      if (typeof s.totalExpenses === 'number') return sum + s.totalExpenses;
      const cb = s.creditsBreakdown || {};
      const cbSum = Object.values(cb).reduce((a, b) => a + (b || 0), 0);
      return sum + cbSum;
    }, 0);
  }, [shifts]);

  const projectedProfit = useMemo(() => monthlySales - monthlyExpenses, [monthlySales, monthlyExpenses]);

  const avgSalesPerShift = useMemo(() => {
    if (!shifts.length) return 0;
    return monthlySales / shifts.length;
  }, [monthlySales, shifts.length]);

  // Build daily series for area chart
  const dailySeries = useMemo(() => {
    if (!startDate || !endDate) return [];
    // Create day buckets
    const days = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = cursor.toISOString().slice(0, 10); // YYYY-MM-DD
      days.push({ key, sales: 0, expenses: 0, label: new Date(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }

    const idx = (date) => {
      const key = new Date(date).toISOString().slice(0, 10);
      return days.findIndex(d => d.key === key);
    };

    shifts.forEach(s => {
      const si = s.startTime?.seconds ? new Date(s.startTime.seconds * 1000) : null;
      if (!si) return;
      const i = idx(si);
      if (i < 0) return;

      // Sales
      let sSales = 0;
      if (typeof s.totalSales === 'number') sSales = s.totalSales;
      else {
        const sb = s.salesBreakdown || {};
        sSales = Object.values(sb).reduce((a, b) => a + (b || 0), 0);
      }

      // Expenses
      let sExp = 0;
      if (typeof s.totalExpenses === 'number') sExp = s.totalExpenses;
      else {
        const cb = s.creditsBreakdown || {};
        sExp = Object.values(cb).reduce((a, b) => a + (b || 0), 0);
      }

      days[i].sales += sSales;
      days[i].expenses += sExp;
    });

    // Format label to e.g. "Oct 01"
    return days.map(d => ({
      name: d.label.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
      Sales: Number(d.sales.toFixed(2)),
      Expenses: Number(d.expenses.toFixed(2)),
    }));
  }, [shifts, startDate, endDate]);

  // Build service breakdown (bar chart)
  const serviceTotals = useMemo(() => {
    const map = {};
    shifts.forEach(s => {
      const sb = s.salesBreakdown || {};
      Object.entries(sb).forEach(([svc, amt]) => {
        map[svc] = (map[svc] || 0) + (amt || 0);
      });
    });
    // Return array for recharts
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1]) // sort desc
      .map(([service, total]) => ({ service, total: Number(total.toFixed(2)) }));
  }, [shifts]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header / Controls */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>
          Home Dashboard
        </Typography>
        <TextField
          label="Month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      {/* KPIs */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography variant="overline">Month-to-Date Sales</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>₱{monthlySales.toFixed(2)}</Typography>
            <Typography variant="caption">Across {shifts.length} shift{shifts.length !== 1 ? 's' : ''}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography variant="overline">Month-to-Date Expenses</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>₱{monthlyExpenses.toFixed(2)}</Typography>
            <Typography variant="caption">Includes debts & expense types</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography variant="overline">Projected Profit</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              ₱{projectedProfit.toFixed(2)}
            </Typography>
            <Typography variant="caption">(Sales − Expenses)</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography variant="overline">Average Sales / Shift</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              ₱{avgSalesPerShift.toFixed(2)}
            </Typography>
            <Typography variant="caption">Based on {shifts.length} shift{shifts.length !== 1 ? 's' : ''}</Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Grid item xs={12} md={7} sx={{ height: '100%' }}>
          <Card sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Month-to-Date (Daily)
            </Typography>
            <Box sx={{ flex: 1, minHeight: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopOpacity={0.35} />
                      <stop offset="95%" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopOpacity={0.35} />
                      <stop offset="95%" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Sales" strokeWidth={2} fillOpacity={1} fill="url(#salesFill)" />
                  <Area type="monotone" dataKey="Expenses" strokeWidth={2} fillOpacity={1} fill="url(#expFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} md={5} sx={{ height: '100%' }}>
          <Card sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Sales by Service (Total)
            </Typography>
            <Box sx={{ flex: 1, minHeight: 280 }}>
              {serviceTotals.length === 0 ? (
                <Paper sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                  <Typography variant="body2">No service sales this month.</Typography>
                </Paper>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceTotals} margin={{ top: 10, right: 24, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="service" angle={-25} textAnchor="end" interval={0} height={60} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
