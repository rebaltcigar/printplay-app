import React, { useState, useEffect } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, IconButton, InputAdornment,
  InputLabel, MenuItem, Select, Stack, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../../supabase';
import PageHeader from '../common/PageHeader';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLANK_SCHEDULE = { label: '', startTime: '08:00', endTime: '17:00', days: [1, 2, 3, 4, 5], ratePerHour: '' };
const BLANK_FORM = {
  name: '', ratePerHour: '', minimumMinutes: 0,
  roundingPolicy: 'up-minute', isActive: true, schedules: [],
};

export default function Rates({ showSnackbar }) {
  const [rates, setRates] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  useEffect(() => {
    const fetchRates = async () => {
      const { data } = await supabase.from('rates').select('*').order('name');
      if (data) setRates(data);
    };

    fetchRates();

    const channel = supabase.channel('rates-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rates' }, fetchRates)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleOpen = (rate = null) => {
    setEditing(rate);
    if (rate) {
      setForm({
        name: rate.name,
        ratePerHour: rate.rate_per_minute ? (rate.rate_per_minute * 60).toFixed(2) : '',
        minimumMinutes: rate.minimum_minutes ?? 0,
        roundingPolicy: rate.rounding_policy || 'up-minute',
        isActive: rate.is_active !== false,
        schedules: (rate.schedules || []).map(s => ({
          label: s.label || '',
          startTime: s.startTime || '08:00',
          endTime: s.endTime || '17:00',
          days: s.days || [],
          ratePerHour: s.ratePerMinute ? (s.ratePerMinute * 60).toFixed(2) : '',
        })),
      });
    } else {
      setForm(BLANK_FORM);
    }
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.ratePerHour) return;
    setSaving(true);
    try {
      const ratePerMinute = parseFloat(form.ratePerHour) / 60;
      const data = {
        name: form.name.trim(),
        type: 'per-hour',
        rate_per_minute: ratePerMinute,
        minimum_minutes: Number(form.minimumMinutes) || 0,
        rounding_policy: form.roundingPolicy,
        is_active: form.isActive,
        schedules: form.schedules
          .filter(s => s.label && s.ratePerHour)
          .map(s => ({
            label: s.label,
            startTime: s.startTime,
            endTime: s.endTime,
            days: s.days,
            ratePerMinute: parseFloat(s.ratePerHour) / 60,
          })),
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('rates').update(data).eq('id', editing.id);
        if (error) throw error;
        showSnackbar('Rate updated');
      } else {
        const { error } = await supabase.from('rates').insert([{
          id: crypto.randomUUID(),
          ...data,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
        showSnackbar('Rate created');
      }
      setOpen(false);
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rate) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Rate',
      message: `Delete rate "${rate.name}"? Stations using this rate must be updated.`,
      confirmText: 'Delete',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('rates').delete().eq('id', rate.id);
          if (error) throw error;
          showSnackbar('Rate deleted');
        } catch (e) {
          showSnackbar(e.message, 'error');
        }
        setConfirmDialog({ open: false });
      },
    });
  };

  const addSchedule = () =>
    setForm(p => ({ ...p, schedules: [...p.schedules, { ...BLANK_SCHEDULE }] }));

  const updateSchedule = (i, field, val) =>
    setForm(p => ({
      ...p,
      schedules: p.schedules.map((s, idx) => idx === i ? { ...s, [field]: val } : s),
    }));

  const removeSchedule = (i) =>
    setForm(p => ({ ...p, schedules: p.schedules.filter((_, idx) => idx !== i) }));

  const toggleDay = (schedIdx, day) => {
    const s = form.schedules[schedIdx];
    const days = s.days.includes(day)
      ? s.days.filter(d => d !== day)
      : [...s.days, day].sort();
    updateSchedule(schedIdx, 'days', days);
  };

  const fmtRate = (r) => r.rate_per_minute
    ? `₱${(r.rate_per_minute * 60).toFixed(2)}/hr`
    : '—';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', p: 2 }}>
      <PageHeader
        title="Rates"
        subtitle="Billing rates for PC sessions. UI shows per-hour; stored as per-minute internally."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Rate
          </Button>
        }
      />

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Rate</TableCell>
              <TableCell>Min. Minutes</TableCell>
              <TableCell>Rounding</TableCell>
              <TableCell>Overrides</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rates.map(r => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{r.name}</TableCell>
                <TableCell>{fmtRate(r)}</TableCell>
                <TableCell>{r.minimum_minutes || 0} min</TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">{r.rounding_policy}</Typography>
                </TableCell>
                <TableCell>
                  {(r.schedules || []).length > 0
                    ? <Chip label={`${r.schedules.length} schedule${r.schedules.length > 1 ? 's' : ''}`} size="small" />
                    : <Typography variant="caption" color="text.secondary">—</Typography>
                  }
                </TableCell>
                <TableCell>
                  <Chip
                    label={r.is_active !== false ? 'Active' : 'Inactive'}
                    size="small"
                    color={r.is_active !== false ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(r)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(r)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {rates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No rates yet</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Rate' : 'Add Rate'}</DialogTitle>
        <DialogContent>
          <Stack gap={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Rate Name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              autoFocus
              placeholder="e.g. Regular, VIP, Off-Peak"
            />

            <Stack direction="row" gap={2}>
              <TextField
                label="Rate per hour"
                type="number"
                value={form.ratePerHour}
                onChange={e => setForm(p => ({ ...p, ratePerHour: e.target.value }))}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                helperText={
                  form.ratePerHour
                    ? `₱${(parseFloat(form.ratePerHour) / 60).toFixed(4)}/min stored internally`
                    : 'Enter the hourly rate'
                }
                fullWidth
                required
              />
              <TextField
                label="Minimum minutes"
                type="number"
                value={form.minimumMinutes}
                onChange={e => setForm(p => ({ ...p, minimumMinutes: e.target.value }))}
                InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                sx={{ width: 180 }}
                helperText="0 = no minimum"
              />
            </Stack>

            <FormControl fullWidth size="small">
              <InputLabel>Rounding Policy</InputLabel>
              <Select
                value={form.roundingPolicy}
                label="Rounding Policy"
                onChange={e => setForm(p => ({ ...p, roundingPolicy: e.target.value }))}
              >
                <MenuItem value="exact">Exact (to the second)</MenuItem>
                <MenuItem value="up-minute">Round up to nearest minute</MenuItem>
                <MenuItem value="up-5min">Round up to nearest 5 minutes</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                />
              }
              label="Active"
            />

            <Divider />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2">Time-of-Day Overrides</Typography>
                <Typography variant="caption" color="text.secondary">
                  Override the rate for specific time windows (e.g. off-peak hours)
                </Typography>
              </Box>
              <Button size="small" startIcon={<AddIcon />} onClick={addSchedule}>
                Add Override
              </Button>
            </Stack>

            {form.schedules.map((sched, i) => (
              <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Stack gap={1.5}>
                  <Stack direction="row" gap={1} alignItems="center">
                    <TextField
                      label="Label"
                      value={sched.label}
                      onChange={e => updateSchedule(i, 'label', e.target.value)}
                      size="small"
                      sx={{ flex: 1 }}
                      placeholder="e.g. Off-Peak"
                    />
                    <IconButton size="small" color="error" onClick={() => removeSchedule(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack direction="row" gap={1}>
                    <TextField
                      label="Start"
                      type="time"
                      value={sched.startTime}
                      onChange={e => updateSchedule(i, 'startTime', e.target.value)}
                      size="small"
                      sx={{ flex: 1 }}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="End"
                      type="time"
                      value={sched.endTime}
                      onChange={e => updateSchedule(i, 'endTime', e.target.value)}
                      size="small"
                      sx={{ flex: 1 }}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="₱/hr"
                      type="number"
                      value={sched.ratePerHour}
                      onChange={e => updateSchedule(i, 'ratePerHour', e.target.value)}
                      size="small"
                      sx={{ width: 110 }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                    />
                  </Stack>

                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {DAYS_SHORT.map((d, di) => (
                      <Chip
                        key={di}
                        label={d}
                        size="small"
                        variant={sched.days.includes(di) ? 'filled' : 'outlined'}
                        color={sched.days.includes(di) ? 'primary' : 'default'}
                        onClick={() => toggleDay(i, di)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.name.trim() || !form.ratePerHour || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={false}
        onConfirm={confirmDialog.onConfirm}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Box>
  );
}
