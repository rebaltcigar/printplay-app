import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, ToggleButtonGroup,
    ToggleButton, Stack, Alert
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import HistoryIcon from '@mui/icons-material/History';

export default function CheckoutDialog({ open, onClose, total, onConfirm, customer }) {
    const [method, setMethod] = useState('Cash');
    const [tendered, setTendered] = useState('');
    const [gcashRef, setGcashRef] = useState('');
    const [gcashPhone, setGcashPhone] = useState('');

    useEffect(() => {
        if (open) {
            setMethod('Cash');
            setTendered('');
            setGcashRef('');
            setGcashPhone('');
        }
    }, [open]);

    const tenderNum = parseFloat(tendered) || 0;
    const change = Math.max(0, tenderNum - total);
    const remaining = Math.max(0, total - tenderNum);

    const isCashValid = tenderNum >= total;
    const isGcashRefValid = /^\d{13}$/.test(gcashRef.trim());
    const isGcashPhoneValid = /^\d{11}$/.test(gcashPhone.trim());
    const isGcashValid = isGcashRefValid && isGcashPhoneValid;

    // Must have a valid customer ID (not walk-in/null) to allow Charge
    const isChargeAllowed = customer && customer.id;

    // Only allow Confirm if method is valid
    const canConfirm =
        method === 'Cash' ? isCashValid :
            method === 'GCash' ? isGcashValid :
                method === 'Charge' ? isChargeAllowed :
                    false;

    const handleConfirm = (shouldPrint = false) => {
        if (!canConfirm) return;
        const paymentDetails = method === 'GCash' ? { refNumber: gcashRef, phone: gcashPhone } : null;
        onConfirm({
            paymentMethod: method,
            amountTendered: method === 'Cash' ? tenderNum : total,
            change: method === 'Cash' ? change : 0,
            paymentDetails
        }, shouldPrint);
    };

    const addCash = (amount) => setTendered((prev) => ((parseFloat(prev) || 0) + amount).toString());

    // Enter key triggers default Confirm (no print)
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && canConfirm) {
            e.preventDefault();
            handleConfirm(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" onKeyDown={handleKeyDown}>
            <DialogTitle sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                Total Due: ₱{total.toFixed(2)}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    <ToggleButtonGroup value={method} exclusive onChange={(e, m) => m && setMethod(m)} fullWidth color="primary">
                        <ToggleButton value="Cash"><PaymentsIcon sx={{ mr: 1 }} /> Cash</ToggleButton>
                        <ToggleButton value="GCash"><PhoneAndroidIcon sx={{ mr: 1 }} /> GCash</ToggleButton>
                        <ToggleButton value="Charge" disabled={!isChargeAllowed}>
                            <HistoryIcon sx={{ mr: 1 }} /> Charge (Pay Later)
                        </ToggleButton>
                    </ToggleButtonGroup>

                    {method === 'Charge' && (
                        <Alert severity="warning">
                            This will be recorded as "Unpaid" (Accounts Receivable).
                        </Alert>
                    )}

                    {method === 'Cash' && (
                        <Box>
                            <TextField
                                autoFocus
                                label="Amount Tendered"
                                type="number"
                                value={tendered}
                                onChange={(e) => setTendered(e.target.value)}
                                fullWidth
                                InputProps={{ sx: { fontSize: '1.5rem', height: '3.5rem' } }}
                                error={tenderNum > 0 && tenderNum < total}
                                helperText={
                                    tenderNum > 0 && tenderNum < total
                                        ? `Insufficient amount. Need ₱${remaining.toFixed(2)} more.`
                                        : "Enter amount equal or greater than Total Due"
                                }
                            />
                            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 3 }}>
                                {[50, 100, 200, 500, 1000].map((amt) => (
                                    <Button key={amt} variant="outlined" size="small" onClick={() => addCash(amt)}>+{amt}</Button>
                                ))}
                            </Stack>
                            <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', p: 2, borderRadius: 2, textAlign: 'center' }}>
                                <Typography variant="h6">Change</Typography>
                                <Typography variant="h4" color="primary.main" fontWeight="bold">₱{change.toFixed(2)}</Typography>
                            </Box>
                        </Box>
                    )}

                    {method === 'GCash' && (
                        <Stack spacing={2}>
                            <Alert severity="info" sx={{ py: 0 }}>Please verify funds receipt.</Alert>
                            <TextField
                                label="Ref No. (13 Digits)"
                                value={gcashRef}
                                onChange={(e) => setGcashRef(e.target.value.replace(/\D/g, '').slice(0, 13))}
                                fullWidth
                                error={!!gcashRef && !isGcashRefValid}
                                helperText={!!gcashRef && !isGcashRefValid ? "Must be 13 digits" : ""}
                            />
                            <TextField
                                label="Phone (11 Digits)"
                                value={gcashPhone}
                                onChange={(e) => setGcashPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                                fullWidth
                                error={!!gcashPhone && !isGcashPhoneValid}
                                helperText={!!gcashPhone && !isGcashPhoneValid ? "Must be 11 digits" : ""}
                            />
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                <Button onClick={onClose} size="large" color="inherit">Cancel</Button>
                <Box>
                    <Button onClick={() => handleConfirm(true)} size="large" sx={{ mr: 1 }} disabled={!canConfirm}>
                        Print & Confirm
                    </Button>
                    <Button onClick={() => handleConfirm(false)} variant="contained" size="large" disabled={!canConfirm}>
                        CONFIRM
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}