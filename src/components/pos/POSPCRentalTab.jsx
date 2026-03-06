/**
 * POSPCRentalTab — PC Rental session management (mock UI, no DB yet)
 *
 * UI patterns based on iCafe, Senet, PanCafe:
 *  - PC Grid view: visual status board, color-coded cards, live timers
 *  - List view: table for quick scanning of all sessions
 *  - Start / Stop & Bill / Extend per PC
 *
 * Rate and PC list are hardcoded mock data.
 * Future: fetch pcUnits from Firestore, rate from settings/catalog.
 */

import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Stack, Chip, IconButton, Tooltip,
    Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    ToggleButton, ToggleButtonGroup, Divider, Paper
} from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import PersonIcon from '@mui/icons-material/Person';
import MonitorIcon from '@mui/icons-material/Monitor';
import { fmtCurrency } from '../../utils/formatters';

const currency = fmtCurrency;

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO v0.6: replace with Firestore pcUnits collection
const RATE_PER_HOUR = 15; // ₱15/hr — will come from catalog/settings

const INITIAL_PCS = [
    { id: 'pc1',  name: 'PC 01', status: 'active',   startTime: Date.now() - 73  * 60000, customer: '' },
    { id: 'pc2',  name: 'PC 02', status: 'free',      startTime: null,                     customer: '' },
    { id: 'pc3',  name: 'PC 03', status: 'active',   startTime: Date.now() - 28  * 60000, customer: 'Juan' },
    { id: 'pc4',  name: 'PC 04', status: 'reserved',  startTime: null,                     customer: 'Maria' },
    { id: 'pc5',  name: 'PC 05', status: 'free',      startTime: null,                     customer: '' },
    { id: 'pc6',  name: 'PC 06', status: 'active',   startTime: Date.now() - 112 * 60000, customer: '' },
    { id: 'pc7',  name: 'PC 07', status: 'free',      startTime: null,                     customer: '' },
    { id: 'pc8',  name: 'PC 08', status: 'active',   startTime: Date.now() - 5   * 60000, customer: 'Ben' },
    { id: 'pc9',  name: 'PC 09', status: 'free',      startTime: null,                     customer: '' },
    { id: 'pc10', name: 'PC 10', status: 'free',      startTime: null,                     customer: '' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(startTime, now) {
    if (!startTime) return null;
    const ms = now - startTime;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeAmount(startTime, now) {
    if (!startTime) return 0;
    const hours = (now - startTime) / 3600000;
    // Round up to nearest minute for billing
    const minutes = Math.ceil((now - startTime) / 60000);
    return Math.round((minutes / 60) * RATE_PER_HOUR * 100) / 100;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    free:     { label: 'Free',     color: 'success', borderColor: '#2e7d32', bg: 'rgba(46,125,50,0.08)' },
    active:   { label: 'Active',   color: 'error',   borderColor: '#c62828', bg: 'rgba(198,40,40,0.08)' },
    reserved: { label: 'Reserved', color: 'warning', borderColor: '#e65100', bg: 'rgba(230,81,0,0.08)'  },
};

// ─── PC Card (Grid View) ──────────────────────────────────────────────────────
function PCCard({ pc, now, onStart, onStop, onExtend }) {
    const cfg = STATUS_CONFIG[pc.status];
    const duration = formatDuration(pc.startTime, now);
    const amount = computeAmount(pc.startTime, now);

    return (
        <Paper
            variant="outlined"
            sx={{
                borderColor: cfg.borderColor,
                bgcolor: cfg.bg,
                borderWidth: pc.status === 'active' ? 2 : 1,
                display: 'flex',
                flexDirection: 'column',
                p: 1.5,
                gap: 0.5,
                minHeight: 140,
                transition: 'box-shadow 0.15s',
                '&:hover': { boxShadow: 3 },
            }}
        >
            {/* Header: PC name + status */}
            <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={0.75}>
                    <MonitorIcon sx={{ fontSize: 16, color: cfg.borderColor }} />
                    <Typography variant="body2" fontWeight="bold">{pc.name}</Typography>
                </Box>
                <Chip label={cfg.label} color={cfg.color} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
            </Box>

            {/* Customer */}
            {pc.customer && (
                <Box display="flex" alignItems="center" gap={0.5}>
                    <PersonIcon sx={{ fontSize: 13, opacity: 0.5 }} />
                    <Typography variant="caption" color="text.secondary" noWrap>{pc.customer}</Typography>
                </Box>
            )}

            {/* Timer + amount (active only) */}
            {pc.status === 'active' && (
                <Box flex={1} display="flex" flexDirection="column" justifyContent="center" alignItems="center" py={0.5}>
                    <Typography variant="h6" fontWeight="bold" fontFamily="monospace" color="error.main" lineHeight={1}>
                        {duration}
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="text.primary">
                        {currency(amount)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        ₱{RATE_PER_HOUR}/hr
                    </Typography>
                </Box>
            )}

            {pc.status === 'free' && (
                <Box flex={1} display="flex" alignItems="center" justifyContent="center">
                    <Typography variant="caption" color="text.disabled">Available</Typography>
                </Box>
            )}

            {pc.status === 'reserved' && (
                <Box flex={1} display="flex" alignItems="center" justifyContent="center">
                    <Typography variant="caption" color="warning.main" fontWeight="bold">Reserved</Typography>
                </Box>
            )}

            {/* Action buttons */}
            <Stack direction="row" spacing={0.5} mt={0.5}>
                {pc.status === 'free' && (
                    <Button
                        fullWidth size="small" variant="contained" color="success"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => onStart(pc)}
                        sx={{ fontSize: '0.7rem' }}
                    >
                        Start
                    </Button>
                )}
                {pc.status === 'reserved' && (
                    <Button
                        fullWidth size="small" variant="contained" color="warning"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => onStart(pc)}
                        sx={{ fontSize: '0.7rem' }}
                    >
                        Start
                    </Button>
                )}
                {pc.status === 'active' && (
                    <>
                        <Button
                            fullWidth size="small" variant="contained" color="error"
                            startIcon={<StopIcon />}
                            onClick={() => onStop(pc)}
                            sx={{ fontSize: '0.7rem' }}
                        >
                            Stop & Bill
                        </Button>
                        <Tooltip title="Extend session">
                            <IconButton size="small" onClick={() => onExtend(pc)} sx={{ border: 1, borderColor: 'divider' }}>
                                <MoreTimeIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </>
                )}
            </Stack>
        </Paper>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function POSPCRentalTab({ onBillSession }) {
    const [pcs, setPcs] = useState(INITIAL_PCS);
    const [view, setView] = useState('grid');
    const [now, setNow] = useState(Date.now());
    const [startDialog, setStartDialog] = useState(null);
    const [customerInput, setCustomerInput] = useState('');
    const [stopDialog, setStopDialog] = useState(null);
    const [extendDialog, setExtendDialog] = useState(null);
    const [extendMinutes, setExtendMinutes] = useState('30');

    // Live clock tick
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const handleStart = (pc) => {
        setCustomerInput(pc.customer || '');
        setStartDialog(pc);
    };

    const confirmStart = () => {
        setPcs(prev => prev.map(p =>
            p.id === startDialog.id
                ? { ...p, status: 'active', startTime: Date.now(), customer: customerInput.trim() }
                : p
        ));
        setStartDialog(null);
    };

    const handleStop = (pc) => setStopDialog(pc);

    const confirmStop = () => {
        const amount = computeAmount(stopDialog.startTime, now);
        const elapsed = now - stopDialog.startTime;

        onBillSession({
            pcName: stopDialog.name,
            customer: stopDialog.customer,
            amount,
            elapsed,
        });

        setPcs(prev => prev.map(p =>
            p.id === stopDialog.id
                ? { ...p, status: 'free', startTime: null, customer: '' }
                : p
        ));
        setStopDialog(null);
    };

    const handleExtend = (pc) => {
        setExtendMinutes('30');
        setExtendDialog(pc);
    };

    const confirmExtend = () => {
        const mins = Number(extendMinutes);
        if (mins > 0) {
            setPcs(prev => prev.map(p =>
                p.id === extendDialog.id
                    ? { ...p, startTime: p.startTime - mins * 60000 } // shift start back = more time added
                    : p
            ));
        }
        setExtendDialog(null);
    };

    const activePCs = pcs.filter(p => p.status === 'active');
    const freePCs = pcs.filter(p => p.status === 'free');
    const totalRevenue = activePCs.reduce((sum, p) => sum + computeAmount(p.startTime, now), 0);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* Toolbar */}
            <Box
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
                    borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', flexShrink: 0
                }}
            >
                {/* Summary chips */}
                <Chip icon={<MonitorIcon />} label={`${activePCs.length} Active`} color="error" size="small" variant="outlined" />
                <Chip label={`${freePCs.length} Free`} color="success" size="small" variant="outlined" />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 0.5 }}>
                    Running: <strong>{currency(totalRevenue)}</strong>
                </Typography>

                {/* View toggle */}
                <ToggleButtonGroup
                    value={view}
                    exclusive
                    onChange={(_, v) => v && setView(v)}
                    size="small"
                >
                    <ToggleButton value="grid" sx={{ px: 1.5 }}>
                        <GridViewIcon fontSize="small" />
                    </ToggleButton>
                    <ToggleButton value="list" sx={{ px: 1.5 }}>
                        <ViewListIcon fontSize="small" />
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
                {view === 'grid' ? (
                    // ── PC Grid View ──────────────────────────────────────────
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                            gap: 1.5,
                        }}
                    >
                        {pcs.map(pc => (
                            <PCCard
                                key={pc.id}
                                pc={pc}
                                now={now}
                                onStart={handleStart}
                                onStop={handleStop}
                                onExtend={handleExtend}
                            />
                        ))}
                    </Box>
                ) : (
                    // ── List View ─────────────────────────────────────────────
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>PC</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Status</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Customer</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold', fontFamily: 'monospace' }}>Duration</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Amount</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {pcs.map(pc => {
                                    const cfg = STATUS_CONFIG[pc.status];
                                    const duration = formatDuration(pc.startTime, now);
                                    const amount = computeAmount(pc.startTime, now);
                                    return (
                                        <TableRow key={pc.id} hover>
                                            <TableCell>
                                                <Box display="flex" alignItems="center" gap={0.75}>
                                                    <MonitorIcon sx={{ fontSize: 14, color: cfg.borderColor }} />
                                                    <Typography variant="body2" fontWeight="bold">{pc.name}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={cfg.label} color={cfg.color} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">{pc.customer || '—'}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontFamily="monospace" color={pc.status === 'active' ? 'error.main' : 'text.disabled'}>
                                                    {duration || '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight="bold">
                                                    {pc.status === 'active' ? currency(amount) : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    {(pc.status === 'free' || pc.status === 'reserved') && (
                                                        <Button size="small" variant="contained" color="success" onClick={() => handleStart(pc)} sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}>
                                                            Start
                                                        </Button>
                                                    )}
                                                    {pc.status === 'active' && (
                                                        <>
                                                            <Button size="small" variant="outlined" onClick={() => handleExtend(pc)} sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}>
                                                                +Time
                                                            </Button>
                                                            <Button size="small" variant="contained" color="error" onClick={() => handleStop(pc)} sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}>
                                                                Stop & Bill
                                                            </Button>
                                                        </>
                                                    )}
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

            {/* ── Dialogs ── */}

            {/* Start Session */}
            <Dialog open={Boolean(startDialog)} onClose={() => setStartDialog(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Start Session — {startDialog?.name}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Customer name (optional)"
                        value={customerInput}
                        onChange={e => setCustomerInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirmStart()}
                        sx={{ mt: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                        Rate: ₱{RATE_PER_HOUR}/hr — billed per minute
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStartDialog(null)}>Cancel</Button>
                    <Button variant="contained" color="success" startIcon={<PlayArrowIcon />} onClick={confirmStart}>
                        Start Session
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Stop & Bill */}
            <Dialog open={Boolean(stopDialog)} onClose={() => setStopDialog(null)} maxWidth="xs" fullWidth>
                {stopDialog && (() => {
                    const amount = computeAmount(stopDialog.startTime, now);
                    const duration = formatDuration(stopDialog.startTime, now);
                    return (
                        <>
                            <DialogTitle>Stop Session — {stopDialog.name}</DialogTitle>
                            <DialogContent>
                                <Stack spacing={1} mt={0.5}>
                                    {stopDialog.customer && (
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="body2" color="text.secondary">Customer</Typography>
                                            <Typography variant="body2" fontWeight="bold">{stopDialog.customer}</Typography>
                                        </Box>
                                    )}
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Duration</Typography>
                                        <Typography variant="body2" fontFamily="monospace" fontWeight="bold">{duration}</Typography>
                                    </Box>
                                    <Divider />
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="subtitle1" fontWeight="bold">Total</Typography>
                                        <Typography variant="subtitle1" fontWeight="bold" color="primary">{currency(amount)}</Typography>
                                    </Box>
                                </Stack>
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => setStopDialog(null)}>Cancel</Button>
                                <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={confirmStop}>
                                    Bill {currency(amount)}
                                </Button>
                            </DialogActions>
                        </>
                    );
                })()}
            </Dialog>

            {/* Extend Session */}
            <Dialog open={Boolean(extendDialog)} onClose={() => setExtendDialog(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Extend Session — {extendDialog?.name}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Add prepaid time to the current session.
                    </Typography>
                    <Stack direction="row" spacing={1} mb={2}>
                        {[15, 30, 60].map(m => (
                            <Button
                                key={m}
                                variant={extendMinutes === String(m) ? 'contained' : 'outlined'}
                                onClick={() => setExtendMinutes(String(m))}
                            >
                                {m} min
                            </Button>
                        ))}
                    </Stack>
                    <TextField
                        fullWidth
                        label="Custom minutes"
                        type="number"
                        value={extendMinutes}
                        onChange={e => setExtendMinutes(e.target.value)}
                        inputProps={{ min: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                        +{currency((Number(extendMinutes) / 60) * RATE_PER_HOUR)} added to session
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExtendDialog(null)}>Cancel</Button>
                    <Button variant="contained" startIcon={<MoreTimeIcon />} onClick={confirmExtend}>
                        Add {extendMinutes} min
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
