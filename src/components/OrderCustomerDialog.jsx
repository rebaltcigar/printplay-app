import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Box, IconButton, Stack
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function OrderCustomerDialog({ open, onClose, onSetCustomer, currentCustomer, showSnackbar }) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [tin, setTin] = useState('');

    // Pre-fill if editing existing customer on order
    useEffect(() => {
        if (open) {
            if (currentCustomer) {
                setName(currentCustomer.fullName || '');
                setPhone(currentCustomer.phone || '');
                setAddress(currentCustomer.address || '');
                setTin(currentCustomer.tin || '');
            } else {
                setName('');
                setPhone('');
                setAddress('');
                setTin('');
            }
        }
    }, [open, currentCustomer]);

    const handleSave = () => {
        if (!name.trim()) {
            showSnackbar?.("Name / Company is required.", 'warning');
            return;
        }

        onSetCustomer({
            fullName: name.trim(),
            phone: phone.trim(),
            address: address.trim(),
            tin: tin.trim(),
            id: 'manual-entry' // Distinguish from DB customers
        });
        onClose();
    };

    const handleClear = () => {
        onSetCustomer(null);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>
                Customer Details
                <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} pt={1}>
                    <TextField
                        label="Name / Company (Required)"
                        fullWidth
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                    <TextField
                        label="Phone"
                        fullWidth
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                    <TextField
                        label="Address"
                        fullWidth
                        multiline
                        rows={2}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                    />
                </Stack>
                <TextField
                    label="TIN"
                    fullWidth
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                    sx={{ mt: 2 }}
                />
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
                <Button onClick={handleClear} color="error">Remove Customer</Button>
                <Box>
                    <Button onClick={onClose} sx={{ mr: 1 }}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave}>Save</Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
