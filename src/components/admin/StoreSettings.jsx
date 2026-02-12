import React, { useState, useEffect } from 'react';
import {
    TextField, Box, Typography, Switch, FormControlLabel,
    InputAdornment, Stack, Paper, Alert, Button, CircularProgress
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { registerFingerprint } from '../../utils/biometrics';

export default function StoreSettings({ section, showSnackbar, user }) {
    const [loading, setLoading] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [biometricStatus, setBiometricStatus] = useState("");
    const [tempLogoUrl, setTempLogoUrl] = useState("");
    const [previewError, setPreviewError] = useState(false);
    const [settings, setSettings] = useState({
        storeName: 'PrintPlay',
        logoUrl: '',
        address: '',
        phone: '',
        mobile: '',
        email: '',
        tin: '',
        currencySymbol: '₱',
        taxRate: 0,
        receiptFooter: 'Thank you for your business!',
        showTaxBreakdown: false,
        drawerHotkey: { altKey: true, code: 'Backquote', display: 'Alt + `' },
    });

    const [capturingHotkey, setCapturingHotkey] = useState(false);

    useEffect(() => {
        loadSettings();
        checkBiometricStatus();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const docRef = doc(db, 'settings', 'config');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings(prev => ({ ...prev, ...data }));
                setTempLogoUrl(data.logoUrl || "");
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
            const result = await registerFingerprint(user.email, user.displayName || user.email);
            if (result && result.success) {
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
        if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;
        const modifier = e.altKey ? 'Alt' : (e.ctrlKey ? 'Ctrl' : (e.shiftKey ? 'Shift' : ''));
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

    const renderHeader = (title, subtitle) => (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight="bold">{title}</Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
    );

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            showSnackbar('Please select an image file.', 'error');
            return;
        }

        try {
            setUploadingLogo(true);
            const storageRef = ref(storage, `logos/store_logo_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            setSettings(prev => ({ ...prev, logoUrl: downloadURL }));
            showSnackbar('Logo uploaded successfully! Don\'t forget to save changes.', 'success');
        } catch (error) {
            console.error("Error uploading logo:", error);
            showSnackbar('Failed to upload logo.', 'error');
        } finally {
            setUploadingLogo(false);
        }
    };

    const convertGoogleDriveLink = (url) => {
        if (!url) return '';
        // Handle /file/d/ID/view
        const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileDMatch && fileDMatch[1]) {
            return `https://drive.google.com/thumbnail?id=${fileDMatch[1]}&sz=w1000`;
        }
        // Handle /open?id=ID
        const openIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (url.includes('drive.google.com') && openIdMatch && openIdMatch[1]) {
            return `https://drive.google.com/thumbnail?id=${openIdMatch[1]}&sz=w1000`;
        }
        return url;
    };

    const handleVerifyLogo = () => {
        setPreviewError(false);
        const converted = convertGoogleDriveLink(tempLogoUrl);
        setSettings(prev => ({ ...prev, logoUrl: converted }));
        setTempLogoUrl(converted);
        if (converted && converted !== tempLogoUrl) {
            showSnackbar('Google Drive link detected and converted!', 'info');
        }
    };

    const renderSaveButton = () => (
        <Box sx={{ mt: 4 }}>
            <Button variant="contained" onClick={handleSave} disabled={loading} size="large">
                {loading ? 'Saving...' : 'Save Changes'}
            </Button>
        </Box>
    );

    return (
        <Box sx={{ maxWidth: 800, p: 2 }}>
            {section === 'store' && (
                <Stack spacing={3}>
                    {renderHeader("Store Profile", "Basic information about your business shown on invoices and receipts.")}
                    <TextField
                        label="Store Name"
                        fullWidth
                        value={settings.storeName}
                        onChange={e => setSettings({ ...settings, storeName: e.target.value })}
                    />
                    <Box>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <TextField
                                label="Logo URL (Image Address)"
                                fullWidth
                                value={tempLogoUrl}
                                onChange={e => {
                                    setTempLogoUrl(e.target.value);
                                    setPreviewError(false);
                                }}
                                helperText="Provide a URL to an image (PNG, JPG). Supports direct Google Drive sharing links."
                            />
                            <Button
                                variant="outlined"
                                onClick={handleVerifyLogo}
                                sx={{ height: 56, whiteSpace: 'nowrap' }}
                            >
                                Preview
                            </Button>
                        </Stack>
                    </Box>
                    {settings.logoUrl && (
                        <Box mt={1}>
                            <Typography variant="caption" color="text.secondary">Preview:</Typography>
                            <Box
                                mt={0.5}
                                p={1}
                                border={1}
                                borderColor={previewError ? "error.main" : "divider"}
                                display="inline-block"
                                sx={{ borderRadius: 1, bgcolor: previewError ? 'error.lighter' : 'transparent' }}
                            >
                                <img
                                    key={settings.logoUrl}
                                    src={settings.logoUrl}
                                    alt=""
                                    height={100}
                                    style={{
                                        objectFit: 'contain',
                                        display: previewError || !settings.logoUrl ? 'none' : 'block'
                                    }}
                                    onError={() => {
                                        setPreviewError(true);
                                        showSnackbar('Image could not be loaded. Please check the URL or permissions.', 'error');
                                    }}
                                />
                                {(previewError || !settings.logoUrl) && (
                                    <Box sx={{ p: 2, textAlign: 'center' }}>
                                        <Typography variant="caption" color="error" sx={{ fontWeight: 'bold', display: 'block' }}>
                                            {previewError ? "Invalid or Private Image" : "No Logo Set"}
                                        </Typography>
                                        {previewError && (
                                            <Typography variant="caption" display="block" color="text.secondary">
                                                Ensure the file is shared as "Anyone with the link"
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Box>
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
                        <TextField label="Phone" fullWidth value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} />
                        <TextField label="Mobile" fullWidth value={settings.mobile} onChange={e => setSettings({ ...settings, mobile: e.target.value })} />
                        <TextField label="TIN" fullWidth value={settings.tin} onChange={e => setSettings({ ...settings, tin: e.target.value })} />
                        <TextField label="Email" fullWidth value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} />
                    </Stack>
                    {renderSaveButton()}
                </Stack>
            )}

            {section === 'pos' && (
                <Stack spacing={3}>
                    {renderHeader("POS Configuration", "General settings for the Point of Sale system.")}
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
                    {renderSaveButton()}
                </Stack>
            )}

            {section === 'hardware' && (
                <Stack spacing={3}>
                    {renderHeader("Hardware & Hotkeys", "Configure external hardware and keyboard shortcuts.")}
                    <Typography variant="subtitle2">Drawer Trigger Hotkey</Typography>
                    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box flex={1}>
                            <Typography variant="caption" color="text.secondary">Current Hotkey</Typography>
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
                    {renderSaveButton()}
                </Stack>
            )}

            {section === 'receipt' && (
                <Stack spacing={3}>
                    {renderHeader("Receipt Settings", "Customize how your receipts look and what information they show.")}
                    <TextField
                        label="Receipt Footer Message"
                        multiline
                        rows={3}
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
                    {renderSaveButton()}
                </Stack>
            )}

            {section === 'security' && (
                <Stack spacing={3}>
                    {renderHeader("Security & Biometrics", "Manage access controls and biometric authentication.")}
                    <Typography variant="body2" color="text.secondary">
                        Register a fingerprint or face ID (via Windows Hello) to quickly open the cash drawer.
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Current Status</Typography>
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
                </Stack>
            )}
        </Box>
    );
}
