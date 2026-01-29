// src/components/reports/StaffPerformance.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
} from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getRange, txAmount, fmtPeso } from '../../utils/analytics';

export default function StaffPerformance() {
    const [preset, setPreset] = useState("thisMonth");
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    const r = useMemo(() => getRange(preset, null, null), [preset]);

    useEffect(() => {
        setLoading(true);
        const qTx = query(
            collection(db, "transactions"),
            where("timestamp", ">=", r.startUtc),
            where("timestamp", "<=", r.endUtc)
        );
        const unsub = onSnapshot(qTx, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [r.startUtc, r.endUtc]);

    // --- Metrics ---
    const staffData = useMemo(() => {
        if (loading) return [];
        const map = {};

        transactions.forEach(t => {
            if (t.isDeleted) return;
            const amt = txAmount(t);
            if (amt <= 0) return; // Sales only
            if (t.item === 'Paid Debt') return;

            const staff = t.staffEmail || "Unknown";

            if (!map[staff]) map[staff] = { name: staff, sales: 0, count: 0 };
            map[staff].sales += amt;
            map[staff].count += 1;
        });

        return Object.values(map).sort((a, b) => b.sales - a.sales);
    }, [transactions, loading]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">Staff Performance</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Period</InputLabel>
                    <Select value={preset} label="Period" onChange={(e) => setPreset(e.target.value)}>
                        <MenuItem value="today">Today</MenuItem>
                        <MenuItem value="thisMonth">This Month</MenuItem>
                        <MenuItem value="lastMonth">Last Month</MenuItem>
                        <MenuItem value="thisYear">This Year</MenuItem>
                        <MenuItem value="allTime">All Time</MenuItem>
                    </Select>
                </FormControl>
            </Paper>

            {/* CHART */}
            <Paper sx={{ p: 2, height: 350 }}>
                <Typography variant="subtitle2">Sales Leaders</Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={staffData} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(val) => `₱${val / 1000}k`} />
                        <YAxis type="category" dataKey="name" width={150} style={{ fontSize: '0.8rem' }} />
                        <Tooltip formatter={(val) => fmtPeso(val)} />
                        <Bar dataKey="sales" name="Total Sales" fill="#82ca9d" barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </Paper>

            {/* TABLE */}
            <TableContainer component={Paper} sx={{ flex: 1 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Staff</TableCell>
                            <TableCell align="right">Transactions</TableCell>
                            <TableCell align="right">Total Sales</TableCell>
                            <TableCell align="right">Avg / Tx</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {staffData.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center">No data.</TableCell></TableRow>
                        ) : (
                            staffData.map((row, idx) => (
                                <TableRow key={row.name} hover>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                                    <TableCell align="right">{row.count}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                        {fmtPeso(row.sales)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtPeso(row.count ? row.sales / row.count : 0)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
