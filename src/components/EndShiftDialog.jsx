import React, { useState, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, Divider, Stack
} from '@mui/material';
import { updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import ErrorIcon from '@mui/icons-material/Error'; // ADDED

import { fmtCurrency } from '../utils/formatters';
const currency = fmtCurrency;

import { computeShiftFinancials } from '../utils/shiftFinancials';

export default function EndShiftDialog({
    open,
    onClose,
    activeShiftId,
    user,
    transactions = [],
    onShiftEnded,
    showSnackbar,
    settings = {},
}) {
    const pcRentalEnabled = settings.pcRentalEnabled !== false; // default true for back-compat
    const pcRentalMode = settings.pcRentalMode || 'external';
    const needsManualInput = pcRentalEnabled && pcRentalMode === 'external';

    const [pcRental, setPcRental] = useState('');

    // When PC rental is off or builtin, total is always 0 (builtin: future v0.6 will fetch from sessions)
    const pcRentalNum = needsManualInput ? Number(pcRental || 0) : 0;

    const pcRentalServiceId = settings.pcRentalServiceId || null;

    // --- ALL FINANCIAL CALCULATIONS from shared utility ---
    const financials = useMemo(
        () => computeShiftFinancials(transactions, pcRentalNum, pcRentalServiceId),
        [transactions, pcRentalNum, pcRentalServiceId]
    );

    const {
        servicesTotal,
        expensesTotal,
        salesBreakdown,
        expensesBreakdown,
        totalCash,
        totalGcash,
        totalAr,
        systemTotal: finalTotal,
        loggedPcNonCash,
    } = financials;



    // --- ACTION ---
    const handleConfirm = async () => {
        if (needsManualInput && pcRental === '') {
            showSnackbar?.('Enter PC Rental total.', 'error');
            return;
        }

        const summary = {
            pcRentalTotal: pcRentalNum,
            servicesTotal,
            expensesTotal,
            systemTotal: finalTotal,
            totalCash,     // NEW: Required,
            totalGcash,    // NEW: Required
            totalAr,       // NEW: Required
            endTime: serverTimestamp()
        };

        try {
            // 1. Close Shift in DB
            await updateDoc(doc(db, 'shifts', activeShiftId), summary);

            // 2. Clear App Status
            const statusRef = doc(db, 'app_status', 'current_shift');
            await setDoc(statusRef, { activeShiftId: null, staffEmail: user.email }, { merge: true });

            // 3. Callback to parent (to show receipt or logout)
            // PASS THE BREAKDOWN
            if (onShiftEnded) {
                onShiftEnded({
                    ...summary,
                    salesBreakdown,
                    expensesBreakdown,
                    breakdown: {
                        cash: totalCash,
                        gcash: totalGcash,
                        receivables: totalAr
                    }
                });
            }
            onClose();
        } catch (e) {
            console.error(e);
            showSnackbar?.('Failed to end shift.', 'error');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>End of Shift</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0, height: '60vh' }}>
                {/* 1. TOP FIXED: PC RENTAL INPUT (external timer mode only) */}
                {pcRentalEnabled && (
                    <Box sx={{ p: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        {needsManualInput ? (
                            <TextField
                                autoFocus
                                label="PC Rental Total (From External Timer)"
                                type="number"
                                fullWidth
                                value={pcRental}
                                onChange={e => setPcRental(e.target.value)}
                                required
                                helperText={loggedPcNonCash > 0
                                    ? `₱${loggedPcNonCash} logged as non-cash (GCash/Charge) — cash portion auto-deducted`
                                    : 'Enter the grand total from your external timer'}
                            />
                        ) : (
                            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary">PC Rental Total</Typography>
                                <Typography variant="body2">
                                    Computed automatically from session records (v0.6).
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}

                {/* 2. MIDDLE SCROLLABLE: BREAKDOWNS */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    {/* SALES */}
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>SALES</Typography>
                    {pcRentalEnabled && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                            <Typography variant="body2">
                                PC Rental{pcRentalMode === 'external' ? ' (external timer)' : ''}
                            </Typography>
                            <Typography variant="body2">{currency(pcRentalNum)}</Typography>
                        </Box>
                    )}
                    <Box>
                        {salesBreakdown.map(([label, amt]) => (
                            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                                <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                                <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">Total Sales</Typography>
                        <Typography variant="subtitle2">{currency(pcRentalNum + servicesTotal)}</Typography>
                    </Box>

                    {/* EXPENSES */}
                    <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>EXPENSES</Typography>
                    {expensesBreakdown.length === 0 && (
                        <Typography variant="caption" sx={{ pl: 1, opacity: 0.7 }}>No expenses</Typography>
                    )}
                    <Box>
                        {expensesBreakdown.map(([label, amt]) => (
                            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                                <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                                <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">Total Expenses</Typography>
                        <Typography variant="subtitle2">{currency(expensesTotal)}</Typography>
                    </Box>
                </Box>

                {/* 3. BOTTOM FIXED: TOTALS */}
                <Box sx={{ p: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" fontWeight="bold">SYSTEM TOTAL</Typography>
                        <Typography variant="h6" fontWeight="bold">{currency(finalTotal)}</Typography>
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>PAYMENT BREAKDOWN</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                        <Typography variant="body2">Cash Sales{pcRentalEnabled ? ' (+ PC Rental)' : ''}</Typography>
                        <Typography variant="body2">{currency(totalCash)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                        <Typography variant="body2">GCash</Typography>
                        <Typography variant="body2">{currency(totalGcash)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                        <Typography variant="body2">Receivables (Pay Later)</Typography>
                        <Typography variant="body2">{currency(totalAr)}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                        <Typography variant="subtitle1" fontWeight="bold" color="text.primary">Expected Cash on Hand</Typography>
                        <Typography variant="subtitle1" fontWeight="bold" color="text.primary">{currency(totalCash - expensesTotal)}</Typography>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleConfirm}>Confirm & End Shift</Button>
            </DialogActions>

        </Dialog>
    );
}