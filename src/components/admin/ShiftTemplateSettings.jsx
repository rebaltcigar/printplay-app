// src/components/admin/ShiftTemplateSettings.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Stack, Button, IconButton,
  TextField, Divider, CircularProgress, Chip, Tooltip, Switch, FormControlLabel,
} from '@mui/material';
import { supabase } from '../../supabase';
import PageHeader from '../common/PageHeader';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const SEEDS = [
  { name: 'Morning',   start_time: '08:00', end_time: '14:00' },
  { name: 'Afternoon', start_time: '14:00', end_time: '20:00' },
  { name: 'Evening',   start_time: '20:00', end_time: '02:00' },
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
    const fetchTemplates = async () => {
      const { data } = await supabase.from('shift_templates').select('*');
      if (data) {
        const list = [...data].sort((a, b) =>
          (a.start_time || '').localeCompare(b.start_time || '') ||
          (a.name || '').localeCompare(b.name || ''),
        );

        if (list.length === 0 && !seededRef.current) {
          seededRef.current = true;
          await supabase.from('shift_templates').insert(
            SEEDS.map(s => ({
              id: crypto.randomUUID(),
              ...s,
              is_default: true,
              disabled: false,
              created_at: new Date().toISOString(),
            }))
          );
          return; // channel will trigger re-fetch
        }

        setTemplates(list);
        setLoading(false);
      }
    };

    fetchTemplates();

    const channel = supabase.channel('shift-template-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_templates' }, fetchTemplates)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const activeCount = templates.filter(t => !t.disabled).length;

  const handleToggleDisabled = async (tpl) => {
    const willDisable = !tpl.disabled;
    if (willDisable && activeCount <= 1) {
      showSnackbar?.('At least one template must remain active.', 'warning');
      return;
    }
    try {
      const { error } = await supabase
        .from('shift_templates')
        .update({ disabled: willDisable })
        .eq('id', tpl.id);
      if (error) throw error;
      showSnackbar?.(willDisable ? `"${tpl.name}" disabled.` : `"${tpl.name}" enabled.`, 'success');
    } catch { showSnackbar?.('Failed to update template.', 'error'); }
  };

  const handleDelete = async (tpl) => {
    // Check for existing schedule entries using this template
    try {
      const { data } = await supabase
        .from('schedules')
        .select('id')
        .eq('shift_label', tpl.name)
        .limit(1);
      if (data && data.length > 0) {
        showSnackbar?.(`"${tpl.name}" has existing schedule entries. Disable it instead of deleting.`, 'warning');
        return;
      }
    } catch { /* proceed with delete if check fails */ }

    if (!window.confirm(`Permanently delete "${tpl.name}"?`)) return;
    try {
      const { error } = await supabase.from('shift_templates').delete().eq('id', tpl.id);
      if (error) throw error;
      showSnackbar?.('Template deleted.', 'success');
    } catch { showSnackbar?.('Delete failed.', 'error'); }
  };

  const handleSave = async () => {
    if (!tplForm.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name:       tplForm.name.trim(),
        start_time: tplForm.startTime,
        end_time:   tplForm.endTime,
      };
      if (editingTpl) {
        const { error } = await supabase.from('shift_templates').update(data).eq('id', editingTpl.id);
        if (error) throw error;
        showSnackbar?.('Template updated.', 'success');
      } else {
        const { error } = await supabase.from('shift_templates').insert([{
          id: crypto.randomUUID(),
          ...data,
          disabled: false,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
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
                borderColor: 'divider',
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
                    {tpl.is_default && (
                      <Chip label="Default" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                    {tpl.disabled && (
                      <Chip label="Disabled" size="small" color="default" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {tpl.start_time && tpl.end_time ? `${tpl.start_time} – ${tpl.end_time}` : 'No time set'}
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
                    setTplForm({ name: tpl.name, startTime: tpl.start_time || '', endTime: tpl.end_time || '' });
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
