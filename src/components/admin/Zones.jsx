import React, { useState, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
  FormControl, InputLabel, MenuItem, Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../../supabase';
import PageHeader from '../common/PageHeader';
import ConfirmationReasonDialog from '../dialogs/ConfirmationReasonDialog';
import { generateUUID } from '../../utils/uuid';


const BLANK = { name: '', color: '#1976d2', sortOrder: 0, rateId: '' };

export default function Zones({ showSnackbar }) {
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  useEffect(() => {
    const fetchAll = async () => {
      const [{ data: zonesData }, { data: ratesData }] = await Promise.all([
        supabase.from('zones').select('*').order('sort_order'),
        supabase.from('rates').select('*').order('name'),
      ]);
      if (zonesData) setZones(zonesData);
      if (ratesData) setRates(ratesData.filter(r => r.is_active !== false));
    };

    fetchAll();

    const channel = supabase.channel('zones-rates-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rates' }, fetchAll)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleOpen = (zone = null) => {
    setEditing(zone);
    setForm(zone
      ? { name: zone.name, color: zone.color || '#1976d2', sortOrder: zone.sort_order ?? 0, rateId: zone.rate_id || '' }
      : BLANK
    );
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        color: form.color,
        sort_order: Number(form.sortOrder),
        rate_id: form.rateId || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('zones').update(data).eq('id', editing.id);
        if (error) throw error;
        showSnackbar('Zone updated');
      } else {
        const { error } = await supabase.from('zones').insert([{
          id: generateUUID(),
          ...data,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
        showSnackbar('Zone created');
      }
      setOpen(false);
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (zone) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Zone',
      message: `Delete zone "${zone.name}"? Stations assigned to this zone must be reassigned first.`,
      confirmText: 'Delete',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('zones').delete().eq('id', zone.id);
          if (error) throw error;
          showSnackbar('Zone deleted');
        } catch (e) {
          showSnackbar(e.message, 'error');
        }
        setConfirmDialog({ open: false });
      },
    });
  };

  const rateName = (id) => rates.find(r => r.id === id)?.name || '—';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', p: 2 }}>
      <PageHeader
        title="Zones"
        subtitle="Group PC stations by area (VIP, Regular, Gaming Pods, etc.)"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Zone
          </Button>
        }
      />

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Assigned Rate</TableCell>
              <TableCell>Color</TableCell>
              <TableCell>Sort Order</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {zones.map(z => (
              <TableRow key={z.id} hover>
                <TableCell>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: z.color, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={500}>{z.name}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{rateName(z.rate_id)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {z.color}
                  </Typography>
                </TableCell>
                <TableCell>{z.sort_order ?? 0}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(z)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(z)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {zones.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No zones yet — add one to get started
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit Zone' : 'Add Zone'}</DialogTitle>
        <DialogContent>
          <Stack gap={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Zone Name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              placeholder="e.g. VIP, Regular, Gaming Pod"
              autoFocus
            />

            <FormControl fullWidth size="small">
              <InputLabel>Assigned Rate (Auto-select)</InputLabel>
              <Select
                value={form.rateId}
                label="Assigned Rate (Auto-select)"
                onChange={e => setForm(p => ({ ...p, rateId: e.target.value }))}
              >
                <MenuItem value=""><em>None (manual selection)</em></MenuItem>
                {rates.map(r => (
                  <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, px: 1 }}>
                If set, this rate will be auto-selected when starting sessions in this zone.
              </Typography>
            </FormControl>

            <Stack direction="row" alignItems="center" gap={2}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40 }}>Color</Typography>
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                style={{ width: 44, height: 28, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
              />
              <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: form.color }} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                {form.color}
              </Typography>
            </Stack>
            <TextField
              label="Sort Order"
              type="number"
              value={form.sortOrder}
              onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))}
              size="small"
              sx={{ width: 140 }}
              helperText="Lower = appears first"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim() || saving}>
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
