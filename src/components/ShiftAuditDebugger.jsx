import React, { useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Typography,
    Box,
    Divider,
    Chip
} from '@mui/material';
import { fmtPeso } from '../utils/analytics';

export default function ShiftAuditDebugger({ open, onClose, shift, transactions, serviceItems }) {
    const normalize = (s) => String(s ?? "").trim().toLowerCase();

    const auditData = useMemo(() => {
        const listNameToCategory = {};
        (serviceItems || []).forEach(s => {
            const n = normalize(s.serviceName || s.name);
            if (n) listNameToCategory[n] = s.category || "";
        });

        return transactions.map(tx => {
            const itemName = normalize(tx.item);
            const amt = Number(tx.total || 0);

            // LOGIC A: Shifts.jsx (List View)
            let catA = listNameToCategory[itemName];
            if (!catA) {
                if (itemName === 'expenses') catA = 'credit';
                else catA = 'debit';
            }
            const isSaleA = catA === 'debit';
            const isExpA = catA === 'credit';

            // LOGIC B: ShiftDetailView.jsx / Receipt
            const isSaleB = tx.item !== "Expenses" && tx.item !== "New Debt";
            const isExpB = tx.item === "Expenses" || tx.item === "New Debt";

            return {
                ...tx,
                isSaleA,
                isExpA,
                isSaleB,
                isExpB,
                mismatch: isSaleA !== isSaleB || isExpA !== isExpB
            };
        });
    }, [transactions, serviceItems]);

    const totals = useMemo(() => {
        let salesA = 0;
        let salesB = 0;
        let expA = 0;
        let expB = 0;

        auditData.forEach(d => {
            const amt = Number(d.total || 0);
            if (d.isSaleA) salesA += amt;
            if (d.isSaleB) salesB += amt;
            if (d.isExpA) expA += amt;
            if (d.isExpB) expB += amt;
        });

        const pc = Number(shift.pcRentalTotal || 0);

        return {
            salesA: salesA + pc,
            salesB: salesB + pc,
            expA,
            expB,
            diffSales: (salesA + pc) - (salesB + pc),
            diffExp: expA - expB
        };
    }, [auditData, shift.pcRentalTotal]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                Shift Audit Debugger
                <Typography variant="caption" display="block" color="text.secondary">
                    Comparing List View Logic vs. Detailed/Receipt Logic
                </Typography>
            </DialogTitle>
            <DialogContent dividers>
                <Box sx={{ mb: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2" gutterBottom color="primary">Logic A (List View / Aggregate)</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Total Sales (+PC):</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtPeso(totals.salesA)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Total Expenses:</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtPeso(totals.expA)}</Typography>
                        </Box>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom color="secondary">Logic B (Detail View / Receipt)</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Total Sales (+PC):</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtPeso(totals.salesB)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Total Expenses:</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtPeso(totals.expB)}</Typography>
                        </Box>
                    </Paper>
                </Box>

                {(totals.diffSales !== 0 || totals.diffExp !== 0) && (
                    <Box sx={{ mb: 2, p: 1, bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight="bold">
                            Discrepancy Found: {fmtPeso(Math.abs(totals.diffSales))} in Sales, {fmtPeso(Math.abs(totals.diffExp))} in Expenses.
                        </Typography>
                    </Box>
                )}

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Item</TableCell>
                                <TableCell align="right">Amount</TableCell>
                                <TableCell>Logic A (List)</TableCell>
                                <TableCell>Logic B (Detail)</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {auditData.map((d) => (
                                <TableRow
                                    key={d.id}
                                    sx={{
                                        bgcolor: d.mismatch ? 'warning.light' : 'transparent',
                                        '& td': { color: d.mismatch ? 'black' : 'inherit' }
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={d.mismatch ? 700 : 400}>{d.item}</Typography>
                                        <Typography variant="caption" sx={{ opacity: 0.7 }}>{d.paymentMethod || 'Cash'}</Typography>
                                    </TableCell>
                                    <TableCell align="right" fontWeight="bold">{fmtPeso(d.total)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={d.isSaleA ? 'SALE' : d.isExpA ? 'EXPENSE' : 'OTHER'}
                                            color={d.isSaleA ? 'success' : 'error'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={d.isSaleB ? 'SALE' : d.isExpB ? 'EXPENSE' : 'OTHER'}
                                            color={d.isSaleB ? 'success' : 'error'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {d.mismatch ? (
                                            <Chip label="MISMATCH" size="small" color="error" />
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">OK</Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell><strong>PC Rental (System)</strong></TableCell>
                                <TableCell align="right"><strong>{fmtPeso(shift.pcRentalTotal)}</strong></TableCell>
                                <TableCell colSpan={3}><Typography variant="caption">Handled same in both logics (as Sale)</Typography></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Close Debugger</Button>
            </DialogActions>
        </Dialog>
    );
}
