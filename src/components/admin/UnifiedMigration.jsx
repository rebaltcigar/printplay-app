import React, { useState, useRef } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress,
    Stepper, Step, StepLabel, StepContent, Alert,
    Table, TableBody, TableCell, TableHead, TableRow,
    Stack, Chip
} from '@mui/material';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, limit, startAfter, writeBatch, doc } from 'firebase/firestore';
import { generateDisplayId } from '../../utils/idGenerator';

// Safety Limits
const READ_LIMIT_DAILY = 50000;
const WRITE_LIMIT_DAILY = 20000;
const SAFETY_THRESHOLD = 0.85;

const MAX_READS = READ_LIMIT_DAILY * SAFETY_THRESHOLD;
const MAX_WRITES = WRITE_LIMIT_DAILY * SAFETY_THRESHOLD;

// Helper: Safe ISO Date String
const safeISO = (val) => {
    if (!val) return 'N/A';
    try {
        let date;
        if (typeof val.toDate === 'function') {
            date = val.toDate(); // Firestore Timestamp
        } else if (val instanceof Date) {
            date = val;
        } else {
            date = new Date(val);
        }

        if (isNaN(date.getTime())) return 'N/A'; // Invalid Date
        return date.toISOString();
    } catch (e) {
        return 'N/A';
    }
};

export default function UnifiedMigration({ showSnackbar }) {
    const [activeStep, setActiveStep] = useState(0);

    // Status
    const [analyzing, setAnalyzing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [paused, setPaused] = useState(false);
    const [pauseReason, setPauseReason] = useState('');

    // Resume State
    const [resumeTimestamp, setResumeTimestamp] = useState(null);
    const [resumeDocCount, setResumeDocCount] = useState(0);

    // Stats
    const [stats, setStats] = useState({
        reads: 0,
        writes: 0,
        processed: 0,
        updated: 0,
        skipped: 0
    });

    const [healthStats, setHealthStats] = useState(null);

    // Logs (Array of objects for CSV)
    const logsRef = useRef([]);
    const [displayLogs, setDisplayLogs] = useState([]); // Subset for UI

    const addLog = (entry) => {
        const timestamp = new Date().toISOString();
        const logItem = { timestamp, ...entry };
        logsRef.current.push(logItem);

        // Update UI log (keep last 50 for performance)
        setDisplayLogs(prev => [`[${new Date().toLocaleTimeString()}] ${entry.message}`, ...prev].slice(0, 50));
    };

    // --- CSV FUNCTIONS ---
    const downloadCSV = () => {
        if (logsRef.current.length === 0) {
            showSnackbar("No logs to export", "info");
            return;
        }

        // CSV Header
        const headers = ["Timestamp", "DocID", "Type", "OldCategory", "NewCategory", "DocTimestamp", "Action", "Message"];
        const csvContent = [
            headers.join(','),
            ...logsRef.current.map(row => {
                return [
                    row.timestamp,
                    row.docId || '',
                    (row.type || '').replace(/,/g, ' '), // sanitize CSV
                    row.oldCategory || '',
                    row.newCategory || '',
                    row.docTimestamp || '', // CRITICAL for resuming
                    row.action || '',
                    `"${(row.message || '').replace(/"/g, '""')}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `migration_log_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(l => l.trim() !== '');
            if (lines.length < 2) {
                showSnackbar("Invalid CSV file", "error");
                return;
            }

            let lastValidTimestamp = null;
            let count = 0;

            // Search from END for resume point
            for (let i = lines.length - 1; i >= 1; i--) {
                const cols = lines[i].split(',');
                // Index 5 is DocTimestamp
                const docTs = cols[5];

                if (docTs && docTs.length > 10 && !lastValidTimestamp && docTs !== 'N/A') {
                    lastValidTimestamp = docTs;
                }
                count++;
            }

            if (lastValidTimestamp) {
                setResumeTimestamp(lastValidTimestamp);
                setResumeDocCount(count);
                showSnackbar(`Loaded history. Resuming after Transaction Time: ${lastValidTimestamp}`, "success");
                addLog({ message: `CSV Loaded. Will resume after: ${lastValidTimestamp}`, action: "RESUME_SET" });
            } else {
                showSnackbar("Could not find valid DocTimestamp in CSV to resume.", "warning");
            }
        };
        reader.readAsText(file);
    };

    // --- PHASE 1: HEALTH CHECK (IDs) ---
    const runHealthCheck = async () => {
        setAnalyzing(true);
        addLog({ message: "Scanning database for missing IDs...", action: "SCAN_START" });
        try {
            setStats(prev => ({ ...prev, reads: prev.reads + 2 }));

            const shiftsSnap = await getDocs(collection(db, 'shifts'));
            setStats(prev => ({ ...prev, reads: prev.reads + shiftsSnap.size }));
            const shiftsMissing = shiftsSnap.docs.filter(d => !d.data().displayId).length;

            const payrollSnap = await getDocs(collection(db, 'payrollRuns'));
            setStats(prev => ({ ...prev, reads: prev.reads + payrollSnap.size }));
            const payrollMissing = payrollSnap.docs.filter(d => !d.data().displayId).length;

            setHealthStats({ shiftsMissing, payrollMissing });
            addLog({ message: `Found ${shiftsMissing} shifts and ${payrollMissing} payroll runs needing IDs.`, action: "SCAN_COMPLETE" });

            setActiveStep(1);
        } catch (e) {
            console.error(e);
            addLog({ message: `Error: ${e.message}`, action: "ERROR" });
        } finally {
            setAnalyzing(false);
        }
    };

    // --- PHASE 3: EXECUTION ---
    const executeMigration = async () => {
        setMigrating(true);
        setPaused(false);
        setPauseReason('');
        setActiveStep(2);

        addLog({ message: "Starting Migration Execution...", action: "START" });

        try {
            const BATCH_SIZE = 400;
            let batch = writeBatch(db);
            let opCount = 0;

            // Sync local limit tracking
            let currentReads = stats.reads;
            let currentWrites = stats.writes;

            const checkLimits = () => {
                if (currentReads >= MAX_READS) return `Read limit reached (${currentReads}/${MAX_READS})`;
                if (currentWrites >= MAX_WRITES) return `Write limit reached (${currentWrites}/${MAX_WRITES})`;
                return null;
            };

            // 1. Transactions - RESUMABLE QUERY
            addLog({ message: "Processing Transactions...", action: "INFO" });

            let hasMore = true;
            let lastDoc = null;
            const CHUNK_SIZE = 500;

            while (hasMore) {
                // CHECK LIMITS
                const limitMsg = checkLimits();
                if (limitMsg) {
                    setPaused(true);
                    setPauseReason(limitMsg);
                    addLog({ message: `PAUSED: ${limitMsg}`, action: "PAUSE" });
                    break;
                }

                // Query Construction
                let qConstraint = [
                    orderBy('timestamp', 'desc'),
                    limit(CHUNK_SIZE)
                ];

                // Resume logic
                if (lastDoc) {
                    qConstraint.push(startAfter(lastDoc));
                } else if (resumeTimestamp) {
                    const resumeDate = new Date(resumeTimestamp);
                    if (!isNaN(resumeDate.getTime())) {
                        qConstraint.push(startAfter(resumeDate));
                        addLog({ message: `Query starting after ${resumeTimestamp}`, action: "QUERY_RESUME" });
                    }
                }

                const q = query(collection(db, 'transactions'), ...qConstraint);
                const snapshot = await getDocs(q);

                currentReads += snapshot.size;
                setStats(prev => ({ ...prev, reads: currentReads }));

                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }

                lastDoc = snapshot.docs[snapshot.docs.length - 1];

                for (const d of snapshot.docs) {
                    const data = d.data();
                    const docTimestamp = safeISO(data.timestamp); // SAFE ISO CALL

                    if (data.isDeleted) continue;

                    let needsUpdate = false;
                    let updatePayload = {};
                    let oldCat = data.financialCategory || 'None';
                    let newCat = oldCat;

                    // --- EXPENSE LOGIC ---
                    const isExpense = data.category === 'credit' || data.item === 'Expenses' || data.expenseType;

                    if (isExpense) {
                        let typeName = data.expenseType || data.item || 'Generic Expense';
                        if (typeName === 'Expenses') typeName = data.expenseType || 'Misc';
                        const lowerName = typeName.trim().toLowerCase();

                        // RULE 1: Explicit "Capital Expense" Type matches existing DB
                        const isExplicitCapital = data.expenseType === 'Capital Expense';

                        // RULE 2: Keyword Heuristics
                        const hasCapitalKeywords = lowerName.includes('capital') ||
                            lowerName.includes('asset') ||
                            lowerName.includes('equipment') ||
                            lowerName.includes('renovation');

                        let targetCat = 'OPEX';
                        if (isExplicitCapital || hasCapitalKeywords) {
                            targetCat = 'CAPEX';
                        }

                        if (data.financialCategory !== targetCat) {
                            updatePayload.financialCategory = targetCat;
                            newCat = targetCat;
                            needsUpdate = true;
                        }

                        // Legacy Salary Fix
                        if (data.expenseType === 'Salary') {
                            if (!data.payrollRunId) { updatePayload.payrollRunId = "legacy_migration"; needsUpdate = true; }
                        }

                    } else {
                        // --- REVENUE LOGIC ---
                        if (!data.financialCategory) {
                            updatePayload.financialCategory = 'Revenue';
                            newCat = 'Revenue';
                            needsUpdate = true;
                        }
                    }

                    if (needsUpdate) {
                        batch.update(doc(db, 'transactions', d.id), updatePayload);
                        opCount++;
                        currentWrites++;
                        setStats(prev => ({ ...prev, writes: currentWrites, updated: prev.updated + 1 }));

                        addLog({
                            message: `Updated ${d.id}: ${oldCat} -> ${newCat}`,
                            action: "UPDATE",
                            docId: d.id,
                            type: data.expenseType || 'Transaction',
                            oldCategory: oldCat,
                            newCategory: newCat,
                            docTimestamp: docTimestamp
                        });
                    } else {
                        setStats(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }));
                    }
                } // end loop docs

                // FORCE LOG THE LAST DOC TIMESTAMP (Using SAFE ISO)
                if (lastDoc) {
                    const d = lastDoc.data();
                    const lastTs = safeISO(d.timestamp);
                    addLog({
                        message: `Batch complete. Last Doc: ${lastDoc.id}`,
                        action: "BATCH_END",
                        docTimestamp: lastTs
                    });
                }

                if (opCount >= 1) { // Commit if we have pending
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                    addLog({ message: "Committed batch to database.", action: "COMMIT" });
                }

                const limitMsgEnd = checkLimits();
                if (limitMsgEnd) {
                    setPaused(true);
                    setPauseReason(limitMsgEnd);
                    addLog({ message: `PAUSED: ${limitMsgEnd}`, action: "PAUSE" });
                    break;
                }

            } // end while

            if (opCount > 0) {
                await batch.commit();
                currentWrites += opCount;
                setStats(prev => ({ ...prev, writes: currentWrites }));
                addLog({ message: "Final batch committed.", action: "COMMIT" });
            }

            if (!paused) {
                addLog({ message: "Migration Completed Successfully.", action: "COMPLETE" });
                showSnackbar?.("Migration Success", "success");
            } else {
                showSnackbar?.("Migration Paused for Safety", "warning");
            }

        } catch (e) {
            console.error(e);
            addLog({ message: `Fatal Error: ${e.message}`, action: "FATAL_ERROR" });
            showSnackbar?.("Migration Failed", "error");
        } finally {
            setMigrating(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
            <Paper sx={{ p: 4, mb: 3 }}>
                <Typography variant="h4" gutterBottom>Unified Migration Tool</Typography>
                <Typography color="text.secondary" gutterBottom>
                    Resumable, Quota-Safe Migration Utility for PrintPlay
                </Typography>

                {/* GLOBAL STATS */}
                <Stack direction="row" spacing={2} sx={{ my: 2 }}>
                    <Chip label={`Reads: ${stats.reads} / ${MAX_READS}`} color={stats.reads > MAX_READS ? "error" : "default"} variant="outlined" />
                    <Chip label={`Writes: ${stats.writes} / ${MAX_WRITES}`} color={stats.writes > MAX_WRITES ? "error" : "default"} variant="outlined" />
                    <Chip label={`Processed: ${stats.processed}`} color="primary" />
                    <Chip label={`Updates: ${stats.updated}`} color="secondary" />
                </Stack>

                <Stepper activeStep={activeStep} orientation="vertical">

                    {/* STEP 1: PREP & UPLOAD */}
                    <Step>
                        <StepLabel>Preparation & Resume</StepLabel>
                        <StepContent>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                If you have a previous run's CSV log, upload it here to resume.
                            </Alert>
                            <Button variant="outlined" component="label">
                                Upload Log CSV
                                <input type="file" hidden accept=".csv" onChange={handleFileUpload} />
                            </Button>
                            {resumeDocCount > 0 && (
                                <Typography variant="caption" sx={{ ml: 2 }}>
                                    Loaded {resumeDocCount} logs. Ready to resume from {resumeTimestamp}.
                                </Typography>
                            )}
                            <Box sx={{ mt: 2 }}>
                                <Button variant="contained" onClick={runHealthCheck}>Start Health Scan</Button>
                                {healthStats && <Button onClick={() => setActiveStep(1)} sx={{ ml: 2 }}>Next</Button>}
                            </Box>
                        </StepContent>
                    </Step>

                    {/* STEP 2: RULES REVIEW */}
                    <Step>
                        <StepLabel>Review Rules</StepLabel>
                        <StepContent>
                            <Typography variant="body2" paragraph>
                                <b>Classification Rules:</b>
                            </Typography>
                            <ul>
                                <li><b>CAPEX:</b> Type is "Capital Expense" OR Name contains "Capital", "Asset", "Equipment".</li>
                                <li><b>OPEX:</b> All other expenses.</li>
                                <li><b>Revenue:</b> All income/sales.</li>
                            </ul>
                            <Button variant="contained" onClick={executeMigration}>Start Execution</Button>
                        </StepContent>
                    </Step>

                    {/* STEP 3: RUNNING */}
                    <Step>
                        <StepLabel>Execution</StepLabel>
                        <StepContent>
                            {paused && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    {pauseReason} <br />
                                    <strong>Action Required:</strong> Download the CSV log below to save your progress. You can upload it tomorrow to resume.
                                </Alert>
                            )}

                            {migrating && <LinearProgress sx={{ mb: 2 }} />}

                            <Box sx={{
                                bgcolor: '#1e1e1e', color: '#00ff00', p: 2,
                                borderRadius: 1, height: 300, overflow: 'auto',
                                fontFamily: 'monospace', fontSize: '0.8rem', mb: 2
                            }}>
                                {displayLogs.map((l, i) => <div key={i}>{l}</div>)}
                            </Box>

                            <Stack direction="row" spacing={2}>
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={downloadCSV}
                                    disabled={logsRef.current.length === 0}
                                >
                                    Download CSV Log (Save State)
                                </Button>
                                {paused && (
                                    <Button variant="outlined" color="warning" onClick={executeMigration}>
                                        Force Resume (Not Recommended)
                                    </Button>
                                )}
                            </Stack>
                        </StepContent>
                    </Step>
                </Stepper>
            </Paper>
        </Box>
    );
}
