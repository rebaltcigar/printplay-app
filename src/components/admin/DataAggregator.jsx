import React, { useState } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress, Stack, Alert
} from '@mui/material';
import { db } from '../../firebase';
import {
    collection, getDocs, query, orderBy, limit, startAfter, doc, setDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import dayjs from 'dayjs';
import { txAmount } from '../../utils/analytics';

export default function DataAggregator({ showSnackbar }) {
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("");
    const [error, setError] = useState(null);

    const BATCH_SIZE = 500;

    const startAggregation = async () => {
        if (!window.confirm("This will scan ALL historical transactions and rebuild the 'stats_daily' collection. This may take a while. Continue?")) return;

        setProcessing(true);
        setStatus("Initializing...");
        setError(null);
        setProgress(0);

        try {
            // 1. Fetch ALL transactions (chunked)
            let lastDoc = null;
            let totalProcessed = 0;
            let hasMore = true;

            // Stats accumulator: Map<"YYYY-MM-DD", { sales, expenses, breakdown... }>
            const dailyStats = new Map();

            // Estimate total for progress (optional, expenisve to count, so we interpret progress as "chunks")
            // Or we just show indeterminate or "Processed X items".

            setStatus("Scanning transactions...");

            while (hasMore) {
                let q = query(
                    collection(db, "transactions"),
                    orderBy("timestamp", "asc"),
                    limit(BATCH_SIZE)
                );
                if (lastDoc) {
                    q = query(
                        collection(db, "transactions"),
                        orderBy("timestamp", "asc"),
                        startAfter(lastDoc),
                        limit(BATCH_SIZE)
                    );
                }

                const snap = await getDocs(q);
                if (snap.empty) {
                    hasMore = false;
                    break;
                }

                lastDoc = snap.docs[snap.docs.length - 1];

                // Process chunk
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.isDeleted) return;

                    const amt = txAmount(data);
                    const ts = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : data.timestamp;
                    if (!ts) return;

                    const dayKey = dayjs(ts).format("YYYY-MM-DD");

                    if (!dailyStats.has(dayKey)) {
                        dailyStats.set(dayKey, {
                            date: dayKey,
                            sales: 0,
                            expenses: 0,
                            txCount: 0,
                            breakdown: {} // Category breakdown
                        });
                    }

                    const stat = dailyStats.get(dayKey);
                    stat.txCount += 1;

                    // Logic similar to AdminHome
                    const isExp =
                        data.category === "credit" ||
                        (data.amount < 0 && !data.serviceId) ||
                        data.expenseType ||
                        data.item === "Expenses";

                    const isNewDebt = data.item === "New Debt";
                    const isPaidDebt = data.item === "Paid Debt";

                    if (!isNewDebt && !isPaidDebt) {
                        if (isExp) {
                            // Exclude Capital for OpEx stats? 
                            // Let's store Total Expenses and maybe split CapEx?
                            // For simplicity, let's roughly follow Dashboard:
                            const type = (data.expenseType || "").toLowerCase();
                            const isCap = type.includes('asset') || type.includes('capital') || data.financialCategory === 'CAPEX';

                            if (!isCap) {
                                stat.expenses += Math.abs(amt);
                            }
                        } else {
                            // Sale
                            stat.sales += amt;
                        }
                    }
                });

                totalProcessed += snap.docs.length;
                setStatus(`Processed ${totalProcessed} transactions...`);
                // Yield to event loop
                await new Promise(r => setTimeout(r, 0));
            }

            // 2. Write Aggregates
            setStatus(`Writing ${dailyStats.size} daily summaries...`);

            // Batch writes
            const writeBatches = [];
            let currentBatch = writeBatch(db);
            let opCount = 0;

            for (const [key, stat] of dailyStats.entries()) {
                const docRef = doc(db, "stats_daily", key);
                currentBatch.set(docRef, {
                    ...stat,
                    updatedAt: serverTimestamp()
                });
                opCount++;

                if (opCount >= 400) {
                    writeBatches.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }
            }
            if (opCount > 0) writeBatches.push(currentBatch.commit());

            await Promise.all(writeBatches);

            setStatus("Aggregation Complete!");
            setProcessing(false);
            if (showSnackbar) showSnackbar("Stats re-generated successfully!", "success");

        } catch (err) {
            console.error(err);
            setError(err.message);
            setProcessing(false);
        }
    };

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Data Aggregation</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
                Re-scan all historical transactions and generate optimized daily statistics.
                Run this when you deploy new reports or if stats seem out of sync.
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            )}

            {processing && (
                <Stack spacing={1} sx={{ mb: 2 }}>
                    <Typography variant="caption">{status}</Typography>
                    <LinearProgress />
                </Stack>
            )}

            <Button
                variant="contained"
                onClick={startAggregation}
                disabled={processing}
            >
                {processing ? "Running..." : "Regenerate Aggregates"}
            </Button>
        </Paper>
    );
}
