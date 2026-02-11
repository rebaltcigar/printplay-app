import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Tabs, Tab, Typography, Switch, FormControlLabel,
    InputAdornment, Stack, Paper, Alert
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'; // Added updateDoc
import { db } from '../firebase';
import { registerFingerprint } from '../utils/biometrics'; // Added import

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

export default function SettingsDialog({ open, onClose, onSettingsUpdated, showSnackbar, user }) {
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [biometricStatus, setBiometricStatus] = useState("");

    // Settings State
    const [settings, setSettings] = useState({
        storeName: 'PrintPlay',
        logoUrl: '',
        address: '',
        address: '',
        phone: '',
        mobile: '', // ADDED
        email: '',
        tin: '', // ADDED
        currencySymbol: '₱',
        taxRate: 0,
        receiptFooter: 'Thank you for your business!',
        showTaxBreakdown: false,
        drawerHotkey: { altKey: true, code: 'Backquote', display: 'Alt + `' }, // Default
    });

    // Hotkey Capture State
    const [capturingHotkey, setCapturingHotkey] = useState(false);

    useEffect(() => {
        if (open) {
            loadSettings();
            checkBiometricStatus();
        }
    }, [open]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const docRef = doc(db, 'settings', 'config');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Merge defaults with loaded data to ensure all fields exist
                setSettings(prev => ({ ...prev, ...data }));
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        } finally {
            setLoading(false);
        }
    };

    const checkBiometricStatus = async () => {
        if (!user || !user.uid) return;
        try {
            const userRef = doc(db, 'users', user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists() && snap.data().biometricId) {
                setBiometricStatus("Counter registered.");
            } else {
                setBiometricStatus("");
            }
        } catch (e) { console.error(e); }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await setDoc(doc(db, 'settings', 'config'), settings);
            if (showSnackbar) showSnackbar('Settings saved successfully!', 'success');
            if (onSettingsUpdated) onSettingsUpdated(settings);
        } catch (e) {
            console.error("Error saving settings:", e);
            showSnackbar?.("Failed to save settings.", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterBiometrics = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // 1. Trigger WebAuthn Registration
            const result = await registerFingerprint(user.email, user.displayName || user.email);

            if (result && result.success) {
                // 2. Save ID to User Profile (Matching Prod Schema)
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    biometricId: result.credentialId,
                    biometricRegisteredAt: new Date().toISOString()
                });

                showSnackbar("Fingerprint registered successfully!", "success");
                setBiometricStatus("Just registered!");
            }
        } catch (err) {
            console.error("Bio Registration Failed:", err);
            showSnackbar("Registration failed: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCaptureHotkey = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore modifier-only presses
        if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;

        const modifier = e.altKey ? 'Alt' : (e.ctrlKey ? 'Ctrl' : (e.shiftKey ? 'Shift' : ''));
        if (!modifier && e.key.length === 1) {
            // Allow single keys if user really wants, but warn?
        }

        const display = `${modifier ? modifier + ' + ' : ''}${e.key.toUpperCase()}`;

        setSettings(prev => ({
            ...prev,
            drawerHotkey: {
                altKey: e.altKey,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                key: e.key,
                code: e.code,
                display
            }
        }));
        setCapturingHotkey(false);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Admin Settings</DialogTitle>
            <DialogContent dividers sx={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tab} onChange={(e, v) => setTab(v)}>
                        <Tab label="Store Profile" />
                        <Tab label="POS Config" />
                        <Tab label="Hardware" />
                        <Tab label="Receipt" />
                        <Tab label="Security" />
                    </Tabs>
                </Box>

                {/* 1. STORE PROFILE */}
                <TabPanel value={tab} index={0}>
                    <Stack spacing={2}>
                        <TextField
                            label="Store Name"
                            fullWidth
                            value={settings.storeName}
                            onChange={e => setSettings({ ...settings, storeName: e.target.value })}
                        />
                        <TextField
                            label="Logo URL (Image Address)"
                            fullWidth
                            value={settings.logoUrl}
                            onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
                            helperText="URL to an image file (PNG, JPG)"
                        />
                        {settings.logoUrl && (
                            <Box mt={1} p={1} border={1} borderColor="divider" display="inline-block">
                                <img src={settings.logoUrl} alt="Logo Preview" height={50} onError={(e) => e.target.style.display = 'none'} />
                            </Box>
                        )}
                        <TextField
                            label="Address"
                            fullWidth
                            multiline
                            rows={2}
                            value={settings.address}
                            onChange={e => setSettings({ ...settings, address: e.target.value })}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Phone"
                                fullWidth
                                value={settings.phone}
                                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                            />
                            <TextField
                                label="Mobile"
                                fullWidth
                                value={settings.mobile}
                                onChange={e => setSettings({ ...settings, mobile: e.target.value })}
                            />
                            <TextField
                                label="TIN"
                                fullWidth
                                value={settings.tin}
                                onChange={e => setSettings({ ...settings, tin: e.target.value })}
                            />
                            <TextField
                                label="Email"
                                fullWidth
                                value={settings.email}
                                onChange={e => setSettings({ ...settings, email: e.target.value })}
                            />
                        </Stack>
                    </Stack>
                </TabPanel>

                {/* 2. POS CONFIG */}
                <TabPanel value={tab} index={1}>
                    <Stack spacing={2}>
                        <TextField
                            label="Currency Symbol"
                            fullWidth
                            value={settings.currencySymbol}
                            onChange={e => setSettings({ ...settings, currencySymbol: e.target.value })}
                        />
                        <TextField
                            label="Default Tax Rate (%)"
                            type="number"
                            fullWidth
                            value={settings.taxRate}
                            onChange={e => setSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                            InputProps={{
                                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            }}
                        />
                    </Stack>
                </TabPanel>

                {/* 3. HARDWARE & HOTKEYS */}
                <TabPanel value={tab} index={2}>
                    <Typography variant="h6" gutterBottom>Drawer Trigger</Typography>
                    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box flex={1}>
                            <Typography variant="subtitle2">Current Hotkey</Typography>
                            <Typography variant="h5" color="primary" fontWeight="bold">
                                {settings.drawerHotkey?.display || 'None'}
                            </Typography>
                        </Box>
                        <Button
                            variant={capturingHotkey ? "contained" : "outlined"}
                            color={capturingHotkey ? "error" : "primary"}
                            onClick={() => setCapturingHotkey(!capturingHotkey)}
                            onKeyDown={capturingHotkey ? handleCaptureHotkey : undefined}
                        >
                            {capturingHotkey ? "Press Keys Now..." : "Change Hotkey"}
                        </Button>
                    </Paper>
                    {capturingHotkey && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Click the button and press your desired key combination (e.g., Alt + D).
                        </Typography>
                    )}
                </TabPanel>

                {/* 4. RECEIPT SETTINGS */}
                <TabPanel value={tab} index={3}>
                    <Stack spacing={2}>
                        <TextField
                            label="Receipt Footer Message"
                            multiline
                            rows={2}
                            fullWidth
                            value={settings.receiptFooter}
                            onChange={e => setSettings({ ...settings, receiptFooter: e.target.value })}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={settings.showTaxBreakdown}
                                    onChange={e => setSettings({ ...settings, showTaxBreakdown: e.target.checked })}
                                />
                            }
                            label="Show Tax Breakdown on Receipt"
                        />
                    </Stack>
                </TabPanel>

                {/* 5. SECURITY (Biometrics) */}
                <TabPanel value={tab} index={4}>
                    <Stack spacing={2}>
                        <Typography variant="h6">Biometric Access</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Register a fingerprint or face ID (via Windows Hello) to quickly open the cash drawer without typing your password.
                        </Typography>

                        <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                                <Typography variant="subtitle2">Current Status</Typography>
                                <Typography variant="body1" fontWeight="bold" color={biometricStatus ? "success.main" : "text.secondary"}>
                                    {biometricStatus || "Not Registered"}
                                </Typography>
                            </Box>
                            <Button
                                variant="contained"
                                startIcon={<FingerprintIcon />}
                                onClick={handleRegisterBiometrics}
                                disabled={loading || !user}
                            >
                                Register Fingerprint
                            </Button>
                        </Paper>

                        {!window.PublicKeyCredential && (
                            <Alert severity="warning">
                                Biometrics not supported on this device/browser.
                            </Alert>
                        )}
                    </Stack>
                </TabPanel>

            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button variant="contained" onClick={handleSave} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Settings'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

