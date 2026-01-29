// src/components/reports/SalesAnalysis.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    Card,
    CardContent,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Divider
} from '@mui/material';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
    getRange,
    txAmount,
    buildServiceMap,
    fmtPeso
} from '../../utils/analytics';

const COLORS = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6610f2", "#e83e8c", "#17a2b8"];

export default function SalesAnalysis() {
    const [preset, setPreset] = useState("thisMonth");

    const [transactions, setTransactions] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);

    const r = useMemo(() => getRange(preset, null, null), [preset]);
    const serviceMap = useMemo(() => buildServiceMap(services), [services]);

    useEffect(() => {
        const unsubServices = onSnapshot(collection(db, "services"), (snap) => {
            setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        setLoading(true);

        const qTx = query(
            collection(db, "transactions"),
            where("timestamp", ">=", r.startUtc),
            where("timestamp", "<=", r.endUtc)
        );
        const unsubTx = onSnapshot(qTx, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qShifts = query(
            collection(db, "shifts"),
            where("startTime", ">=", r.startUtc),
            where("startTime", "<=", r.endUtc)
        );
        const unsubShifts = onSnapshot(qShifts, (snap) => {
            setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => {
            unsubServices();
            unsubTx();
            unsubShifts();
        };
    }, [r.startUtc, r.endUtc]);

    const { categoryData, itemData, totalSales } = useMemo(() => {
        if (loading) return { categoryData: [], itemData: [], totalSales: 0 };

        const catMap = {};
        const itemMap = {};
        let total = 0;

        // Wrapper to process amounts
        const process = (amt, itemName, catName) => {
            if (amt <= 0) return;
            // Cat
            if (!catMap[catName]) catMap[catName] = 0;
            catMap[catName] += amt;
            // Item
            if (!itemMap[itemName]) itemMap[itemName] = { amount: 0, count: 0 };
            itemMap[itemName].amount += amt;
            itemMap[itemName].count += 1;
            total += amt;
        };

        transactions.forEach(t => {
            if (t.isDeleted || t.item === 'Paid Debt') return;
            const amt = txAmount(t);
            const normItem = (t.item || "").trim().toLowerCase();
            let cat = "Others";

            if (serviceMap.has(normItem)) {
                const svc = serviceMap.get(normItem);
                cat = svc.category || "Service";
            } else if (t.category) {
                cat = t.category;
            } else {
                if (normItem.includes('print')) cat = "Printing";
                else if (normItem.includes('scan') || normItem.includes('lamin')) cat = "Services";
                else cat = "Uncategorized";
            }
            process(amt, t.item || "Unknown", cat.charAt(0).toUpperCase() + cat.slice(1));
        });

        shifts.forEach(s => {
            const val = Number(s.pcRentalTotal || 0);
            if (val > 0) {
                // Upsert to maps manually to avoid double counting if function reused incorrectly
                // But here manual is safer
                const cat = "PC Rental";
                const item = "PC Rental (Time)";
                if (!catMap[cat]) catMap[cat] = 0;
                catMap[cat] += val;

                if (!itemMap[item]) itemMap[item] = { amount: 0, count: 0 };
                itemMap[item].amount += val;
                itemMap[item].count += 1; // 1 shift
                total += val;
            }
        });

        const catList = Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const itemList = Object.entries(itemMap)
            .map(([name, d]) => ({ name, value: d.amount, count: d.count }))
            .sort((a, b) => b.value - a.value);

        return { categoryData: catList, itemData: itemList, totalSales: total };
    }, [transactions, shifts, serviceMap, loading]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* HEADER */}
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">Sales Analysis</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Period</InputLabel>
                    <Select value={preset} label="Period" onChange={(e) => setPreset(e.target.value)}>
                        <MenuItem value="today">Today</MenuItem>
                        <MenuItem value="thisWeek">This Week</MenuItem>
                        <MenuItem value="thisMonth">This Month</MenuItem>
                        <MenuItem value="lastMonth">Last Month</MenuItem>
                        <MenuItem value="thisYear">This Year</MenuItem>
                        <MenuItem value="allTime">All Time</MenuItem>
                    </Select>
                </FormControl>
            </Paper>

            <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

                {/* LEFT COL: TABLE (Takes more width for clean columns) */}
                <Grid item xs={12} md={8} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Box sx={{ p: 2, pb: 1 }}>
                            <Typography variant="h6">Top Selling Items</Typography>
                        </Box>
                        <Divider />
                        <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '10%' }}>Rank</TableCell>
                                        <TableCell sx={{ width: '40%' }}>Item Name</TableCell>
                                        <TableCell align="right" sx={{ width: '15%' }}>Count</TableCell>
                                        <TableCell align="right" sx={{ width: '20%' }}>Amount</TableCell>
                                        <TableCell align="right" sx={{ width: '15%' }}>%</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {itemData.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} align="center">No data.</TableCell></TableRow>
                                    ) : (
                                        itemData.map((row, idx) => (
                                            <TableRow key={row.name} hover>
                                                <TableCell>{idx + 1}</TableCell>
                                                <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                                                <TableCell align="right">{row.count}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmtPeso(row.value)}</TableCell>
                                                <TableCell align="right">
                                                    {totalSales > 0 ? ((row.value / totalSales) * 100).toFixed(1) : 0}%
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* RIGHT COL: KPI + CHART */}
                <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* KPI Card */}
                    <Card>
                        <CardContent sx={{ textAlign: 'center', py: 3 }}>
                            <Typography variant="body2" color="text.secondary">Total Sales</Typography>
                            <Typography variant="h4" fontWeight="bold" color="primary.main">
                                {fmtPeso(totalSales)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{preset}</Typography>
                        </CardContent>
                    </Card>

                    {/* Pie Chart */}
                    <Paper sx={{ p: 2, flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" align="center" gutterBottom>Category Distribution</Typography>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius="70%"
                                    innerRadius="40%"
                                    fill="#8884d8"
                                    dataKey="value"
                                    nameKey="name"
                                    paddingAngle={5}
                                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val) => fmtPeso(val)} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Legend below */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mt: 1 }}>
                            {categoryData.map((entry, index) => (
                                <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 10, height: 10, bgcolor: COLORS[index % COLORS.length], borderRadius: '50%' }} />
                                    <Typography variant="caption" noWrap>{entry.name}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                </Grid>

            </Grid>
        </Box>
    );
}
