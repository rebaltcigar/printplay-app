import React, { useState, useEffect } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Alert, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../../firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import DownloadIcon from '@mui/icons-material/Download';
import PageHeader from '../common/PageHeader';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';

const BLANK_SPECS = { cpu: '', gpu: '', ram: '', monitor: '' };
const BLANK_FORM = {
  name: '', label: '', zoneId: '', rateId: '',
  macAddress: '', ipAddress: '',
  specs: { ...BLANK_SPECS },
};

export default function Stations({ showSnackbar }) {
  const [stations, setStations] = useState([]);
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const [tokenDialog, setTokenDialog] = useState({ open: false, stationId: null, stationName: '', agentEmail: '', agentPassword: '', loading: false });

  useEffect(() => {
    const onErr = (label) => (err) => console.error(`[Stations] ${label} snapshot error:`, err);
    const u1 = onSnapshot(
      collection(db, 'stations'),
      snap => setStations(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))),
      onErr('stations')
    );
    const u2 = onSnapshot(
      collection(db, 'zones'),
      snap => setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))),
      onErr('zones')
    );
    const u3 = onSnapshot(
      collection(db, 'rates'),
      snap => setRates(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.isActive !== false).sort((a, b) => a.name.localeCompare(b.name))),
      onErr('rates')
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  const handleOpen = (station = null) => {
    setEditing(station);
    setForm(station ? {
      name: station.name || '',
      label: station.label || '',
      zoneId: station.zoneId || '',
      rateId: station.rateId || '',
      macAddress: station.macAddress || '',
      ipAddress: station.ipAddress || '',
      specs: { ...BLANK_SPECS, ...(station.specs || {}) },
    } : BLANK_FORM);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        label: form.label.trim(),
        zoneId: form.zoneId || null,
        rateId: form.rateId || null,
        macAddress: form.macAddress.trim(),
        ipAddress: form.ipAddress.trim(),
        specs: form.specs,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'stations', editing.id), data);
        showSnackbar('Station updated');
      } else {
        await addDoc(collection(db, 'stations'), {
          ...data,
          status: 'offline',
          currentSessionId: null,
          isOnline: false,
          isLocked: true,
          agentVersion: null,
          agentLastPing: null,
          tamperAlert: false,
          createdAt: serverTimestamp(),
        });
        showSnackbar('Station created');
      }
      setOpen(false);
    } catch (e) {
      showSnackbar(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (station) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Station',
      message: `Delete station "${station.name}"? This cannot be undone. End any active sessions first.`,
      confirmText: 'Delete',
      confirmColor: 'error',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'stations', station.id));
          showSnackbar('Station deleted');
        } catch (e) {
          showSnackbar(e.message, 'error');
        }
        setConfirmDialog({ open: false });
      },
    });
  };

  const handleGenerateToken = async (station) => {
    setTokenDialog({ open: true, stationId: station.id, stationName: station.name, agentEmail: '', agentPassword: '', loading: true });
    let secondaryApp = null;
    try {
      // Generate unique agent credentials (no Cloud Function needed)
      const uid = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
      const agentEmail = `agent-${uid}@kunek-agent.internal`;
      const agentPassword = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');

      // Use a secondary app instance so we don't sign out the current admin
      secondaryApp = initializeApp(firebaseConfig, `provision-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const credential = await createUserWithEmailAndPassword(secondaryAuth, agentEmail, agentPassword);

      // Bind the agent's UID to the station doc
      await updateDoc(doc(db, 'stations', station.id), {
        agentUid: credential.user.uid,
        agentEmail,
        provisionedAt: serverTimestamp(),
      });

      setTokenDialog(p => ({ ...p, agentEmail, agentPassword, loading: false }));
    } catch (err) {
      setTokenDialog(p => ({ ...p, loading: false }));
      showSnackbar(`Failed to provision: ${err.message}`, 'error');
    } finally {
      if (secondaryApp) deleteApp(secondaryApp).catch(() => { });
    }
  };

  const handleDownloadConfig = () => {
    const config = {
      stationId: tokenDialog.stationId,
      firestoreProjectId: firebaseConfig.projectId,
      firebaseApiKey: firebaseConfig.apiKey,
      firebaseAuthDomain: firebaseConfig.authDomain,
      agentEmail: tokenDialog.agentEmail,
      agentPassword: tokenDialog.agentPassword,
      videoBackgroundPath: 'C:\\ProgramData\\KunekAgent\\bg.mp4',
      provisionedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(url);
    showSnackbar('config.json downloaded');
  };

  const zoneName = (id) => zones.find(z => z.id === id)?.name || '—';
  const rateName = (station) => {
    if (station.rateId) return rates.find(r => r.id === station.rateId)?.name || '—';
    if (station.zoneId) {
      const zone = zones.find(z => z.id === station.zoneId);
      if (zone?.rateId) return `${rates.find(r => r.id === zone.rateId)?.name || '—'} (Zone)`;
    }
    return '—';
  };

  const statusColor = (s) => {
    switch (s) {
      case 'available': return 'success';
      case 'in-use': return 'primary';
      case 'maintenance': return 'warning';
      case 'offline': default: return 'default';
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', p: 2 }}>
      <PageHeader
        title="Stations"
        subtitle="Manage PC stations, zones, and agent provisioning"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Station
          </Button>
        }
      />

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>Zone</TableCell>
              <TableCell>Default Rate</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Agent</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stations.map(s => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{s.label || '—'}</Typography>
                </TableCell>
                <TableCell>{zoneName(s.zoneId)}</TableCell>
                <TableCell>{rateName(s)}</TableCell>
                <TableCell>
                  <Chip
                    label={s.status || 'offline'}
                    size="small"
                    color={statusColor(s.status)}
                  />
                </TableCell>
                <TableCell>
                  {s.isOnline
                    ? <Chip label={`Online · v${s.agentVersion || '?'}`} size="small" color="success" variant="outlined" />
                    : <Chip label="Offline" size="small" variant="outlined" />
                  }
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Generate provisioning token">
                    <IconButton size="small" onClick={() => handleGenerateToken(s)}>
                      <VpnKeyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small" onClick={() => handleOpen(s)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(s)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {stations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No stations yet — add one to get started
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Station' : 'Add Station'}</DialogTitle>
        <DialogContent>
          <Stack gap={2.5} sx={{ mt: 1 }}>
            <Stack direction="row" gap={2}>
              <TextField
                label="Station ID / Name"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                fullWidth
                required
                autoFocus
                placeholder="e.g. PC-01"
                helperText="Short identifier, must be unique"
              />
              <TextField
                label="Display Label"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                fullWidth
                placeholder="e.g. VIP Booth 1"
                helperText="Shown on map & receipts"
              />
            </Stack>

            <Stack direction="row" gap={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Zone</InputLabel>
                <Select
                  value={form.zoneId}
                  label="Zone"
                  onChange={e => setForm(p => ({ ...p, zoneId: e.target.value }))}
                >
                  <MenuItem value="">No zone</MenuItem>
                  {zones.map(z => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Default Rate</InputLabel>
                <Select
                  value={form.rateId}
                  label="Default Rate"
                  onChange={e => setForm(p => ({ ...p, rateId: e.target.value }))}
                >
                  <MenuItem value="">None</MenuItem>
                  {rates.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" gap={2}>
              <TextField
                label="MAC Address"
                value={form.macAddress}
                onChange={e => setForm(p => ({ ...p, macAddress: e.target.value }))}
                fullWidth
                placeholder="AA:BB:CC:DD:EE:FF"
              />
              <TextField
                label="IP Address"
                value={form.ipAddress}
                onChange={e => setForm(p => ({ ...p, ipAddress: e.target.value }))}
                fullWidth
                placeholder="192.168.1.10"
              />
            </Stack>

            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Hardware Specs (optional)
            </Typography>
            <Stack direction="row" gap={2}>
              <TextField
                label="CPU"
                value={form.specs.cpu}
                onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, cpu: e.target.value } }))}
                fullWidth
                size="small"
                placeholder="e.g. i7-12700"
              />
              <TextField
                label="GPU"
                value={form.specs.gpu}
                onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, gpu: e.target.value } }))}
                fullWidth
                size="small"
                placeholder="e.g. RTX 3060"
              />
            </Stack>
            <Stack direction="row" gap={2}>
              <TextField
                label="RAM"
                value={form.specs.ram}
                onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, ram: e.target.value } }))}
                fullWidth
                size="small"
                placeholder="e.g. 16GB DDR5"
              />
              <TextField
                label="Monitor"
                value={form.specs.monitor}
                onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, monitor: e.target.value } }))}
                fullWidth
                size="small"
                placeholder={'e.g. 27" 165Hz'}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Provisioning Token Dialog */}
      <Dialog open={tokenDialog.open} onClose={() => setTokenDialog(p => ({ ...p, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>Provisioning Token — {tokenDialog.stationName}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            {tokenDialog.loading ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                Generating token…
              </Typography>
            ) : tokenDialog.agentEmail ? (
              <>
                <Alert severity="success">
                  Agent credentials created. Download <strong>config.json</strong> and place it in{' '}
                  <code>C:\ProgramData\KunekAgent\</code> on <strong>{tokenDialog.stationName}</strong>.
                  Then run <code>npm run install-service</code> if not already installed.
                </Alert>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadConfig}
                  fullWidth
                >
                  Download config.json
                </Button>
                <Typography variant="caption" color="text.secondary">
                  The file contains all credentials. Keep it secure — it will not be shown again.
                </Typography>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTokenDialog(p => ({ ...p, open: false }))}>Close</Button>
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
