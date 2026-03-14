import React, { useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box
} from '@mui/material';

export default function ChangeDisplayDialog({ open, onClose, change }) {
    const buttonRef = useRef(null);

    // Auto-focus the close button when opened so 'Enter' dismisses it
    useEffect(() => {
        if (open && buttonRef.current) {
            buttonRef.current.focus();
        }
    }, [open]);

    // Handle Enter key keydown on the dialog to ensure it closes
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            onClose();
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="xs"
            onKeyDown={handleKeyDown}
        >
            <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h5" fontWeight="bold">Change Due</Typography>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="h2" color="primary" fontWeight="bold">
                    ₱{Number(change || 0).toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Transaction Complete
                </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2, justifyContent: 'center' }}>
                <Button
                    ref={buttonRef}
                    onClick={onClose}
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{ py: 1.5, fontSize: '1.2rem' }}
                >
                    OK
                </Button>
            </DialogActions>
        </Dialog>
    );
}
