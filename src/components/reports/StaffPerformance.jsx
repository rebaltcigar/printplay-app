// src/components/reports/StaffPerformance.jsx
import React, { useMemo } from 'react';
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
    ResponsiveContainer
} from 'recharts';
import { txAmount, fmtPeso } from '../../services/analyticsService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import PageHeader from '../common/PageHeader';

export default function StaffPerformance() {
    const {
        preset, setPreset,
        transactions,
        loading
    } = useAnalytics();

    // --- Metrics Aggregated by Order ---
    const staffData = useMemo(() => {
        if (loading) return [];
        const map = {};

        // To get true Order Count and average order value, we need to bucket by orderNumber
        const orderMap = {}; // staffEmail -> Set(orderNumbers)

        transactions.forEach(t => {
            if (t.isDeleted) return;
            const amt = txAmount(t);
            if (amt <= 0 && t.financialCategory !== 'Revenue') return;
            if (t.item === 'Paid Debt') return;

            const staff = t.staffEmail || "Unknown";
            const orderNum = t.orderNumber;

            if (!map[staff]) {
                map[staff] = { name: staff, sales: 0, txCount: 0, orderCount: 0 };
                orderMap[staff] = new Set();
            }

            map[staff].sales += amt;
            map[staff].txCount += 1;
            if (orderNum) orderMap[staff].add(orderNum);
        });

        // Convert Sets to counts
        Object.keys(map).forEach(staff => {
            map[staff].orderCount = orderMap[staff].size;
        });

        return Object.values(map).sort((a, b) => b.sales - a.sales);
    }, [transactions, loading]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PageHeader
                title="Staff Performance"
                subtitle="Track sales contributions and transaction volume by team member."
                actions={
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Period</InputLabel>
                        <Select value={preset} label="Period" onChange={(e) => setPreset(e.target.value)}>
                            <MenuItem value="today">Today</MenuItem>
                            <MenuItem value="yesterday">Yesterday</MenuItem>
                            <MenuItem value="thisWeek">This Week</MenuItem>
                            <MenuItem value="lastWeek">Last Week</MenuItem>
                            <MenuItem value="thisMonth">This Month</MenuItem>
                            <MenuItem value="lastMonth">Last Month</MenuItem>
                            <MenuItem value="thisYear">This Year</MenuItem>
                            <MenuItem value="lastYear">Last Year</MenuItem>
                            <MenuItem value="allTime">All Time</MenuItem>
                        </Select>
                    </FormControl>
                }
            />

            {/* CHART */}
            <Paper sx={{ p: 2, height: 300 }}>
                <Typography variant="subtitle2" gutterBottom>Sales Leaders</Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={staffData} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(val) => `₱${val / 1000}k`} />
                        <YAxis type="category" dataKey="name" width={150} style={{ fontSize: '0.8rem' }} />
                        <Tooltip formatter={(val) => fmtPeso(val)} />
                        <Bar dataKey="sales" name="Total Sales" fill="#28a745" barSize={20} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Paper>

            {/* TABLE */}
            <TableContainer component={Paper} sx={{ flex: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Staff Member</TableCell>
                            <TableCell align="right">Total Orders</TableCell>
                            <TableCell align="right">Total Sales</TableCell>
                            <TableCell align="right">Avg Order Value</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {staffData.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center">No data found for this period.</TableCell></TableRow>
                        ) : (
                            staffData.map((row, idx) => (
                                <TableRow key={row.name} hover>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                                    <TableCell align="right">{row.orderCount}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                        {fmtPeso(row.sales)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtPeso(row.orderCount ? row.sales / row.orderCount : 0)}
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
