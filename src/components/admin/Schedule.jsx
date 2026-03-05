// src/components/admin/Schedule.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, Stack, Chip, IconButton, Tabs, Tab,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Tooltip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CircularProgress, Alert,
} from '@mui/material';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useStaffList } from '../../hooks/useStaffList';
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
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDay(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}
function fmtRange(s, e) {
  const sd = new Date(s + 'T00:00:00');
  const ed = new Date(e + 'T00:00:00');
  const eOpts = sd.getMonth() === ed.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' };
  return `${sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${ed.toLocaleDateString('en-US', eOpts)}, ${ed.getFullYear()}`;
}

// ---------- Constants ----------
const STATUS_CFG = {
  scheduled:     { label: 'Scheduled', color: 'primary' },
  'in-progress': { label: 'On Shift',  color: 'success' },
  completed:     { label: 'Done',      color: 'default' },
  absent:        { label: 'Absent',    color: 'error' },
  covered:       { label: 'Covered',   color: 'warning' },
};

const DEFAULT_TPLS = [
  { id: '_m', name: 'Morning',   startTime: '08:00', endTime: '14:00' },
  { id: '_a', name: 'Afternoon', startTime: '14:00', endTime: '20:00' },
  { id: '_e', name: 'Evening',   startTime: '20:00', endTime: '02:00' },
];

const BLANK_ENTRY = { staffEmail: '', date: '', shiftLabel: '', startTime: '', endTime: '', notes: '', status: 'scheduled' };
const BLANK_TPL   = { name: '', startTime: '', endTime: '' };

// ---------- Staff chip (calendar cell — shows staff name, shift is the row label) ----------
function StaffChip({ entry, onEdit, onDelete, onAbsent, onCoverage }) {
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
            {entry.staffName || entry.staffEmail}
          </Typography>
          {entry.coveredByName && (
            <Typography variant="caption" color="warning.main" display="block" noWrap lineHeight={1.2}>
              ↳ {entry.coveredByName}
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
  const { staffOptions, loading: staffLoading } = useStaffList();
  const staffOnly = useMemo(() => staffOptions.filter(s => s.role === 'staff'), [staffOptions]);

  const [tab, setTab] = useState(0);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayPHT()));
  const [entries, setEntries] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TPLS);
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Drawers & dialogs
  const [entryDrawer, setEntryDrawer]     = useState({ open: false, mode: 'create', entry: null });
  const [tplDrawerOpen, setTplDrawerOpen] = useState(false);
  const [coverDlg, setCoverDlg]           = useState({ open: false, entry: null });

  // Forms
  const [entryForm, setEntryForm] = useState(BLANK_ENTRY);
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState('');
  const [tplForm, setTplForm]       = useState(BLANK_TPL);
  const [editingTpl, setEditingTpl] = useState(null);
  const [savingTpl, setSavingTpl]   = useState(false);
  const [coverStaff, setCoverStaff] = useState('');
  const [savingCover, setSavingCover] = useState(false);

  const weekEnd   = addDays(weekStart, 6);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today     = todayPHT();

  // Subscribe entries for current week
  useEffect(() => {
    setLoadingEntries(true);
    const q = query(
      collection(db, 'schedules'),
      where('date', '>=', weekStart),
      where('date', '<=', weekEnd),
    );
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingEntries(false);
    }, err => { console.error('Schedule fetch:', err); setLoadingEntries(false); });
    return unsub;
  }, [weekStart, weekEnd]);

  // Subscribe shift templates
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shiftTemplates'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by startTime so Morning → Afternoon → Evening ordering is natural
      list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || (a.name || '').localeCompare(b.name || ''));
      setTemplates(list.length ? list : DEFAULT_TPLS);
    }, err => { console.error('Templates fetch:', err); });
    return unsub;
  }, []);

  // Derived: entries keyed by shiftLabel → date → [entries]
  const byShiftByDate = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const key = e.shiftLabel;
      if (!map[key]) map[key] = {};
      if (!map[key][e.date]) map[key][e.date] = [];
      map[key][e.date].push(e);
    }
    return map;
  }, [entries]);

  // Absences & covered entries for the current week
  const absenceEntries = useMemo(() =>
    [...entries]
      .filter(e => e.status === 'absent' || e.status === 'covered')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.staffName || '').localeCompare(b.staffName || '')),
    [entries]
  );

  const summaryCards = useMemo(() => ([
    { label: 'Scheduled',  value: String(entries.filter(e => e.status === 'scheduled').length),    color: 'primary.main' },
    { label: 'On Shift',   value: String(entries.filter(e => e.status === 'in-progress').length),  color: 'success.main' },
    { label: 'Absent',     value: String(entries.filter(e => e.status === 'absent').length),       color: 'error.main' },
    { label: 'Covered',    value: String(entries.filter(e => e.status === 'covered').length),      color: 'warning.main' },
  ]), [entries]);

  // --- Navigation ---
  const prevWeek = () => setWeekStart(ws => addDays(ws, -7));
  const nextWeek = () => setWeekStart(ws => addDays(ws, 7));
  const goToday  = () => setWeekStart(getWeekStart(todayPHT()));

  // --- Open entry drawer ---
  const openCreate = useCallback((staffEmail = '', date = '', shiftLabel = '') => {
    setFormErr('');
    const tpl = shiftLabel ? templates.find(t => t.name === shiftLabel) : null;
    setEntryForm({
      ...BLANK_ENTRY,
      staffEmail,
      date: date || todayPHT(),
      shiftLabel: shiftLabel || '',
      startTime: tpl?.startTime || '',
      endTime:   tpl?.endTime   || '',
    });
    setEntryDrawer({ open: true, mode: 'create', entry: null });
  }, [templates]);

  const openEdit = useCallback((entry) => {
    setFormErr('');
    setEntryForm({
      staffEmail: entry.staffEmail || '',
      date:       entry.date       || '',
      shiftLabel: entry.shiftLabel || '',
      startTime:  entry.startTime  || '',
      endTime:    entry.endTime    || '',
      notes:      entry.notes      || '',
      status:     entry.status     || 'scheduled',
    });
    setEntryDrawer({ open: true, mode: 'edit', entry });
  }, []);

  const handleTplSelect = (name) => {
    const tpl = templates.find(t => t.name === name);
    setEntryForm(f => ({ ...f, shiftLabel: name, startTime: tpl?.startTime || '', endTime: tpl?.endTime || '' }));
  };

  // --- CRUD entry ---
  const handleSaveEntry = async () => {
    if (!entryForm.staffEmail) { setFormErr('Select a staff member.'); return; }
    if (!entryForm.date)       { setFormErr('Select a date.'); return; }
    if (!entryForm.shiftLabel) { setFormErr('Select a shift template.'); return; }
    setSaving(true); setFormErr('');
    try {
      const staff = staffOnly.find(s => s.email === entryForm.staffEmail);
      const data = {
        staffUid:   staff?.uid    || '',
        staffEmail: entryForm.staffEmail,
        staffName:  staff ? (staff.fullName || staff.email) : entryForm.staffEmail,
        date:       entryForm.date,
        shiftLabel: entryForm.shiftLabel,
        startTime:  entryForm.startTime,
        endTime:    entryForm.endTime,
        status:     entryForm.status || 'scheduled',
        notes:      entryForm.notes || '',
        updatedAt:  serverTimestamp(),
      };
      if (entryDrawer.mode === 'create') {
        await addDoc(collection(db, 'schedules'), { ...data, createdAt: serverTimestamp() });
        showSnackbar?.('Schedule entry added.', 'success');
      } else {
        await updateDoc(doc(db, 'schedules', entryDrawer.entry.id), data);
        showSnackbar?.('Schedule entry updated.', 'success');
      }
      setEntryDrawer(p => ({ ...p, open: false }));
    } catch (err) {
      setFormErr('Save failed. Try again.');
      console.error(err);
    } finally { setSaving(false); }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete schedule entry for ${entry.staffName || entry.staffEmail}?`)) return;
    try {
      await deleteDoc(doc(db, 'schedules', entry.id));
      showSnackbar?.('Entry deleted.', 'success');
    } catch { showSnackbar?.('Delete failed.', 'error'); }
  };

  const handleMarkAbsent = async (entry) => {
    try {
      await updateDoc(doc(db, 'schedules', entry.id), { status: 'absent', updatedAt: serverTimestamp() });
      showSnackbar?.(`${entry.staffName || entry.staffEmail} marked absent.`, 'warning');
    } catch { showSnackbar?.('Failed.', 'error'); }
  };

  const handleAssignCoverage = async () => {
    if (!coverStaff) return;
    setSavingCover(true);
    try {
      const s = staffOnly.find(x => x.email === coverStaff);
      await updateDoc(doc(db, 'schedules', coverDlg.entry.id), {
        status:         'covered',
        coveredByUid:   s?.uid || '',
        coveredByEmail: coverStaff,
        coveredByName:  s ? (s.fullName || coverStaff) : coverStaff,
        updatedAt:      serverTimestamp(),
      });
      showSnackbar?.('Coverage assigned.', 'success');
      setCoverDlg({ open: false, entry: null }); setCoverStaff('');
    } catch { showSnackbar?.('Failed.', 'error'); }
    finally { setSavingCover(false); }
  };

  // --- Copy last week ---
  const handleCopyLastWeek = async () => {
    const lws = addDays(weekStart, -7);
    const lwe = addDays(lws, 6);
    try {
      const snap = await getDocs(query(
        collection(db, 'schedules'),
        where('date', '>=', lws),
        where('date', '<=', lwe),
      ));
      if (snap.empty) { showSnackbar?.('No entries found last week.', 'info'); return; }
      await Promise.all(snap.docs.map(d => {
        const x = d.data();
        return addDoc(collection(db, 'schedules'), {
          staffUid: x.staffUid || '', staffEmail: x.staffEmail,
          staffName: x.staffName || '',
          date: addDays(x.date, 7),
          shiftLabel: x.shiftLabel, startTime: x.startTime || '', endTime: x.endTime || '',
          status: 'scheduled', notes: x.notes || '',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }));
      showSnackbar?.(`Copied ${snap.docs.length} entries to this week.`, 'success');
    } catch (err) { showSnackbar?.('Copy failed.', 'error'); console.error(err); }
  };

  // --- Template CRUD ---
  const handleSaveTpl = async () => {
    if (!tplForm.name.trim()) return;
    setSavingTpl(true);
    try {
      const data = { name: tplForm.name.trim(), startTime: tplForm.startTime, endTime: tplForm.endTime };
      if (editingTpl && !editingTpl.id.startsWith('_')) {
        await updateDoc(doc(db, 'shiftTemplates', editingTpl.id), data);
      } else {
        await addDoc(collection(db, 'shiftTemplates'), data);
      }
      setEditingTpl(null); setTplForm(BLANK_TPL);
      showSnackbar?.('Template saved.', 'success');
    } catch { showSnackbar?.('Failed.', 'error'); }
    finally { setSavingTpl(false); }
  };

  const handleDeleteTpl = async (tpl) => {
    if (tpl.id.startsWith('_')) return;
    try {
      await deleteDoc(doc(db, 'shiftTemplates', tpl.id));
      showSnackbar?.('Template deleted.', 'success');
    } catch { showSnackbar?.('Failed.', 'error'); }
  };

  const entryActions = {
    onEdit: openEdit,
    onDelete: handleDelete,
    onAbsent: handleMarkAbsent,
    onCoverage: (e) => { setCoverStaff(''); setCoverDlg({ open: true, entry: e }); },
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
        <Tab
          icon={<WarningAmberIcon />} iconPosition="start" label="Absences & Coverage"
          sx={{ '& .MuiBadge-badge': {} }}
        />
      </Tabs>

      {/* ── TAB 0: CALENDAR ── */}
      {tab === 0 && (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <TableContainer component={Card} sx={{ overflowX: 'auto' }}>
            <Table sx={{ tableLayout: 'fixed', minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  {/* Shift column header */}
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
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No shift templates. Add templates using the Templates button.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map(tpl => (
                    <TableRow key={tpl.id} hover>
                      {/* Row label: shift template */}
                      <TableCell sx={{ verticalAlign: 'top', py: 1, bgcolor: 'action.hover' }}>
                        <Typography variant="body2" fontWeight={700} noWrap>{tpl.name}</Typography>
                        {tpl.startTime && (
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {tpl.startTime}–{tpl.endTime}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Day cells: staff chips */}
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
                          <Typography variant="body2">{entry.staffName || entry.staffEmail}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{entry.shiftLabel}</Typography>
                          {entry.startTime && (
                            <Typography variant="caption" color="text.secondary">
                              {entry.startTime}–{entry.endTime}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={cfg.label} color={cfg.color} size="small" />
                        </TableCell>
                        <TableCell>
                          {entry.coveredByName ? (
                            <Typography variant="body2">{entry.coveredByName}</Typography>
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
              {templates.map(t => (
                <MenuItem key={t.id} value={t.name}>
                  {t.name}{t.startTime ? ` (${t.startTime}–${t.endTime})` : ''}
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
              sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>{tpl.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {tpl.startTime && tpl.endTime ? `${tpl.startTime}–${tpl.endTime}` : 'No time set'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => {
                  setEditingTpl(tpl);
                  setTplForm({ name: tpl.name, startTime: tpl.startTime || '', endTime: tpl.endTime || '' });
                }}>
                  <EditIcon fontSize="small" />
                </IconButton>
                {!tpl.id.startsWith('_') && (
                  <IconButton size="small" color="error" onClick={() => handleDeleteTpl(tpl)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
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
              Original: <strong>{coverDlg.entry.staffName || coverDlg.entry.staffEmail}</strong>
              {' – '}{coverDlg.entry.shiftLabel} on {fmtShort(coverDlg.entry.date)}
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
                .filter(s => s.email !== coverDlg.entry?.staffEmail)
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
