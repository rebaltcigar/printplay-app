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
    Divider,
    FormControlLabel,
    Checkbox,
    Stack
} from '@mui/material';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend
} from 'recharts';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
    getRange,
    txAmount,
    buildServiceMap,
    fmtPeso,
    getBusinessType,
    buildHourlySeries,
    isPcRentalTx,
    calculateMetrics,
    classifyFinancialTx
} from '../../services/analyticsService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import PageHeader from '../common/PageHeader';

const COLORS = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6610f2", "#e83e8c", "#17a2b8"];

export default function SalesAnalysis() {
    const [aggregateVariants, setAggregateVariants] = useState(true);

    const {
        preset, setPreset,
        range: r,
        transactions,
        shifts,
        services,
        loading
    } = useAnalytics();

    const serviceMap = useMemo(() => buildServiceMap(services), [services]);

    const { categoryData, itemData, businessTypeData, hourlyData, totalSales } = useMemo(() => {
        if (loading) return { categoryData: [], itemData: [], businessTypeData: [], hourlyData: [], totalSales: 0 };

        const catMap = {};
        const itemMap = {};
        const bizMap = { retail: 0, service: 0 };

        // Use centralized metrics for totalSales
        const metrics = calculateMetrics(transactions, shifts);
        const total = metrics.sales;

        // Wrapper to process amounts
        const process = (amt, itemName, catName, type) => {
            if (amt <= 0) return;
            // Cat
            if (!catMap[catName]) catMap[catName] = 0;
            catMap[catName] += amt;
            // Item
            if (!itemMap[itemName]) itemMap[itemName] = { amount: 0, count: 0 };
            itemMap[itemName].amount += amt;
            itemMap[itemName].count += 1;
            // Biz Type
            bizMap[type] = (bizMap[type] || 0) + amt;
        };

        transactions.forEach(t => {
            const cf = classifyFinancialTx(t, serviceMap);
            if (cf.type !== 'revenue') return;

            const normItem = (t.item || "").trim().toLowerCase();
            let cat = "Others";
            let type = getBusinessType(t, serviceMap);

            const svc = serviceMap.get(normItem);
            if (svc) {
                cat = svc.category || "Service";
            } else if (t.category) {
                cat = t.category;
            } else {
                if (normItem.includes('print')) cat = "Printing";
                else if (normItem.includes('scan') || normItem.includes('lamin')) cat = "Services";
                else cat = "Uncategorized";
            }

            let displayName = t.item || "Unknown";
            if (aggregateVariants && svc && svc.parentServiceId) {
                const parent = services.find(s => s.id === svc.parentServiceId);
                if (parent) displayName = parent.serviceName;
            }

            process(cf.amount, displayName, cat.charAt(0).toUpperCase() + cat.slice(1), type);
        });

        // PC Rental
        shifts.forEach(s => {
            const val = Number(s.pcRentalTotal || 0);
            if (val > 0) {
                const cat = "PC Rental";
                const item = "PC Rental (Time)";
                process(val, item, cat, 'service');
            }
        });

        const catList = Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const itemList = Object.entries(itemMap)
            .map(([name, d]) => ({ name, value: d.amount, count: d.count }))
            .sort((a, b) => b.value - a.value);

        const bizList = [
            { name: 'Retail', value: bizMap.retail, color: '#28a745' },
            { name: 'Service', value: bizMap.service, color: '#007bff' }
        ].filter(b => b.value > 0);

        const hourlyList = buildHourlySeries(transactions);

        return {
            categoryData: catList,
            itemData: itemList,
            businessTypeData: bizList,
            hourlyData: hourlyList,
            totalSales: total
        };
    }, [transactions, shifts, services, serviceMap, loading, aggregateVariants]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            <PageHeader
                title="Sales Analysis"
                subtitle="Detailed breakdown of top-selling items and category distribution."
                actions={
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <FormControlLabel
                            control={<Checkbox checked={aggregateVariants} onChange={e => setAggregateVariants(e.target.checked)} />}
                            label="Aggregate Variants"
                        />
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
                    </Box>
                }
            />

            <Grid container spacing={2}>
                {/* TOP ROW: KPIs and Distributions */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Stack spacing={2}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center', py: 3 }}>
                                <Typography variant="body2" color="text.secondary">Total Sales</Typography>
                                <Typography variant="h4" fontWeight="bold" color="primary.main">
                                    {fmtPeso(totalSales)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {preset === 'allTime' ? 'Since earliest record' : preset}
                                </Typography>
                            </CardContent>
                        </Card>

                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle2" align="center" gutterBottom>Retail vs Service</Typography>
                            <ResponsiveContainer width="100%" height={150}>
                                <PieChart>
                                    <Pie
                                        data={businessTypeData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="40%"
                                        outerRadius="70%"
                                        dataKey="value"
                                        nameKey="name"
                                    >
                                        {businessTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(val) => fmtPeso(val)} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </Paper>
                    </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" align="center" gutterBottom>Category Distribution</Typography>
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius="80%"
                                    innerRadius="50%"
                                    fill="#8884d8"
                                    dataKey="value"
                                    nameKey="name"
                                    paddingAngle={5}
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val) => fmtPeso(val)} />
                            </PieChart>
                        </ResponsiveContainer>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mt: 1 }}>
                            {categoryData.map((entry, index) => (
                                <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 8, height: 8, bgcolor: COLORS[index % COLORS.length], borderRadius: '50%' }} />
                                    <Typography variant="caption" noWrap>{entry.name}</Typography>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <Box sx={{ p: 2, pb: 1 }}>
                            <Typography variant="subtitle2">Top Selling Items (Top 10)</Typography>
                        </Box>
                        <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontSize: '0.75rem' }}>Item</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>Qty</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.75rem' }}>Sales</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {itemData.slice(0, 10).map((row) => (
                                        <TableRow key={row.name} hover>
                                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>{row.name}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.5 }}>{row.count}</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 'bold', py: 0.5 }}>{fmtPeso(row.value)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* FULL WIDTH ROW: HOURLY VOLUME */}
                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 3, minHeight: 400 }}>
                        <Typography variant="h6" align="center" gutterBottom>Transaction Volume by Hour</Typography>
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                            Peak sales periods and customer traffic distribution.
                        </Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={hourlyData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="hour"
                                    tickFormatter={(h) => `${h}:00`}
                                    label={{ value: 'Hour of Day', position: 'insideBottom', offset: -10 }}
                                />
                                <YAxis
                                    label={{ value: 'Total Orders', angle: -90, position: 'insideLeft' }}
                                />
                                <Tooltip
                                    labelFormatter={(h) => `Time: ${h}:00 - ${h}:59`}
                                    formatter={(val, name) => [val, name === 'count' ? 'Orders' : 'Sales']}
                                />
                                <Bar dataKey="count" name="Orders" fill="#3f51b5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

            </Grid>
        </Box>
    );
}
