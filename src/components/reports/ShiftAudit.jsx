// src/components/reports/ShiftAudit.jsx
import React from 'react';
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
    Chip,
    Skeleton
} from '@mui/material';
import { fmtPeso } from '../../services/analyticsService';
import dayjs from 'dayjs';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import PageHeader from '../common/PageHeader';

export default function ShiftAudit() {
    const {
        preset, setPreset,
        shifts,
        loading
    } = useAnalytics();

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PageHeader
                title="Shift Audit"
                subtitle="Track drawer discrepancies and cash handling across shifts."
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

            <TableContainer component={Paper} sx={{ flex: 1, position: 'relative' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date / Time</TableCell>
                            <TableCell>Staff</TableCell>
                            <TableCell align="right">Opening Cash</TableCell>
                            <TableCell align="right">Exp. Cash</TableCell>
                            <TableCell align="right">Actual Cash</TableCell>
                            <TableCell align="right">Difference</TableCell>
                            <TableCell>Notes</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={7}><Skeleton variant="text" /></TableCell>
                                </TableRow>
                            ))
                        ) : shifts.length === 0 ? (
                            <TableRow><TableCell colSpan={7} align="center">No shifts in range.</TableCell></TableRow>
                        ) : (
                            shifts.map((s) => {
                                const start = s.startTime?.seconds ? dayjs.unix(s.startTime.seconds) : dayjs(s.startTime);
                                const end = s.endTime?.seconds ? dayjs.unix(s.endTime.seconds) : (s.endTime ? dayjs(s.endTime) : null);

                                const actual = Number(s.actualCash || 0);
                                const expVal = s.expectedCash !== undefined ? s.expectedCash : (s.systemCash || 0);

                                const diff = actual - expVal;
                                const isShort = diff < -5;
                                const isOver = diff > 5;

                                return (
                                    <TableRow key={s.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">
                                                {start.format("MMM D, HH:mm")}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {end ? `to ${end.format("HH:mm")}` : "(Active)"}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{s.staffEmail}</TableCell>
                                        <TableCell align="right">{fmtPeso(s.startBatch || s.startingCash)}</TableCell>
                                        <TableCell align="right">{fmtPeso(expVal)}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                            {s.endTime ? fmtPeso(actual) : "-"}
                                        </TableCell>
                                        <TableCell align="right">
                                            {s.endTime ? (
                                                <Chip
                                                    label={fmtPeso(diff)}
                                                    size="small"
                                                    color={isShort ? "error" : (isOver ? "success" : "default")}
                                                    variant={Math.abs(diff) < 1 ? "outlined" : "filled"}
                                                />
                                            ) : "-"}
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 200, whiteSpace: "nowrap" }}>
                                            {s.endNote || s.notes || "-"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
