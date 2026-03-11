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
import DownloadIcon from '@mui/icons-material/Download';
import { supabase } from '../../supabase';
import PageHeader from '../common/PageHeader';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';
import { generateUUID } from '../../utils/uuid';


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
    const fetchAll = async () => {
      const [{ data: stationsData }, { data: zonesData }, { data: ratesData }] = await Promise.all([
        supabase.from('stations').select('*').order('name'),
        supabase.from('zones').select('*').order('sort_order'),
        supabase.from('rates').select('*').order('name'),
      ]);
      if (stationsData) setStations(stationsData);
      if (zonesData) setZones(zonesData);
      if (ratesData) setRates(ratesData.filter(r => r.is_active !== false));
    };

    fetchAll();

    const channel = supabase.channel('stations-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rates' }, fetchAll)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleOpen = (station = null) => {
    setEditing(station);
    setForm(station ? {
      name: station.name || '',
      label: station.label || '',
      zoneId: station.zone_id || '',
      rateId: station.rate_id || '',
      macAddress: station.mac_address || '',
      ipAddress: station.ip_address || '',
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
        zone_id: form.zoneId || null,
        rate_id: form.rateId || null,
        mac_address: form.macAddress.trim(),
        ip_address: form.ipAddress.trim(),
        specs: form.specs,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('stations').update(data).eq('id', editing.id);
        if (error) throw error;
        showSnackbar('Station updated');
      } else {
        const { error } = await supabase.from('stations').insert([{
          id: generateUUID(),
          ...data,
          status: 'offline',
          current_session_id: null,
          is_online: false,
          is_locked: true,
          agent_version: null,
          last_ping: null,
          tamper_alert: false,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
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
          const { error } = await supabase.from('stations').delete().eq('id', station.id);
          if (error) throw error;
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
    try {
      const uid = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
      const agentEmail = `agent-${uid}@kunek-agent.internal`;
      const agentPassword = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');

      // Create a secondary Supabase client so we don't disturb the admin session
      const { createClient } = await import('@supabase/supabase-js');
      const secondaryClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { data: signUpData, error: signUpErr } = await secondaryClient.auth.signUp({
        email: agentEmail,
        password: agentPassword,
      });
      if (signUpErr) throw signUpErr;
      await secondaryClient.auth.signOut();

      const agentUid = signUpData.user?.id;

      // Bind the agent's UID to the station row
      const { error: updateErr } = await supabase.from('stations').update({
        agent_uid: agentUid,
        agent_email: agentEmail,
        provisioned_at: new Date().toISOString(),
      }).eq('id', station.id);
      if (updateErr) throw updateErr;

      setTokenDialog(p => ({ ...p, agentEmail, agentPassword, loading: false }));
    } catch (err) {
      setTokenDialog(p => ({ ...p, loading: false }));
      showSnackbar(`Failed to provision: ${err.message}`, 'error');
    }
  };

  const handleDownloadConfig = () => {
    const config = {
      stationId: tokenDialog.stationId,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
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
    if (station.rate_id) return rates.find(r => r.id === station.rate_id)?.name || '—';
    if (station.zone_id) {
      const zone = zones.find(z => z.id === station.zone_id);
      if (zone?.rate_id) return `${rates.find(r => r.id === zone.rate_id)?.name || '—'} (Zone)`;
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
                <TableCell>{zoneName(s.zone_id)}</TableCell>
                <TableCell>{rateName(s)}</TableCell>
                <TableCell>
                  <Chip
                    label={s.status || 'offline'}
                    size="small"
                    color={statusColor(s.status)}
                  />
                </TableCell>
                <TableCell>
                  {s.is_online
                    ? <Chip label={`Online · v${s.agent_version || '?'}`} size="small" color="success" variant="outlined" />
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
                fullWidth required autoFocus
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
                <Select value={form.zoneId} label="Zone" onChange={e => setForm(p => ({ ...p, zoneId: e.target.value }))}>
                  <MenuItem value="">No zone</MenuItem>
                  {zones.map(z => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Default Rate</InputLabel>
                <Select value={form.rateId} label="Default Rate" onChange={e => setForm(p => ({ ...p, rateId: e.target.value }))}>
                  <MenuItem value="">None</MenuItem>
                  {rates.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" gap={2}>
              <TextField label="MAC Address" value={form.macAddress} onChange={e => setForm(p => ({ ...p, macAddress: e.target.value }))} fullWidth placeholder="AA:BB:CC:DD:EE:FF" />
              <TextField label="IP Address" value={form.ipAddress} onChange={e => setForm(p => ({ ...p, ipAddress: e.target.value }))} fullWidth placeholder="192.168.1.10" />
            </Stack>

            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Hardware Specs (optional)
            </Typography>
            <Stack direction="row" gap={2}>
              <TextField label="CPU" value={form.specs.cpu} onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, cpu: e.target.value } }))} fullWidth size="small" placeholder="e.g. i7-12700" />
              <TextField label="GPU" value={form.specs.gpu} onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, gpu: e.target.value } }))} fullWidth size="small" placeholder="e.g. RTX 3060" />
            </Stack>
            <Stack direction="row" gap={2}>
              <TextField label="RAM" value={form.specs.ram} onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, ram: e.target.value } }))} fullWidth size="small" placeholder="e.g. 16GB DDR5" />
              <TextField label="Monitor" value={form.specs.monitor} onChange={e => setForm(p => ({ ...p, specs: { ...p.specs, monitor: e.target.value } }))} fullWidth size="small" placeholder={'e.g. 27" 165Hz'} />
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
