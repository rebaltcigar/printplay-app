// src/components/reports/SalesAnalysis.jsx
import React, { useState, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
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
import {
    buildServiceMap,
    fmtPeso,
    getBusinessType,
    buildHourlySeries,
    calculateMetrics,
    classifyFinancialTx,
    classifyCategory
} from '../../services/analyticsService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

const COLORS = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6610f2", "#e83e8c", "#17a2b8"];

export default function SalesAnalysis() {
    const [aggregateVariants, setAggregateVariants] = useState(true);

    const {
        preset, setPreset,
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

        const metrics = calculateMetrics(transactions, shifts);
        const total = metrics.sales;

        const process = (amt, itemName, catName, type) => {
            if (amt <= 0) return;
            catMap[catName] = (catMap[catName] || 0) + amt;
            if (!itemMap[itemName]) itemMap[itemName] = { amount: 0, count: 0 };
            itemMap[itemName].amount += amt;
            itemMap[itemName].count += 1;
            bizMap[type] = (bizMap[type] || 0) + amt;
        };

        transactions.forEach(t => {
            const cf = classifyFinancialTx(t, serviceMap);
            if (cf.type !== 'revenue') return;

            const category = classifyCategory(t, serviceMap);
            const type = getBusinessType(t, serviceMap);

            let displayName = t.item || "Unknown";
            const normItem = (t.item || "").trim().toLowerCase();
            const svc = serviceMap.get(normItem);

            if (aggregateVariants && svc && svc.parentServiceId) {
                const parent = services.find(s => s.id === svc.parentServiceId);
                if (parent) displayName = parent.serviceName;
            }

            process(cf.amount, displayName, category, type);
        });

        shifts.forEach(s => {
            const val = Number(s.pcRentalTotal || 0);
            if (val > 0) process(val, "PC Rental (Time)", "PC Rental", 'service');
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

        return {
            categoryData: catList,
            itemData: itemList,
            businessTypeData: bizList,
            hourlyData: buildHourlySeries(transactions),
            totalSales: total
        };
    }, [transactions, shifts, services, serviceMap, loading, aggregateVariants]);

    const cards = [
        {
            label: 'Total Sales',
            value: fmtPeso(totalSales),
            sub: preset === 'allTime' ? 'Since start' : preset,
            color: 'primary.main',
            icon: <AttachMoneyIcon />,
            highlight: true
        }
    ];

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
                <Grid size={{ xs: 12, md: 4 }}>
                    <Stack spacing={2}>
                        <SummaryCards cards={cards} loading={loading} />

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
