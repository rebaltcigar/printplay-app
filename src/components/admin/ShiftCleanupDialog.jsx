
import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, LinearProgress, Alert, Stack
} from '@mui/material';
import { collection, getDocs, doc, writeBatch, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

export default function ShiftCleanupDialog({ open, onClose, showSnackbar }) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [logs, setLogs] = useState([]);

    const runCleanup = async () => {
        setLoading(true);
        setStatus('Fetching shifts...');
        setLogs([]);
        setProgress(0);

        try {
            // 1. Fetch all shifts (or maybe just those without totalCash?)
            // Ideally we process all to be safe, but let's target ones missing the new fields first if we could.
            // For now, let's just grab all shifts to be thorough, but maybe limit to recent 500 if too many?
            // Let's grab ALL for now, assuming dataset isn't massive yet.
            const shiftsSnap = await getDocs(collection(db, 'shifts'));
            const totalShifts = shiftsSnap.size;
            let processed = 0;
            let updated = 0;

            const batchSize = 400; // Limits
            let batch = writeBatch(db);
            let opCount = 0;

            const commitBatch = async () => {
                if (opCount > 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                }
            };

            for (const sDoc of shiftsSnap.docs) {
                const s = sDoc.data();

                // Skip if already has totalCash AND we trust it? 
                // Let's force update to ensure accuracy if user requested "Fix".

                setStatus(`Processing shift ${processed + 1} of ${totalShifts}...`);

                // 2. Fetch transactions for this shift
                const txQ = query(collection(db, 'transactions'), where('shiftId', '==', sDoc.id));
                const txSnap = await getDocs(txQ);

                let cash = 0;
                let gcash = 0;
                let ar = 0;
                let expenses = 0;

                txSnap.docs.forEach(td => {
                    const tx = td.data();
                    if (tx.isDeleted || tx.voided) return;

                    const amt = Number(tx.total || 0);

                    if (tx.item === 'Expenses') {
                        expenses += amt;
                    } else if (tx.category === 'Debt' || tx.item === 'New Debt') {
                        // Debt creation is usually excluded from sales totals in some views,
                        // but for "Shortage" calc, we fundamentally care about:
                        // Did we receive Cash, GCash, or Nothing (Charge)?

                        // If Debt is "Charge" -> AR
                        // If Debt is "Cash" (unlikely for new debt?) -> Cash

                        // Actually, standard "New Debt" transaction:
                        // paymentMethod: 'Charge' (usually)
                        if (tx.paymentMethod === 'GCash') gcash += amt;
                        else if (tx.paymentMethod === 'Charge' || tx.paymentMethod === 'Pay Later') ar += amt;
                        else cash += amt;

                    } else {
                        // Regular Sale / Service
                        if (tx.paymentMethod === 'GCash') gcash += amt;
                        else if (tx.paymentMethod === 'Charge' || tx.paymentMethod === 'Pay Later') ar += amt;
                        else cash += amt;
                    }
                });

                // PC Rental Check (hybrid split logic from EndShiftDialog)
                // We need to see if PC Rental was part of these transactions?
                // Usually PC Rental is a single line item "PC Rental" with paymentMethod.
                // If the user used the old "manual input" field in EndShiftDialog, 
                // the "PC Rental" transaction might NOT exist in 'transactions' collection for older versions?
                // OR it might exist if they logged it.

                // If s.pcRentalTotal exists but no corresponding transaction, we assume CASH 
                // unless we find "PC Rental" transactions.

                const loggedPcRental = txSnap.docs.filter(t => t.data().item === 'PC Rental');
                const loggedPcTotal = loggedPcRental.reduce((sum, t) => sum + Number(t.data().total || 0), 0);

                const shiftPcTotal = Number(s.pcRentalTotal || 0);

                // If there's a discrepancy (e.g. manual entry was 1000, logged was 0), treat difference as Cash.
                if (shiftPcTotal > loggedPcTotal) {
                    const diff = shiftPcTotal - loggedPcTotal;
                    cash += diff;
                }

                // 3. Prepare Update
                const updateData = {
                    totalCash: Number(cash.toFixed(2)),
                    totalGcash: Number(gcash.toFixed(2)),
                    totalAr: Number(ar.toFixed(2)),
                    // verifiedAt: serverTimestamp() // Optional: mark as migrated
                };

                // Only update if changed (optional optimization, but good for logs)
                if (s.totalCash !== updateData.totalCash || s.totalGcash !== updateData.totalGcash) {
                    batch.update(sDoc.ref, updateData);
                    opCount++;
                    updated++;
                }

                if (opCount >= 400) await commitBatch();

                processed++;
                setProgress((processed / totalShifts) * 100);
            }

            await commitBatch();

            setStatus('Complete!');
            setLogs(prev => [...prev, `Processed ${totalShifts} shifts. Updated ${updated} records.`]);
            if (showSnackbar) showSnackbar(`Fixed ${updated} shifts.`, 'success');

        } catch (e) {
            console.error(e);
            setStatus('Error occurred.');
            setLogs(prev => [...prev, `Error: ${e.message}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={!loading ? onClose : undefined} fullWidth maxWidth="sm">
            <DialogTitle>Fix / Migrate Shift Data</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Alert severity="info">
                        This tool will recalculate the <b>Total Cash</b>, <b>GCash</b>, and <b>Receivables</b> for ALL past shifts by summing up their individual transactions.
                        <br /><br />
                        Run this if you see incorrect "Shortage" amounts in Payroll (e.g. GCash being counted as missing cash).
                    </Alert>

                    {loading && (
                        <Box>
                            <Typography variant="caption">{status}</Typography>
                            <LinearProgress variant="determinate" value={progress} />
                        </Box>
                    )}

                    {!loading && status === 'Complete!' && (
                        <Alert severity="success">Migration Complete! {logs[0]}</Alert>
                    )}

                    {!loading && status === 'Error occurred.' && (
                        <Alert severity="error">Migration Failed. Check console.</Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Close</Button>
                <Button onClick={runCleanup} variant="contained" disabled={loading}>
                    Run Fix
                </Button>
            </DialogActions>
        </Dialog>
    );
}
