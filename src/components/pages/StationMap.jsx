import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Chip, Grid, IconButton, Menu, MenuItem,
  Stack, Tooltip, Typography, ToggleButtonGroup, ToggleButton,
  Badge, Drawer, List, ListItem, ListItemIcon, ListItemText, Divider,
  Paper, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Monitor as MonitorIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  MoreTime as MoreTimeIcon,
  MoreVert as MoreVertIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Build as BuildIcon,
  History as HistoryIcon,
  WifiOff as WifiOffIcon,
  WarningAmber as WarningAmberIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
  PowerSettingsNew as PowerIcon,
  RestartAlt as RestartIcon,
  SettingsRemote as RemoteIcon,
  Visibility as VisibilityIcon,
  Pause as PauseIcon,
  SkipNext as ResumeIcon,
  Bolt as BoltIcon,
  Chat as MessageIcon,
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  Assignment as LogsIcon,
} from '@mui/icons-material';
import { supabase } from '../../supabase';
import { fmtCurrency } from '../../utils/formatters';
import StartSessionDialog from '../dialogs/StartSessionDialog';
import EndSessionDialog from '../dialogs/EndSessionDialog';
import PageHeader from '../common/PageHeader';

const DRAWER_WIDTH = 320;
const ACTIVITY_WIDTH = 340;

// ── Time helpers ──────────────────────────────────────────────────────────────

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function secondsToHMS(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function getTimeRemaining(session, nowMs) {
  if (!session || session.type === 'postpaid') return null;
  const startMs = session.startedAt ? new Date(session.startedAt).getTime() : 0;
  const pausedMs = (session.minutesPaused || 0) * 60000;
  const elapsedMs = nowMs - startMs - pausedMs;
  const allottedMs = (session.minutesAllotted || 0) * 60000;
  return Math.max(0, (allottedMs - elapsedMs) / 1000); // seconds
}

function getElapsedMinutes(session, nowMs) {
  if (!session) return 0;
  const startMs = session.startedAt ? new Date(session.startedAt).getTime() : 0;
  const pausedMs = (session.minutesPaused || 0) * 60000;
  return Math.max(0, (nowMs - startMs - pausedMs) / 60000);
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  available: { label: 'Available', color: '#1b5e20', border: '#4caf50', chipColor: 'success' },
  'in-use': { label: 'In Use', color: '#0d3069', border: '#2196f3', chipColor: 'primary' },
  reserved: { label: 'Reserved', color: '#4a1c6e', border: '#9c27b0', chipColor: 'secondary' },
  maintenance: { label: 'Maintenance', color: '#4a3000', border: '#ff9800', chipColor: 'warning' },
  offline: { label: 'Offline', color: '#1a1a1a', border: '#555', chipColor: 'default' },
};

// ── Station Card ──────────────────────────────────────────────────────────────

function StationCard({ station, session, zones, now, active, onAction, onClick }) {
  const status = station.status || 'offline';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

  const secsRemaining = getTimeRemaining(session, now);
  const isLowTime = secsRemaining !== null && secsRemaining < 15 * 60;
  const isCritical = secsRemaining !== null && secsRemaining < 5 * 60;
  const borderColor = active ? '#fff' : (isCritical ? '#f44336' : isLowTime ? '#ff9800' : cfg.border);

  return (
    <Paper
      elevation={active ? 8 : 2}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onAction('context-menu', station, session, { x: e.clientX, y: e.clientY });
      }}
      sx={{
        bgcolor: 'background.paper',
        border: `1px solid ${alpha(cfg.border, 0.3)}`,
        borderRadius: 1,
        minHeight: 145,
        minWidth: 160,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 12px ${alpha(cfg.color, 0.2)}`,
          borderColor: cfg.border
        },
        boxShadow: active ? `0 0 15px ${alpha(cfg.color, 0.3)}` : undefined,
        opacity: status === 'offline' ? 0.7 : 1,
      }}
    >
      {/* Accent top bar */}
      <Box sx={{ height: 3, bgcolor: cfg.border, flexShrink: 0 }} />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 1.5, gap: 0.5 }}>
        {/* PC Icon in soft circle */}
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            bgcolor: alpha(cfg.color, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 0.5,
            border: `1px solid ${alpha(cfg.border, 0.2)}`
          }}
        >
          <MonitorIcon sx={{ fontSize: 24, color: cfg.border }} />
        </Box>

        {status === 'in-use' && session ? (
          <Stack alignItems="center">
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }} noWrap>
              {session.customerName || 'Walk-in'}
            </Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 900, color: cfg.border }}>
              {session.type === 'postpaid' ? 'POST' : secondsToHMS(secsRemaining)}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>{cfg.label}</Typography>
        )}
      </Box>

      {/* Small name at bottom */}
      <Box sx={{ bgcolor: alpha(cfg.color, 0.05), py: 0.5, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.5, color: 'text.primary' }}>
          {station.name}
        </Typography>
      </Box>

      {station.isOnline === false && (
        <WifiOffIcon sx={{ position: 'absolute', top: 8, right: 8, fontSize: 14, color: 'warning.main' }} />
      )}
    </Paper>
  );
}

// ── Station Logs Drawer removed (Using Global Table) ──

// ── Station Detail Panel removed (Using Context Menu) ──

// ── Global Activity Panel ─────────────────────────────────────────────────────

function GlobalActivityTable({ stations, onLogClick }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('station_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);
      if (data) {
        setLogs(data.map(d => ({
          ...d,
          stationId: d.station_id,
          stationName: d.station_name
        })));
      }
      setLoading(false);
    };
    fetchLogs();

    const channel = supabase.channel('public:station_logs:map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_logs' }, fetchLogs)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const getStationName = (id, fallback) => {
    const s = stations.find(s => s.id === id);
    return s?.name || fallback || id;
  };

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon sx={{ fontSize: 18 }} /> RECENT ACTIVITY
        </Typography>
      </Box>
      <TableContainer sx={{ flex: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>TIME</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>STATION</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>EVENT</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>CUSTOMER</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>METADATA</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={20} sx={{ my: 2 }} /></TableCell></TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  hover
                  onClick={() => onLogClick(log)}
                  sx={{ cursor: 'pointer', '& td': { fontSize: '0.75rem', py: 0.8 } }}
                >
                  <TableCell color="text.secondary">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                    {getStationName(log.stationId, log.stationName)}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {log.event?.replace(/-/g, ' ')}
                  </TableCell>
                  <TableCell>{log.metadata?.customerName || '—'}</TableCell>
                  <TableCell color="text.secondary">
                    {log.metadata?.minutesAllotted ? `${log.metadata.minutesAllotted} min` : ''}
                    {log.metadata?.amountPaid ? ` · ₱${log.metadata.amountPaid}` : ''}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function LogDetailDrawer({ log, stations, onClose }) {
  if (!log) return null;
  const s = stations.find(s => s.id === log.stationId);

  return (
    <Drawer anchor="right" open={!!log} onClose={onClose} PaperProps={{ sx: { width: 360 } }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={800}>Log Details</Typography>
        <IconButton size="small" onClick={onClose}><VisibilityIcon /></IconButton>
      </Box>
      <Box sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" color="text.secondary">Station</Typography>
            <Typography variant="body1" fontWeight={700}>{s?.name || log.stationName || log.stationId}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Event Type</Typography>
            <Typography variant="body1" fontWeight={700} sx={{ textTransform: 'capitalize' }}>{log.event?.replace(/-/g, ' ')}</Typography>
          </Box>
          <Box>
            <Typography variant="body2">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</Typography>
          </Box>
          <Divider />
          <Box>
            <Typography variant="overline" color="text.secondary">Metadata</Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', mt: 1 }}>
              <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(log.metadata || {}, null, 2)}
              </pre>
            </Paper>
          </Box>
        </Stack>
      </Box>
    </Drawer>
  );
}

// ── Main PC Map ───────────────────────────────────────────────────────────────

export default function StationMap({ showSnackbar, user }) {
  const now = useNow(1000);
  const [stations, setStations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [startDialog, setStartDialog] = useState({ open: false, station: null, activeSession: null, isStandaloneTopup: false });
  const [endDialog, setEndDialog] = useState({ open: false, station: null, session: null });
  const [logsDrawer, setLogsDrawer] = useState({ open: false, station: null });
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const selectedStation = stations.find(s => s.id === selectedId);
  const sessionByStation = sessions.reduce((acc, s) => { if (s.stationId) acc[s.stationId] = s; return acc; }, {});
  const selectedSession = selectedStation ? sessionByStation[selectedStation.id] : null;

  useEffect(() => {
    const fetchData = async () => {
      const [stationsRes, sessionsRes, zonesRes] = await Promise.all([
        supabase.from('stations').select('*'),
        supabase.from('sessions').select('*').eq('status', 'active'),
        supabase.from('zones').select('*').order('sort_order', { ascending: true })
      ]);

      if (stationsRes.data) {
        setStations(stationsRes.data.map(d => ({
          ...d,
          zoneId: d.zone_id,
          isOnline: d.is_online,
          tamperAlert: d.tamper_alert,
          ipAddress: d.ip_address,
          isPaused: d.is_paused
        })).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (sessionsRes.data) {
        setSessions(sessionsRes.data.map(d => ({
          ...d,
          stationId: d.station_id,
          customerId: d.customer_id,
          customerName: d.customer_name,
          startedAt: d.started_at,
          minutesAllotted: d.minutes_allotted,
          minutesPaused: d.minutes_paused,
          amountPaid: d.amount_paid
        })));
      }
      if (zonesRes.data) {
        setZones(zonesRes.data.map(d => ({
          ...d,
          sortOrder: d.sort_order
        })));
      }
      setLoading(false);
    };

    fetchData();

    const channel = supabase.channel('public:stations_map_data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, fetchData)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const stats = {
    total: stations.length,
    available: stations.filter(s => s.status === 'available').length,
    inUse: stations.filter(s => s.status === 'in-use').length,
    offline: stations.filter(s => s.status === 'offline').length,
    tamperAlerts: stations.filter(s => s.tamperAlert).length,
  };

  const filtered = stations.filter(s => {
    if (zoneFilter === 'all') return true;
    if (zoneFilter === 'unzoned') return !s.zoneId;
    return s.zoneId === zoneFilter;
  });

  const handleAction = useCallback(async (action, station, session, extra) => {
    switch (action) {
      case 'start': setStartDialog({ open: true, station, activeSession: null }); break;
      case 'end': setEndDialog({ open: true, station, session }); break;
      case 'extend': setStartDialog({ open: true, station, activeSession: session }); break;
      case 'logs': setLogsDrawer({ open: true, station }); break;
      case 'context-menu':
        setContextMenu({ mouse: extra, station: station, currentSession: session });
        return;
      case 'maintenance':
        try {
          await supabase.from('stations').update({ status: 'maintenance', updated_at: new Date().toISOString() }).eq('id', station.id);
          showSnackbar(`${station.name} set to maintenance`);
        } catch (e) { showSnackbar(e.message, 'error'); }
        break;
      case 'guest-start':
        try {
          // Trigger guest start logic
          setStartDialog({ open: true, station, isQuickGuest: true, activeSession: null });
        } catch (e) { showSnackbar(e.message, 'error'); }
        break;
      case 'pause-session':
        await supabase.from('stations').update({ is_paused: true, updated_at: new Date().toISOString() }).eq('id', station.id);
        showSnackbar(`Station ${station.name} paused`);
        break;
      case 'resume-session':
        await supabase.from('stations').update({ is_paused: false, updated_at: new Date().toISOString() }).eq('id', station.id);
        showSnackbar(`Station ${station.name} resumed`);
        break;
      case 'remote-lock':
        await supabase.from('stations').update({ command: { type: 'lock', timestamp: Date.now() } }).eq('id', station.id);
        showSnackbar(`Lock command sent to ${station.name}`);
        break;
      case 'remote-unlock':
        await supabase.from('stations').update({ command: { type: 'unlock', timestamp: Date.now() } }).eq('id', station.id);
        showSnackbar(`Unlock command sent to ${station.name}`);
        break;
      case 'send-message':
        const msg = window.prompt(`Send message to ${station.name}:`);
        if (msg) {
          await supabase.from('stations').update({ command: { type: 'message', text: msg, timestamp: Date.now() } }).eq('id', station.id);
          showSnackbar(`Message sent to ${station.name}`);
        }
        break;
      case 'power-restart':
        await supabase.from('stations').update({ command: { type: 'restart', timestamp: Date.now() } }).eq('id', station.id);
        showSnackbar(`Restart command sent to ${station.name}`);
        break;
      case 'power-shutdown':
        await supabase.from('stations').update({ command: { type: 'shutdown', timestamp: Date.now() } }).eq('id', station.id);
        showSnackbar(`Shutdown command sent to ${station.name}`);
        break;
      default: break;
    }
    setContextMenu(null);
  }, [showSnackbar]);

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Left drawer removed */}

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: 2, pb: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <PageHeader
            title="Command Center"
            actions={
              <Stack direction="row" alignItems="center" gap={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<WalletIcon />}
                  onClick={() => setStartDialog({ open: true, station: null, activeSession: null, isStandaloneTopup: true })}
                  sx={{ mr: 1, fontWeight: 700 }}
                >
                  TOP-UP MEMBER
                </Button>
                <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
                  <ToggleButton value="grid"><GridViewIcon fontSize="small" /></ToggleButton>
                  <ToggleButton value="list"><ViewListIcon fontSize="small" /></ToggleButton>
                </ToggleButtonGroup>
                <IconButton onClick={() => setLogsDrawer({ open: !logsDrawer.open, station: null })} color={logsDrawer.open ? 'primary' : 'default'}>
                  <HistoryIcon />
                </IconButton>
              </Stack>
            }
          />
          <Stack direction="row" gap={1} sx={{ mt: 1 }}>
            <Chip size="small" label={`Total: ${stats.total}`} />
            <Chip size="small" label={`In Use: ${stats.inUse}`} color="primary" />
            <Chip size="small" label={`Available: ${stats.available}`} color="success" />
          </Stack>
        </Box>

        <Box sx={{ px: 2, py: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" gap={1}>
            <Chip label="All Zones" size="small" onClick={() => setZoneFilter('all')} variant={zoneFilter === 'all' ? 'filled' : 'outlined'} />
            {zones.map(z => <Chip key={z.id} label={z.name} size="small" onClick={() => setZoneFilter(z.id)} variant={zoneFilter === z.id ? 'filled' : 'outlined'} />)}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {viewMode === 'grid' ? (
            <Grid container spacing={2}>
              {filtered.map(s => (
                <Grid item key={s.id} xs={6} sm={4} md={3} lg={2.4}>
                  <StationCard
                    station={s}
                    session={sessionByStation[s.id]}
                    zones={zones}
                    now={now}
                    active={selectedId === s.id}
                    onClick={() => setSelectedId(s.id)}
                    onAction={handleAction}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
              <Table size="small" stickyHeader sx={{ '& td, & th': { py: 0.5, px: 1, fontSize: '0.75rem' } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    {['PC', 'Status', 'Account', 'Level', 'Start Time', 'Type', 'Time', 'Fees', 'Balance', 'Name', 'Area', 'IP'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(s => {
                    const sess = sessionByStation[s.id];
                    const cfg = STATUS_CONFIG[s.status || 'offline'];
                    return (
                      <TableRow
                        key={s.id}
                        hover
                        onClick={() => setSelectedId(s.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          handleAction('context-menu', s, sess, { x: e.clientX, y: e.clientY });
                        }}
                        selected={selectedId === s.id}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ fontWeight: 800 }}>{s.name}</TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: cfg.border, fontWeight: 700 }}>
                            {cfg.label}
                          </Typography>
                        </TableCell>
                        <TableCell>{sess?.customerId ? sess.customerName : (s.status === 'in-use' ? 'Walk-in' : '—')}</TableCell>
                        <TableCell>Member</TableCell>
                        <TableCell>{sess?.startedAt ? new Date(sess.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                        <TableCell>{sess ? (sess.type === 'prepaid' ? 'Normal Billing' : 'Postpaid') : '—'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>
                          {sess ? (sess.type === 'postpaid' ? secondsToHMS(getElapsedMinutes(sess, now) * 60) : secondsToHMS(getTimeRemaining(sess, now))) : '—'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{sess ? fmtCurrency(sess.amountPaid || 0) : '—'}</TableCell>
                        <TableCell>0.00</TableCell>
                        <TableCell>{sess?.customerName || '—'}</TableCell>
                        <TableCell>{zones.find(z => z.id === s.zoneId)?.name || 'Default'}</TableCell>
                        <TableCell sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>{s.ipAddress || '192.168.1.XX'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* ── Bottom Activity Table ── */}
        <Box sx={{ height: '25%', borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <GlobalActivityTable
            stations={stations}
            onLogClick={(log) => setSelectedLog(log)}
          />
        </Box>
      </Box>

      {/* ── Context Menu ── */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu !== null ? { top: contextMenu.mouse.y, left: contextMenu.mouse.x } : undefined}
        PaperProps={{ sx: { minWidth: 220, py: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' } }}
      >
        {contextMenu?.station?.status === 'available' ? [
          <MenuItem key="start" onClick={() => handleAction('start', contextMenu.station)}>
            <ListItemIcon><PlayArrowIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText primary="Open Session" />
            <Typography variant="caption" color="text.disabled">F5</Typography>
          </MenuItem>,
          <MenuItem key="guest-start" onClick={() => handleAction('guest-start', contextMenu.station)}>
            <ListItemIcon><BoltIcon fontSize="small" color="secondary" /></ListItemIcon>
            <ListItemText primary="Quick Guest" />
          </MenuItem>
        ] : [
          <MenuItem key="end" onClick={() => handleAction('end', contextMenu.station, contextMenu.currentSession)}>
            <ListItemIcon><StopIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary="End Session" />
            <Typography variant="caption" color="text.disabled">F8</Typography>
          </MenuItem>,
          <MenuItem key="extend" onClick={() => handleAction('extend', contextMenu.station, contextMenu.currentSession)}>
            <ListItemIcon><AddIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText primary="Add Time / Top-up" />
            <Typography variant="caption" color="text.disabled">F9</Typography>
          </MenuItem>,
          <Divider key="div1" />,
          <MenuItem key="pause" onClick={() => handleAction('pause-session', contextMenu.station)} disabled={contextMenu?.station?.isPaused}>
            <ListItemIcon><PauseIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Pause Session" />
            <Typography variant="caption" color="text.disabled">F6</Typography>
          </MenuItem>,
          <MenuItem key="resume" onClick={() => handleAction('resume-session', contextMenu.station)} disabled={!contextMenu?.station?.isPaused}>
            <ListItemIcon><ResumeIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Resume Session" />
            <Typography variant="caption" color="text.disabled">F7</Typography>
          </MenuItem>
        ]}

        <Divider />

        <MenuItem onClick={() => handleAction('send-message', contextMenu.station)}>
          <ListItemIcon><MessageIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Send Message" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => handleAction('remote-lock', contextMenu.station)}>
          <ListItemIcon><LockIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Force Lock" />
        </MenuItem>
        <MenuItem onClick={() => handleAction('remote-unlock', contextMenu.station)}>
          <ListItemIcon><LockOpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Force Unlock" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => handleAction('power-restart', contextMenu.station)} sx={{ color: 'warning.main' }}>
          <ListItemIcon><RestartIcon fontSize="small" color="inherit" /></ListItemIcon>
          <ListItemText primary="Restart Terminal" />
        </MenuItem>
        <MenuItem onClick={() => handleAction('power-shutdown', contextMenu.station)} sx={{ color: 'error.main' }}>
          <ListItemIcon><PowerIcon fontSize="small" color="inherit" /></ListItemIcon>
          <ListItemText primary="Shutdown Terminal" />
        </MenuItem>
        <MenuItem onClick={() => handleAction('wol', contextMenu.station)} sx={{ color: 'success.main' }}>
          <ListItemIcon><BoltIcon fontSize="small" color="inherit" /></ListItemIcon>
          <ListItemText primary="Wake-on-LAN" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => handleAction('logs', contextMenu.station)}>
          <ListItemIcon><LogsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="View Logs" />
        </MenuItem>
      </Menu>

      <StartSessionDialog
        open={startDialog.open}
        station={startDialog.station}
        activeSession={startDialog.activeSession}
        isQuickGuest={startDialog.isQuickGuest}
        isStandaloneTopup={startDialog.isStandaloneTopup}
        onClose={() => setStartDialog({ open: false, station: null, isQuickGuest: false, activeSession: null, isStandaloneTopup: false })}
        showSnackbar={showSnackbar}
        user={user}
      />
      <EndSessionDialog open={endDialog.open} station={endDialog.station} session={endDialog.session} onClose={() => setEndDialog({ open: false, station: null, session: null })} showSnackbar={showSnackbar} user={user} />
      <LogDetailDrawer log={selectedLog} stations={stations} onClose={() => setSelectedLog(null)} />
    </Box>
  );
}
