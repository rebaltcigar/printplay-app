// src/components/admin/ShiftTemplateSettings.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Stack, Button, IconButton,
  TextField, Divider, CircularProgress, Chip, Tooltip, Switch, FormControlLabel,
} from '@mui/material';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, writeBatch, serverTimestamp, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import PageHeader from '../common/PageHeader';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const SEEDS = [
  { name: 'Morning',   startTime: '08:00', endTime: '14:00' },
  { name: 'Afternoon', startTime: '14:00', endTime: '20:00' },
  { name: 'Evening',   startTime: '20:00', endTime: '02:00' },
];
const BLANK = { name: '', startTime: '', endTime: '' };

export default function ShiftTemplateSettings({ showSnackbar }) {
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tplForm, setTplForm]       = useState(BLANK);
  const [editingTpl, setEditingTpl] = useState(null);
  const [saving, setSaving]         = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shiftTemplates'), async snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) =>
        (a.startTime || '').localeCompare(b.startTime || '') ||
        (a.name || '').localeCompare(b.name || ''),
      );

      if (list.length === 0 && !seededRef.current) {
        seededRef.current = true;
        const batch = writeBatch(db);
        for (const seed of SEEDS) {
          batch.set(doc(collection(db, 'shiftTemplates')), {
            ...seed, isDefault: true, disabled: false, createdAt: serverTimestamp(),
          });
        }
        await batch.commit().catch(console.error);
        return;
      }

      setTemplates(list);
      setLoading(false);
    }, err => { console.error('ShiftTemplates:', err); setLoading(false); });
    return unsub;
  }, []);

  const activeCount = templates.filter(t => !t.disabled).length;

  const handleToggleDisabled = async (tpl) => {
    const willDisable = !tpl.disabled;
    if (willDisable && activeCount <= 1) {
      showSnackbar?.('At least one template must remain active.', 'warning');
      return;
    }
    try {
      await updateDoc(doc(db, 'shiftTemplates', tpl.id), { disabled: willDisable });
      showSnackbar?.(willDisable ? `"${tpl.name}" disabled.` : `"${tpl.name}" enabled.`, 'success');
    } catch { showSnackbar?.('Failed to update template.', 'error'); }
  };

  const handleDelete = async (tpl) => {
    // Check for existing schedule entries using this template
    try {
      const snap = await getDocs(query(collection(db, 'schedules'), where('shiftLabel', '==', tpl.name)));
      if (!snap.empty) {
        showSnackbar?.(
          `"${tpl.name}" has ${snap.size} existing schedule entries. Disable it instead of deleting.`,
          'warning',
        );
        return;
      }
    } catch { /* proceed with delete if check fails */ }

    if (!window.confirm(`Permanently delete "${tpl.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'shiftTemplates', tpl.id));
      showSnackbar?.('Template deleted.', 'success');
    } catch { showSnackbar?.('Delete failed.', 'error'); }
  };

  const handleSave = async () => {
    if (!tplForm.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name:      tplForm.name.trim(),
        startTime: tplForm.startTime,
        endTime:   tplForm.endTime,
      };
      if (editingTpl) {
        await updateDoc(doc(db, 'shiftTemplates', editingTpl.id), data);
        showSnackbar?.('Template updated.', 'success');
      } else {
        await addDoc(collection(db, 'shiftTemplates'), { ...data, disabled: false });
        showSnackbar?.('Template added.', 'success');
      }
      setEditingTpl(null);
      setTplForm(BLANK);
    } catch { showSnackbar?.('Failed to save template.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 600 }}>
      <PageHeader
        title="Shift Templates"
        subtitle="Define the shift labels and default times used when scheduling staff"
      />

      {loading ? (
        <CircularProgress size={24} sx={{ mt: 2 }} />
      ) : (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {templates.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No templates yet. Add one below.
            </Typography>
          )}

          {templates.map(tpl => (
            <Box
              key={tpl.id}
              sx={{
                p: 1.5, border: '1px solid',
                borderColor: tpl.disabled ? 'divider' : 'divider',
                borderRadius: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                opacity: tpl.disabled ? 0.5 : 1,
                bgcolor: editingTpl?.id === tpl.id ? 'action.selected' : 'transparent',
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <AccessTimeIcon fontSize="small" color={tpl.disabled ? 'disabled' : 'action'} />
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" fontWeight={600}>{tpl.name}</Typography>
                    {tpl.isDefault && (
                      <Chip label="Default" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                    {tpl.disabled && (
                      <Chip label="Disabled" size="small" color="default" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {tpl.startTime && tpl.endTime ? `${tpl.startTime} – ${tpl.endTime}` : 'No time set'}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={0.5} alignItems="center">
                <Tooltip title={tpl.disabled ? 'Enable' : (activeCount <= 1 ? 'Cannot disable last active template' : 'Disable')}>
                  <span>
                    <Switch
                      size="small"
                      checked={!tpl.disabled}
                      onChange={() => handleToggleDisabled(tpl)}
                      disabled={!tpl.disabled && activeCount <= 1}
                    />
                  </span>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={() => {
                    setEditingTpl(tpl);
                    setTplForm({ name: tpl.name, startTime: tpl.startTime || '', endTime: tpl.endTime || '' });
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <Tooltip title={tpl.disabled ? 'Delete (disabled templates only)' : 'Disable before deleting'}>
                  <span>
                    <IconButton
                      size="small" color="error"
                      onClick={() => handleDelete(tpl)}
                      disabled={!tpl.disabled}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          ))}

          <Divider sx={{ my: 1 }} />

          <Typography variant="subtitle2" fontWeight={600}>
            {editingTpl ? `Editing: ${editingTpl.name}` : 'New Template'}
          </Typography>

          <TextField
            label="Name" size="small"
            value={tplForm.name}
            onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))}
            fullWidth disabled={saving}
            placeholder="e.g. Morning, Split Shift, Weekend"
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Start" type="time" size="small"
              value={tplForm.startTime}
              onChange={e => setTplForm(f => ({ ...f, startTime: e.target.value }))}
              fullWidth disabled={saving} InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End" type="time" size="small"
              value={tplForm.endTime}
              onChange={e => setTplForm(f => ({ ...f, endTime: e.target.value }))}
              fullWidth disabled={saving} InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained" size="small"
              onClick={handleSave}
              disabled={saving || !tplForm.name.trim()}
            >
              {editingTpl ? 'Update' : 'Add Template'}
            </Button>
            {editingTpl && (
              <Button size="small" onClick={() => { setEditingTpl(null); setTplForm(BLANK); }} disabled={saving}>
                Cancel
              </Button>
            )}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
