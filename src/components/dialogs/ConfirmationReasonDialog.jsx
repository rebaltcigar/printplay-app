import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Stack
} from '@mui/material';

/**
 * A reusable dialog for confirmations that may require a reason.
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onConfirm: (reason) => void
 * - title: string
 * - message: string
 * - requireReason: boolean (default: true)
 * - confirmText: string (default: 'Confirm')
 * - confirmColor: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' (default: 'error')
 */
export default function ConfirmationReasonDialog({
    open,
    onClose,
    onConfirm,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    requireReason = true,
    confirmText = "Confirm",
    confirmColor = "error"
}) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState(false);

    const handleConfirm = () => {
        if (requireReason && !reason.trim()) {
            setError(true);
            return;
        }
        onConfirm(reason.trim());
        handleClose();
    };

    const handleClose = () => {
        setReason('');
        setError(false);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
            <DialogTitle sx={{ color: confirmColor === 'error' ? 'error.main' : 'inherit' }}>
                {title}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="body2">
                        {message}
                    </Typography>
                    {requireReason && (
                        <TextField
                            label="Reason (Required)"
                            fullWidth
                            multiline
                            rows={2}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (e.target.value.trim()) setError(false);
                            }}
                            error={error}
                            helperText={error ? "Reason is required to proceed." : ""}
                            autoFocus
                        />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant="contained" color={confirmColor} onClick={handleConfirm}>
                    {confirmText}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
