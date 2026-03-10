import React, { useState } from 'react';
import {
    Box,
    Card,
    Typography,
    TextField,
    Button,
    Stack,
    Alert,
    CircularProgress
} from '@mui/material';
import { supabase } from '../../supabase';
import LockResetIcon from '@mui/icons-material/LockReset';

/**
 * A full-screen overlay component shown to users who log in with a temporary password (requires_password_reset: true).
 * Blocks access to the rest of the application until they set their own permanent password.
 */
export default function ForcePasswordReset({ onComplete }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError("Password must be at least 6 characters long.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (!user) throw new Error("No authenticated user found.");

            // 1. Update password via Supabase Auth
            const { error: updateErr } = await supabase.auth.updateUser({ password });
            if (updateErr) throw updateErr;

            // 2. Clear the flag in profiles
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({ requires_password_reset: false })
                .eq('id', user.id);
            if (profileErr) throw profileErr;

            // 3. Notify parent App.jsx to unblock routing
            if (onComplete) onComplete();

        } catch (err) {
            console.error("Failed to reset password:", err);
            setError(err.message || "Failed to update password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default'
            }}
        >
            <Card sx={{ maxWidth: 400, width: '100%', p: 4, textAlign: 'center' }}>
                <LockResetIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />

                <Typography variant="h5" fontWeight={600} gutterBottom>
                    Set Your Password
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={4}>
                    You are logging in with a temporary password provided by your administrator.
                    Please set a permanent password to continue securely.
                </Typography>

                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        {error && <Alert severity="error">{error}</Alert>}

                        <TextField
                            label="New Password"
                            type="password"
                            fullWidth
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />

                        <TextField
                            label="Confirm New Password"
                            type="password"
                            fullWidth
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={loading}
                        />

                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            fullWidth
                            disabled={loading}
                            startIcon={loading ? <CircularProgress size={20} /> : null}
                        >
                            {loading ? "Updating..." : "Update Password & Continue"}
                        </Button>
                    </Stack>
                </form>
            </Card>
        </Box>
    );
}
