import React, { useState, useEffect } from 'react';
import {
    TextField, Box, Typography, Switch, FormControlLabel,
    InputAdornment, Stack, Paper, Alert, Button, CircularProgress, LinearProgress, MenuItem,
    Autocomplete, IconButton, Tooltip
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { supabase } from '../../supabase';
import { registerFingerprint } from '../../services/biometricService';
import { convertLogoUrl } from '../../services/brandingService';
import PageHeader from '../common/PageHeader';
import ValidatedInput from '../common/ValidatedInput';

const PH_BANKS = [
    'BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank',
    'Security Bank', 'China Bank', 'RCBC', 'PNB', 'EastWest Bank',
    'Philtrust Bank', 'PBCOM', 'Bank of Commerce', 'Maybank',
    'Bank of Makati', 'Citystate Savings Bank', 'PSBank', 'UCPB'
].sort();

export default function StoreSettings({ section, showSnackbar, user }) {
    const [loading, setLoading] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [biometricStatus, setBiometricStatus] = useState("");
    const [tempLogoUrl, setTempLogoUrl] = useState("");
    const [previewError, setPreviewError] = useState(false);
    const [settings, setSettings] = useState({
        storeName: 'Kunek',
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
        checkoutHotkey: { code: 'F10', key: 'F10', display: 'F10' },
        idPrefixes: {
            shifts: 'SHIFT',
            expenses: 'EXP',
            transactions: 'TX',
            payroll: 'PAY'
        },
        shiftDurationHours: 12,
        shiftAlertMinutes: 30,
        schedulePostingFrequency: 'weekly',
        pcRentalEnabled: true,
        pcRentalMode: 'external', // 'external' = third-party timer | 'builtin' = Kunek v0.6
        pcRentalServiceId: '',    // service id of the catalog item used for PC billing
        invoiceDueDays: 7,        // Default days until an invoice is due
        paymentMethods: {
            cash: { enabled: true },
            charge: { enabled: true },
            card: { enabled: false },
            gcash: { enabled: false, label: 'GCash', accountName: '', accountNumber: '', showDetails: false, qrUrl: '' },
            maya: { enabled: false, label: 'Maya', accountName: '', accountNumber: '', showDetails: false, qrUrl: '' },
            banks: [] // Array of { id, bankName, accountName, accountNumber, label, enabled, showDetails, qrUrl }
        }
    });

    const [capturingHotkey, setCapturingHotkey] = useState(false);
    const [capturingCheckoutHotkey, setCapturingCheckoutHotkey] = useState(false);
    const [saleServices, setSaleServices] = useState([]); // for pcRentalServiceId picker

    useEffect(() => {
        loadSettings();
        checkBiometricStatus();
        if (section === 'pos') {
            supabase.from('products').select('*').eq('financial_category', 'Sale').order('name')
                .then(({ data }) => {
                    if (data) setSaleServices(data.filter(s => s.active !== false));
                })
                .catch(() => { });
        }
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const { data } = await supabase.from('settings').select('*').eq('id', 'config').single();
            if (data) {
                const mapped = {
                    storeName: data.store_name || 'Kunek',
                    logoUrl: data.logo_url || '',
                    address: data.address || '',
                    phone: data.phone || '',
                    mobile: data.mobile || '',
                    email: data.email || '',
                    tin: data.tin || '',
                    currencySymbol: data.currency_symbol || '₱',
                    taxRate: data.tax_rate || 0,
                    receiptFooter: data.receipt_footer || 'Thank you for your business!',
                    showTaxBreakdown: data.show_tax_breakdown || false,
                    drawerHotkey: data.drawer_hotkey || { altKey: true, code: 'Backquote', display: 'Alt + `' },
                    checkoutHotkey: data.checkout_hotkey || { code: 'F10', key: 'F10', display: 'F10' },
                    idPrefixes: data.id_prefixes || { shifts: 'SHIFT', expenses: 'EXP', transactions: 'TX', payroll: 'PAY' },
                    shiftDurationHours: data.shift_duration_hours || 12,
                    shiftAlertMinutes: data.shift_alert_minutes || 30,
                    schedulePostingFrequency: data.schedule_posting_frequency || 'weekly',
                    pcRentalEnabled: data.pc_rental_enabled || false,
                    pcRentalMode: data.pc_rental_mode || 'external',
                    pcRentalServiceId: data.pc_rental_service_id || '',
                    invoiceDueDays: data.invoice_due_days || 7,
                    paymentMethods: data.payment_methods || { cash: { enabled: true }, charge: { enabled: true }, card: { enabled: false }, gcash: { enabled: false, label: 'GCash', accountName: '', accountNumber: '', showDetails: false, qrUrl: '' }, maya: { enabled: false, label: 'Maya', accountName: '', accountNumber: '', showDetails: false, qrUrl: '' }, banks: [] },
                };
                setSettings(prev => ({ ...prev, ...mapped }));
                setTempLogoUrl(mapped.logoUrl);
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        } finally {
            setLoading(false);
        }
    };

    const checkBiometricStatus = async () => {
        if (!user?.id && !user?.uid) return;
        try {
            const { data } = await supabase.from('profiles').select('biometric_id').eq('id', user.id || user.uid).single();
            setBiometricStatus(data?.biometric_id ? "Counter registered." : "");
        } catch (e) { console.error(e); }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            const payload = {
                id: 'config',
                store_name: settings.storeName,
                logo_url: settings.logoUrl,
                address: settings.address,
                phone: settings.phone,
                mobile: settings.mobile,
                email: settings.email,
                tin: settings.tin,
                currency_symbol: settings.currencySymbol,
                tax_rate: settings.taxRate,
                receipt_footer: settings.receiptFooter,
                show_tax_breakdown: settings.showTaxBreakdown,
                drawer_hotkey: settings.drawerHotkey,
                checkout_hotkey: settings.checkoutHotkey,
                id_prefixes: settings.idPrefixes,
                shift_duration_hours: settings.shiftDurationHours,
                shift_alert_minutes: settings.shiftAlertMinutes,
                schedule_posting_frequency: settings.schedulePostingFrequency,
                pc_rental_enabled: settings.pcRentalEnabled,
                pc_rental_mode: settings.pcRentalMode,
                pc_rental_service_id: settings.pcRentalServiceId,
                invoice_due_days: settings.invoiceDueDays,
                payment_methods: settings.paymentMethods,
            };
            const { error } = await supabase.from('settings').upsert([payload]);
            if (error) throw error;
            showSnackbar?.('Settings saved successfully!', 'success');
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
                await supabase.from('profiles').update({ biometric_id: result.credentialId, biometric_registered_at: new Date().toISOString() }).eq('id', user.id || user.uid);
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

    const buildHotkeyObj = (e) => {
        const modifier = e.altKey ? 'Alt' : (e.ctrlKey ? 'Ctrl' : (e.shiftKey ? 'Shift' : ''));
        return {
            altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
            key: e.key, code: e.code,
            display: `${modifier ? modifier + ' + ' : ''}${e.key.toUpperCase()}`,
        };
    };

    const handleCaptureHotkey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;
        setSettings(prev => ({ ...prev, drawerHotkey: buildHotkeyObj(e) }));
        setCapturingHotkey(false);
    };

    const handleCaptureCheckoutHotkey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return;
        setSettings(prev => ({ ...prev, checkoutHotkey: buildHotkeyObj(e) }));
        setCapturingCheckoutHotkey(false);
    };

    const renderHeader = (title, subtitle) => (
        <PageHeader title={title} subtitle={subtitle} />
    );

    const handleFileChange = async (e, type = 'logo', method = null, bankIndex = null) => {
        const file = e.target.files[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            showSnackbar('Please select an image file.', 'error');
            return;
        }

        try {
            if (type === 'logo') setUploadingLogo(true);
            else setLoading(true);

            const storagePath = type === 'logo' ? `logos/store_logo_${Date.now()}` : `qrcodes/${method}_${Date.now()}`;
            const { error: uploadError } = await supabase.storage.from('assets').upload(storagePath, file, { upsert: true });
            if (uploadError) throw uploadError;
            const downloadURL = supabase.storage.from('assets').getPublicUrl(storagePath).data.publicUrl;

            if (type === 'logo') {
                setSettings(prev => ({ ...prev, logoUrl: downloadURL }));
                showSnackbar('Logo uploaded successfully! Don\'t forget to save changes.', 'success');
            } else if (method === 'bank') {
                const newBanks = [...(settings.paymentMethods.banks || [])];
                if (newBanks[bankIndex]) {
                    newBanks[bankIndex].qrUrl = downloadURL;
                    setSettings(prev => ({
                        ...prev,
                        paymentMethods: { ...prev.paymentMethods, banks: newBanks }
                    }));
                }
                showSnackbar(`Bank QR code uploaded successfully!`, 'success');
            } else {
                setSettings(prev => ({
                    ...prev,
                    paymentMethods: {
                        ...prev.paymentMethods,
                        [method]: { ...prev.paymentMethods[method], qrUrl: downloadURL }
                    }
                }));
                showSnackbar(`${method.toUpperCase()} QR code uploaded successfully!`, 'success');
            }
        } catch (error) {
            console.error(`Error uploading ${type}:`, error);
            showSnackbar(`Failed to upload ${type}.`, 'error');
        } finally {
            setUploadingLogo(false);
            setLoading(false);
        }
    };

    const handleVerifyLogo = () => {
        setPreviewError(false);
        const converted = convertLogoUrl(tempLogoUrl);
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

    const handleConvertQRLink = (methodKey, index = null) => {
        if (methodKey === 'bank') {
            const newBanks = [...(settings.paymentMethods.banks || [])];
            if (newBanks[index]) {
                const converted = convertLogoUrl(newBanks[index].qrUrl);
                if (converted !== newBanks[index].qrUrl) {
                    newBanks[index].qrUrl = converted;
                    setSettings({
                        ...settings,
                        paymentMethods: { ...settings.paymentMethods, banks: newBanks }
                    });
                    showSnackbar('Google Drive link converted!', 'info');
                }
            }
        } else {
            const method = settings.paymentMethods[methodKey];
            const converted = convertLogoUrl(method.qrUrl);
            if (converted !== method.qrUrl) {
                setSettings({
                    ...settings,
                    paymentMethods: {
                        ...settings.paymentMethods,
                        [methodKey]: { ...method, qrUrl: converted }
                    }
                });
                showSnackbar('Google Drive link converted!', 'info');
            }
        }
    };

    const renderPaymentMethod = (key, title, hasDetails = true) => {
        const method = settings.paymentMethods?.[key] || {};
        return (
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: '12px' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle1" fontWeight="bold">{title}</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {method.enabled ? 'Currently active at checkout.' : 'Hidden from checkout.'}
                        </Typography>
                    </Box>
                    <Switch
                        checked={!!method.enabled}
                        onChange={e => setSettings({
                            ...settings,
                            paymentMethods: {
                                ...settings.paymentMethods,
                                [key]: { ...method, enabled: e.target.checked }
                            }
                        })}
                    />
                </Stack>

                {method.enabled && hasDetails && (
                    <Stack spacing={2} sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            label="Display Label"
                            fullWidth
                            size="small"
                            placeholder={title}
                            value={method.label || ''}
                            onChange={e => setSettings({
                                ...settings,
                                paymentMethods: {
                                    ...settings.paymentMethods,
                                    [key]: { ...method, label: e.target.value }
                                }
                            })}
                        />
                        <Stack direction="row" spacing={2}>
                            <ValidatedInput
                                label="Account Name"
                                fullWidth
                                size="small"
                                required
                                value={method.accountName || ''}
                                onChange={val => setSettings({
                                    ...settings,
                                    paymentMethods: {
                                        ...settings.paymentMethods,
                                        [key]: { ...method, accountName: val }
                                    }
                                })}
                            />
                            <ValidatedInput
                                label="Account Number / Mobile"
                                fullWidth
                                size="small"
                                required
                                rule={key === 'gcash' || key === 'maya' ? 'phone' : 'text'}
                                value={method.accountNumber || ''}
                                onChange={val => setSettings({
                                    ...settings,
                                    paymentMethods: {
                                        ...settings.paymentMethods,
                                        [key]: { ...method, accountNumber: val }
                                    }
                                })}
                            />
                        </Stack>

                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={!!method.showDetails}
                                    onChange={e => setSettings({
                                        ...settings,
                                        paymentMethods: {
                                            ...settings.paymentMethods,
                                            [key]: { ...method, showDetails: e.target.checked }
                                        }
                                    })}
                                />
                            }
                            label={<Typography variant="body2">Show details on checkout modal</Typography>}
                        />

                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                QR Code (Supports Google Drive Links)
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                                <TextField
                                    label="QR Code URL / Link"
                                    fullWidth
                                    size="small"
                                    value={method.qrUrl || ''}
                                    onChange={e => setSettings({
                                        ...settings,
                                        paymentMethods: {
                                            ...settings.paymentMethods,
                                            [key]: { ...method, qrUrl: e.target.value }
                                        }
                                    })}
                                    helperText="Paste a direct image link or a Google Drive sharing link."
                                />
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleConvertQRLink(key)}
                                    sx={{ height: 40, mt: 0 }}
                                >
                                    Preview
                                </Button>
                            </Stack>
                            {method.qrUrl && (
                                <Box mt={1.5} sx={{ textAlign: 'center', p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                                    <img
                                        src={method.qrUrl}
                                        alt="QR Preview"
                                        style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </Box>
                            )}
                        </Box>
                    </Stack>
                )}
            </Paper>
        );
    };

    const renderBanksSection = () => {
        const banks = settings.paymentMethods?.banks || [];
        const addBank = () => {
            const newBanks = [...banks, {
                id: Date.now().toString(),
                bankName: '',
                accountName: '',
                accountNumber: '',
                label: 'Bank Transfer',
                enabled: true,
                showDetails: true,
                qrUrl: ''
            }];
            setSettings({ ...settings, paymentMethods: { ...settings.paymentMethods, banks: newBanks } });
        };

        const removeBank = (id) => {
            const newBanks = banks.filter(b => b.id !== id);
            setSettings({ ...settings, paymentMethods: { ...settings.paymentMethods, banks: newBanks } });
        };

        const updateBank = (index, updates) => {
            const newBanks = [...banks];
            newBanks[index] = { ...newBanks[index], ...updates };
            setSettings({ ...settings, paymentMethods: { ...settings.paymentMethods, banks: newBanks } });
        };

        return (
            <Box sx={{ mb: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="bold">Bank Accounts</Typography>
                    <Button startIcon={<AddCircleOutlineIcon />} onClick={addBank}>Add Bank</Button>
                </Stack>

                {banks.length === 0 && (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover', borderStyle: 'dashed' }}>
                        <Typography variant="body2" color="text.secondary">No bank accounts configured.</Typography>
                    </Paper>
                )}

                {banks.map((bank, index) => (
                    <Paper key={bank.id} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: '12px' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Box sx={{ flex: 1, mr: 2 }}>
                                <Autocomplete
                                    options={PH_BANKS}
                                    size="small"
                                    value={bank.bankName || null}
                                    onChange={(e, val) => updateBank(index, { bankName: val })}
                                    renderInput={(params) => <TextField {...params} label="Select Bank" required />}
                                />
                            </Box>
                            <Stack direction="row" spacing={1}>
                                <Switch
                                    checked={!!bank.enabled}
                                    onChange={e => updateBank(index, { enabled: e.target.checked })}
                                />
                                <IconButton color="error" size="small" onClick={() => removeBank(bank.id)}>
                                    <DeleteOutlineIcon />
                                </IconButton>
                            </Stack>
                        </Stack>

                        {bank.enabled && (
                            <Stack spacing={2} sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                                <Stack direction="row" spacing={2}>
                                    <ValidatedInput
                                        label="Account Name"
                                        fullWidth
                                        size="small"
                                        required
                                        value={bank.accountName || ''}
                                        onChange={val => updateBank(index, { accountName: val })}
                                    />
                                    <ValidatedInput
                                        label="Account Number"
                                        fullWidth
                                        size="small"
                                        required
                                        value={bank.accountNumber || ''}
                                        onChange={val => updateBank(index, { accountNumber: val })}
                                    />
                                </Stack>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            size="small"
                                            checked={!!bank.showDetails}
                                            onChange={e => updateBank(index, { showDetails: e.target.checked })}
                                        />
                                    }
                                    label={<Typography variant="body2">Show details on checkout modal</Typography>}
                                />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                        QR Code (Supports Google Drive Links)
                                    </Typography>
                                    <Stack direction="row" spacing={1}>
                                        <TextField
                                            label="QR Code URL"
                                            fullWidth
                                            size="small"
                                            value={bank.qrUrl || ''}
                                            onChange={e => updateBank(index, { qrUrl: e.target.value })}
                                        />
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleConvertQRLink('bank', index)}
                                        >
                                            Preview
                                        </Button>
                                    </Stack>
                                    {bank.qrUrl && (
                                        <Box mt={1.5} sx={{ textAlign: 'center', p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                                            <img
                                                src={bank.qrUrl}
                                                alt="QR Preview"
                                                style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        </Box>
                                    )}
                                </Box>
                            </Stack>
                        )}
                    </Paper>
                ))}
            </Box>
        );
    };

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
                    <Typography variant="subtitle2" sx={{ pt: 1 }}>Shift Duration</Typography>
                    <Stack direction="row" spacing={2}>
                        <TextField
                            label="Shift Duration"
                            type="number"
                            fullWidth
                            value={settings.shiftDurationHours ?? 12}
                            onChange={e => setSettings({ ...settings, shiftDurationHours: Math.max(1, parseInt(e.target.value) || 12) })}
                            helperText="Max hours per shift before warning turns red."
                            InputProps={{ endAdornment: <InputAdornment position="end">hrs</InputAdornment> }}
                            inputProps={{ min: 1, max: 24 }}
                        />
                        <TextField
                            label="Alert Before End"
                            type="number"
                            fullWidth
                            value={settings.shiftAlertMinutes ?? 30}
                            onChange={e => setSettings({ ...settings, shiftAlertMinutes: Math.max(1, parseInt(e.target.value) || 30) })}
                            helperText="Yellow warning shown this many minutes before shift limit."
                            InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                            inputProps={{ min: 1, max: 120 }}
                        />
                    </Stack>
                    <Typography variant="subtitle2" sx={{ pt: 1 }}>Invoicing</Typography>
                    <TextField
                        label="Default Invoice Due Days"
                        type="number"
                        fullWidth
                        value={settings.invoiceDueDays ?? 7}
                        onChange={e => setSettings({ ...settings, invoiceDueDays: Math.max(0, parseInt(e.target.value) || 7) })}
                        helperText="Number of days before a Charge to Account order becomes overdue."
                        InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
                        inputProps={{ min: 0 }}
                    />
                    <Typography variant="subtitle2" sx={{ pt: 1 }}>Schedule Posting</Typography>
                    <TextField
                        select
                        label="Schedule Posting Frequency"
                        fullWidth
                        value={settings.schedulePostingFrequency || 'weekly'}
                        onChange={e => setSettings({ ...settings, schedulePostingFrequency: e.target.value })}
                        helperText="Minimum frequency for posting staff schedules."
                    >
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="biweekly">Bi-weekly</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                    </TextField>

                    <Typography variant="subtitle2" sx={{ pt: 1 }}>PC Rental</Typography>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={!!settings.pcRentalEnabled}
                                    onChange={e => setSettings({ ...settings, pcRentalEnabled: e.target.checked })}
                                />
                            }
                            label="PC Rental enabled"
                        />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                            Enables the PC Rental tab in the POS and includes PC rental in shift-end calculations.
                        </Typography>
                        {settings.pcRentalEnabled && (
                            <Stack spacing={2} sx={{ mt: 1 }}>
                                <TextField
                                    select
                                    label="PC Timer Mode"
                                    fullWidth
                                    value={settings.pcRentalMode || 'external'}
                                    onChange={e => setSettings({ ...settings, pcRentalMode: e.target.value })}
                                    helperText={
                                        settings.pcRentalMode === 'external'
                                            ? 'Cashier enters the grand total from the external timer at shift end.'
                                            : 'PC rental total is computed automatically from Kunek session records (v0.6).'
                                    }
                                >
                                    <MenuItem value="external">External timer — manual total at shift end</MenuItem>
                                    <MenuItem value="builtin">Kunek built-in timer (v0.6+)</MenuItem>
                                </TextField>

                                <TextField
                                    select
                                    label="PC Rental Billing Service"
                                    fullWidth
                                    value={settings.pcRentalServiceId || ''}
                                    onChange={e => setSettings({ ...settings, pcRentalServiceId: e.target.value })}
                                    helperText="When a customer pays for PC time via GCash or Charge, cashier adds this catalog item. Shift-end math uses it to correctly split cash vs. non-cash PC rental revenue."
                                >
                                    <MenuItem value="">— Not linked (uses &quot;PC Rental&quot; name match)</MenuItem>
                                    {saleServices.map(s => (
                                        <MenuItem key={s.id} value={s.id}>
                                            {s.name}
                                            {s.priceType === 'variable' ? ' (variable)' : s.price ? ` — ₱${s.price}` : ''}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Stack>
                        )}
                    </Paper>

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
                    <Typography variant="subtitle2">Checkout Hotkey</Typography>
                    <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box flex={1}>
                            <Typography variant="caption" color="text.secondary">Current Hotkey</Typography>
                            <Typography variant="h5" color="primary" fontWeight="bold">
                                {settings.checkoutHotkey?.display || 'None'}
                            </Typography>
                        </Box>
                        <Button
                            variant={capturingCheckoutHotkey ? "contained" : "outlined"}
                            color={capturingCheckoutHotkey ? "error" : "primary"}
                            onClick={() => setCapturingCheckoutHotkey(!capturingCheckoutHotkey)}
                            onKeyDown={capturingCheckoutHotkey ? handleCaptureCheckoutHotkey : undefined}
                        >
                            {capturingCheckoutHotkey ? "Press Keys Now..." : "Change Hotkey"}
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
            {section === 'payments' && (
                <Stack spacing={3}>
                    {renderHeader("Payment Methods", "Configure which payment options are available for customers at checkout.")}

                    <Typography variant="subtitle2" color="primary" sx={{ mb: -1 }}>Legacy / Basic Methods</Typography>
                    <Stack direction="row" spacing={2}>
                        <Paper variant="outlined" sx={{ p: 2, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2">Cash (Always On)</Typography>
                                <Typography variant="caption" color="text.secondary">Default payment method</Typography>
                            </Box>
                            <Switch checked disabled />
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2">Charge to Account</Typography>
                                <Typography variant="caption" color="text.secondary">Invoicing / Credit</Typography>
                            </Box>
                            <Switch
                                checked={!!settings.paymentMethods?.charge?.enabled}
                                onChange={e => setSettings({
                                    ...settings,
                                    paymentMethods: {
                                        ...settings.paymentMethods,
                                        charge: { ...settings.paymentMethods?.charge, enabled: e.target.checked }
                                    }
                                })}
                            />
                        </Paper>
                    </Stack>

                    <Typography variant="subtitle2" color="primary" sx={{ mb: -1, mt: 2 }}>Digital / Modern Methods</Typography>
                    {renderPaymentMethod('gcash', 'GCash')}
                    {renderPaymentMethod('maya', 'Maya')}

                    {renderBanksSection()}

                    <Typography variant="subtitle2" color="primary" sx={{ mb: -1, mt: 2 }}>Integrated Methods</Typography>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: '12px', bgcolor: 'action.hover', borderStyle: 'dashed', textAlign: 'center' }}>
                        <Typography variant="subtitle2" fontWeight="bold">Card Payments</Typography>
                        <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>COMING SOON</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            We are working on bringing direct card integrations (Maya Checkout / Stripe) to Kunek.
                        </Typography>
                    </Paper>

                    {renderSaveButton()}
                </Stack>
            )}
        </Box>
    );
}
