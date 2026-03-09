// src/components/reports/ConsumptionReport.jsx
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
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import { buildConsumptionSeries, buildServiceMap } from '../../services/analyticsService';
import PageHeader from '../common/PageHeader';

export default function ConsumptionReport() {
    const {
        preset, setPreset,
        transactions,
        services,
        loading
    } = useAnalytics();

    const serviceMap = useMemo(() => buildServiceMap(services), [services]);

    const consumptionData = useMemo(() => {
        if (loading) return [];
        return buildConsumptionSeries(transactions, serviceMap);
    }, [transactions, serviceMap, loading]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PageHeader
                title="Consumables Tracker"
                subtitle="Track material usage (paper, ink, etc.) linked to services sold."
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

            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, pb: 1 }}>
                    <Typography variant="h6">Usage Summary</Typography>
                </Box>
                <Divider />
                <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Material Name</TableCell>
                                <TableCell align="right">Quantity Consumed</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {consumptionData.length === 0 ? (
                                <TableRow><TableCell colSpan={2} align="center">No consumption data recorded for this period.</TableCell></TableRow>
                            ) : (
                                consumptionData.map((row) => (
                                    <TableRow key={row.itemId} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.qty.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
