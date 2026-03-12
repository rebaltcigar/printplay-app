import React, { useState, useMemo } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, InputAdornment,
  InputLabel, MenuItem, Select, Stack, TextField, Typography, Paper
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import { supabase } from '../../supabase';
import { pcSessionService } from '../../services/pcSessionService';
import { fmtCurrency } from '../../utils/formatters';
import { generateDisplayId, getStaffIdentity } from '../../utils/idUtils';

const PAYMENT_METHODS = ['Cash', 'GCash', 'Card', 'Other'];

function getElapsedMinutes(session) {
  if (!session?.startedAt) return 0;
  const startMs = session.startedAt?.toMillis?.() || 0;
  const pausedMs = (session.minutesPaused || 0) * 60000;
  return Math.max(0, (Date.now() - startMs - pausedMs) / 60000);
}

function applyRounding(minutes, policy) {
  switch (policy) {
    case 'up-minute': return Math.ceil(minutes);
    case 'up-5min': return Math.ceil(minutes / 5) * 5;
    case 'exact': default: return minutes;
  }
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EndSessionDialog({ open, station, session, onClose, showSnackbar, user }) {
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [saveToAccount, setSaveToAccount] = useState(true);

  const isPostpaid = session?.type === 'postpaid';
  const elapsedMin = getElapsedMinutes(session);
  const unusedMin = Math.max(0, (session?.minutesAllotted || 0) - elapsedMin);
  const roundingPolicy = session?.rateSnapshot?.roundingPolicy || 'up-minute';
  const billableMinutes = applyRounding(elapsedMin, roundingPolicy);
  const ratePerMinute = session?.ratePerMinuteApplied || session?.rateSnapshot?.ratePerMinute || 0;
  const billAmount = isPostpaid ? billableMinutes * ratePerMinute : (session?.amountCharged || 0);

  const change = useMemo(() => {
    const paid = parseFloat(amountPaid);
    if (isNaN(paid)) return null;
    return paid - billAmount;
  }, [amountPaid, billAmount]);

  const canSubmit = () => {
    if (!session) return false;
    if (isPostpaid) return !!amountPaid && parseFloat(amountPaid) >= billAmount;
    return true; // prepaid: already paid, just ending
  };

  const handleSubmit = async () => {
    if (!station || !session) return;
    setSaving(true);
    try {
      const { data: { user: staffUser } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const minutesUsed = Math.round(elapsedMin);

      // Centralized End Session Logic
      await pcSessionService.endSession({
        sessionId: session.id,
        stationId: station.id,
        stationName: station.name,
        amountCharged: billAmount,
        status: 'ended',
        reason: 'manual-end',
        staffId: staffUser?.id,
        user: user
      });

      // Write transaction for postpaid (payment collected now)
      if (isPostpaid) {
        const txId = await generateDisplayId("transactions", "TX");
        await supabase.from('transactions').insert([{
          id: txId,
          item: `PC Session — ${station.label || station.name}`,
          type: 'pc-session',
          price: billAmount,
          qty: 1,
          payment_method: paymentMethod,
          staff_id: getStaffIdentity(user) || staffUser?.email || null,
          session_id: session.id,
          station_id: station.id,
          customer_id: session.customerId || null,
          customer_name: session.customerName || 'Walk-in',
          notes: `Postpaid · ${fmtDuration(billableMinutes)} · ${session.rateSnapshot?.name || ''}`,
          created_at: now,
        }]);
      }

      // Save time to account if requested
      if (saveToAccount && session.customerId && unusedMin > 1) {
        const { data: cust } = await supabase.from('customers')
          .select('minutes_remaining')
          .eq('id', session.customerId)
          .single();

        if (cust) {
          await supabase.from('customers').update({
            minutes_remaining: (cust.minutes_remaining || 0) + Math.floor(unusedMin),
            updated_at: now
          }).eq('id', session.customerId);
        }
      }

      showSnackbar(`Session ended on ${station.name}${saveToAccount && unusedMin > 1 ? ` · ${Math.floor(unusedMin)} min saved` : ''}`);
      onClose();
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        End Session — {station?.name}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2.5} sx={{ mt: 1 }}>
          {/* Session summary */}
          <Stack gap={0.5}>
            <Typography variant="body2" color="text.secondary">Customer</Typography>
            <Typography variant="body1" fontWeight={600}>
              {session.customerName || 'Walk-in'}
            </Typography>
          </Stack>

          <Stack direction="row" gap={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">Started</Typography>
              <Typography variant="body2">
                {session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : '—'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Elapsed</Typography>
              <Typography variant="body2" fontWeight={500}>
                {fmtDuration(elapsedMin)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Rate</Typography>
              <Typography variant="body2">
                {session.rateSnapshot?.name || '—'}
              </Typography>
            </Box>
          </Stack>

          <Divider />

          {/* Billing */}
          {isPostpaid ? (
            <Stack gap={2}>
              <Stack direction="row" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" color="text.secondary">Billable time</Typography>
                  <Typography variant="body1">
                    {fmtDuration(billableMinutes)}
                    {roundingPolicy !== 'exact' && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        ({roundingPolicy})
                      </Typography>
                    )}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" color="text.secondary">
                    {fmtCurrency((ratePerMinute * 60))}/hr
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="primary">
                    {fmtCurrency(billAmount)}
                  </Typography>
                </Box>
              </Stack>

              <FormControl fullWidth size="small">
                <InputLabel>Payment Method</InputLabel>
                <Select value={paymentMethod} label="Payment Method" onChange={e => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>

              <TextField
                label="Amount Received"
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                fullWidth
                autoFocus
                helperText={
                  change !== null && change >= 0
                    ? `Change: ${fmtCurrency(change)}`
                    : change !== null && change < 0
                      ? `Short by ${fmtCurrency(Math.abs(change))}`
                      : ''
                }
              />
            </Stack>
          ) : (
            <Stack gap={1}>
              <Alert severity="success">
                Prepaid session — already paid {fmtCurrency(session.amountPaid || 0)} via {session.paymentMethod}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {session.type === 'package'
                  ? `Package: ${session.packageSnapshot?.name || '—'}`
                  : `${session.minutesAllotted} minutes purchased`}
              </Typography>

              {session.customerId && unusedMin > 1 && (
                <Paper variant="outlined" sx={{ p: 2, mt: 1, border: '1px solid', borderColor: 'primary.light', bgcolor: 'primary.50' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="subtitle2" color="primary.main">SAVE UNUSED TIME?</Typography>
                      <Typography variant="h6" fontWeight={800}>{Math.floor(unusedMin)} min</Typography>
                      <Typography variant="caption" display="block">Will be added to member wallet</Typography>
                    </Box>
                    <Button
                      variant={saveToAccount ? "contained" : "outlined"}
                      size="small"
                      onClick={() => setSaveToAccount(!saveToAccount)}
                    >
                      {saveToAccount ? 'SAVING' : 'DISCARD'}
                    </Button>
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={!canSubmit() || saving}
          startIcon={saving ? <CircularProgress size={16} /> : <StopIcon />}
        >
          {saving ? 'Ending…' : 'End Session'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
