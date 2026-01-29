import React, { useState } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress,
    Stepper, Step, StepLabel, StepContent
} from '@mui/material';
import { db } from '../../firebase';
import { collection, getDocs, query, where, updateDoc, doc, writeBatch, serverTimestamp, orderBy, limit, startAfter } from 'firebase/firestore'; // Fixed imports
import { generateDisplayId } from '../../utils/idGenerator';

const steps = [
    { label: 'Database Health Check', description: 'Assign missing IDs to Shifts and Payroll runs.' },
    { label: 'Expense Classification', description: 'Auto-categorize based on keywords.' },
    { label: 'Execution', description: 'Apply changes to the database.' }
];

export default function UnifiedMigration({ showSnackbar }) {
    const [activeStep, setActiveStep] = useState(0);

    // Status
    const [analyzing, setAnalyzing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [log, setLog] = useState([]);

    // Phase 1 Stats
    const [healthStats, setHealthStats] = useState(null);

    // Progress
    const [progress, setProgress] = useState(0);

    const addLog = (msg) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    // --- PHASE 1: HEALTH CHECK ---
    const runHealthCheck = async () => {
        setAnalyzing(true);
        addLog("Scanning database for missing IDs...");
        try {
            const shiftsSnap = await getDocs(collection(db, 'shifts'));
            const shiftsMissing = shiftsSnap.docs.filter(d => !d.data().displayId).length;

            const payrollSnap = await getDocs(collection(db, 'payrollRuns'));
            const payrollMissing = payrollSnap.docs.filter(d => !d.data().displayId).length;

            setHealthStats({ shiftsMissing, payrollMissing });
            addLog(`Found ${shiftsMissing} shifts and ${payrollMissing} payroll runs needing IDs.`);

            setActiveStep(1);
        } catch (e) {
            console.error(e);
            addLog(`Error: ${e.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    // --- PHASE 3: EXECUTION (Merged Logic) ---
    const executeMigration = async () => {
        setMigrating(true);
        setActiveStep(2);
        setProgress(0);
        addLog("Starting Migration Execution...");

        try {
            const BATCH_SIZE = 400;
            let batch = writeBatch(db);
            let opCount = 0;
            let totalProcessed = 0;

            // 1. Fix IDs (Shifts/Payroll)
            if (healthStats?.shiftsMissing > 0 || healthStats?.payrollMissing > 0) {
                addLog("Patching missing IDs...");
                // ... ID patching logic same as before, simplified for brevity in this replace ...
                // (Re-using the exact logic flow from before for IDs)
                const shiftsSnap = await getDocs(collection(db, 'shifts'));
                const shiftsToUpdate = shiftsSnap.docs.filter(d => !d.data().displayId);
                for (const d of shiftsToUpdate) {
                    const newId = await generateDisplayId('shifts', 'SHIFT');
                    batch.update(doc(db, 'shifts', d.id), { displayId: newId });
                    opCount++;
                    if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
                }

                const payrollSnap = await getDocs(collection(db, 'payrollRuns'));
                const payToUpdate = payrollSnap.docs.filter(d => !d.data().displayId);
                for (const d of payToUpdate) {
                    const newId = await generateDisplayId('payrollRuns', 'PAY');
                    batch.update(doc(db, 'payrollRuns', d.id), { displayId: newId });
                    opCount++;
                    if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
                }
                addLog("IDs patched.");
            }

            // 2. Update Expense Types (Services Collection)
            addLog("Updating Expense Definitions (Services)...");
            const servicesSnap = await getDocs(collection(db, 'services'));
            for (const d of servicesSnap.docs) {
                const data = d.data();
                if (data.category === 'Credit') {
                    const name = (data.serviceName || '').trim().toLowerCase();
                    // Heuristic only
                    let cat = 'OPEX';
                    if (name.includes('capital') || name.includes('asset') || name.includes('equipment')) {
                        cat = 'CAPEX';
                    }

                    if (data.financialCategory !== cat) {
                        batch.update(doc(db, 'services', d.id), { financialCategory: cat });
                        opCount++;
                    }
                }
                if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
            }

            // 3. Update Transactions (Historical Data) - WITH PAGINATION
            addLog("Updating Transactions (Batching 500 at a time)...");

            let hasMore = true;
            let lastDoc = null;
            const CHUNK_SIZE = 500;
            let totalFetched = 0;

            while (hasMore) {
                let qConstraint = [
                    orderBy('timestamp', 'desc'),
                    limit(CHUNK_SIZE)
                ];
                if (lastDoc) {
                    qConstraint.push(startAfter(lastDoc));
                }

                const q = query(collection(db, 'transactions'), ...qConstraint);
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                totalFetched += snapshot.size;

                for (const d of snapshot.docs) {
                    const data = d.data();
                    if (data.isDeleted) continue;

                    let needsUpdate = false;
                    let updatePayload = {};

                    // Expense Logic
                    const isExpense = data.category === 'credit' || data.item === 'Expenses' || data.expenseType;
                    if (isExpense) {
                        let typeName = data.expenseType || data.item || 'Generic Expense';
                        if (typeName === 'Expenses') typeName = data.expenseType || 'Misc';
                        typeName = typeName.trim();
                        const lower = typeName.toLowerCase();

                        // HEURISTIC ONLY
                        let targetCat = 'OPEX';
                        if (lower.includes('capital') || lower.includes('asset') || lower.includes('equipment')) {
                            targetCat = 'CAPEX';
                        }

                        if (data.financialCategory !== targetCat) {
                            updatePayload.financialCategory = targetCat;
                            needsUpdate = true;
                        }

                        // Legacy Salary Fix
                        if (data.expenseType === 'Salary') {
                            if (!data.payrollRunId) { updatePayload.payrollRunId = "legacy_migration"; needsUpdate = true; }
                            if (data.voided === undefined) { updatePayload.voided = false; needsUpdate = true; }
                        }

                    } else {
                        // Revenue Logic
                        if (!data.financialCategory) {
                            updatePayload.financialCategory = 'Revenue';
                            needsUpdate = true;
                        }
                    }

                    if (needsUpdate) {
                        batch.update(doc(db, 'transactions', d.id), updatePayload);
                        opCount++;
                    }
                }

                if (opCount > 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                    addLog(`Processed ${totalFetched} transactions...`);
                }
            }

            setProgress(100);
            addLog("Migration Complete Successfully.");
            showSnackbar?.("Migration Success", "success");
            setMigrating(false);

        } catch (e) {
            console.error(e);
            addLog(`Fatal Error: ${e.message}`);
            showSnackbar?.("Migration Failed", "error");
            setMigrating(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: 2 }}>
            <Typography variant="h5" gutterBottom>System Migration Utility</Typography>
            <Paper sx={{ p: 3, mb: 3 }}>
                <Stepper activeStep={activeStep} orientation="vertical">

                    {/* STEP 1 */}
                    <Step>
                        <StepLabel>Database Health Check</StepLabel>
                        <StepContent>
                            <Typography variant="body2" paragraph>
                                Scans for missing IDs on Shifts and Payroll.
                            </Typography>
                            {analyzing && <LinearProgress sx={{ mb: 2 }} />}
                            {healthStats && (
                                <Box sx={{ mb: 2, bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
                                    <Typography variant="caption">Shifts Missing IDs: <b>{healthStats.shiftsMissing}</b></Typography><br />
                                    <Typography variant="caption">Payroll Missing IDs: <b>{healthStats.payrollMissing}</b></Typography>
                                </Box>
                            )}
                            <Button variant="contained" onClick={runHealthCheck} disabled={analyzing}>
                                {healthStats ? 'Re-Scan' : 'Start Scan'}
                            </Button>
                            {healthStats && (
                                <Button onClick={() => setActiveStep(1)} sx={{ ml: 2 }}>
                                    Next
                                </Button>
                            )}
                        </StepContent>
                    </Step>

                    {/* STEP 2 */}
                    <Step>
                        <StepLabel>Expense Classification</StepLabel>
                        <StepContent>
                            <Typography variant="body2" paragraph>
                                <b>Logic:</b> We will scan all transactions and apply the following rules:
                            </Typography>
                            <ul>
                                <li>If name contains <b>"Capital"</b>, <b>"Asset"</b>, or <b>"Equipment"</b> → <b>CAPEX</b></li>
                                <li>Everything else → <b>OPEX</b> (Operating Expense)</li>
                            </ul>
                            <Typography variant="caption" color="text.secondary" paragraph>
                                No manual tagging required.
                            </Typography>

                            <Button variant="contained" onClick={executeMigration}>
                                Start Migration
                            </Button>
                        </StepContent>
                    </Step>

                    {/* STEP 3 */}
                    <Step>
                        <StepLabel>Execution</StepLabel>
                        <StepContent>
                            <Typography variant="body2" paragraph>Applying updates to database...</Typography>
                            <LinearProgress variant="determinate" value={progress} sx={{ mb: 1, height: 10, borderRadius: 5 }} />
                            <Typography variant="caption" align="right" display="block">{progress}%</Typography>

                            <Box sx={{ mt: 2, bgcolor: '#000', color: '#0f0', p: 2, borderRadius: 1, maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {log.map((l, i) => <div key={i}>{l}</div>)}
                            </Box>

                            {!migrating && progress === 100 && (
                                <Button sx={{ mt: 2 }} onClick={() => showSnackbar("All Done!", "success")}>Finished</Button>
                            )}
                        </StepContent>
                    </Step>
                </Stepper>
            </Paper>
        </Box>
    );
}
