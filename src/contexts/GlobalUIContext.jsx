import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField } from '@mui/material';

const GlobalUIContext = createContext(null);

export function GlobalUIProvider({ children }) {
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'info',
    });

    const [confirm, setConfirm] = useState({
        open: false,
        title: '',
        message: '',
        requireReason: false,
        reason: '',
        confirmLabel: 'Confirm',
        confirmColor: 'primary',
        onConfirm: null,
    });

    const showSnackbar = useCallback((message, severity = 'info') => {
        setSnackbar({ open: true, message, severity });
    }, []);

    const hideSnackbar = useCallback((event, reason) => {
        if (reason === 'clickaway') return;
        setSnackbar((prev) => ({ ...prev, open: false }));
    }, []);

    const showConfirm = useCallback(({ title, message, requireReason = false, confirmLabel = 'Confirm', confirmColor = 'primary', onConfirm }) => {
        setConfirm({
            open: true,
            title,
            message,
            requireReason,
            reason: '',
            confirmLabel,
            confirmColor,
            onConfirm
        });
    }, []);

    const handleConfirmClose = () => {
        setConfirm(prev => ({ ...prev, open: false }));
    };

    const handleConfirmExecute = () => {
        if (confirm.onConfirm) {
            confirm.onConfirm(confirm.requireReason ? confirm.reason : undefined);
        }
        handleConfirmClose();
    };

    return (
        <GlobalUIContext.Provider value={{ showSnackbar, showConfirm }}>
            {children}
            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={hideSnackbar}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={hideSnackbar}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirm.open}
                onClose={handleConfirmClose}
                fullWidth
                maxWidth="xs"
            >
                <DialogTitle>{confirm.title}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: confirm.requireReason ? 2 : 0 }}>
                        {confirm.message}
                    </DialogContentText>
                    {confirm.requireReason && (
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Reason Required"
                            fullWidth
                            variant="outlined"
                            value={confirm.reason}
                            onChange={(e) => setConfirm(prev => ({ ...prev, reason: e.target.value }))}
                        />
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleConfirmClose} color="inherit">Cancel</Button>
                    <Button
                        onClick={handleConfirmExecute}
                        color={confirm.confirmColor}
                        variant="contained"
                        disabled={confirm.requireReason && !confirm.reason.trim()}
                    >
                        {confirm.confirmLabel}
                    </Button>
                </DialogActions>
            </Dialog>
        </GlobalUIContext.Provider>
    );
}

export function useGlobalUI() {
    const context = useContext(GlobalUIContext);
    if (!context) {
        throw new Error('useGlobalUI must be used within a GlobalUIProvider');
    }
    return context;
}
