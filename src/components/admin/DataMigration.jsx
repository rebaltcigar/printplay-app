// src/components/admin/DataMigration.jsx
// Admin tool: one-time Firestore data migrations.
// Provides a live progress bar, detailed log output, and proper error handling.

import React, { useState, useRef, useCallback } from 'react';
import {
    Box, Button, Card, CardContent, Chip, Divider,
    LinearProgress, Stack, Typography, Alert, AlertTitle,
    Accordion, AccordionSummary, AccordionDetails,
    Tooltip, IconButton
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BuildIcon from '@mui/icons-material/Build';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import PageHeader from '../common/PageHeader';

// ─── Log Level Config ────────────────────────────────────────────────────────
const LOG_LEVEL = { INFO: 'info', SUCCESS: 'success', WARN: 'warn', ERROR: 'error', DEBUG: 'debug' };

const LOG_COLORS = {
    [LOG_LEVEL.INFO]: '#90caf9',  // blue
    [LOG_LEVEL.SUCCESS]: '#81c784',  // green
    [LOG_LEVEL.WARN]: '#ffb74d',  // orange
    [LOG_LEVEL.ERROR]: '#e57373',  // red
    [LOG_LEVEL.DEBUG]: '#b0bec5',  // grey
};

const LOG_PREFIXES = {
    [LOG_LEVEL.INFO]: '[INFO ]',
    [LOG_LEVEL.SUCCESS]: '[OK   ]',
    [LOG_LEVEL.WARN]: '[WARN ]',
    [LOG_LEVEL.ERROR]: '[ERROR]',
    [LOG_LEVEL.DEBUG]: '[DEBUG]',
};

// ─── Migration Definitions ───────────────────────────────────────────────────
const MIGRATIONS = [
    {
        id: 'rename_category_values',
        label: 'Rename Catalogue Category Values',
        description: "Renames 'Debit' → 'Sale' and 'Credit' → 'Expense' in the services collection. This is a one-time migration to fix the backwards accounting terminology.",
        badge: 'Required',
        badgeColor: 'error',
        batchSize: 400,
        run: async ({ log, setProgress, signal }) => {
            log('Fetching all documents from the services collection…', LOG_LEVEL.INFO);

            let snap;
            try {
                snap = await getDocs(collection(db, 'services'));
            } catch (err) {
                throw new Error(`Failed to fetch services collection: ${err.message}`);
            }

            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            log(`Fetched ${all.length} total service document(s).`, LOG_LEVEL.DEBUG);

            const toSaleFix = all.filter(d => d.category === 'Debit');
            const toExpenseFix = all.filter(d => d.category === 'Credit');
            const alreadyNew = all.filter(d => d.category === 'Sale' || d.category === 'Expense');
            const unknown = all.filter(d => !['Debit', 'Credit', 'Sale', 'Expense'].includes(d.category));

            log(`Documents with category='Debit'  (→ 'Sale'):    ${toSaleFix.length}`, LOG_LEVEL.INFO);
            log(`Documents with category='Credit' (→ 'Expense'): ${toExpenseFix.length}`, LOG_LEVEL.INFO);
            log(`Documents already on new values (skipped):       ${alreadyNew.length}`, LOG_LEVEL.DEBUG);

            if (unknown.length > 0) {
                log(`⚠ Found ${unknown.length} doc(s) with unexpected category value(s):`, LOG_LEVEL.WARN);
                unknown.forEach(d => {
                    log(`  → id=${d.id}  serviceName="${d.serviceName}"  category="${d.category}"`, LOG_LEVEL.WARN);
                });
            }

            if (toSaleFix.length === 0 && toExpenseFix.length === 0) {
                log('Nothing to migrate. All documents are already on the new values.', LOG_LEVEL.SUCCESS);
                setProgress(100);
                return { updated: 0, skipped: alreadyNew.length };
            }

            const toUpdate = [
                ...toSaleFix.map(d => ({ id: d.id, name: d.serviceName, old: 'Debit', category: 'Sale' })),
                ...toExpenseFix.map(d => ({ id: d.id, name: d.serviceName, old: 'Credit', category: 'Expense' })),
            ];

            log(`Preparing to update ${toUpdate.length} document(s) in batches of 400…`, LOG_LEVEL.INFO);

            const BATCH_SIZE = 400;
            let updatedCount = 0;

            for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
                // Allow external cancellation
                if (signal?.aborted) {
                    throw new Error('Migration was cancelled by user.');
                }

                const chunk = toUpdate.slice(i, i + BATCH_SIZE);
                log(`Committing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} doc(s)…`, LOG_LEVEL.DEBUG);

                // Log individual changes at DEBUG level
                chunk.forEach(item => {
                    log(`  ↳ [${item.id}] "${item.name}": '${item.old}' → '${item.category}'`, LOG_LEVEL.DEBUG);
                });

                const batch = writeBatch(db);
                chunk.forEach(({ id, category }) => {
                    batch.update(doc(db, 'services', id), { category });
                });

                try {
                    await batch.commit();
                } catch (err) {
                    throw new Error(`Batch commit failed at offset ${i}: ${err.message}\nFirestore code: ${err.code}`);
                }

                updatedCount += chunk.length;
                const pct = Math.round((updatedCount / toUpdate.length) * 100);
                setProgress(pct);
                log(`Batch committed. Progress: ${updatedCount}/${toUpdate.length} (${pct}%)`, LOG_LEVEL.INFO);
            }

            log(`Migration complete! Updated ${updatedCount} document(s).`, LOG_LEVEL.SUCCESS);
            return { updated: updatedCount, skipped: alreadyNew.length };
        }
    },
];

// ─── Log Entry Component ──────────────────────────────────────────────────────
function LogEntry({ entry }) {
    return (
        <Typography
            component="div"
            variant="caption"
            sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                lineHeight: 1.6,
                color: LOG_COLORS[entry.level] || '#ccc',
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
            }}
        >
            <span style={{ opacity: 0.45, userSelect: 'none' }}>{entry.ts} </span>
            <span style={{ opacity: 0.7 }}>{LOG_PREFIXES[entry.level]} </span>
            {entry.message}
        </Typography>
    );
}

// ─── Single Migration Card ────────────────────────────────────────────────────
function MigrationCard({ migration, showSnackbar }) {
    const [status, setStatus] = useState('idle');  // idle | running | done | error
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState([]);
    const [result, setResult] = useState(null);
    const [errorDetail, setErrorDetail] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    const logEndRef = useRef(null);
    const abortRef = useRef(null);

    const addLog = useCallback((message, level = LOG_LEVEL.INFO) => {
        const now = new Date();
        const ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        const entry = { ts: `${ts}.${ms}`, message, level, id: Date.now() + Math.random() };
        setLogs(prev => [...prev, entry]);
        // Auto-scroll to bottom
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    const handleRun = async () => {
        if (status === 'running') return;
        setStatus('running');
        setProgress(0);
        setLogs([]);
        setResult(null);
        setErrorDetail(null);

        const controller = new AbortController();
        abortRef.current = controller;

        addLog(`=== Starting migration: "${migration.label}" ===`, LOG_LEVEL.INFO);
        addLog(`Timestamp: ${new Date().toISOString()}`, LOG_LEVEL.DEBUG);

        try {
            const res = await migration.run({
                log: addLog,
                setProgress,
                signal: controller.signal,
            });
            setResult(res);
            setStatus('done');
            setProgress(100);
            addLog(`=== Migration finished successfully ===`, LOG_LEVEL.SUCCESS);
            showSnackbar?.(`Migration complete! Updated ${res.updated} doc(s).`, 'success');
        } catch (err) {
            setStatus('error');
            setErrorDetail(err);
            addLog(`=== Migration FAILED ===`, LOG_LEVEL.ERROR);
            addLog(`Error: ${err.message}`, LOG_LEVEL.ERROR);
            if (err.stack) {
                addLog(`Stack trace:\n${err.stack}`, LOG_LEVEL.DEBUG);
            }
            showSnackbar?.(`Migration failed: ${err.message}`, 'error');
        } finally {
            abortRef.current = null;
        }
    };

    const handleCopyLogs = () => {
        const text = logs.map(e => `${e.ts} ${LOG_PREFIXES[e.level]} ${e.message}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showSnackbar?.('Logs copied to clipboard!', 'success');
        }).catch(() => {
            showSnackbar?.('Failed to copy logs.', 'error');
        });
    };

    const isIdle = status === 'idle';
    const isRunning = status === 'running';
    const isDone = status === 'done';
    const isError = status === 'error';

    const visibleLogs = showDebug ? logs : logs.filter(l => l.level !== LOG_LEVEL.DEBUG);

    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
                {/* Header Row */}
                <Stack direction="row" alignItems="flex-start" spacing={2} flexWrap="wrap">
                    <Box flex={1} minWidth={200}>
                        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                            <Typography variant="subtitle1" fontWeight={700}>
                                {migration.label}
                            </Typography>
                            <Chip
                                label={migration.badge}
                                color={migration.badgeColor}
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                            {isDone && (
                                <Chip
                                    icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                    label="Done"
                                    color="success"
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.65rem' }}
                                />
                            )}
                            {isError && (
                                <Chip
                                    icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                                    label="Failed"
                                    color="error"
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.65rem' }}
                                />
                            )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {migration.description}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
                        <Button
                            variant={isDone ? 'outlined' : 'contained'}
                            color={isError ? 'error' : 'primary'}
                            startIcon={<PlayArrowIcon />}
                            onClick={handleRun}
                            disabled={isRunning}
                            size="small"
                            sx={{ minWidth: 120 }}
                        >
                            {isRunning ? 'Running…' : isDone ? 'Run Again' : isError ? 'Retry' : 'Run Migration'}
                        </Button>
                    </Stack>
                </Stack>

                {/* Progress Bar */}
                {(isRunning || isDone || isError) && (
                    <Box mt={2}>
                        <Stack direction="row" justifyContent="space-between" mb={0.5}>
                            <Typography variant="caption" color="text.secondary">
                                {isRunning ? `Processing… ${progress}%` : isDone ? 'Completed' : 'Failed'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {progress}%
                            </Typography>
                        </Stack>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            color={isError ? 'error' : isDone ? 'success' : 'primary'}
                            sx={{ height: 8, borderRadius: 4 }}
                        />
                    </Box>
                )}

                {/* Result Summary */}
                {isDone && result && (
                    <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 2 }}>
                        <AlertTitle>Migration Successful</AlertTitle>
                        Updated <strong>{result.updated}</strong> document(s). &nbsp;
                        Skipped <strong>{result.skipped}</strong> (already on new values).
                    </Alert>
                )}

                {/* Error Summary */}
                {isError && errorDetail && (
                    <Alert severity="error" icon={<ErrorIcon />} sx={{ mt: 2 }}>
                        <AlertTitle>Migration Failed</AlertTitle>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {errorDetail.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                            Check the log below for full details.
                        </Typography>
                    </Alert>
                )}

                {/* Idempotency Warning */}
                {isIdle && (
                    <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 2 }} variant="outlined">
                        <AlertTitle>Before you run</AlertTitle>
                        This migration updates Firestore documents. It is <strong>safe to re-run</strong> — documents already on new values are skipped.
                        Still, consider backing up your Firestore data before proceeding on a large production database.
                    </Alert>
                )}

                {/* Log Console */}
                {logs.length > 0 && (
                    <Box mt={2}>
                        <Divider sx={{ mb: 1.5 }} />
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Migration Log
                                </Typography>
                                <Chip label={`${logs.length} entries`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                            </Stack>
                            <Stack direction="row" spacing={0.5}>
                                <Tooltip title={showDebug ? 'Hide debug entries' : 'Show debug entries'}>
                                    <Chip
                                        label="DEBUG"
                                        size="small"
                                        variant={showDebug ? 'filled' : 'outlined'}
                                        color={showDebug ? 'primary' : 'default'}
                                        onClick={() => setShowDebug(v => !v)}
                                        sx={{ height: 22, fontSize: '0.65rem', cursor: 'pointer' }}
                                    />
                                </Tooltip>
                                <Tooltip title="Copy full log to clipboard">
                                    <IconButton size="small" onClick={handleCopyLogs}>
                                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>

                        <Box
                            sx={{
                                bgcolor: '#0a0a0a',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                p: 1.5,
                                maxHeight: 320,
                                overflowY: 'auto',
                                '&::-webkit-scrollbar': { width: 6 },
                                '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                                '&::-webkit-scrollbar-thumb': { bgcolor: '#333', borderRadius: 3 },
                            }}
                        >
                            {visibleLogs.map(entry => (
                                <LogEntry key={entry.id} entry={entry} />
                            ))}
                            <div ref={logEndRef} />
                        </Box>

                        {!showDebug && logs.filter(l => l.level === LOG_LEVEL.DEBUG).length > 0 && (
                            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                                {logs.filter(l => l.level === LOG_LEVEL.DEBUG).length} debug entries hidden. Toggle DEBUG to show.
                            </Typography>
                        )}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DataMigration({ showSnackbar }) {
    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title="Data Migrations"
                subtitle="One-time database maintenance tools. Each migration is idempotent — safe to re-run."
                actions={
                    <Tooltip title="Only superadmins should run migrations. Run against staging first.">
                        <Chip
                            icon={<InfoOutlinedIcon />}
                            label="Admin only"
                            size="small"
                            variant="outlined"
                            color="warning"
                        />
                    </Tooltip>
                }
            />

            <Alert severity="info" sx={{ mb: 3 }} variant="outlined">
                <AlertTitle>How migrations work</AlertTitle>
                Migrations update Firestore documents in batches of 400 to stay within Firestore limits.
                Each migration checks current values before writing — docs already on the correct value are skipped automatically.
                The log console shows real-time progress. Toggle <strong>DEBUG</strong> to see individual document changes.
            </Alert>

            {MIGRATIONS.map(m => (
                <MigrationCard key={m.id} migration={m} showSnackbar={showSnackbar} />
            ))}

            <Typography variant="caption" color="text.disabled" display="block" mt={2} textAlign="center">
                Migrations are designed by the development team. Do not run unless instructed.
            </Typography>
        </Box>
    );
}
