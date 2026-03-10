import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, InputAdornment, InputLabel,
  MenuItem, Select, Stack, TextField, Typography, CircularProgress,
  Alert, ToggleButtonGroup, ToggleButton, IconButton, Paper, Menu, ListItemIcon, ListItemText
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';
import PaymentsIcon from '@mui/icons-material/Payments';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import BoltIcon from '@mui/icons-material/Bolt';
import AddIcon from '@mui/icons-material/Add';

import { supabase } from '../../supabase';
import { pcSessionService } from '../../services/pcSessionService';
import { fmtCurrency } from '../../utils/formatters';
import { getBankIcon, GCashIcon, MayaIcon } from '../../utils/bankIcons';
import CustomerSelectionDrawer from '../pos/CustomerSelectionDrawer';

const BLANK = {
  customerType: 'walkin',
  customerId: null,
  customerName: '',
  customerSearch: '',
  newMemberUsername: '',
  newMemberName: '',
  rateId: '',
  hours: '',
  amountDue: 0,
  paymentMethod: 'Cash',
  tendered: '',
  refNumber: '',
  phone: '',
  bankId: null,
  discountType: 'none',
  discountValue: 0,
  usingBalance: false,
  availableMinutes: 0,
};

export default function StartSessionDialog({ open, station, activeSession, isQuickGuest, isStandaloneTopup, onClose, showSnackbar }) {
  const [step, setStep] = useState(0); // 0: Setup, 1: Checkout
  const [form, setForm] = useState(BLANK);
  const [inputMode, setInputMode] = useState('amount');
  const [editingCustomer, setEditingCustomer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [rates, setRates] = useState([]);
  const [zones, setZones] = useState([]);
  const [customerResults, setCustomerResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [appSettings, setAppSettings] = useState(null);
  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);

  const [anchorEl, setAnchorEl] = useState(null);
  const [isSelectingBank, setIsSelectingBank] = useState(false);

  const amountRef = useRef(null);
  const searchRef = useRef(null);
  const tenderedRef = useRef(null);

  // Load dependency data
  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const ObjectData = await Promise.all([
        supabase.from('rates').select('*').eq('is_active', true),
        supabase.from('zones').select('*'),
        supabase.from('settings').select('*').eq('id', 'system').single()
      ]);
      const [r, z, s] = ObjectData;
      if (r.data) setRates(r.data.map(d => ({ ...d, ratePerMinute: d.rate_per_minute, isActive: d.is_active })));
      if (z.data) setZones(z.data);
      if (s.data) setAppSettings({
        paymentMethods: s.data.payment_methods
      });
    };
    fetchData();
  }, [open]);

  // Handle Mode/Reset
  useEffect(() => {
    if (open) {
      setStep(0);
      if (activeSession) {
        // TOP UP MODE
        setForm({
          ...BLANK,
          customerId: activeSession.customerId || null,
          customerName: activeSession.customerName || 'Walk-in',
          customerType: activeSession.customerId ? 'member' : 'walkin',
          rateId: activeSession.rateId || station?.rateId || '',
        });
        setEditingCustomer(false);
        setTimeout(() => amountRef.current?.focus(), 150);
      } else if (isQuickGuest) {
        // QUICK GUEST MODE
        const gid = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
        setForm({ ...BLANK, customerName: gid, customerType: 'walkin' });
        setEditingCustomer(false);
        setTimeout(() => amountRef.current?.focus(), 150);
      } else if (isStandaloneTopup) {
        // STANDALONE TOP UP MODE
        setForm(BLANK);
        setEditingCustomer(true);
        setTimeout(() => searchRef.current?.focus(), 150);
      } else {
        // NEW SESSION MODE
        setForm(BLANK);
        setEditingCustomer(true);
        setTimeout(() => searchRef.current?.focus(), 150);
      }
    }
  }, [open, isQuickGuest, isStandaloneTopup, activeSession, station]);

  // Search Logic
  useEffect(() => {
    const term = form.customerSearch?.trim();
    if (!term || term.length < 2) {
      setCustomerResults([]);
      return;
    }

    setSearching(true);
    supabase.from('customers')
      .select('*')
      .eq('is_active', true)
      .or(`full_name.ilike.%${term}%,username.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(10)
      .then(({ data }) => {
        if (data) {
          setCustomerResults(data.map(d => ({
            ...d,
            fullName: d.full_name,
            minutesRemaining: d.minutes_remaining
          })));
        }
        setSearching(false);
      }).catch(() => setSearching(false));
  }, [form.customerSearch]);

  const selectedRate = rates.find(r => r.id === form.rateId);
  const rpm = selectedRate?.ratePerMinute || 0;

  // Auto-sync Rate
  useEffect(() => {
    if (open && station && !form.rateId) {
      let rid = station.rateId;
      if (!rid && station.zoneId) rid = zones.find(z => z.id === station.zoneId)?.rateId;
      if (rid) setForm(p => ({ ...p, rateId: rid }));
    }
  }, [open, station, zones, form.rateId]);

  const handleInputChange = (field, value) => {
    let updates = { [field]: value };
    if (rpm > 0) {
      if (field === 'hours') updates.amountDue = (Number(value) * 60 * rpm).toFixed(2);
      if (field === 'amountDue') updates.hours = (Number(value) / (rpm * 60)).toFixed(2);
    }
    setForm(p => ({ ...p, ...updates }));
  };

  const handleSelectCustomer = (c) => {
    setForm(p => ({
      ...p,
      customerId: c.id,
      customerName: c.fullName || c.name,
      customerType: 'member',
      customerSearch: '',
      availableMinutes: c.minutesRemaining || 0
    }));
    setEditingCustomer(false);
    setCustomerResults([]);
    setTimeout(() => amountRef.current?.focus(), 100);
  };

  const discountAmount = form.discountType === 'percent'
    ? (Number(form.amountDue) * (form.discountValue / 100))
    : (form.discountType === 'fixed' ? Number(form.discountValue) : 0);

  const finalTotal = Math.max(0, Number(form.amountDue) - discountAmount);

  // Calculate seconds remaining if top-up
  const currentRemaining = useMemo(() => {
    if (!activeSession || activeSession.type === 'postpaid') return null;
    const startMs = activeSession.startedAt ? new Date(activeSession.startedAt).getTime() : Date.now();
    const elapsedMs = Date.now() - startMs;
    const allottedMs = (activeSession.minutesAllotted || 0) * 60000;
    return Math.max(0, (allottedMs - elapsedMs) / 1000);
  }, [activeSession]);

  const addedMinutes = Math.round(Number(form.hours) * 60);

  const tenderNum = parseFloat(form.tendered) || 0;
  const change = Math.max(0, tenderNum - finalTotal);
  const remaining = Math.max(0, finalTotal - tenderNum);

  const methodsConfig = appSettings?.paymentMethods || {};
  const enabledBanks = (methodsConfig.banks || []).filter(b => b.enabled);
  const activeBank = enabledBanks.find(b => b.id === form.bankId);

  const canGoNext = form.rateId &&
    (isRegistering ? (form.newMemberUsername?.length >= 4 && form.newMemberName) : (form.customerId || form.customerName)) &&
    Number(form.amountDue) > 0;
  const canConfirm = form.paymentMethod === 'Cash' ? tenderNum >= finalTotal : true;

  const handleNext = () => {
    if (form.usingBalance) {
      // Skip checkout if using balance
      handleSubmit();
      return;
    }
    setStep(1);
    setTimeout(() => tenderedRef.current?.focus(), 150);
  };

  const handleSubmit = async () => {
    if (!canConfirm || saving) return;
    setSaving(true);
    try {
      const { data: { user: staff } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const isTopUp = !!activeSession;

      if (isTopUp) {
        // UPDATE EXISTING SESSION (Top-up)
        await pcSessionService.topupSession({
          sessionId: activeSession.id,
          stationId: station.id,
          stationName: station.name,
          customerName: form.customerName,
          addedMinutes,
          amountDue: Number(form.amountDue),
          amountPaid: finalTotal,
          paymentMethod: form.paymentMethod,
          discountAmount,
          staffId: staff?.id,
          staffEmail: staff?.email
        });
        showSnackbar(`Topped up ${addedMinutes} min for ${form.customerName}`);
      } else {
        // CREATE NEW SESSION OR STANDALONE TOPUP
        let customerId = form.customerId;
        let customerName = form.customerName || 'Walk-in';

        if (isRegistering) {
          const { data: custRef, error } = await supabase.from('customers').insert([{
            username: form.newMemberUsername.toLowerCase(),
            full_name: form.newMemberName,
            minutes_remaining: 0,
            force_password_change: true,
            is_active: true,
            created_at: now,
            updated_at: now
          }]).select().single();
          if (error) throw error;
          customerId = custRef.id;
          customerName = form.newMemberName;
        }

        if (isStandaloneTopup) {
          // STANDALONE TOP UP
          if (customerId) {
            const { data: cust } = await supabase.from('customers').select('minutes_remaining').eq('id', customerId).single();
            await supabase.from('customers').update({
              minutes_remaining: (cust?.minutes_remaining || 0) + addedMinutes,
              updated_at: now
            }).eq('id', customerId);
          }

          await supabase.from('transactions').insert([{
            item: `Account Top-up — ${customerName}`,
            type: 'pc-topup', price: finalTotal, qty: 1,
            payment_method: form.paymentMethod, staff_email: staff?.email,
            customer_id: customerId, customer_name: customerName,
            discount_amount: discountAmount, subtotal: Number(form.amountDue),
            created_at: now,
          }]);

          showSnackbar(`Topped up ${addedMinutes} min to ${customerName}'s account`);
        } else {
          // START NEW SESSION
          await pcSessionService.startSession({
            stationId: station.id,
            stationName: station.name,
            customerId,
            customerName,
            type: 'prepaid',
            rateId: form.rateId,
            rateSnapshot: selectedRate,
            minutesAllotted: addedMinutes,
            amountDue: Number(form.amountDue),
            amountPaid: finalTotal,
            paymentMethod: form.paymentMethod,
            paymentDetails: ['GCash', 'Maya', 'Bank Transfer'].includes(form.paymentMethod) ? {
              refNumber: form.refNumber,
              phone: form.phone,
              bankId: form.bankId,
              bankName: activeBank?.bankName
            } : null,
            discount: { type: form.discountType, value: form.discountValue, amount: discountAmount },
            usingBalance: form.usingBalance,
            staffId: staff?.id,
            staffEmail: staff?.email
          });
          showSnackbar(`Session started for ${customerName}`);
        }
      }
      onClose();
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (step === 0 && canGoNext) handleNext();
      else if (step === 1 && canConfirm) handleSubmit();
    }
  };

  const activeMethodConfig = (() => {
    if (form.paymentMethod === 'GCash') return methodsConfig.gcash || {};
    if (form.paymentMethod === 'Maya') return methodsConfig.maya || {};
    if (form.paymentMethod === 'Bank Transfer') return activeBank || {};
    return {};
  })();

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth onKeyDown={handleKeyDown}>
        <DialogTitle component="div" sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="span" fontWeight={800}>
            {step === 1 ? 'Checkout Payment' : (activeSession ? `Top Up — ${station?.name}` : (isStandaloneTopup ? 'Member Top-up' : `Start Session — ${station?.name}`))}
          </Typography>
          {step === 1 && (
            <IconButton size="small" onClick={() => setStep(0)}><ArrowBackIcon fontSize="small" /></IconButton>
          )}
        </DialogTitle>

        <DialogContent>
          {step === 0 ? (
            <Stack gap={2.5} sx={{ mt: 1 }}>
              {/* Setup View */}
              <Box>
                {editingCustomer ? (
                  <Stack spacing={1.5}>
                    {!isRegistering ? (
                      <>
                        <TextField
                          inputRef={searchRef}
                          fullWidth label="Customer Search"
                          placeholder="Enter name or phone..."
                          value={form.customerSearch}
                          onChange={e => setForm(p => ({ ...p, customerSearch: e.target.value }))}
                          InputProps={{
                            startAdornment: <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                            endAdornment: searching ? <CircularProgress size={16} /> : null
                          }}
                          autoFocus
                        />
                        <Button
                          variant="outlined"
                          color="secondary"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => setIsRegistering(true)}
                          sx={{ alignSelf: 'flex-start', py: 1 }}
                        >
                          CREATE NEW MEMBER ACCOUNT
                        </Button>
                      </>
                    ) : (
                      <Paper sx={{ p: 2, border: 1, borderColor: 'secondary.main', bgcolor: 'secondary.main' + '08' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                          <Typography variant="subtitle2" fontWeight="bold">New Member Registration</Typography>
                          <Button size="small" onClick={() => setIsRegistering(false)}>Back to Search</Button>
                        </Stack>
                        <Stack spacing={2}>
                          <TextField
                            label="Username"
                            fullWidth size="small"
                            placeholder="Min 4 characters"
                            value={form.newMemberUsername}
                            onChange={e => setForm(p => ({ ...p, newMemberUsername: e.target.value.replace(/\s/g, '') }))}
                            helperText="No spaces allowed"
                          />
                          <TextField
                            label="Full Name"
                            fullWidth size="small"
                            value={form.newMemberName}
                            onChange={e => setForm(p => ({ ...p, newMemberName: e.target.value }))}
                          />
                          <Alert severity="info" sx={{ py: 0 }}>Default password: 123</Alert>
                        </Stack>
                      </Paper>
                    )}
                  </Stack>
                ) : (
                  <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'action.hover' }}>
                    <Stack direction="row" alignItems="center" gap={1.5}>
                      <PersonIcon color="primary" />
                      <Box>
                        <Typography variant="subtitle2" fontWeight={700}>{form.customerName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {activeSession ? (
                            <>Active Session · {currentRemaining ? `${Math.floor(currentRemaining / 60)}m remaining` : 'Postpaid'}</>
                          ) : (
                            isStandaloneTopup ? `Balance: ${form.availableMinutes} min` : (form.customerType === 'walkin' ? 'Walk-in / Guest' : 'Member Account')
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                    {!isQuickGuest && !activeSession && (
                      <IconButton size="small" onClick={() => { setEditingCustomer(true); setIsRegistering(false); }}><EditIcon fontSize="small" /></IconButton>
                    )}
                  </Paper>
                )}

                {customerResults.length > 0 && editingCustomer && !isRegistering && (
                  <Paper sx={{ mt: 0.5, position: 'absolute', width: 'calc(100% - 48px)', maxHeight: 150, overflowY: 'auto', border: 1, borderColor: 'divider', zIndex: 100 }}>
                    {customerResults.map(c => (
                      <MenuItem key={c.id} onClick={() => handleSelectCustomer(c)} sx={{ py: 1.5 }}>
                        <Stack>
                          <Typography variant="body2" fontWeight="bold">{c.fullName || c.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.username || 'No username'} · {c.phone || 'No phone'}</Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Paper>
                )}
              </Box>

              {form.customerId && form.availableMinutes > 0 && !activeSession && (
                <Button
                  fullWidth
                  variant={form.usingBalance ? "contained" : "outlined"}
                  color="secondary"
                  onClick={() => {
                    const newState = !form.usingBalance;
                    setForm(p => ({
                      ...p,
                      usingBalance: newState,
                      hours: newState ? (p.availableMinutes / 60).toFixed(2) : p.hours,
                      amountDue: newState ? 0 : p.amountDue
                    }));
                  }}
                  startIcon={<AccountBalanceIcon />}
                  sx={{ mb: 1 }}
                >
                  {form.usingBalance ? 'USING ACCOUNT BALANCE' : `USE ACCOUNT BALANCE (${form.availableMinutes} min available)`}
                </Button>
              )}

              <FormControl fullWidth size="small" disabled={!!activeSession || form.usingBalance}>
                <InputLabel>Rate Plan</InputLabel>
                <Select value={form.rateId} label="Rate Plan" onChange={e => handleInputChange('rateId', e.target.value)}>
                  {rates.map(r => <MenuItem key={r.id} value={r.id}>{r.name} (₱{(r.ratePerMinute * 60).toFixed(0)}/hr)</MenuItem>)}
                </Select>
              </FormControl>

              <Box>
                <ToggleButtonGroup fullWidth size="small" exclusive value={inputMode} onChange={(_, v) => v && setInputMode(v)} sx={{ mb: 1, height: 32 }} disabled={form.usingBalance}>
                  <ToggleButton value="minutes">BY HOURS</ToggleButton>
                  <ToggleButton value="amount">BY AMOUNT</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                  inputRef={amountRef}
                  fullWidth label={inputMode === 'minutes' ? 'Hours' : 'PHP Amount'}
                  value={inputMode === 'minutes' ? form.hours : form.amountDue}
                  onChange={e => handleInputChange(inputMode === 'minutes' ? 'hours' : 'amountDue', e.target.value)}
                  type="number"
                  disabled={form.usingBalance}
                  InputProps={{ sx: { fontSize: '1.2rem', fontWeight: 700 } }}
                  helperText={
                    rpm > 0 && (
                      <Typography variant="caption" color="primary.main" fontWeight={600}>
                        {inputMode === 'minutes'
                          ? `Equivalent to ₱${Number(form.amountDue).toFixed(2)}`
                          : `Equivalent to ${form.hours} ${Number(form.hours) === 1 ? 'hr' : 'hrs'}`
                        }
                      </Typography>
                    )
                  }
                />
              </Box>
            </Stack>
          ) : (
            <Stack gap={2.5} sx={{ mt: 1 }}>
              {/* Checkout View — EXACT REPLICA OF POS CHECKOUT */}
              <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 3, borderRadius: 2, textAlign: 'center', boxShadow: 3 }}>
                <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1, fontWeight: 700 }}>
                  {activeSession ? 'TOP UP AMOUNT' : 'TOTAL DUE'}
                </Typography>
                <Stack direction="row" justifyContent="center" alignItems="baseline" spacing={1}>
                  {discountAmount > 0 && (
                    <Typography variant="h5" sx={{ opacity: 0.6, textDecoration: 'line-through', fontWeight: 500 }}>
                      ₱{Number(form.amountDue).toFixed(2)}
                    </Typography>
                  )}
                  <Typography variant="h2" sx={{ fontWeight: 900, lineHeight: 1 }}>
                    ₱{finalTotal.toFixed(2)}
                  </Typography>
                </Stack>
                <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.9 }}>
                  {form.customerName} · +{form.hours} hrs
                </Typography>
              </Box>

              {/* DISCOUNT SECTION */}
              <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2" fontWeight="bold">Apply Discount</Typography>
                  <ToggleButtonGroup
                    size="small"
                    value={form.discountType}
                    exclusive
                    onChange={(e, v) => v && setForm(p => ({ ...p, discountType: v }))}
                  >
                    <ToggleButton value="none">None</ToggleButton>
                    <ToggleButton value="percent">%</ToggleButton>
                    <ToggleButton value="fixed">Fixed</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {form.discountType !== 'none' && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      label={form.discountType === 'percent' ? 'Percentage (%)' : 'Amount (₱)'}
                      type="number"
                      size="small"
                      value={form.discountValue}
                      onChange={(e) => setForm(p => ({ ...p, discountValue: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      fullWidth
                    />
                    <Stack direction="row" spacing={0.5}>
                      {form.discountType === 'percent'
                        ? [5, 10, 20].map(v => (
                          <Button key={v} variant="outlined" size="small" onClick={() => setForm(p => ({ ...p, discountValue: v }))}>{v}%</Button>
                        ))
                        : [10, 20, 50].map(v => (
                          <Button key={v} variant="outlined" size="small" onClick={() => setForm(p => ({ ...p, discountValue: v }))}>₱{v}</Button>
                        ))
                      }
                    </Stack>
                  </Stack>
                )}
              </Box>

              <Box>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, opacity: 0.8 }}>Payment Method</Typography>
                <Button
                  fullWidth variant="outlined"
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
                    {form.paymentMethod === 'Cash' && <PaymentsIcon color="primary" />}
                    {form.paymentMethod === 'GCash' && <GCashIcon color="primary" />}
                    {form.paymentMethod === 'Maya' && <MayaIcon color="primary" />}
                    {form.paymentMethod === 'Bank Transfer' && (
                      activeBank
                        ? getBankIcon(activeBank.bankName, { color: 'primary' }) || <AccountBalanceIcon color="primary" />
                        : <AccountBalanceIcon color="primary" />
                    )}
                    <Typography variant="body1" fontWeight="bold">
                      {form.paymentMethod === 'Bank Transfer' && activeBank ? activeBank.bankName : form.paymentMethod}
                    </Typography>
                  </Stack>
                </Button>

                <Menu
                  anchorEl={anchorEl} open={Boolean(anchorEl)}
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
                    <MenuItem key="cash" onClick={() => { setForm(p => ({ ...p, paymentMethod: 'Cash', bankId: null })); setAnchorEl(null); }} selected={form.paymentMethod === 'Cash'}>
                      <ListItemIcon><PaymentsIcon fontSize="small" /></ListItemIcon>
                      <ListItemText primary="Cash" />
                      {form.paymentMethod === 'Cash' && <CheckCircleIcon fontSize="small" color="primary" />}
                    </MenuItem>,

                    methodsConfig.gcash?.enabled && (
                      <MenuItem key="gcash" onClick={() => { setForm(p => ({ ...p, paymentMethod: 'GCash', bankId: null })); setAnchorEl(null); }} selected={form.paymentMethod === 'GCash'}>
                        <ListItemIcon><GCashIcon fontSize="small" /></ListItemIcon>
                        <ListItemText
                          primary={methodsConfig.gcash.label || 'GCash'}
                          secondary={methodsConfig.gcash.showDetails ? methodsConfig.gcash.accountNumber : null}
                        />
                        {form.paymentMethod === 'GCash' && <CheckCircleIcon fontSize="small" color="primary" />}
                      </MenuItem>
                    ),

                    methodsConfig.maya?.enabled && (
                      <MenuItem key="maya" onClick={() => { setForm(p => ({ ...p, paymentMethod: 'Maya', bankId: null })); setAnchorEl(null); }} selected={form.paymentMethod === 'Maya'}>
                        <ListItemIcon><MayaIcon fontSize="small" /></ListItemIcon>
                        <ListItemText
                          primary={methodsConfig.maya.label || 'Maya'}
                          secondary={methodsConfig.maya.showDetails ? methodsConfig.maya.accountNumber : null}
                        />
                        {form.paymentMethod === 'Maya' && <CheckCircleIcon fontSize="small" color="primary" />}
                      </MenuItem>
                    ),

                    enabledBanks.length > 0 && (
                      <MenuItem
                        key="bank"
                        onClick={() => {
                          if (enabledBanks.length > 1) setIsSelectingBank(true);
                          else { setForm(p => ({ ...p, paymentMethod: 'Bank Transfer', bankId: enabledBanks[0].id })); setAnchorEl(null); }
                        }}
                        selected={form.paymentMethod === 'Bank Transfer'}
                      >
                        <ListItemIcon><AccountBalanceIcon fontSize="small" /></ListItemIcon>
                        <ListItemText
                          primary="Bank Transfer"
                          secondary={enabledBanks.length > 1 ? `${enabledBanks.length} accounts` : enabledBanks[0].bankName}
                        />
                        {form.paymentMethod === 'Bank Transfer' && <CheckCircleIcon fontSize="small" color="primary" />}
                        {enabledBanks.length > 1 && <KeyboardArrowDownIcon sx={{ ml: 1, opacity: 0.5, transform: 'rotate(-90deg)' }} />}
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
                        onClick={() => { setForm(p => ({ ...p, paymentMethod: 'Bank Transfer', bankId: bank.id })); setAnchorEl(null); setIsSelectingBank(false); }}
                        selected={form.paymentMethod === 'Bank Transfer' && form.bankId === bank.id}
                      >
                        <ListItemIcon>{getBankIcon(bank.bankName, { fontSize: 'small' }) || <AccountBalanceIcon fontSize="small" />}</ListItemIcon>
                        <ListItemText
                          primary={bank.bankName}
                          secondary={bank.showDetails ? bank.accountNumber : null}
                        />
                        {form.paymentMethod === 'Bank Transfer' && form.bankId === bank.id && <CheckCircleIcon fontSize="small" color="primary" />}
                      </MenuItem>
                    ))
                  ]}
                </Menu>
              </Box>

              {['GCash', 'Maya', 'Bank Transfer'].includes(form.paymentMethod) && (
                <Stack spacing={2}>
                  {activeMethodConfig.qrUrl && (
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                        SCAN QR TO PAY
                      </Typography>
                      <Box
                        component="img"
                        src={activeMethodConfig.qrUrl}
                        sx={{ width: 140, height: 140, objectFit: 'contain', mx: 'auto', borderRadius: 1 }}
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
                    <TextField size="small" label="Reference Number" placeholder="Optional" value={form.refNumber} onChange={e => setForm(p => ({ ...p, refNumber: e.target.value }))} fullWidth />
                    <TextField size="small" label="Sender Phone" placeholder="Optional" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} fullWidth />
                  </Stack>
                </Stack>
              )}

              {form.paymentMethod === 'Cash' && (
                <Box>
                  <TextField
                    inputRef={tenderedRef}
                    fullWidth label="Amount Tendered"
                    value={form.tendered}
                    onChange={e => setForm(p => ({ ...p, tendered: e.target.value }))}
                    type="number"
                    InputProps={{ sx: { fontSize: '1.5rem', height: '3.5rem', fontWeight: 900 } }}
                    error={tenderNum > 0 && tenderNum < finalTotal}
                    helperText={
                      tenderNum > 0 && tenderNum < finalTotal
                        ? `Insufficient. Need ₱${remaining.toFixed(2)} more.`
                        : 'Enter amount equal or greater than Total Due'
                    }
                    autoFocus
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 3 }}>
                    {[50, 100, 200, 500, 1000].map(a => (
                      <Button key={a} variant="outlined" size="small" onClick={() => setForm(p => ({ ...p, tendered: ((parseFloat(p.tendered) || 0) + a).toString() }))}>+{a}</Button>
                    ))}
                  </Stack>
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', p: 1.5, borderRadius: 2, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>Expected Change</Typography>
                    <Typography variant="h5" sx={{ color: '#ef5350', fontWeight: 'bold' }}>₱{change.toFixed(2)}</Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit">Cancel</Button>
          {step === 0 ? (
            <Button variant="contained" fullWidth onClick={handleNext} disabled={!canGoNext} color="primary" sx={{ py: 1.2, fontWeight: 700 }}>
              {activeSession ? 'ADD TIME (CHECKOUT)' : (isStandaloneTopup ? 'CHECKOUT (TOP-UP)' : 'CHECKOUT (ENTER)')}
            </Button>
          ) : (
            <Button variant="contained" fullWidth onClick={handleSubmit} disabled={!canConfirm || saving} color="success" sx={{ py: 1.2, fontWeight: 700 }}>
              {saving ? 'Processing...' : (activeSession ? 'CONFIRM TOP UP' : (isStandaloneTopup ? 'CONFIRM TOP UP' : 'START SESSION (ENTER)'))}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <CustomerSelectionDrawer
        open={showCustomerDrawer}
        onClose={() => setShowCustomerDrawer(false)}
        currentCustomer={form.customerId ? { id: form.customerId, fullName: form.customerName } : null}
        onSelectCustomer={(c) => {
          if (c) {
            handleSelectCustomer(c);
          } else {
            // Unlink / Walk-in
            setForm(p => ({
              ...p,
              customerId: null,
              customerName: '',
              customerType: 'walkin',
              availableMinutes: 0,
              usingBalance: false
            }));
            setEditingCustomer(true);
          }
          setShowCustomerDrawer(false);
        }}
      />
    </>
  );
}
