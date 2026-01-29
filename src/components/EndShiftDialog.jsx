import React, { useState, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, Divider, Stack
} from '@mui/material';
import { updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import ErrorIcon from '@mui/icons-material/Error'; // ADDED

const currency = (num) => `₱${Number(num || 0).toFixed(2)}`;

export default function EndShiftDialog({
    open,
    onClose,
    activeShiftId,
    user,
    transactions = [],
    onShiftEnded,
    showSnackbar
}) {
    const [pcRental, setPcRental] = useState('');

    // --- CALCULATIONS (Legacy Logic) ---
    const servicesTotal = useMemo(() => {
        return transactions.reduce((sum, tx) => {
            if (tx.item !== 'Expenses' && tx.item !== 'New Debt') return sum + (tx.total || 0);
            return sum;
        }, 0);
    }, [transactions]);

    const expensesTotal = useMemo(() => {
        return transactions.reduce((sum, tx) => {
            if (tx.item === 'Expenses' || tx.item === 'New Debt') return sum + (tx.total || 0);
            return sum;
        }, 0);
    }, [transactions]);

    const pcRentalNum = Number(pcRental || 0);
    const finalTotal = servicesTotal - expensesTotal + pcRentalNum;

    const salesBreakdown = useMemo(() => {
        const m = new Map();
        transactions.forEach(tx => {
            if (tx.item === 'Expenses' || tx.item === 'New Debt') return;
            const key = tx.item || '—';
            m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
        });
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [transactions]);

    const expensesBreakdown = useMemo(() => {
        const m = new Map();
        transactions.forEach(tx => {
            if (tx.item === 'Expenses') {
                const key = `Expense: ${tx.expenseType || 'Other'}`;
                m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
            } else if (tx.item === 'New Debt') {
                const key = 'New Debt';
                m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
            }
        });
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [transactions]);

    // --- ACTION ---
    const handleConfirm = async () => {
        if (pcRental === '') {
            showSnackbar?.('Enter PC Rental total.', 'error');
            return;
        }

        const summary = {
            pcRentalTotal: pcRentalNum,
            servicesTotal,
            expensesTotal,
            systemTotal: finalTotal,
            endTime: serverTimestamp()
        };

        try {
            // 1. Close Shift in DB
            await updateDoc(doc(db, 'shifts', activeShiftId), summary);

            // 2. Clear App Status
            const statusRef = doc(db, 'app_status', 'current_shift');
            await setDoc(statusRef, { activeShiftId: null, staffEmail: user.email }, { merge: true });

            // 3. Callback to parent (to show receipt or logout)
            if (onShiftEnded) {
                onShiftEnded({ ...summary, salesBreakdown, expensesBreakdown });
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
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        autoFocus
                        label="PC Rental Total"
                        type="number"
                        fullWidth
                        value={pcRental}
                        onChange={e => setPcRental(e.target.value)}
                        required
                    />

                    <Divider />

                    {/* Sales Breakdown */}
                    <Typography variant="subtitle2">Sales</Typography>
                    {salesBreakdown.length === 0 && (
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>No sales entries.</Typography>
                    )}
                    {salesBreakdown.map(([label, amt]) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">{label}</Typography>
                            <Typography variant="body2">{currency(amt)}</Typography>
                        </Box>
                    ))}

                    <Divider />

                    {/* Expenses Breakdown */}
                    <Typography variant="subtitle2">Expenses</Typography>
                    {expensesBreakdown.length === 0 && (
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>No expense entries.</Typography>
                    )}
                    {expensesBreakdown.map(([label, amt]) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">{label}</Typography>
                            <Typography variant="body2">{currency(amt)}</Typography>
                        </Box>
                    ))}

                    <Divider />

                    {/* Totals */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Total Sales</Typography>
                        <Typography>{currency(servicesTotal + pcRentalNum)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Total Expenses</Typography>
                        <Typography>{currency(expensesTotal)}</Typography>
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="h6">SYSTEM TOTAL</Typography>
                        <Typography variant="h5" fontWeight={800}>{currency(finalTotal)}</Typography>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleConfirm}>Confirm & End Shift</Button>
            </DialogActions>

        </Dialog>
    );
}