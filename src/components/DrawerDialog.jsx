import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, CircularProgress
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';

// Firebase
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// Helpers
import { openDrawer } from '../utils/drawerService';
import { verifyFingerprint } from '../utils/biometrics';

export default function DrawerDialog({ open, onClose, user, showSnackbar }) {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    // Auto-reset and scan when opened
    useEffect(() => {
        if (open) {
            setPassword("");
            setLoading(false);
            // Optional: Auto-trigger scan on open
            handleBiometricOpen();
        }
    }, [open]);

    const handleBiometricOpen = async () => {
        setLoading(true);
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);

            if (!userSnap.exists()) throw new Error("User record not found.");

            const userData = userSnap.data();
            const storedBiometricId = userData.biometricId;

            if (!storedBiometricId) {
                // Silent return or slight UI indication if needed, 
                // but usually we just let them type password if no bio setup.
                setLoading(false);
                return;
            }

            const isVerified = await verifyFingerprint(storedBiometricId);
            if (isVerified) {
                await openDrawer(user, 'biometric');
                onClose();
            }
        } catch (err) {
            console.error("Biometric Error:", err);
            // Don't alert here, just let them fall back to password
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!password) return;

        setLoading(true);
        try {
            // Re-authenticate to prove identity
            await signInWithEmailAndPassword(auth, user.email, password);
            await openDrawer(user, 'manual');
            onClose();
        } catch (err) {
            console.error("Drawer Unlock Failed:", err);
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                showSnackbar?.("Incorrect password.", 'error');
            } else {
                showSnackbar?.("Failed to open drawer: " + err.message, 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Unlock Drawer</DialogTitle>
            <form onSubmit={handlePasswordSubmit}>
                <DialogContent>
                    <Typography variant="body2" gutterBottom>Enter password or scan finger.</Typography>
                    <TextField
                        autoFocus
                        label="Password"
                        type="password"
                        fullWidth
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={loading}
                    />
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2 }}>
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={handleBiometricOpen}
                        disabled={loading}
                        startIcon={<FingerprintIcon />}
                    >
                        {loading ? "Scanning..." : "Scan Finger"}
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'flex-end' }}>
                        <Button onClick={onClose} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="outlined" disabled={loading}>Use Password</Button>
                    </Box>
                </DialogActions>
            </form>
        </Dialog>
    );
}