import React, { useState } from 'react';
import { Box, Button, Typography, Card, LinearProgress, Stack } from '@mui/material';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function MigrationRunner() {
    const [status, setStatus] = useState('idle'); // idle, running, done, error
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState([]);

    const addLog = (msg) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    const runMigration = async () => {
        setStatus('running');
        setProgress(0);
        addLog('Starting Migration...');

        try {
            const batchLimit = 400;
            let batch = writeBatch(db);
            let opCount = 0;
            let totalProcessed = 0;

            // 1. Migrate Services (Expense Types)
            addLog('Scanning Services/Expense Types...');
            const servicesSnap = await getDocs(collection(db, 'services'));
            for (const d of servicesSnap.docs) {
                const data = d.data();
                let update = null;

                if (data.category === 'Credit') {
                    // It's an expense type
                    const name = (data.serviceName || '').toLowerCase();
                    if (name.includes('asset') || name.includes('equipment') || name.includes('construction') || name.includes('renovation')) {
                        update = { financialCategory: 'CAPEX' };
                    } else {
                        update = { financialCategory: 'OPEX' };
                    }
                } else {
                    // It's a service/retail item
                    update = { financialCategory: 'Revenue' }; // Or explicit null, but Revenue is useful
                    if (data.type === 'retail') {
                        // ensure it has tracking fields
                        if (data.trackStock === undefined) update.trackStock = false;
                    }
                }

                if (update) {
                    batch.update(doc(db, 'services', d.id), update);
                    opCount++;
                }

                if (opCount >= batchLimit) {
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                    addLog(`Committed batch of 400 services...`);
                }
            }

            // 2. Migrate Transactions
            addLog('Scanning Transactions (This may take a while)...');
            // We process ALL transactions to tag them correctly
            const txSnap = await getDocs(collection(db, 'transactions'));
            const totalTx = txSnap.size;
            let processedTx = 0;

            for (const d of txSnap.docs) {
                const data = d.data();
                let update = null;

                // If already tagged, skip (unless we want to force re-tag)
                if (!data.financialCategory) {
                    if (data.category === 'Credit' || data.item === 'Expenses') {
                        // Expense
                        const name = (data.expenseType || data.item || '').toLowerCase();
                        if (name.includes('asset') || name.includes('equipment') || name.includes('restock') || name.includes('inventory')) {
                            update = { financialCategory: 'CAPEX' }; // or InventoryAsset if we were strict, but CAPEX is safer transition
                        } else {
                            update = { financialCategory: 'OPEX' };
                        }
                    } else {
                        // Sale
                        update = { financialCategory: 'Revenue' };
                        // If it was a generic sale, we can't easily backfill Unit Cost unfortunately without history
                    }
                }

                if (update) {
                    batch.update(doc(db, 'transactions', d.id), update);
                    opCount++;
                }

                processedTx++;
                if (processedTx % 50 === 0) {
                    setProgress((processedTx / totalTx) * 100);
                }

                if (opCount >= batchLimit) {
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                    addLog(`Committed batch... (${processedTx}/${totalTx})`);
                }
            }

            // Final commit
            if (opCount > 0) {
                await batch.commit();
            }

            setStatus('done');
            addLog('Migration Complete!');

        } catch (e) {
            console.error(e);
            setStatus('error');
            addLog(`Error: ${e.message}`);
        }
    };

    return (
        <Card sx={{ p: 3, m: 2, maxWidth: 600 }}>
            <Typography variant="h6" gutterBottom>System Migration Tool</Typography>
            <Typography variant="body2" paragraph>
                Updates existing Services and Transactions to include `financialCategory` (OPEX/CAPEX/Revenue).
            </Typography>

            {status === 'running' && (
                <Box sx={{ mb: 2 }}>
                    <LinearProgress variant="determinate" value={progress} />
                    <Typography variant="caption" align="right" display="block">{progress.toFixed(0)}%</Typography>
                </Box>
            )}

            <Stack spacing={1} sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: '#f5f5f5', p: 1, mb: 2, borderRadius: 1 }}>
                {log.map((l, i) => <Typography key={i} variant="caption" display="block">{l}</Typography>)}
            </Stack>

            <Button
                variant="contained"
                onClick={runMigration}
                disabled={status === 'running' || status === 'done'}
            >
                {status === 'done' ? 'Completed' : 'Run Migration'}
            </Button>
        </Card>
    );
}
