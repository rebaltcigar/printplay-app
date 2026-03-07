import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, ToggleButtonGroup,
    ToggleButton, Stack, Alert
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import HistoryIcon from '@mui/icons-material/History';
import ValidatedInput from './common/ValidatedInput';

export default function CheckoutDialog({ open, onClose, total, onConfirm, customer, defaultDueDays = 7 }) {
    const [method, setMethod] = useState('Cash');
    const [tendered, setTendered] = useState('');
    const [gcashRef, setGcashRef] = useState('');
    const [gcashPhone, setGcashPhone] = useState('');
    const [dueDate, setDueDate] = useState('');
    const tenderedRef = useRef(null);

    const defaultDueDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + (defaultDueDays || 7));
        return d.toISOString().split('T')[0];
    };

    useEffect(() => {
        if (open) {
            setMethod('Cash');
            setTendered('');
            setGcashRef('');
            setGcashPhone('');
            setDueDate(defaultDueDateStr());
            setTimeout(() => tenderedRef.current?.focus(), 150);
        }
    }, [open]);

    const tenderNum = parseFloat(tendered) || 0;
    const change = Math.max(0, tenderNum - total);
    const remaining = Math.max(0, total - tenderNum);

    // Only need to handle method-specific logic now
    const isCashValid = tenderNum >= total;
    const isGcashRefValid = gcashRef.length === 13;
    const isGcashPhoneValid = gcashPhone.length === 11;
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
            paymentDetails,
            dueDate: method === 'Charge' && dueDate ? new Date(dueDate) : null,
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
                Checkout
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    {/* ENHANCED TOTAL DISPLAY */}
                    <Box
                        sx={{
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            p: 3,
                            borderRadius: 2,
                            textAlign: 'center',
                            boxShadow: 3
                        }}
                    >
                        <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.9, fontWeight: 'bold' }}>
                            ORDER TOTAL
                        </Typography>
                        <Typography variant="h2" sx={{ fontWeight: 900, lineHeight: 1 }}>
                            ₱{total.toFixed(2)}
                        </Typography>
                    </Box>

                    <ToggleButtonGroup value={method} exclusive onChange={(e, m) => m && setMethod(m)} fullWidth color="primary">
                        <ToggleButton value="Cash"><PaymentsIcon sx={{ mr: 1 }} /> Cash</ToggleButton>
                        <ToggleButton value="GCash"><PhoneAndroidIcon sx={{ mr: 1 }} /> GCash</ToggleButton>
                        <ToggleButton value="Charge" disabled={!isChargeAllowed}>
                            <HistoryIcon sx={{ mr: 1 }} /> Charge (Pay Later)
                        </ToggleButton>
                    </ToggleButtonGroup>

                    {method === 'Charge' && (
                        <Stack spacing={2}>
                            <Alert severity="warning">
                                This will be recorded as an invoice (Accounts Receivable). Customer must be assigned.
                            </Alert>
                            <TextField
                                label="Due Date"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                helperText="Date by which payment is expected"
                            />
                        </Stack>
                    )}

                    {method === 'Cash' && (
                        <Box>
                            <ValidatedInput
                                inputRef={tenderedRef}
                                label="Amount Tendered"
                                rule="numeric"
                                value={tendered}
                                onChange={setTendered}
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
                            <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', p: 1.5, borderRadius: 2, textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <Typography variant="body2" sx={{ opacity: 0.7 }}>Expected Change</Typography>
                                <Typography variant="h5" sx={{ color: '#ef5350', fontWeight: 'bold' }}>₱{change.toFixed(2)}</Typography>
                            </Box>
                        </Box>
                    )}


                    {method === 'GCash' && (
                        <Stack spacing={2}>
                            <Alert severity="info" sx={{ py: 0 }}>Please verify funds receipt.</Alert>
                            <ValidatedInput
                                label="Ref No. (13 Digits)"
                                rule="gcash"
                                value={gcashRef}
                                onChange={setGcashRef}
                                fullWidth
                            />
                            <ValidatedInput
                                label="Phone (11 Digits)"
                                rule="phone"
                                value={gcashPhone}
                                onChange={setGcashPhone}
                                fullWidth
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