import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, CircularProgress, Alert
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';

// Firebase
import { auth, db } from '../firebase';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// Helpers
import { openDrawer } from '../utils/drawerService';
import { verifyFingerprint } from '../utils/biometrics';

export default function DrawerDialog({ open, onClose, user, showSnackbar }) {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [internalError, setInternalError] = useState("");

    // Auto-reset and scan when opened
    useEffect(() => {
        if (open) {
            setPassword("");
            setLoading(false);
            setInternalError(""); // Reset error
            // Optional: Auto-trigger scan on open
            handleBiometricOpen();
        }
    }, [open]);

    const handleBiometricOpen = async () => {
        if (!user || !user.uid) {
            setInternalError("User identity invalid.");
            return;
        }

        // Don't set loading true immediately to avoid flickering if not set up
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);

            if (!userSnap.exists()) {
                setInternalError("User record not found.");
                return;
            }

            const userData = userSnap.data();
            const storedBiometricId = userData.biometricId;

            if (!storedBiometricId) {
                // Inform user why it's not popping up
                setInternalError("No fingerprint registered for this account.");
                return;
            }

            setLoading(true);
            const isVerified = await verifyFingerprint(storedBiometricId);
            if (isVerified) {
                await openDrawer(user, 'biometric');
                onClose();
            } else {
                setInternalError("Fingerprint failed. You may need to Register (Settings > Security).");
            }
        } catch (err) {
            console.error("Biometric Error:", err);
            setInternalError("Scanner error: " + (err.message || "Unknown"));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!password) return;

        setLoading(true);
        setInternalError("");
        try {
            // Use Re-Authentication instead of Sign-In to verify current session
            const credential = EmailAuthProvider.credential(user.email, password);
            if (!auth.currentUser) throw new Error("No active session.");

            await reauthenticateWithCredential(auth.currentUser, credential);

            await openDrawer(user, 'manual');
            onClose();
        } catch (err) {
            console.error("Drawer Unlock Failed:", err);
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setInternalError("Incorrect password.");
            } else {
                setInternalError("Error: " + err.message);
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
                    <Box mb={2}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Account: <strong>{user?.email}</strong>
                        </Typography>
                        <Typography variant="body2">
                            Enter password or scan finger.
                        </Typography>
                    </Box>

                    {internalError && (
                        <Alert severity="error" sx={{ mb: 2 }}>{internalError}</Alert>
                    )}

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
                        {loading ? "Verifying..." : "Retry Scanner"}
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'flex-end' }}>
                        <Button onClick={onClose} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="outlined" disabled={loading}>Unlock</Button>
                    </Box>
                </DialogActions>
            </form>
        </Dialog>
    );
}
