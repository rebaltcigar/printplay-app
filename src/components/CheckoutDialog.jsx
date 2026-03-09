import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Box, Typography, ToggleButtonGroup,
    ToggleButton, Stack, Alert, Paper, Menu, MenuItem, ListItemIcon, ListItemText
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ValidatedInput from './common/ValidatedInput';
import { getBankIcon, GCashIcon, MayaIcon } from '../utils/bankIcons';

export default function CheckoutDialog({ open, onClose, total, onConfirm, customer, defaultDueDays = 7, appSettings }) {
    const [method, setMethod] = useState('Cash');
    const [tendered, setTendered] = useState('');
    const [refNumber, setRefNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [discountType, setDiscountType] = useState('none');
    const [discountValue, setDiscountValue] = useState(0);
    const [anchorEl, setAnchorEl] = useState(null);
    const [selectedBankId, setSelectedBankId] = useState(null);
    const [isSelectingBank, setIsSelectingBank] = useState(false);
    const tenderedRef = useRef(null);

    const defaultDueDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + (defaultDueDays || 7));
        return d.toISOString().split('T')[0];
    };

    // Reset all state when dialog opens
    useEffect(() => {
        if (open) {
            setMethod('Cash');
            setTendered('');
            setRefNumber('');
            setPhone('');
            setDueDate(defaultDueDateStr());
            setDiscountType('none');
            setDiscountValue(0);
            setSelectedBankId(null);
            setIsSelectingBank(false);
            setTimeout(() => tenderedRef.current?.focus(), 150);
        }
    }, [open]);

    const discountAmount = discountType === 'percent'
        ? (total * (discountValue / 100))
        : (discountType === 'fixed' ? discountValue : 0);

    const finalTotal = Math.max(0, total - discountAmount);
    const tenderNum = parseFloat(tendered) || 0;
    const change = Math.max(0, tenderNum - finalTotal);
    const remaining = Math.max(0, finalTotal - tenderNum);

    // Config shorthand
    const methodsConfig = appSettings?.paymentMethods || {};
    const enabledBanks = (methodsConfig.banks || []).filter(b => b.enabled);

    // Auto-select first bank when only one is available
    useEffect(() => {
        if (method === 'Bank Transfer' && enabledBanks.length === 1 && !selectedBankId) {
            setSelectedBankId(enabledBanks[0].id);
        }
    }, [method]);

    const activeBank = enabledBanks.find(b => b.id === selectedBankId) || null;

    // Derive the active config for the selected digital method
    const activeMethodConfig = (() => {
        if (method === 'GCash') return methodsConfig.gcash || {};
        if (method === 'Maya') return methodsConfig.maya || {};
        if (method === 'Bank Transfer') return activeBank || {};
        return {};
    })();

    const isChargeAllowed = customer && customer.id;

    const canConfirm =
        method === 'Cash' ? tenderNum >= finalTotal :
            ['GCash', 'Maya', 'Bank Transfer', 'Card'].includes(method) ? true :
                method === 'Charge' ? isChargeAllowed :
                    false;

    const handleConfirm = (shouldPrint = false) => {
        if (!canConfirm) return;
        const paymentDetails = ['GCash', 'Maya', 'Bank Transfer', 'Card'].includes(method)
            ? { refNumber, phone, bankId: selectedBankId || null, bankName: activeBank?.bankName || null }
            : null;

        onConfirm({
            paymentMethod: method,
            amountTendered: method === 'Cash' ? tenderNum : finalTotal,
            change: method === 'Cash' ? change : 0,
            paymentDetails,
            dueDate: method === 'Charge' && dueDate ? new Date(dueDate) : null,
            discount: { type: discountType, value: discountValue, amount: discountAmount },
            subtotal: total,
            total: finalTotal
        }, shouldPrint);
    };

    const addCash = (amount) => setTendered((prev) => ((parseFloat(prev) || 0) + amount).toString());

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && canConfirm) {
            e.preventDefault();
            handleConfirm(false);
        }
    };

    // Unified method selection: clears bank state when switching away from Bank Transfer
    const selectMethod = (newMethod, bankId = null) => {
        setMethod(newMethod);
        if (newMethod !== 'Bank Transfer') setSelectedBankId(null);
        else if (bankId) setSelectedBankId(bankId);
        setAnchorEl(null);
        setIsSelectingBank(false);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" onKeyDown={handleKeyDown}>
            <DialogTitle sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                Checkout
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    {/* TOTAL DISPLAY */}
                    <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 3, borderRadius: 2, textAlign: 'center', boxShadow: 3 }}>
                        <Stack direction="row" justifyContent="center" alignItems="baseline" spacing={1}>
                            {discountAmount > 0 && (
                                <Typography variant="h5" sx={{ opacity: 0.6, textDecoration: 'line-through', fontWeight: 500 }}>
                                    ₱{total.toFixed(2)}
                                </Typography>
                            )}
                            <Typography variant="h2" sx={{ fontWeight: 900, lineHeight: 1 }}>
                                ₱{finalTotal.toFixed(2)}
                            </Typography>
                        </Stack>
                        {discountAmount > 0 && (
                            <Typography variant="caption" sx={{ mt: 1, display: 'block', fontWeight: 'bold' }}>
                                SAVE ₱{discountAmount.toFixed(2)} ({discountType === 'percent' ? `${discountValue}%` : 'FLAT'})
                            </Typography>
                        )}
                    </Box>

                    {/* DISCOUNT SECTION */}
                    <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                            <Typography variant="subtitle2" fontWeight="bold">Apply Discount</Typography>
                            <ToggleButtonGroup
                                size="small"
                                value={discountType}
                                exclusive
                                onChange={(e, v) => v && setDiscountType(v)}
                            >
                                <ToggleButton value="none">None</ToggleButton>
                                <ToggleButton value="percent">%</ToggleButton>
                                <ToggleButton value="fixed">Fixed</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>
                        {discountType !== 'none' && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <TextField
                                    label={discountType === 'percent' ? 'Percentage (%)' : 'Amount (₱)'}
                                    type="number"
                                    size="small"
                                    value={discountValue}
                                    onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                                    fullWidth
                                />
                                <Stack direction="row" spacing={0.5}>
                                    {discountType === 'percent'
                                        ? [5, 10, 20].map(v => (
                                            <Button key={v} variant="outlined" size="small" onClick={() => setDiscountValue(v)}>{v}%</Button>
                                        ))
                                        : [10, 20, 50].map(v => (
                                            <Button key={v} variant="outlined" size="small" onClick={() => setDiscountValue(v)}>₱{v}</Button>
                                        ))
                                    }
                                </Stack>
                            </Stack>
                        )}
                    </Box>

                    {/* PAYMENT METHOD SELECTOR */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, opacity: 0.8 }}>Payment Method</Typography>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={(e) => setAnchorEl(e.currentTarget)}
                            endIcon={<KeyboardArrowDownIcon />}
                            sx={{
                                justifyContent: 'space-between',
                                height: '56px',
                                borderRadius: '12px',
                                px: 2,
                                border: '2px solid',
                                borderColor: 'primary.main',
                                '&:hover': { border: '2px solid', borderColor: 'primary.dark' }
                            }}
                        >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                {method === 'Cash' && <PaymentsIcon color="primary" />}
                                {method === 'GCash' && <GCashIcon color="primary" />}
                                {method === 'Maya' && <MayaIcon color="primary" />}
                                {method === 'Bank Transfer' && (
                                    activeBank
                                        ? getBankIcon(activeBank.bankName, { color: 'primary' }) || <AccountBalanceIcon color="primary" />
                                        : <AccountBalanceIcon color="primary" />
                                )}
                                {method === 'Card' && <CreditCardIcon color="disabled" />}
                                {method === 'Charge' && <HistoryIcon color="primary" />}
                                <Typography variant="body1" fontWeight="bold">
                                    {method === 'Bank Transfer' && activeBank ? activeBank.bankName : method}
                                </Typography>
                            </Stack>
                        </Button>

                        <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={() => { setAnchorEl(null); setIsSelectingBank(false); }}
                            PaperProps={{
                                sx: {
                                    width: anchorEl ? anchorEl.clientWidth : 'auto',
                                    mt: 1,
                                    borderRadius: '12px',
                                    boxShadow: '0px 8px 16px rgba(0,0,0,0.15)',
                                    maxHeight: 400
                                }
                            }}
                        >
                            {!isSelectingBank ? [
                                <MenuItem key="cash" onClick={() => selectMethod('Cash')} selected={method === 'Cash'}>
                                    <ListItemIcon><PaymentsIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText primary="Cash" />
                                    {method === 'Cash' && <CheckCircleIcon fontSize="small" color="primary" />}
                                </MenuItem>,

                                methodsConfig.gcash?.enabled && (
                                    <MenuItem key="gcash" onClick={() => selectMethod('GCash')} selected={method === 'GCash'}>
                                        <ListItemIcon><GCashIcon fontSize="small" /></ListItemIcon>
                                        <ListItemText
                                            primary={methodsConfig.gcash.label || 'GCash'}
                                            secondary={methodsConfig.gcash.showDetails ? methodsConfig.gcash.accountNumber : null}
                                        />
                                        {method === 'GCash' && <CheckCircleIcon fontSize="small" color="primary" />}
                                    </MenuItem>
                                ),

                                methodsConfig.maya?.enabled && (
                                    <MenuItem key="maya" onClick={() => selectMethod('Maya')} selected={method === 'Maya'}>
                                        <ListItemIcon><MayaIcon fontSize="small" /></ListItemIcon>
                                        <ListItemText
                                            primary={methodsConfig.maya.label || 'Maya'}
                                            secondary={methodsConfig.maya.showDetails ? methodsConfig.maya.accountNumber : null}
                                        />
                                        {method === 'Maya' && <CheckCircleIcon fontSize="small" color="primary" />}
                                    </MenuItem>
                                ),

                                enabledBanks.length > 0 && (
                                    <MenuItem
                                        key="bank"
                                        onClick={() => {
                                            if (enabledBanks.length > 1) setIsSelectingBank(true);
                                            else selectMethod('Bank Transfer', enabledBanks[0].id);
                                        }}
                                        selected={method === 'Bank Transfer'}
                                    >
                                        <ListItemIcon><AccountBalanceIcon fontSize="small" /></ListItemIcon>
                                        <ListItemText
                                            primary="Bank Transfer"
                                            secondary={enabledBanks.length > 1 ? `${enabledBanks.length} accounts` : enabledBanks[0].bankName}
                                        />
                                        {method === 'Bank Transfer' && <CheckCircleIcon fontSize="small" color="primary" />}
                                        {enabledBanks.length > 1 && <KeyboardArrowDownIcon sx={{ ml: 1, opacity: 0.5, transform: 'rotate(-90deg)' }} />}
                                    </MenuItem>
                                ),

                                <MenuItem key="card" disabled>
                                    <ListItemIcon><CreditCardIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText
                                        primary="Card Payments"
                                        secondary="Coming Soon"
                                        secondaryTypographyProps={{ color: 'primary', fontWeight: 'bold', fontSize: '10px' }}
                                    />
                                </MenuItem>,

                                methodsConfig.charge?.enabled !== false && (
                                    <MenuItem
                                        key="charge"
                                        onClick={() => selectMethod('Charge')}
                                        selected={method === 'Charge'}
                                        disabled={!isChargeAllowed}
                                    >
                                        <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
                                        <ListItemText primary="Charge (Invoice)" />
                                        {method === 'Charge' && <CheckCircleIcon fontSize="small" color="primary" />}
                                    </MenuItem>
                                ),
                            ] : [
                                <MenuItem key="back" onClick={() => setIsSelectingBank(false)} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 0.5 }}>
                                    <ListItemIcon><ArrowBackIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText primary="Back to Methods" primaryTypographyProps={{ variant: 'caption', fontWeight: 'bold' }} />
                                </MenuItem>,
                                ...enabledBanks.map(bank => (
                                    <MenuItem
                                        key={bank.id}
                                        onClick={() => selectMethod('Bank Transfer', bank.id)}
                                        selected={method === 'Bank Transfer' && selectedBankId === bank.id}
                                    >
                                        <ListItemIcon>{getBankIcon(bank.bankName, { fontSize: 'small' }) || <AccountBalanceIcon fontSize="small" />}</ListItemIcon>
                                        <ListItemText
                                            primary={bank.bankName}
                                            secondary={bank.showDetails ? bank.accountNumber : null}
                                        />
                                        {method === 'Bank Transfer' && selectedBankId === bank.id && <CheckCircleIcon fontSize="small" color="primary" />}
                                    </MenuItem>
                                ))
                            ]}
                        </Menu>
                    </Box>

                    {/* DIGITAL PAYMENT DETAILS — QR + Account Info + Reference fields */}
                    {['GCash', 'Maya', 'Bank Transfer'].includes(method) && (
                        <Stack spacing={2}>
                            {activeMethodConfig.qrUrl && (
                                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                                        SCAN QR TO PAY
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={activeMethodConfig.qrUrl}
                                        alt={`${method} QR`}
                                        sx={{ width: 180, height: 180, objectFit: 'contain', mx: 'auto', borderRadius: 1 }}
                                    />
                                </Box>
                            )}

                            {activeMethodConfig.showDetails && (activeMethodConfig.accountName || activeMethodConfig.accountNumber) && (
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">Account Details</Typography>
                                    {activeMethodConfig.bankName && (
                                        <Typography variant="body1" fontWeight="bold">{activeMethodConfig.bankName}</Typography>
                                    )}
                                    <Typography variant="body1" fontWeight="bold">{activeMethodConfig.accountName || 'N/A'}</Typography>
                                    <Typography variant="h6" color="primary" fontWeight="bold">{activeMethodConfig.accountNumber || 'N/A'}</Typography>
                                </Paper>
                            )}

                            <Stack direction="row" spacing={2}>
                                <ValidatedInput
                                    label="Reference Number"
                                    rule="numeric"
                                    value={refNumber}
                                    onChange={setRefNumber}
                                    fullWidth
                                    placeholder="Optional"
                                />
                                <ValidatedInput
                                    label="Sender Phone"
                                    rule="phone"
                                    value={phone}
                                    onChange={setPhone}
                                    fullWidth
                                    placeholder="Optional"
                                />
                            </Stack>
                        </Stack>
                    )}

                    {/* CASH */}
                    {method === 'Cash' && (
                        <Box>
                            <ValidatedInput
                                inputRef={tenderedRef}
                                label="Amount Tendered"
                                rule="numeric"
                                value={tendered}
                                onChange={setTendered}
                                fullWidth
                                InputProps={{ sx: { fontSize: '1.5rem', height: '3.5rem' } }}
                                error={tenderNum > 0 && tenderNum < finalTotal}
                                helperText={
                                    tenderNum > 0 && tenderNum < finalTotal
                                        ? `Insufficient. Need ₱${remaining.toFixed(2)} more.`
                                        : 'Enter amount equal or greater than Total Due'
                                }
                            />
                            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 3 }}>
                                {[50, 100, 200, 500, 1000].map((amt) => (
                                    <Button key={amt} variant="outlined" size="small" onClick={() => addCash(amt)}>+{amt}</Button>
                                ))}
                            </Stack>
                            <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', p: 1.5, borderRadius: 2, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Typography variant="body2" sx={{ opacity: 0.7 }}>Expected Change</Typography>
                                <Typography variant="h5" sx={{ color: '#ef5350', fontWeight: 'bold' }}>₱{change.toFixed(2)}</Typography>
                            </Box>
                        </Box>
                    )}

                    {/* CHARGE */}
                    {method === 'Charge' && (
                        <Stack spacing={2}>
                            <Alert severity="warning">
                                This will be recorded as an invoice (Accounts Receivable). Customer must be assigned.
                            </Alert>
                            <TextField
                                label="Due Date"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                helperText="Date by which payment is expected"
                            />
                        </Stack>
                    )}

                    {/* CARD */}
                    {method === 'Card' && (
                        <Alert severity="info">
                            Record a manual card transaction (via external terminal).
                        </Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                <Button onClick={onClose} size="large" color="inherit">Cancel</Button>
                <Box>
                    <Button onClick={() => handleConfirm(true)} size="large" sx={{ mr: 1 }} disabled={!canConfirm}>
                        Print & Confirm
                    </Button>
                    <Button onClick={() => handleConfirm(false)} variant="contained" size="large" disabled={!canConfirm}>
                        CONFIRM
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
