import React, { useState, useEffect } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, IconButton, InputAdornment,
  InputLabel, MenuItem, Select, Stack, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import PageHeader from '../common/PageHeader';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';

const BLANK_FORM = {
  name: '', minutes: '', price: '', bonusMinutes: 0,
  validDays: 0, rateId: '', isActive: true, sortOrder: 0,
};

export default function Packages({ showSnackbar }) {
  const [packages, setPackages] = useState([]);
  const [rates, setRates] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  useEffect(() => {
    const onErr = (label) => (err) => console.error(`[Packages] ${label} snapshot error:`, err);
    const u1 = onSnapshot(
      collection(db, 'packages'),
      snap => setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))),
      onErr('packages')
    );
    const u2 = onSnapshot(
      collection(db, 'rates'),
      snap => setRates(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.isActive !== false).sort((a, b) => a.name.localeCompare(b.name))),
      onErr('rates')
    );
    return () => { u1(); u2(); };
  }, []);

  const handleOpen = (pkg = null) => {
    setEditing(pkg);
    setForm(pkg ? {
      name: pkg.name,
      minutes: pkg.minutes,
      price: pkg.price,
      bonusMinutes: pkg.bonusMinutes ?? 0,
      validDays: pkg.validDays ?? 0,
      rateId: pkg.rateId || '',
      isActive: pkg.isActive !== false,
      sortOrder: pkg.sortOrder ?? 0,
    } : BLANK_FORM);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.minutes || !form.price) return;
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        minutes: Number(form.minutes),
        price: parseFloat(form.price),
        bonusMinutes: Number(form.bonusMinutes) || 0,
        validDays: Number(form.validDays) || 0,
        rateId: form.rateId || null,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'packages', editing.id), data);
        showSnackbar('Package updated');
      } else {
        await addDoc(collection(db, 'packages'), { ...data, createdAt: serverTimestamp() });
        showSnackbar('Package created');
      }
      setOpen(false);
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (pkg) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Package',
      message: `Delete package "${pkg.name}"?`,
      confirmText: 'Delete',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'packages', pkg.id));
          showSnackbar('Package deleted');
        } catch (e) {
          showSnackbar(e.message, 'error');
        }
        setConfirmDialog({ open: false });
      },
    });
  };

  const rateName = (id) => rates.find(r => r.id === id)?.name || '—';

  const fmtDuration = (p) => {
    const total = (p.minutes || 0) + (p.bonusMinutes || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const base = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
    return p.bonusMinutes > 0 ? `${p.minutes}m +${p.bonusMinutes}m bonus = ${base}` : base;
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', p: 2 }}>
      <PageHeader
        title="Packages"
        subtitle="Pre-paid time bundles customers can purchase"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Package
          </Button>
        }
      />

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Rate Plan</TableCell>
              <TableCell>Expiry</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {packages.map(p => (
              <TableRow key={p.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                <TableCell>
                  <Typography variant="body2">{fmtDuration(p)}</Typography>
                </TableCell>
                <TableCell>₱{parseFloat(p.price || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Typography variant="body2" color={p.rateId ? 'text.primary' : 'text.secondary'}>
                    {rateName(p.rateId)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {p.validDays > 0 ? `${p.validDays} day${p.validDays > 1 ? 's' : ''}` : 'Session only'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={p.isActive !== false ? 'Active' : 'Inactive'}
                    size="small"
                    color={p.isActive !== false ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpen(p)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(p)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {packages.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No packages yet</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Package' : 'Add Package'}</DialogTitle>
        <DialogContent>
          <Stack gap={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Package Name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              autoFocus
              placeholder="e.g. 3-Hour Bundle, Student Package"
            />

            <Stack direction="row" gap={2}>
              <TextField
                label="Base Minutes"
                type="number"
                value={form.minutes}
                onChange={e => setForm(p => ({ ...p, minutes: e.target.value }))}
                fullWidth
                required
                InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
              />
              <TextField
                label="Bonus Minutes"
                type="number"
                value={form.bonusMinutes}
                onChange={e => setForm(p => ({ ...p, bonusMinutes: e.target.value }))}
                sx={{ width: 160 }}
                InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                helperText="Promo extra time"
              />
            </Stack>

            <Stack direction="row" gap={2}>
              <TextField
                label="Price"
                type="number"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                fullWidth
                required
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              />
              <TextField
                label="Valid for (days)"
                type="number"
                value={form.validDays}
                onChange={e => setForm(p => ({ ...p, validDays: e.target.value }))}
                sx={{ width: 160 }}
                helperText="0 = current session only"
              />
            </Stack>

            <FormControl fullWidth size="small">
              <InputLabel>Rate Plan (optional)</InputLabel>
              <Select
                value={form.rateId}
                label="Rate Plan (optional)"
                onChange={e => setForm(p => ({ ...p, rateId: e.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {rates.map(r => (
                  <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" gap={2} alignItems="center">
              <TextField
                label="Sort Order"
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))}
                size="small"
                sx={{ width: 130 }}
                helperText="Lower = first in list"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isActive}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                  />
                }
                label="Active"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.name.trim() || !form.minutes || !form.price || saving}
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
