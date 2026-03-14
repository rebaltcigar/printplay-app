// src/components/admin/Schedule.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, Stack, Chip, IconButton, Tabs, Tab,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Tooltip, Divider, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CircularProgress, Alert,
} from '@mui/material';
import { supabase } from '../../supabase';
import { useStaff } from '../../contexts/StaffContext';
import { fmtShortDate, fmtDayOfWeek, fmtDate } from '../../utils/formatters';
import { getFriendlyErrorMessage } from '../../services/errorService';
import { ROLES } from '../../utils/permissions';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import DetailDrawer from '../common/DetailDrawer';

import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PeopleIcon from '@mui/icons-material/People';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TuneIcon from '@mui/icons-material/Tune';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { generateUUID } from '../../utils/uuid';


// ---------- Date helpers ----------
function todayPHT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}
function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return dateToStr(d);
}
function getWeekDates(ws) {
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}
function fmtShort(dateStr) {
  return fmtShortDate(dateStr + 'T00:00:00');
}
function fmtDay(dateStr) {
  return fmtDayOfWeek(dateStr + 'T00:00:00');
}
function fmtRange(s, e) {
  const sd = new Date(s + 'T00:00:00');
  const ed = new Date(e + 'T00:00:00');
  return `${fmtDate(sd)} – ${fmtDate(ed)}`;
}

// ---------- Constants ----------
const STATUS_CFG = {
  scheduled: { label: 'Scheduled', color: 'primary' },
  'in-progress': { label: 'On Shift', color: 'success' },
  completed: { label: 'Done', color: 'default' },
  absent: { label: 'Absent', color: 'error' },
  covered: { label: 'Covered', color: 'warning' },
};

const TEMPLATE_SEEDS = [
  { name: 'Morning', start_time: '08:00', end_time: '14:00' },
  { name: 'Afternoon', start_time: '14:00', end_time: '20:00' },
  { name: 'Evening', start_time: '20:00', end_time: '02:00' },
];

const BLANK_ENTRY = { staffEmail: '', date: '', shiftLabel: '', startTime: '', endTime: '', notes: '', status: 'scheduled' };
const BLANK_TPL = { name: '', startTime: '', endTime: '' };

// ---------- Staff chip ----------
function StaffChip({ entry, onEdit, onDelete, onAbsent, onCoverage, userMap }) {
  const cfg = STATUS_CFG[entry.status] || STATUS_CFG.scheduled;
  return (
    <Box
      sx={{
        mb: 0.5, p: '4px 6px', borderRadius: 1,
        bgcolor: entry.status === 'absent' ? 'rgba(211,47,47,.08)'
          : entry.status === 'covered' ? 'rgba(237,108,2,.08)'
            : 'action.hover',
        '&:hover .ea': { display: 'flex' }, position: 'relative',
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={0.5}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" fontWeight={600} display="block" noWrap lineHeight={1.3}>
            {entry.staff_name || entry.staff_email}
          </Typography>
          {entry.covered_by_id && (
            <Typography variant="caption" color="warning.main" display="block" noWrap lineHeight={1.2}>
              ↳ {userMap?.[entry.covered_by_id] || 'Covered'}
            </Typography>
          )}
        </Box>
        <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontSize: '0.58rem', height: 15, mt: 0.25, flexShrink: 0 }} />
      </Stack>

      {/* Hover actions */}
      <Stack
        className="ea" direction="row" spacing={0}
        sx={{ display: 'none', position: 'absolute', top: 1, right: 1, bgcolor: 'background.paper', borderRadius: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip title="Edit"><IconButton size="small" onClick={() => onEdit(entry)}><EditIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
        {entry.status === 'scheduled' && (
          <Tooltip title="Mark Absent"><IconButton size="small" onClick={() => onAbsent(entry)}><PersonOffIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
        )}
        {entry.status === 'absent' && (
          <Tooltip title="Assign Coverage"><IconButton size="small" onClick={() => onCoverage(entry)}><PeopleIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
        )}
        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDelete(entry)}><DeleteIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
      </Stack>
    </Box>
  );
}

// ---------- Main component ----------
export default function Schedule({ showSnackbar }) {
  const { staffOptions, userMap, loading: staffLoading } = useStaff();
  const staffOnly = useMemo(() => staffOptions.filter(s => s.role === ROLES.STAFF), [staffOptions]);

  const [tab, setTab] = useState(0);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayPHT()));
  const [entries, setEntries] = useState([]);
  const [templates, setTemplates] = useState([]);
  const tplSeededRef = useRef(false);
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Drawers & dialogs
  const [entryDrawer, setEntryDrawer] = useState({ open: false, mode: 'create', entry: null });
  const [tplDrawerOpen, setTplDrawerOpen] = useState(false);
  const [coverDlg, setCoverDlg] = useState({ open: false, entry: null });

  // Forms
  const [entryForm, setEntryForm] = useState(BLANK_ENTRY);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [tplForm, setTplForm] = useState(BLANK_TPL);
  const [editingTpl, setEditingTpl] = useState(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [coverStaff, setCoverStaff] = useState('');
  const [savingCover, setSavingCover] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = todayPHT();

  // Subscribe entries for current week
  useEffect(() => {
    setLoadingEntries(true);
    const fetchEntries = async () => {
      const { data } = await supabase
        .from('schedules')
        .select('*')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      if (data) setEntries(data);
      setLoadingEntries(false);
    };

    fetchEntries();

    const channel = supabase.channel(`schedule-entries-${weekStart}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, fetchEntries)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [weekStart, weekEnd]);

  // Subscribe shift templates — seeds defaults on first run if table is empty
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('shift_templates').select('*');
      if (data) {
        const list = [...data].sort((a, b) =>
          (a.start_time || '').localeCompare(b.start_time || '') ||
          (a.name || '').localeCompare(b.name || ''),
        );

        if (list.length === 0 && !tplSeededRef.current) {
          tplSeededRef.current = true;
          await supabase.from('shift_templates').insert(
            TEMPLATE_SEEDS.map(s => ({
              id: generateUUID(),
              ...s,
              is_default: true,
              disabled: false,
              created_at: new Date().toISOString(),
            }))
          );
          return;
        }

        setTemplates(list);
      }
    };

    fetchTemplates();

    const channel = supabase.channel('schedule-templates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_templates' }, fetchTemplates)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Derived: entries keyed by shift_label → date → [entries]
  const byShiftByDate = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const key = e.shift_label;
      if (!map[key]) map[key] = {};
      if (!map[key][e.date]) map[key][e.date] = [];
      map[key][e.date].push(e);
    }
    return map;
  }, [entries]);

  const activeTemplates = useMemo(() => templates.filter(t => !t.disabled), [templates]);

  const absenceEntries = useMemo(() =>
    [...entries]
      .filter(e => e.status === 'absent' || e.status === 'covered')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.staff_name || '').localeCompare(b.staff_name || '')),
    [entries]
  );

  const summaryCards = useMemo(() => ([
    { label: 'Scheduled', value: String(entries.filter(e => e.status === 'scheduled').length), color: 'primary.main' },
    { label: 'On Shift', value: String(entries.filter(e => e.status === 'in-progress').length), color: 'success.main' },
    { label: 'Absent', value: String(entries.filter(e => e.status === 'absent').length), color: 'error.main' },
    { label: 'Covered', value: String(entries.filter(e => e.status === 'covered').length), color: 'warning.main' },
  ]), [entries]);

  // --- Navigation ---
  const prevWeek = () => setWeekStart(ws => addDays(ws, -7));
  const nextWeek = () => setWeekStart(ws => addDays(ws, 7));
  const goToday = () => setWeekStart(getWeekStart(todayPHT()));

  // --- Open entry drawer ---
  const openCreate = useCallback((staffEmail = '', date = '', shiftLabel = '') => {
    setFormErr('');
    const tpl = shiftLabel ? templates.find(t => t.name === shiftLabel) : null;
    setEntryForm({
      ...BLANK_ENTRY,
      staffEmail,
      date: date || todayPHT(),
      shiftLabel: shiftLabel || '',
      startTime: tpl?.start_time || '',
      endTime: tpl?.end_time || '',
    });
    setEntryDrawer({ open: true, mode: 'create', entry: null });
  }, [templates]);

  const openEdit = useCallback((entry) => {
    setFormErr('');
    setEntryForm({
      staffEmail: entry.staff_email || '',
      date: entry.date || '',
      shiftLabel: entry.shift_label || '',
      startTime: entry.start_time || '',
      endTime: entry.end_time || '',
      notes: entry.notes || '',
      status: entry.status || 'scheduled',
    });
    setEntryDrawer({ open: true, mode: 'edit', entry });
  }, []);

  const handleTplSelect = (name) => {
    const tpl = templates.find(t => t.name === name);
    setEntryForm(f => ({ ...f, shiftLabel: name, startTime: tpl?.start_time || '', endTime: tpl?.end_time || '' }));
  };

  // --- CRUD entry ---
  const handleSaveEntry = async () => {
    if (!entryForm.staffEmail) { setFormErr('Select a staff member.'); return; }
    if (!entryForm.date) { setFormErr('Select a date.'); return; }
    if (!entryForm.shiftLabel) { setFormErr('Select a shift template.'); return; }
    setSaving(true); setFormErr('');
    try {
      const staff = staffOnly.find(s => s.email === entryForm.staffEmail);
      const now = new Date().toISOString();
      const data = {
        staff_uid: staff?.uid || '',
        staff_email: entryForm.staffEmail,
        staff_name: staff ? (staff.fullName || staff.email) : entryForm.staffEmail,
        date: entryForm.date,
        shift_label: entryForm.shiftLabel,
        start_time: entryForm.startTime,
        end_time: entryForm.endTime,
        status: entryForm.status || 'scheduled',
        notes: entryForm.notes || '',
        updated_at: now,
      };
      if (entryDrawer.mode === 'create') {
        const { error } = await supabase.from('schedules').insert([{
          id: generateUUID(),
          ...data,
          created_at: now,
        }]);
        if (error) throw error;
        showSnackbar?.('Schedule entry added.', 'success');
      } else {
        const { error } = await supabase.from('schedules').update(data).eq('id', entryDrawer.entry.id);
        if (error) throw error;
        showSnackbar?.('Schedule entry updated.', 'success');
      }
      setEntryDrawer(p => ({ ...p, open: false }));
    } catch (err) {
      setFormErr(getFriendlyErrorMessage(err));
      console.error(err);
    } finally { setSaving(false); }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete schedule entry for ${entry.staff_name || entry.staff_email}?`)) return;
    try {
      const { error } = await supabase.from('schedules').delete().eq('id', entry.id);
      if (error) throw error;
      showSnackbar?.('Entry deleted.', 'success');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
  };

  const handleMarkAbsent = async (entry) => {
    try {
      const { error } = await supabase
        .from('schedules')
        .update({ status: 'absent', updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) throw error;
      showSnackbar?.(`${entry.staff_name || entry.staff_email} marked absent.`, 'warning');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
  };

  const handleAssignCoverage = async () => {
    if (!coverStaff) return;
    setSavingCover(true);
    try {
      const s = staffOnly.find(x => x.email === coverStaff);
      const { error } = await supabase.from('schedules').update({
        status: 'covered',
        covered_by_id: s?.id || null,
        updated_at: new Date().toISOString(),
      }).eq('id', coverDlg.entry.id);
      if (error) throw error;
      showSnackbar?.('Coverage assigned.', 'success');
      setCoverDlg({ open: false, entry: null }); setCoverStaff('');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
    finally { setSavingCover(false); }
  };

  // --- Copy last week ---
  const handleCopyLastWeek = async () => {
    const lws = addDays(weekStart, -7);
    const lwe = addDays(lws, 6);
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .gte('date', lws)
        .lte('date', lwe);
      if (error) throw error;
      if (!data || data.length === 0) { showSnackbar?.('No entries found last week.', 'info'); return; }

      const now = new Date().toISOString();
      const inserts = data.map(x => ({
        id: generateUUID(),
        staff_uid: x.staff_uid || '',
        staff_email: x.staff_email,
        staff_name: x.staff_name || '',
        date: addDays(x.date, 7),
        shift_label: x.shift_label,
        start_time: x.start_time || '',
        end_time: x.end_time || '',
        status: 'scheduled',
        notes: x.notes || '',
        created_at: now,
        updated_at: now,
      }));

      const { error: insertErr } = await supabase.from('schedules').insert(inserts);
      if (insertErr) throw insertErr;
      showSnackbar?.(`Copied ${inserts.length} entries to this week.`, 'success');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); console.error(err); }
  };

  // --- Template CRUD ---
  const handleSaveTpl = async () => {
    if (!tplForm.name.trim()) return;
    setSavingTpl(true);
    try {
      const data = { name: tplForm.name.trim(), start_time: tplForm.startTime, end_time: tplForm.endTime };
      if (editingTpl) {
        const { error } = await supabase.from('shift_templates').update(data).eq('id', editingTpl.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shift_templates').insert([{
          id: generateUUID(),
          ...data,
          disabled: false,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
      }
      setEditingTpl(null); setTplForm(BLANK_TPL);
      showSnackbar?.('Template saved.', 'success');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
    finally { setSavingTpl(false); }
  };

  const handleToggleTplDisabled = async (tpl) => {
    const willDisable = !tpl.disabled;
    if (willDisable && activeTemplates.length <= 1) {
      showSnackbar?.('At least one template must remain active.', 'warning');
      return;
    }
    try {
      const { error } = await supabase.from('shift_templates').update({ disabled: willDisable }).eq('id', tpl.id);
      if (error) throw error;
      showSnackbar?.(willDisable ? `"${tpl.name}" disabled.` : `"${tpl.name}" enabled.`, 'success');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
  };

  const handleDeleteTpl = async (tpl) => {
    if (!tpl.disabled) {
      showSnackbar?.('Disable the template before deleting it.', 'warning');
      return;
    }
    try {
      const { data } = await supabase
        .from('schedules')
        .select('id')
        .eq('shift_label', tpl.name)
        .limit(1);
      if (data && data.length > 0) {
        showSnackbar?.(`"${tpl.name}" has schedule entries. It cannot be permanently deleted.`, 'warning');
        return;
      }
    } catch { /* proceed if check fails */ }
    if (!window.confirm(`Permanently delete "${tpl.name}"?`)) return;
    try {
      const { error } = await supabase.from('shift_templates').delete().eq('id', tpl.id);
      if (error) throw error;
      showSnackbar?.('Template deleted.', 'success');
    } catch (err) { showSnackbar?.(getFriendlyErrorMessage(err), 'error'); }
  };

  const entryActions = {
    onEdit: openEdit,
    onDelete: handleDelete,
    onCoverage: (e) => { setCoverStaff(''); setCoverDlg({ open: true, entry: e }); },
    userMap,
  };

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title="Schedule"
        subtitle="Staff shift scheduling"
        actions={
          <>
            <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopyLastWeek}>
              Copy Last Week
            </Button>
            <Button size="small" variant="outlined" startIcon={<TuneIcon />} onClick={() => setTplDrawerOpen(true)}>
              Templates
            </Button>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()}>
              Add Entry
            </Button>
          </>
        }
      />

      <SummaryCards cards={summaryCards} loading={loadingEntries} sx={{ mb: 2, flexShrink: 0 }} />

      {/* Week nav */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={prevWeek}><ChevronLeftIcon /></IconButton>
          <Button size="small" variant="outlined" startIcon={<TodayIcon />} onClick={goToday}>Today</Button>
          <IconButton size="small" onClick={nextWeek}><ChevronRightIcon /></IconButton>
          <Typography variant="subtitle2" fontWeight={600}>{fmtRange(weekStart, weekEnd)}</Typography>
        </Stack>
      </Stack>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Tab icon={<CalendarMonthIcon />} iconPosition="start" label="Calendar" />
        <Tab icon={<WarningAmberIcon />} iconPosition="start" label="Absences & Coverage" />
      </Tabs>

      {/* ── TAB 0: CALENDAR ── */}
      {tab === 0 && (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table sx={{ tableLayout: 'fixed', minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 120, fontWeight: 600 }}>Shift</TableCell>
                  {weekDates.map(date => (
                    <TableCell
                      key={date}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        bgcolor: date === today ? 'action.selected' : 'inherit',
                        width: `calc((100% - 120px) / 7)`,
                      }}
                    >
                      <Typography variant="caption" fontWeight={600} display="block">{fmtDay(date)}</Typography>
                      <Typography variant="caption" color={date === today ? 'primary.main' : 'text.secondary'}>
                        {fmtShort(date)}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingEntries || staffLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : activeTemplates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No active templates. Enable or add templates using the Templates button.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  activeTemplates.map(tpl => (
                    <TableRow key={tpl.id} hover>
                      <TableCell sx={{ verticalAlign: 'top', py: 1, bgcolor: 'action.hover' }}>
                        <Typography variant="body2" fontWeight={700} noWrap>{tpl.name}</Typography>
                        {tpl.start_time && (
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {tpl.start_time}–{tpl.end_time}
                          </Typography>
                        )}
                      </TableCell>

                      {weekDates.map(date => {
                        const cellEntries = byShiftByDate[tpl.name]?.[date] || [];
                        return (
                          <TableCell
                            key={date}
                            sx={{
                              verticalAlign: 'top', p: 0.5,
                              bgcolor: date === today ? 'action.focus' : 'inherit',
                              minWidth: 80,
                            }}
                          >
                            {cellEntries.map(entry => (
                              <StaffChip key={entry.id} entry={entry} {...entryActions} />
                            ))}
                            <Tooltip title={`Add ${tpl.name} shift on ${fmtShort(date)}`}>
                              <IconButton
                                size="small"
                                sx={{ opacity: 0.2, '&:hover': { opacity: 1 } }}
                                onClick={() => openCreate('', date, tpl.name)}
                              >
                                <AddIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── TAB 1: ABSENCES & COVERAGE ── */}
      {tab === 1 && (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {absenceEntries.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <WarningAmberIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
              <Typography color="text.secondary">No absences or coverage this week.</Typography>
            </Box>
          ) : (
            <TableContainer component={Card}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Staff</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Shift</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Covered By</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 130 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {absenceEntries.map(entry => {
                    const cfg = STATUS_CFG[entry.status] || STATUS_CFG.scheduled;
                    return (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          <Typography variant="body2">{fmtShort(entry.date)}</Typography>
                          <Typography variant="caption" color="text.secondary">{fmtDay(entry.date)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{entry.staff_name || entry.staff_email}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{entry.shift_label}</Typography>
                          {entry.start_time && (
                            <Typography variant="caption" color="text.secondary">
                              {entry.start_time}–{entry.end_time}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={cfg.label} color={cfg.color} size="small" />
                        </TableCell>
                        <TableCell>
                          {entry.covered_by_id ? (
                            <Typography variant="body2">{userMap?.[entry.covered_by_id] || 'Covered'}</Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openEdit(entry)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {entry.status === 'absent' && (
                              <Tooltip title="Assign Coverage">
                                <IconButton size="small" onClick={() => { setCoverStaff(''); setCoverDlg({ open: true, entry }); }}>
                                  <PeopleIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => handleDelete(entry)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* ── ENTRY DRAWER (Create / Edit) ── */}
      <DetailDrawer
        open={entryDrawer.open}
        onClose={() => setEntryDrawer(p => ({ ...p, open: false }))}
        title={entryDrawer.mode === 'create' ? 'Add Schedule Entry' : 'Edit Schedule Entry'}
        loading={saving}
        disableClose={saving}
        actions={
          <>
            <Button onClick={() => setEntryDrawer(p => ({ ...p, open: false }))} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveEntry} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <Stack spacing={2.5}>
          {formErr && <Alert severity="error">{formErr}</Alert>}

          <FormControl fullWidth required>
            <InputLabel>Staff Member</InputLabel>
            <Select
              label="Staff Member"
              value={entryForm.staffEmail}
              onChange={e => setEntryForm(f => ({ ...f, staffEmail: e.target.value }))}
              disabled={saving}
            >
              {staffOnly.map(s => (
                <MenuItem key={s.email} value={s.email}>{s.fullName || s.email}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Date" type="date"
            value={entryForm.date}
            onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))}
            fullWidth required disabled={saving} InputLabelProps={{ shrink: true }}
          />

          <FormControl fullWidth required>
            <InputLabel>Shift Template</InputLabel>
            <Select
              label="Shift Template"
              value={entryForm.shiftLabel}
              onChange={e => handleTplSelect(e.target.value)}
              disabled={saving}
            >
              {activeTemplates.map(t => (
                <MenuItem key={t.id} value={t.name}>
                  {t.name}{t.start_time ? ` (${t.start_time}–${t.end_time})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Start Time" type="time"
              value={entryForm.startTime}
              onChange={e => setEntryForm(f => ({ ...f, startTime: e.target.value }))}
              fullWidth disabled={saving} InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Time" type="time"
              value={entryForm.endTime}
              onChange={e => setEntryForm(f => ({ ...f, endTime: e.target.value }))}
              fullWidth disabled={saving} InputLabelProps={{ shrink: true }}
            />
          </Stack>

          {entryDrawer.mode === 'edit' && (
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={entryForm.status}
                onChange={e => setEntryForm(f => ({ ...f, status: e.target.value }))}
                disabled={saving}
              >
                {Object.entries(STATUS_CFG).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            label="Notes (optional)"
            value={entryForm.notes}
            onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
            fullWidth multiline rows={2} disabled={saving}
          />
        </Stack>
      </DetailDrawer>

      {/* ── TEMPLATES DRAWER ── */}
      <DetailDrawer
        open={tplDrawerOpen}
        onClose={() => { setTplDrawerOpen(false); setEditingTpl(null); setTplForm(BLANK_TPL); }}
        title="Shift Templates"
        subtitle="Configure available shift labels"
        width={440}
      >
        <Stack spacing={1.5}>
          {templates.map(tpl => (
            <Box
              key={tpl.id}
              sx={{
                p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                opacity: tpl.disabled ? 0.5 : 1,
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>{tpl.name}</Typography>
                  {tpl.disabled && <Chip label="Disabled" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {tpl.start_time && tpl.end_time ? `${tpl.start_time}–${tpl.end_time}` : 'No time set'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Tooltip title={!tpl.disabled && activeTemplates.length <= 1 ? 'Cannot disable last active template' : (tpl.disabled ? 'Enable' : 'Disable')}>
                  <span>
                    <Switch
                      size="small"
                      checked={!tpl.disabled}
                      onChange={() => handleToggleTplDisabled(tpl)}
                      disabled={!tpl.disabled && activeTemplates.length <= 1}
                    />
                  </span>
                </Tooltip>
                <IconButton size="small" onClick={() => {
                  setEditingTpl(tpl);
                  setTplForm({ name: tpl.name, startTime: tpl.start_time || '', endTime: tpl.end_time || '' });
                }}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <Tooltip title={tpl.disabled ? 'Delete' : 'Disable before deleting'}>
                  <span>
                    <IconButton size="small" color="error" onClick={() => handleDeleteTpl(tpl)} disabled={!tpl.disabled}>
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
            fullWidth disabled={savingTpl}
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Start" type="time" size="small"
              value={tplForm.startTime}
              onChange={e => setTplForm(f => ({ ...f, startTime: e.target.value }))}
              fullWidth disabled={savingTpl} InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End" type="time" size="small"
              value={tplForm.endTime}
              onChange={e => setTplForm(f => ({ ...f, endTime: e.target.value }))}
              fullWidth disabled={savingTpl} InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained" size="small"
              onClick={handleSaveTpl}
              disabled={savingTpl || !tplForm.name.trim()}
            >
              {editingTpl ? 'Update' : 'Add Template'}
            </Button>
            {editingTpl && (
              <Button size="small" onClick={() => { setEditingTpl(null); setTplForm(BLANK_TPL); }} disabled={savingTpl}>
                Cancel
              </Button>
            )}
          </Stack>
        </Stack>
      </DetailDrawer>

      {/* ── COVERAGE DIALOG ── */}
      <Dialog
        open={coverDlg.open}
        onClose={() => !savingCover && setCoverDlg({ open: false, entry: null })}
        maxWidth="xs" fullWidth
      >
        <DialogTitle>Assign Coverage</DialogTitle>
        <DialogContent>
          {coverDlg.entry && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Original: <strong>{coverDlg.entry.staff_name || coverDlg.entry.staff_email}</strong>
              {' – '}{coverDlg.entry.shift_label} on {fmtShort(coverDlg.entry.date)}
            </Typography>
          )}
          <FormControl fullWidth>
            <InputLabel>Covering Staff</InputLabel>
            <Select
              label="Covering Staff"
              value={coverStaff}
              onChange={e => setCoverStaff(e.target.value)}
              disabled={savingCover}
            >
              {staffOnly
                .filter(s => s.email !== coverDlg.entry?.staff_email)
                .map(s => (
                  <MenuItem key={s.email} value={s.email}>{s.fullName || s.email}</MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCoverDlg({ open: false, entry: null })} disabled={savingCover}>Cancel</Button>
          <Button variant="contained" onClick={handleAssignCoverage} disabled={savingCover || !coverStaff}>
            {savingCover ? 'Saving…' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
