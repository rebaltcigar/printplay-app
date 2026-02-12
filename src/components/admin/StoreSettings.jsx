import React, { useState, useEffect } from 'react';
import {
    TextField, Box, Typography, Switch, FormControlLabel,
    InputAdornment, Stack, Paper, Alert, Button, CircularProgress, LinearProgress
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import {
    collection, query, getDocs, updateDoc, writeBatch, doc, getDoc, setDoc, orderBy
} from 'firebase/firestore'; import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { registerFingerprint } from '../../utils/biometrics';
import { generateDisplayId, generateBatchIds } from '../../utils/idGenerator';

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
        idPrefixes: {
            shifts: 'SHIFT',
            expenses: 'EXP',
            transactions: 'TX',
            payroll: 'PAY'
        }
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

    const handleBackfillShifts = async () => {
        if (!confirm("This will generate sequential IDs for all shifts missing them based on chronolical order. Continue?")) return;
        setLoading(true);
        try {
            const q = query(collection(db, "shifts"));
            const snap = await getDocs(q);
            let count = 0;
            const sortedDocs = snap.docs.sort((a, b) => {
                const tA = a.data().startTime?.seconds || 0;
                const tB = b.data().startTime?.seconds || 0;
                return tA - tB;
            });

            for (const d of sortedDocs) {
                const data = d.data();
                if (!data.displayId) {
                    const newId = await generateDisplayId("shifts", settings.idPrefixes?.shifts || "SHIFT");
                    await updateDoc(d.ref, { displayId: newId });
                    count++;
                }
            }
            showSnackbar?.(`Backfilled IDs for ${count} shifts.`, 'success');
        } catch (e) {
            console.error("Backfill failed:", e);
            showSnackbar?.("Backfill failed. Check console.", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBackfillTransactions = async () => {
        if (!window.confirm("This will generate sequential IDs for ALL transactions missing them. Continue?")) return;
        setLoading(true);
        try {
            const q = query(collection(db, "transactions"));
            const snap = await getDocs(q);
            const missingExpenses = [];
            const missingTx = [];
            snap.docs.forEach(d => {
                const data = d.data();
                if (!data.displayId) {
                    if (data.item === 'Expenses') missingExpenses.push(d);
                    else missingTx.push(d);
                }
            });
            let countExp = 0;
            let countTx = 0;
            const sortFn = (a, b) => (a.data().timestamp?.seconds || 0) - (b.data().timestamp?.seconds || 0);
            missingExpenses.sort(sortFn);
            missingTx.sort(sortFn);

            const expIds = await generateBatchIds("expenses", settings.idPrefixes?.expenses || "EXP", missingExpenses.length);
            const txIds = await generateBatchIds("transactions", settings.idPrefixes?.transactions || "TX", missingTx.length);

            const batchLimit = 500;
            let batch = writeBatch(db);
            let ops = 0;
            const commitBatch = async () => {
                await batch.commit();
                batch = writeBatch(db);
                ops = 0;
            };
            for (let i = 0; i < missingExpenses.length; i++) {
                batch.update(missingExpenses[i].ref, { displayId: expIds[i] });
                ops++;
                countExp++;
                if (ops >= batchLimit) await commitBatch();
            }
            for (let i = 0; i < missingTx.length; i++) {
                batch.update(missingTx[i].ref, { displayId: txIds[i] });
                ops++;
                countTx++;
                if (ops >= batchLimit) await commitBatch();
            }
            if (ops > 0) await commitBatch();
            showSnackbar?.(`Backfilled: ${countExp} Expenses, ${countTx} Transactions.`, 'success');
        } catch (e) {
            console.error("Backfill failed:", e);
            showSnackbar?.("Backfill failed. Check console.", 'error');
        } finally {
            setLoading(false);
        }
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
        <Box sx={{ maxWidth: 800, p: 2, position: 'relative' }}>
            {loading && (
                <LinearProgress
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        borderRadius: '4px 4px 0 0',
                        zIndex: 20
                    }}
                />
            )}
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

            {section === 'ids' && (
                <Stack spacing={3}>
                    {renderHeader("ID System Configuration", "Manage the prefixes for unique system identifiers.")}
                    <Alert severity="info">
                        Changing these prefixes will only affect <strong>new</strong> records. Existing records will keep their old IDs.
                    </Alert>
                    <TextField
                        label="Shift ID Prefix"
                        fullWidth
                        value={settings.idPrefixes?.shifts || ''}
                        onChange={e => setSettings({
                            ...settings,
                            idPrefixes: { ...settings.idPrefixes, shifts: e.target.value.toUpperCase() }
                        })}
                        placeholder="e.g. SHIFT"
                        helperText="Used for: Daily employee shifts"
                    />
                    <TextField
                        label="Transaction ID Prefix"
                        fullWidth
                        value={settings.idPrefixes?.transactions || ''}
                        onChange={e => setSettings({
                            ...settings,
                            idPrefixes: { ...settings.idPrefixes, transactions: e.target.value.toUpperCase() }
                        })}
                        placeholder="e.g. TX"
                        helperText="Used for: Sales and service items"
                    />
                    <TextField
                        label="Expense ID Prefix"
                        fullWidth
                        value={settings.idPrefixes?.expenses || ''}
                        onChange={e => setSettings({
                            ...settings,
                            idPrefixes: { ...settings.idPrefixes, expenses: e.target.value.toUpperCase() }
                        })}
                        placeholder="e.g. EXP"
                        helperText="Used for: Store expenses and stock-in"
                    />
                    <TextField
                        label="Payroll ID Prefix"
                        fullWidth
                        value={settings.idPrefixes?.payroll || ''}
                        onChange={e => setSettings({
                            ...settings,
                            idPrefixes: { ...settings.idPrefixes, payroll: e.target.value.toUpperCase() }
                        })}
                        placeholder="e.g. PAY"
                        helperText="Used for: Employee salary runs"
                    />
                    {renderSaveButton()}

                    <Box sx={{ mt: 4 }}>
                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                            Maintenance & Repair
                        </Typography>
                        <Stack spacing={2} sx={{ mb: 2 }}>
                            <Alert severity="warning">
                                Use these tools to generate missing IDs for old records. Chronological order is preserved.
                            </Alert>
                        </Stack>
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                            <Button
                                variant="outlined"
                                color="warning"
                                onClick={handleBackfillShifts}
                                disabled={loading}
                            >
                                {loading ? "Processing..." : "Fix Missing Shift IDs"}
                            </Button>
                            <Button
                                variant="outlined"
                                color="warning"
                                onClick={handleBackfillTransactions}
                                disabled={loading}
                            >
                                {loading ? "Processing..." : "Fix Missing Transaction IDs"}
                            </Button>
                        </Stack>
                    </Box>
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
