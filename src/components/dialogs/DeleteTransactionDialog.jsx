import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography
} from '@mui/material';

export default function DeleteTransactionDialog({ open, onClose, onConfirm }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState(false);

    const handleConfirm = () => {
        if (!reason.trim()) {
            setError(true);
            return;
        }
        onConfirm(reason);
        setReason('');
        setError(false);
        onClose();
    };

    const handleClose = () => {
        setReason('');
        setError(false);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
            <DialogTitle sx={{ color: 'error.main' }}>Delete Transaction</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" sx={{ mb: 2 }}>
                    Are you sure you want to delete this transaction? This action will remove it from the total calculations.
                </Typography>
                <TextField
                    label="Reason for Deletion (Required)"
                    fullWidth
                    multiline
                    rows={2}
                    value={reason}
                    onChange={(e) => {
                        setReason(e.target.value);
                        if (e.target.value.trim()) setError(false);
                    }}
                    error={error}
                    helperText={error ? "Reason is required" : ""}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleConfirm}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
}
