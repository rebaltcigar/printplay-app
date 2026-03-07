import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Stack, ToggleButtonGroup, ToggleButton,
    Typography, Alert
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { fmtCurrency } from '../utils/formatters';
import { recordPayment } from '../services/invoiceService';
import { useGlobalUI } from '../contexts/GlobalUIContext';

export default function RecordPaymentDialog({ open, onClose, invoice, user, activeShiftId, onSuccess }) {
    const { showSnackbar } = useGlobalUI();
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [note, setNote] = useState('');
    const [gcashRef, setGcashRef] = useState('');
    const [gcashPhone, setGcashPhone] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && invoice) {
            setAmount(invoice.balance?.toString() || '');
            setMethod('cash');
            setNote('');
            setGcashRef('');
            setGcashPhone('');
        }
    }, [open, invoice]);

    if (!invoice) return null;

    const numAmount = parseFloat(amount) || 0;
    const isAmountValid = numAmount > 0 && numAmount <= (invoice.balance || 0);

    const isGcashRefValid = /^\d{13}$/.test(gcashRef.trim());
    const isGcashPhoneValid = /^\d{11}$/.test(gcashPhone.trim());
    const isGcashValid = method === 'gcash' ? (isGcashRefValid && isGcashPhoneValid) : true;

    const isValid = isAmountValid && isGcashValid;

    const handleConfirm = async () => {
        if (!isValid) return;

        setLoading(true);
        try {
            const finalNote = method === 'gcash'
                ? `GCash Ref: ${gcashRef} | Phone: ${gcashPhone}${note ? ` | ${note}` : ''}`
                : note;

            await recordPayment(invoice.id, {
                amount: numAmount,
                method,
                note: finalNote,
                staffEmail: user?.email,
                shiftId: activeShiftId
            }, invoice);

            showSnackbar(`Payment of ${fmtCurrency(numAmount)} recorded.`, 'success');
            onSuccess?.();
            onClose();
        } catch (err) {
            console.error('Record payment error:', err);
            showSnackbar('Failed to record payment.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">Current Balance</Typography>
                        <Typography variant="h4" fontWeight="bold" color={invoice.balance > 0 ? 'error.main' : 'success.main'}>
                            {fmtCurrency(invoice.balance || 0)}
                        </Typography>
                    </Box>

                    <TextField
                        label="Payment Amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        fullWidth
                        autoFocus
                        InputProps={{
                            startAdornment: <Typography sx={{ mr: 1 }}>₱</Typography>
                        }}
                        error={numAmount > (invoice.balance || 0)}
                        helperText={numAmount > (invoice.balance || 0) ? "Amount exceeds current balance" : ""}
                    />

                    <Box>
                        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>Payment Method</Typography>
                        <ToggleButtonGroup
                            value={method}
                            exclusive
                            onChange={(e, v) => v && setMethod(v)}
                            fullWidth
                            color="primary"
                            size="small"
                        >
                            <ToggleButton value="cash"><PaymentsIcon sx={{ mr: 1, fontSize: 18 }} /> Cash</ToggleButton>
                            <ToggleButton value="gcash"><PhoneAndroidIcon sx={{ mr: 1, fontSize: 18 }} /> GCash</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {method === 'gcash' && (
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

                    <TextField
                        label={method === 'gcash' ? "Additional Notes" : "Reference / Notes"}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                        placeholder="Optional notes"
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={loading} color="inherit">Cancel</Button>
                <Button
                    onClick={handleConfirm}
                    disabled={!isValid || loading}
                    variant="contained"
                    color="primary"
                >
                    {loading ? 'Saving...' : 'Confirm Payment'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
