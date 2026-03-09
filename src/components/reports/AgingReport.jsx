// src/components/reports/AgingReport.jsx
import React, { useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    TableContainer,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Divider,
    Grid,
    Card,
    CardContent
} from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import { fmtPeso } from '../../services/analyticsService';
import PageHeader from '../common/PageHeader';
import dayjs from 'dayjs';

const BUCKET_COLORS = ['#28a745', '#ffc107', '#dc3545'];

export default function AgingReport() {
    const { invoices, loading } = useAnalytics();

    const { buckets, totalOutstanding } = useMemo(() => {
        const result = [
            { name: '0–30 Days', value: 0, count: 0 },
            { name: '31–60 Days', value: 0, count: 0 },
            { name: '61+ Days', value: 0, count: 0 }
        ];
        let total = 0;

        const now = dayjs();

        const unpaid = invoices.filter(inv => inv.status === 'UNPAID' || inv.status === 'PARTIAL');

        unpaid.forEach(inv => {
            const date = inv.createdAt?.seconds ? dayjs.unix(inv.createdAt.seconds) : dayjs(inv.createdAt);
            const diff = now.diff(date, 'day');
            const amt = Number(inv.balance || inv.total || 0);

            if (diff <= 30) {
                result[0].value += amt;
                result[0].count += 1;
            } else if (diff <= 60) {
                result[1].value += amt;
                result[1].count += 1;
            } else {
                result[2].value += amt;
                result[2].count += 1;
            }
            total += amt;
        });

        return { buckets: result, totalOutstanding: total };
    }, [invoices]);

    if (loading) return <Typography sx={{ p: 4 }} align="center">Loading aging data...</Typography>;

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PageHeader
                title="Invoice Aging Report"
                subtitle="Monitor outstanding balances Categorized by how long they've been unpaid."
            />

            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Total Receivables</Typography>
                            <Typography variant="h4" fontWeight="bold" color="primary.main">
                                {fmtPeso(totalOutstanding)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2, height: 120, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={buckets} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} fontSize={12} />
                                <Tooltip formatter={(val) => fmtPeso(val)} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {buckets.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, pb: 1 }}>
                    <Typography variant="h6">Detailed Unpaid Invoices</Typography>
                </Box>
                <Divider />
                <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Customer</TableCell>
                                <TableCell>Invoice #</TableCell>
                                <TableCell>Date</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell>Age</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {invoices.filter(inv => inv.status === 'UNPAID' || inv.status === 'PARTIAL').length === 0 ? (
                                <TableRow><TableCell colSpan={5} align="center">No outstanding invoices.</TableCell></TableRow>
                            ) : (
                                invoices
                                    .filter(inv => inv.status === 'UNPAID' || inv.status === 'PARTIAL')
                                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                                    .map((inv) => {
                                        const date = inv.createdAt?.seconds ? dayjs.unix(inv.createdAt.seconds) : dayjs(inv.createdAt);
                                        const age = dayjs().diff(date, 'day');
                                        return (
                                            <TableRow key={inv.id} hover>
                                                <TableCell>{inv.customerName}</TableCell>
                                                <TableCell>{inv.invoiceNumber || inv.orderNumber}</TableCell>
                                                <TableCell>{date.format('MMM DD, YYYY')}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmtPeso(inv.balance || inv.total)}</TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{
                                                        color: age > 60 ? 'error.main' : age > 30 ? 'warning.main' : 'success.main',
                                                        fontWeight: 500
                                                    }}>
                                                        {age} days
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
