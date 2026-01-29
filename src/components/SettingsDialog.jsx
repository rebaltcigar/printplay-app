import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Tabs, Tab, Typography, Switch, FormControlLabel,
    InputAdornment, Stack, Paper
} from '@mui/material';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

export default function SettingsDialog({ open, onClose, onSettingsUpdated, showSnackbar }) {
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        storeName: 'PrintPlay',
        logoUrl: '',
        address: '',
        phone: '',
        email: '',
        currencySymbol: '₱',
        taxRate: 0,
        receiptFooter: 'Thank you for your business!',
        showTaxBreakdown: false,
        drawerHotkey: { altKey: true, code: 'Backquote', display: 'Alt + `' }, // Default
    });

    // Hotkey Capture State
    const [capturingHotkey, setCapturingHotkey] = useState(false);

    useEffect(() => {
        if (open) loadSettings();
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
                        <Tab label="Hardware / Hotkeys" />
                        <Tab label="Receipt" />
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
