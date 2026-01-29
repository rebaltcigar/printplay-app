import React, { useState } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
    Stepper, Step, StepLabel, StepContent, Switch, FormControlLabel, Radio, RadioGroup, FormControl
} from '@mui/material';
import { db } from '../../firebase';
import { collection, getDocs, query, where, updateDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { generateDisplayId } from '../../utils/idGenerator';

const steps = [
    { label: 'Database Health Check', description: 'Assign missing IDs to Shifts and Payroll runs.' },
    { label: 'Expense Classification', description: 'Categorize historical Expense Types as OPEX or CAPEX.' },
    { label: 'Execution', description: 'Apply changes to the database.' }
];

export default function UnifiedMigration({ showSnackbar }) {
    const [activeStep, setActiveStep] = useState(0);
    const [analyzing, setAnalyzing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [log, setLog] = useState([]);

    // Phase 1 Stats
    const [healthStats, setHealthStats] = useState(null);

    // Phase 2 Data
    const [expenseTypes, setExpenseTypes] = useState([]); // [{ name, count, category: 'OPEX'|'CAPEX' }]

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

            // Only auto-proceed if strictly necessary, but let's let user click Next
            setActiveStep(1);
            runExpenseAnalysis(); // Automatically start analyzing expenses next
        } catch (e) {
            console.error(e);
            addLog(`Error: ${e.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    // --- PHASE 2: EXPENSE ANALYSIS ---
    const runExpenseAnalysis = async () => {
        setAnalyzing(true);
        addLog("Analyzing Expense Types...");
        try {
            const typeMap = new Map(); // name -> { count, currentCat }

            // 1. Scan Services (Expense Types)
            const servicesSnap = await getDocs(collection(db, 'services'));
            servicesSnap.forEach(d => {
                const data = d.data();
                if (data.category === 'Credit') {
                    const name = (data.serviceName || '').trim();
                    if (name) {
                        const existing = typeMap.get(name) || { count: 0, category: data.financialCategory || 'OPEX' };
                        // heuristics if not set
                        if (!data.financialCategory) {
                            if (name.toLowerCase().includes('asset') || name.toLowerCase().includes('equipment')) existing.category = 'CAPEX';
                        }
                        typeMap.set(name, existing);
                    }
                }
            });

            // 2. Scan Transactions
            const txSnap = await getDocs(collection(db, 'transactions'));
            txSnap.forEach(d => {
                const data = d.data();
                if (data.isDeleted) return;

                // Identify if expense
                const isExpense = data.category === 'credit' || data.item === 'Expenses' || data.expenseType;

                if (isExpense) {
                    // Get the "Type" name
                    let typeName = data.expenseType || data.item || 'Generic Expense';
                    if (typeName === 'Expenses') typeName = data.expenseType || 'Misc';

                    typeName = typeName.trim();

                    const existing = typeMap.get(typeName) || { count: 0, category: 'OPEX' };
                    existing.count++;

                    // Heuristics
                    if (!data.financialCategory && (typeName.toLowerCase().includes('asset') || typeName.toLowerCase().includes('equipment'))) {
                        existing.category = 'CAPEX';
                    }
                    if (data.financialCategory) existing.category = data.financialCategory;

                    typeMap.set(typeName, existing);
                }
            });

            // Convert to array
            const list = Array.from(typeMap.entries()).map(([name, val]) => ({
                name,
                count: val.count,
                category: val.category
            }));

            list.sort((a, b) => b.count - a.count);
            setExpenseTypes(list);
            addLog(`Found ${list.length} unique expense types.`);

        } catch (e) {
            console.error(e);
            addLog(`Error analyzing expenses: ${e.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const toggleCategory = (index, newVal) => {
        const copy = [...expenseTypes];
        copy[index].category = newVal;
        setExpenseTypes(copy);
    };

    // --- PHASE 3: EXECUTION ---
    const executeMigration = async () => {
        setMigrating(true);
        setActiveStep(2);
        setProgress(0);
        addLog("Starting Migration Execution...");

        try {
            const BATCH_SIZE = 400;
            let batch = writeBatch(db);
            let opCount = 0;
            let processed = 0;

            // 1. Fix IDs (Shifts/Payroll)
            if (healthStats?.shiftsMissing > 0 || healthStats?.payrollMissing > 0) {
                // Reuse logic from DataMigration.jsx (simplified here for brevity)
                // In a real scenario, I'd copy the ID generation loops.
                // For now, let's assume the user runs the old tool or we implement it fully.
                // Let's implement fully to be "Unified".

                const shiftsSnap = await getDocs(collection(db, 'shifts'));
                const shiftsToUpdate = shiftsSnap.docs.filter(d => !d.data().displayId);
                shiftsToUpdate.sort((a, b) => (a.data().startTime?.seconds || 0) - (b.data().startTime?.seconds || 0));

                for (const d of shiftsToUpdate) {
                    const newId = await generateDisplayId('shifts', 'SHIFT');
                    batch.update(doc(db, 'shifts', d.id), { displayId: newId });
                    opCount++;
                    if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
                }

                const payrollSnap = await getDocs(collection(db, 'payrollRuns'));
                const payToUpdate = payrollSnap.docs.filter(d => !d.data().displayId);
                payToUpdate.sort((a, b) => (a.data().createdAt?.seconds || 0) - (b.data().createdAt?.seconds || 0));

                for (const d of payToUpdate) {
                    const newId = await generateDisplayId('payrollRuns', 'PAY');
                    batch.update(doc(db, 'payrollRuns', d.id), { displayId: newId });
                    opCount++;
                    if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
                }

                addLog("IDs patched.");
            }

            // 2. Update Expense Types (Services Collection)
            addLog("Updating Expense Definitions...");
            // Map for quick lookup
            const categoryMap = new Map();
            expenseTypes.forEach(t => categoryMap.set(t.name, t.category));

            const servicesSnap = await getDocs(collection(db, 'services'));
            for (const d of servicesSnap.docs) {
                const data = d.data();
                if (data.category === 'Credit') {
                    const cat = categoryMap.get(data.serviceName) || 'OPEX';
                    if (data.financialCategory !== cat) {
                        batch.update(doc(db, 'services', d.id), { financialCategory: cat });
                        opCount++;
                    }
                }
                if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
            }

            // 3. Update Transactions (Historical Data)
            addLog("Updating Historical Transactions...");
            const txSnap = await getDocs(collection(db, 'transactions'));
            const total = txSnap.size;
            let current = 0;

            for (const d of txSnap.docs) {
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

                    const targetCat = categoryMap.get(typeName) || 'OPEX';
                    if (data.financialCategory !== targetCat) {
                        updatePayload.financialCategory = targetCat;
                        needsUpdate = true;
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

                current++;
                if (current % 50 === 0) setProgress(Math.round((current / total) * 100));

                if (opCount >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
            }

            // Final Commit
            if (opCount > 0) await batch.commit();

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
                        <StepLabel>Expense Classification (Interactive)</StepLabel>
                        <StepContent>
                            <Typography variant="body2" paragraph>
                                Review unique expense types found in your history and tag them.
                            </Typography>

                            {expenseTypes.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, mb: 2 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Expense Type</TableCell>
                                                <TableCell align="right">Count</TableCell>
                                                <TableCell>Classification</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {expenseTypes.map((type, idx) => (
                                                <TableRow key={type.name}>
                                                    <TableCell sx={{ fontWeight: 'bold' }}>{type.name}</TableCell>
                                                    <TableCell align="right">{type.count}</TableCell>
                                                    <TableCell>
                                                        <FormControl component="fieldset">
                                                            <RadioGroup
                                                                row
                                                                value={type.category}
                                                                onChange={(e) => toggleCategory(idx, e.target.value)}
                                                            >
                                                                <FormControlLabel value="OPEX" control={<Radio size="small" />} label={<Typography variant="caption">OPEX</Typography>} />
                                                                <FormControlLabel value="CAPEX" control={<Radio size="small" />} label={<Typography variant="caption">CAPEX</Typography>} />
                                                            </RadioGroup>
                                                        </FormControl>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Typography variant="caption" color="text.secondary" paragraph>
                                    No expenses loaded yet.
                                </Typography>
                            )}

                            <Button variant="contained" onClick={executeMigration} disabled={expenseTypes.length === 0}>
                                Confirm & Execute Migration
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
