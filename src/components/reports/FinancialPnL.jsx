// src/components/reports/FinancialPnL.jsx
import React, { useMemo } from 'react';
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
    Stack,
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
import {
    fmtPeso,
    buildServiceMap,
    buildPnLSeries
} from '../../services/analyticsService';
import dayjs from 'dayjs';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import { safePrint } from '../../services/printService';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

export default function FinancialPnL() {
    const {
        preset, setPreset,
        range: r,
        transactions,
        shifts,
        services,
        loading
    } = useAnalytics();

    const serviceMap = useMemo(() => buildServiceMap(services), [services]);

    const { tableData, summary } = useMemo(() => {
        if (loading) return { tableData: [], summary: {} };

        const results = buildPnLSeries({
            transactions,
            shifts,
            startLocal: r.startLocal,
            endLocal: r.endLocal,
            serviceMap
        });

        const total = results.reduce((acc, curr) => ({
            sales: acc.sales + curr.sales,
            cogs: acc.cogs + curr.cogs,
            opex: acc.opex + curr.opex,
            netProfit: acc.netProfit + curr.netProfit
        }), { sales: 0, cogs: 0, opex: 0, netProfit: 0 });

        total.margin = total.sales > 0 ? (total.netProfit / total.sales) * 100 : 0;

        return { tableData: results, summary: total };
    }, [transactions, shifts, loading, r, serviceMap]);

    const cards = [
        { label: 'Total Revenue', value: fmtPeso(summary?.sales), color: 'primary.main', icon: <AttachMoneyIcon /> },
        { label: 'COGS', value: fmtPeso(summary?.cogs), color: 'text.secondary', icon: <ReceiptIcon /> },
        { label: 'OpEx', value: fmtPeso(summary?.opex), color: 'error.main', icon: <AccountBalanceWalletIcon /> },
        {
            label: 'Net Profit',
            value: fmtPeso(summary?.netProfit),
            sub: `Margin: ${summary?.margin?.toFixed(1)}%`,
            color: summary?.netProfit >= 0 ? 'success.main' : 'error.main',
            icon: <TrendingUpIcon />,
            highlight: true
        }
    ];

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PageHeader
                title="Profit & Loss"
                subtitle="Financial performance summary across revenue, COGS, and expenses."
                actions={
                    <Stack direction="row" spacing={2} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Date Range</InputLabel>
                            <Select value={preset} label="Date Range" onChange={(e) => setPreset(e.target.value)}>
                                <MenuItem value="thisMonth">This Month</MenuItem>
                                <MenuItem value="lastMonth">Last Month</MenuItem>
                                <MenuItem value="last90">Last 90 Days</MenuItem>
                                <MenuItem value="ytd">Year to Date (YTD)</MenuItem>
                                <MenuItem value="all">All Time</MenuItem>
                            </Select>
                        </FormControl>
                        <Button variant="outlined" onClick={() => safePrint(null, "FinancialPnL")}>Print / PDF</Button>
                    </Stack>
                }
            />

            <SummaryCards cards={cards} loading={loading} />

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
                            <TableRow><TableCell colSpan={6} align="center">No data available.</TableCell></TableRow>
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
