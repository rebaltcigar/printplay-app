// src/components/reports/ShiftAudit.jsx
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
    Chip
} from '@mui/material';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { getRange, fmtPeso } from '../../utils/analytics';
import dayjs from 'dayjs';

export default function ShiftAudit() {
    const [preset, setPreset] = useState("thisMonth");
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);

    const r = useMemo(() => getRange(preset, null, null), [preset]);

    useEffect(() => {
        setLoading(true);
        // Fetch COMPLETED shifts mostly
        const q = query(
            collection(db, "shifts"),
            where("startTime", ">=", r.startUtc),
            where("startTime", "<=", r.endUtc),
            orderBy("startTime", "desc")
        );
        const unsub = onSnapshot(q, (snap) => {
            setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [r.startUtc, r.endUtc]);

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">Shift Audit (Drawer Log)</Typography>
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

            <TableContainer component={Paper} sx={{ flex: 1 }}>
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
                        {shifts.length === 0 ? (
                            <TableRow><TableCell colSpan={7} align="center">No shifts in range.</TableCell></TableRow>
                        ) : (
                            shifts.map((s) => {
                                const start = s.startTime?.seconds ? dayjs.unix(s.startTime.seconds) : dayjs(s.startTime);
                                const end = s.endTime?.seconds ? dayjs.unix(s.endTime.seconds) : (s.endTime ? dayjs(s.endTime) : null);

                                const actual = Number(s.actualCash || 0);
                                const expected = Number(s.expectedCash || 0); // Need to define how expected is calculated if not stored
                                // Assuming expectedCash is stored on shift close. 
                                // If not, we might need 'systemCash' or 'totalCashInDrawer' from DB if available.
                                // Falling back to `totalCash` if expectedCash missing (legacy)
                                const expVal = s.expectedCash !== undefined ? s.expectedCash : (s.systemCash || 0);

                                const diff = actual - expVal;
                                const isShort = diff < -5; // tolerance
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
                                        <TableCell sx={{ maxWidth: 200 }} noWrap>
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
