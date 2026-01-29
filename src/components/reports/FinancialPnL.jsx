// src/components/reports/FinancialPnL.jsx
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
    Stack,
    Divider,
    Button
} from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import {
    getRange,
    txAmount,
    classifyTx,
    buildServiceMap,
    generateMonthlyKeys,
    saleMatchesService,
    fmtPeso
} from '../../utils/analytics';
import dayjs from 'dayjs';
import { useAnalytics } from '../../contexts/AnalyticsContext';

export default function FinancialPnL() {
    // --- Context ---
    const {
        preset, setPreset,
        range: r,
        transactions,
        shifts,
        services,
        loading
    } = useAnalytics();

    // --- Service Map ---
    const serviceMap = useMemo(() => buildServiceMap(services), [services]);

    // --- 2. Process P&L ---
    const { tableData, summary } = useMemo(() => {
        if (loading) return { tableData: [], summary: {} };

        // 1. Generate Buckets (Months)
        // If preset is "thisMonth", we might want daily granularity? 
        // SaaS convention: P&L is usually Monthly, but let's follow the range granularity helper?
        // For now, let's force MONTHLY buckets for P&L unless range is very short.
        // Actually, "generateMonthlyKeys" is specific for months. 
        // If range is "thisMonth", let's just show that one month.

        const keys = generateMonthlyKeys(r.startLocal, r.endLocal); // ["YYYY-MM", ...]
        const buckets = new Map();
        keys.forEach(k => buckets.set(k, { date: k, sales: 0, cogs: 0, opex: 0, netProfit: 0 }));

        const getBucketKey = (dateArgs) => dayjs(dateArgs).format("YYYY-MM");

        // 2. Iterate Transactions
        transactions.forEach(t => {
            if (t.isDeleted) return;
            const amt = txAmount(t);
            const k = getBucketKey(t.timestamp.seconds ? t.timestamp.seconds * 1000 : t.timestamp);

            const b = buckets.get(k);
            if (!b) return; // Out of range or logic error

            // Classify
            if (t.financialCategory) {
                // Modern Classification
                if (t.financialCategory === 'Revenue') {
                    b.sales += amt;
                    // Calculate COGS if unitCost is present (Accrual Basis)
                    if (t.unitCost) {
                        const cost = Number(t.unitCost) * Number(t.quantity || 1);
                        b.cogs += cost;
                    }
                }
                else if (t.financialCategory === 'COGS') b.cogs += Math.abs(amt); // Legacy or Adjustments
                else if (t.financialCategory === 'OPEX') b.opex += Math.abs(amt);
                // CAPEX and InventoryAsset are excluded from P&L
            } else {
                // Legacy Fallback
                const isExp = t.amount < 0 && !t.serviceId;
                // Note: txAmount returns positive for sales, negative for expenses usually, 
                // but let's stick to the analytics helper logic or explicit checks.

                if (t.item === 'New Debt' || t.item === 'Paid Debt' || t.category === 'credit') return; // Skip debt flow for P&L revenue

                // Check if purely expense
                const type = (t.expenseType || "").toLowerCase();
                if (t.item === 'Expenses' || type) {
                    // Exclude Capital
                    if (!type.includes('asset') && !type.includes('capital') && !type.includes('capex')) {
                        b.opex += Math.abs(amt);
                    }
                } else {
                    // Assume Sale
                    b.sales += amt;
                }
            }
        });

        // 3. Iterate Shifts (PC Rental Revenue)
        shifts.forEach(s => {
            const k = getBucketKey(s.startTime.seconds * 1000);
            const b = buckets.get(k);
            if (b) {
                b.sales += Number(s.pcRentalTotal || 0);
            }
        });

        // 4. Finalize
        const results = keys.map(k => {
            const b = buckets.get(k);
            b.netProfit = b.sales - b.cogs - b.opex;
            if (b.sales > 0) {
                b.margin = (b.netProfit / b.sales) * 100;
            } else {
                b.margin = 0;
            }
            return b;
        });

        // 5. Total Summaries
        const total = results.reduce((acc, curr) => ({
            sales: acc.sales + curr.sales,
            cogs: acc.cogs + curr.cogs,
            opex: acc.opex + curr.opex,
            netProfit: acc.netProfit + curr.netProfit
        }), { sales: 0, cogs: 0, opex: 0, netProfit: 0 });

        total.margin = total.sales > 0 ? (total.netProfit / total.sales) * 100 : 0;

        return { tableData: results, summary: total };

    }, [transactions, shifts, loading, r]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* FILTER BAR */}
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">Financial P&L</Typography>
                <Box sx={{ flexGrow: 1 }} />
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
                <Button variant="outlined" onClick={() => window.print()}>Print / PDF</Button>
            </Paper>

            {/* SUMMARY CARDS */}
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <SummaryCard title="Total Revenue" value={summary?.sales} color="primary.main" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <SummaryCard title="COGS" value={summary?.cogs} color="text.secondary" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <SummaryCard title="OpEx" value={summary?.opex} color="error.main" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card>
                        <CardContent sx={{ pb: 1 }}>
                            <Typography variant="body2" color="text.secondary">Net Profit</Typography>
                            <Typography variant="h5" fontWeight="bold" sx={{ color: summary?.netProfit >= 0 ? 'success.main' : 'error.main' }}>
                                {fmtPeso(summary?.netProfit)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Margin: {summary?.margin?.toFixed(1)}%
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* CHART SECTION */}
            <Paper sx={{ p: 2, height: 350 }}>
                <Typography variant="subtitle2" gutterBottom>Financial Trend</Typography>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tableData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickFormatter={(val) => dayjs(val).format("MMM YYYY")}
                            style={{ fontSize: '0.75rem' }}
                        />
                        <YAxis
                            tickFormatter={(val) => `₱${val / 1000}k`}
                            style={{ fontSize: '0.75rem' }}
                        />
                        <Tooltip
                            formatter={(value) => fmtPeso(value)}
                            labelFormatter={(label) => dayjs(label).format("MMMM YYYY")}
                        />
                        <Legend />
                        <ReferenceLine y={0} stroke="#000" />
                        <Bar dataKey="sales" name="Revenue" fill="#1976d2" stackId="a" />
                        <Bar dataKey="cogs" name="COGS" fill="#9e9e9e" stackId="b" />
                        <Bar dataKey="opex" name="Expenses" fill="#d32f2f" stackId="b" />
                    </BarChart>
                </ResponsiveContainer>
            </Paper>

            {/* DATA TABLE */}
            <TableContainer component={Paper} sx={{ flex: 1 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: '20%' }}>Period</TableCell>
                            <TableCell align="right" sx={{ width: '15%' }}>Revenue</TableCell>
                            <TableCell align="right" sx={{ width: '15%' }}>COGS</TableCell>
                            <TableCell align="right" sx={{ width: '15%' }}>OpEx</TableCell>
                            <TableCell align="right" sx={{ width: '20%' }}>Net Profit</TableCell>
                            <TableCell align="right" sx={{ width: '15%' }}>Margin</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tableData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center">No data available.</TableCell>
                            </TableRow>
                        ) : (
                            tableData.map((row) => (
                                <TableRow key={row.date} hover>
                                    <TableCell sx={{ fontWeight: 600 }}>{dayjs(row.date).format("MMMM YYYY")}</TableCell>
                                    <TableCell align="right">{fmtPeso(row.sales)}</TableCell>
                                    <TableCell align="right">{fmtPeso(row.cogs)}</TableCell>
                                    <TableCell align="right" sx={{ color: 'error.main' }}>{fmtPeso(row.opex)}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold', color: row.netProfit >= 0 ? 'success.main' : 'error.main' }}>
                                        {fmtPeso(row.netProfit)}
                                    </TableCell>
                                    <TableCell align="right">{row.margin.toFixed(1)}%</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

        </Box>
    );
}

function SummaryCard({ title, value, color }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="body2" color="text.secondary">{title}</Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: color || 'inherit' }}>
                    {fmtPeso(value)}
                </Typography>
            </CardContent>
        </Card>
    );
}
