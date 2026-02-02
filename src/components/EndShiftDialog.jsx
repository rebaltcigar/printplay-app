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

    const PC_RENTAL_ITEM_NAME = "PC Rental";

    // --- CALCULATIONS (Updated for Hybrid PC Rental) ---

    // 1. Identify Logged PC Rental Transactions
    const { pcRentalTransactions, otherTransactions } = useMemo(() => {
        const pc = [];
        const other = [];
        transactions.forEach(tx => {
            if (tx.item === PC_RENTAL_ITEM_NAME) pc.push(tx);
            else other.push(tx);
        });
        return { pcRentalTransactions: pc, otherTransactions: other };
    }, [transactions]);

    // 2. Tally Logged PC Rental Payment Methods
    const { loggedPcGcash, loggedPcAr, loggedPcCash } = useMemo(() => {
        let gcash = 0;
        let ar = 0;
        let cash = 0;
        pcRentalTransactions.forEach(tx => {
            // Treat null/undefined payment method as Cash (legacy safety)
            if (tx.paymentMethod === 'GCash') gcash += (tx.total || 0);
            else if (tx.paymentMethod === 'Charge') ar += (tx.total || 0);
            else cash += (tx.total || 0);
        });
        return { loggedPcGcash: gcash, loggedPcAr: ar, loggedPcCash: cash };
    }, [pcRentalTransactions]);

    const loggedPcNonCash = loggedPcGcash + loggedPcAr;

    // 3. Standard Services (Excluding PC Rental to avoid double count)
    const servicesTotal = useMemo(() => {
        return otherTransactions.reduce((sum, tx) => {
            if (tx.item !== 'Expenses' && tx.item !== 'New Debt') return sum + (tx.total || 0);
            return sum;
        }, 0);
    }, [otherTransactions]);

    const expensesTotal = useMemo(() => {
        return otherTransactions.reduce((sum, tx) => {
            if (tx.item === 'Expenses' || tx.item === 'New Debt') return sum + (tx.total || 0);
            return sum;
        }, 0);
    }, [otherTransactions]);

    // 4. Breakdown of Regular Sales (Excluding PC Rental)
    const regularCashSales = useMemo(() => {
        return otherTransactions.reduce((sum, tx) => {
            if (tx.item !== 'Expenses' && tx.item !== 'New Debt') {
                if (tx.paymentMethod === 'Cash' || !tx.paymentMethod) return sum + (tx.total || 0);
            }
            return sum;
        }, 0);
    }, [otherTransactions]);

    const regularGcashSales = useMemo(() => {
        return otherTransactions.reduce((sum, tx) => {
            if (tx.item !== 'Expenses' && tx.item !== 'New Debt' && tx.paymentMethod === 'GCash') {
                return sum + (tx.total || 0);
            }
            return sum;
        }, 0);
    }, [otherTransactions]);

    const regularArSales = useMemo(() => {
        return otherTransactions.reduce((sum, tx) => {
            if (tx.item !== 'Expenses' && tx.item !== 'New Debt' && tx.paymentMethod === 'Charge') {
                return sum + (tx.total || 0);
            }
            return sum;
        }, 0);
    }, [otherTransactions]);

    // 5. Final Calculations
    const pcRentalNum = Number(pcRental || 0);

    // The "Cash" portion of the PC Rental is the User Input MINUS any non-cash methods logged.
    // If the user inputs 1000, and we logged 300 GCash, then 700 must be Cash.
    // We protect against negatives in display, but logic holds.
    const impliedPcCash = Math.max(0, pcRentalNum - loggedPcNonCash);

    const totalCash = regularCashSales + impliedPcCash;
    const totalGcash = regularGcashSales + loggedPcGcash;
    const totalAr = regularArSales + loggedPcAr;

    const finalTotal = servicesTotal - expensesTotal + pcRentalNum;

    const salesBreakdown = useMemo(() => {
        const m = new Map();
        otherTransactions.forEach(tx => {
            if (tx.item === 'Expenses' || tx.item === 'New Debt') return;
            const key = tx.item || '—';
            m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
        });
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [otherTransactions]);

    const expensesBreakdown = useMemo(() => {
        const m = new Map();
        otherTransactions.forEach(tx => {
            if (tx.item === 'Expenses') {
                const key = `Expense: ${tx.expenseType || 'Other'}`;
                m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
            } else if (tx.item === 'New Debt') {
                const key = 'New Debt';
                m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
            }
        });
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [otherTransactions]);

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
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        autoFocus
                        label="PC Rental Total (From Timer System)"
                        type="number"
                        fullWidth
                        value={pcRental}
                        onChange={e => setPcRental(e.target.value)}
                        required
                        helperText={loggedPcNonCash > 0 ? `Includes ₱${loggedPcNonCash} logged as Non-Cash (GCash/Charge)` : "Enter the Grand Total from your timer"}
                    />

                    <Divider />

                    {/* SECTION 1: SALES */}
                    <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>SALES</Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                        <Typography variant="body2">PC Rental</Typography>
                        <Typography variant="body2">{currency(pcRentalNum)}</Typography>
                    </Box>

                    {/* Itemized Sales */}
                    <Box sx={{ maxHeight: 150, overflow: 'auto' }}>
                        {salesBreakdown.map(([label, amt]) => (
                            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                                <Typography variant="caption">{label}</Typography>
                                <Typography variant="caption">{currency(amt)}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">Total Sales</Typography>
                        <Typography variant="subtitle2">{currency(pcRentalNum + servicesTotal)}</Typography>
                    </Box>


                    {/* SECTION 2: EXPENSES */}
                    <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>EXPENSES</Typography>
                    {expensesBreakdown.length === 0 && (
                        <Typography variant="caption" sx={{ pl: 1, opacity: 0.7 }}>No expenses</Typography>
                    )}
                    <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                        {expensesBreakdown.map(([label, amt]) => (
                            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                                <Typography variant="caption">{label}</Typography>
                                <Typography variant="caption">{currency(amt)}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">Total Expenses</Typography>
                        <Typography variant="subtitle2">{currency(expensesTotal)}</Typography>
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    {/* SECTION 3: SYSTEM TOTAL */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" fontWeight="bold">SYSTEM TOTAL</Typography>
                        <Typography variant="h6" fontWeight="bold">{currency(finalTotal)}</Typography>
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    {/* SECTION 4: PAYMENT BREAKDOWN */}
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>PAYMENT BREAKDOWN</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                        <Typography variant="body2">Cash Sales (+ PC Rental)</Typography>
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

                    {/* SECTION 5: CASHIER EXPECTED CASH */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                        <Typography variant="subtitle1" fontWeight="bold" color="text.primary">Expected Cash on Hand</Typography>
                        <Typography variant="subtitle1" fontWeight="bold" color="text.primary">{currency(totalCash - expensesTotal)}</Typography>
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