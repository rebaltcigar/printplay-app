import React, { useState } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip
} from '@mui/material';
import { db } from '../../firebase';
import { collection, getDocs, query, where, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { generateDisplayId } from '../../utils/idGenerator';

export default function DataMigration({ showSnackbar }) {
    const [analyzing, setAnalyzing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [stats, setStats] = useState(null);
    const [log, setLog] = useState([]);

    // Valid visual feedback
    const [progress, setProgress] = useState(0);
    const [currentAction, setCurrentAction] = useState("Idle");

    // --- ANALYSIS ---
    const handleAnalyze = async () => {
        setAnalyzing(true);
        setCurrentAction("Scanning Database...");
        setProgress(0);
        setLog([]);

        try {
            // 1. Shifts
            const shiftsSnap = await getDocs(collection(db, 'shifts'));
            const shiftsMissing = shiftsSnap.docs.filter(d => !d.data().displayId).length;

            // 2. Payroll
            const payrollSnap = await getDocs(collection(db, 'payrollRuns'));
            const payrollMissing = payrollSnap.docs.filter(d => !d.data().displayId).length;

            // 3. Transactions (Expenses)
            const allTxSnap = await getDocs(collection(db, 'transactions'));
            let expensesMissingCat = 0;

            allTxSnap.docs.forEach(d => {
                const data = d.data();
                if (data.isDeleted) return;
                const isExpense =
                    data.item === "New Debt" ? false :
                        data.item === "Paid Debt" ? false :
                            (data.category === 'credit' || data.expenseType || (data.total < 0 && !data.serviceId));

                if (isExpense && !data.financialCategory) {
                    expensesMissingCat++;
                }
            });

            setStats({
                shifts: { total: shiftsSnap.size, missingId: shiftsMissing },
                payroll: { total: payrollSnap.size, missingId: payrollMissing },
                expenses: { total: expensesMissingCat, missingCat: expensesMissingCat }
            });

            setLog(prev => [...prev, `Analysis complete. Found ${shiftsMissing} shifts, ${payrollMissing} payroll runs, and ${expensesMissingCat} expenses to update.`]);
            setCurrentAction("Ready to Migrate");

        } catch (error) {
            console.error(error);
            showSnackbar("Analysis failed", "error");
            setCurrentAction("Error during analysis");
        } finally {
            setAnalyzing(false);
        }
    };

    // --- MIGRATION ---
    const handleMigrate = async () => {
        if (!stats) return;
        setMigrating(true);
        setLog(prev => [...prev, "Starting migration..."]);

        // Calculate Total Ops for Progress Bar
        const totalOps = stats.shifts.missingId + stats.payroll.missingId + stats.expenses.missingCat;
        let completedOps = 0;

        const updateProgress = () => {
            if (totalOps === 0) setProgress(100);
            else setProgress(Math.round((completedOps / totalOps) * 100));
        };

        const BATCH_SIZE = 400;

        try {
            // 1. Shifts
            if (stats.shifts.missingId > 0) {
                setCurrentAction("Migrating Shifts (Sorting & Assigning IDs)...");
                setLog(prev => [...prev, "Migrating Shifts..."]);

                const snap = await getDocs(collection(db, 'shifts'));
                const toUpdate = snap.docs.filter(d => !d.data().displayId);
                toUpdate.sort((a, b) => (a.data().startTime?.seconds || 0) - (b.data().startTime?.seconds || 0));

                for (const docSnap of toUpdate) {
                    const newId = await generateDisplayId('shifts', 'SHIFT');
                    await updateDoc(doc(db, 'shifts', docSnap.id), { displayId: newId });
                    completedOps++;
                    updateProgress();
                }
                setLog(prev => [...prev, `Updated ${toUpdate.length} shifts with IDs.`]);
            }

            // 2. Payroll
            if (stats.payroll.missingId > 0) {
                setCurrentAction("Migrating Payroll Runs...");
                setLog(prev => [...prev, "Migrating Payroll..."]);

                const snap = await getDocs(collection(db, 'payrollRuns'));
                const toUpdate = snap.docs.filter(d => !d.data().displayId);
                toUpdate.sort((a, b) => (a.data().createdAt?.seconds || 0) - (b.data().createdAt?.seconds || 0));

                for (const docSnap of toUpdate) {
                    const newId = await generateDisplayId('payrollRuns', 'PAY');
                    await updateDoc(doc(db, 'payrollRuns', docSnap.id), { displayId: newId });
                    completedOps++;
                    updateProgress();
                }
                setLog(prev => [...prev, `Updated ${toUpdate.length} payroll runs with IDs.`]);
            }

            // 3. Expenses
            if (stats.expenses.missingCat > 0) {
                setCurrentAction("Categorizing Expenses (OPEX/CAPEX)...");
                setLog(prev => [...prev, "Migrating Expenses Logic..."]);

                const allTxSnap = await getDocs(collection(db, 'transactions'));

                const getCategory = (tx) => {
                    const t = (tx.expenseType || tx.item || "").toLowerCase();
                    const note = (tx.notes || "").toLowerCase();
                    if (t.includes('asset') || t.includes('equipment') || t.includes('renovation') || t.includes('construction') || note.includes('capex')) return 'CAPEX';
                    if (t.includes('supply') || t.includes('supplies') || t.includes('ink') || t.includes('paper') || t.includes('maintenance')) return 'OPEX';
                    return 'OPEX';
                };

                let batch = writeBatch(db);
                let opCount = 0;
                let processed = 0;

                for (const docSnap of allTxSnap.docs) {
                    const data = docSnap.data();
                    if (data.isDeleted) continue;

                    const isExpense = (data.category === 'credit' || (data.amount < 0 && !data.serviceId) || data.expenseType);
                    if (!isExpense || data.financialCategory) continue;

                    const cat = getCategory(data);
                    batch.update(doc(db, 'transactions', docSnap.id), { financialCategory: cat });

                    opCount++;
                    processed++;
                    completedOps++;
                    // Note: Progress updates in batch loop might be too fast/frequent, but fine for now
                    if (processed % 10 === 0) updateProgress();

                    if (opCount >= BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        opCount = 0;
                    }
                }
                if (opCount > 0) await batch.commit();
                updateProgress(); // Ensure we hit 100% relative to this section
                setLog(prev => [...prev, `Backfilled category for ${processed} expenses.`]);
            }

            setProgress(100);
            setCurrentAction("Migration Complete");
            showSnackbar("Migration Complete!", "success");
            setStats(null);
            handleAnalyze();

        } catch (error) {
            console.error("Migration fatal error", error);
            setLog(prev => [...prev, `Error: ${error.message}`]);
            setCurrentAction("Migration Failed");
            showSnackbar("Migration failed", "error");
        } finally {
            setMigrating(false);
        }
    };

    return (
        <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto', mt: 4 }}>
            <Box mb={2}>
                <Typography variant="h5" gutterBottom>Database Migration Tool</Typography>
                <Typography variant="body2" color="text.secondary">
                    Backfill missing IDs and standardize accounting categories.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5, display: 'block' }}>
                    *Disaster Recovery: This process is resumable. If interrupted (network/power loss), simply refresh and run it again. It will skip already updated records.
                </Typography>
            </Box>

            <Box sx={{ my: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button variant="contained" onClick={handleAnalyze} disabled={analyzing || migrating}>
                    {analyzing ? "Scanning..." : "Analyze Data"}
                </Button>
                <Button variant="contained" color="error" onClick={handleMigrate} disabled={!stats || migrating || analyzing}>
                    {migrating ? "Stop (Refresh)" : "Execute Migration"}
                </Button>
            </Box>

            {/* STATUS & PROGRESS */}
            {(analyzing || migrating || stats) && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #333' }}>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="subtitle2" color="primary">{currentAction}</Typography>
                        <Typography variant="subtitle2">{progress}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 5 }} />
                </Box>
            )}

            {stats && (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Collection</TableCell>
                                <TableCell align="right">Total</TableCell>
                                <TableCell align="right">Pending</TableCell>
                                <TableCell align="right">Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                <TableCell>Shifts</TableCell>
                                <TableCell align="right">{stats.shifts.total}</TableCell>
                                <TableCell align="right">{stats.shifts.missingId}</TableCell>
                                <TableCell align="right">
                                    {stats.shifts.missingId > 0 ? <Chip label="Action Needed" color="warning" size="small" /> : <Chip label="OK" color="success" size="small" />}
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Payroll Runs</TableCell>
                                <TableCell align="right">{stats.payroll.total}</TableCell>
                                <TableCell align="right">{stats.payroll.missingId}</TableCell>
                                <TableCell align="right">
                                    {stats.payroll.missingId > 0 ? <Chip label="Action Needed" color="warning" size="small" /> : <Chip label="OK" color="success" size="small" />}
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>Expenses</TableCell>
                                <TableCell align="right">{stats.expenses.total}</TableCell>
                                <TableCell align="right">{stats.expenses.missingCat}</TableCell>
                                <TableCell align="right">
                                    {stats.expenses.missingCat > 0 ? <Chip label="Retrofit Needed" color="warning" size="small" /> : <Chip label="OK" color="success" size="small" />}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Box sx={{
                bgcolor: '#121212',
                border: '1px solid #333',
                color: '#e0e0e0',
                p: 2,
                borderRadius: 1,
                maxHeight: 300,
                overflow: 'auto',
                fontFamily: 'monospace'
            }}>
                <Typography variant="subtitle2" sx={{ color: '#90caf9', mb: 1 }}>Console Output:</Typography>
                {log.map((line, i) => (
                    <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid #333' }}>
                        <span style={{ color: '#555', marginRight: '8px' }}>[{new Date().toLocaleTimeString()}]</span>
                        {line}
                    </div>
                ))}
                {log.length === 0 && <span style={{ color: '#666' }}>Waiting for action...</span>}
            </Box>
        </Paper>
    );
}
