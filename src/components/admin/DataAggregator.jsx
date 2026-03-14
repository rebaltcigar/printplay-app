import React, { useState } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress, Stack, Alert
} from '@mui/material';
import { supabase } from '../../supabase';
import dayjs from 'dayjs';
import PageHeader from '../common/PageHeader';

export default function DataAggregator({ showSnackbar }) {
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState(null);

    const startAggregation = async () => {
        if (!window.confirm("This will scan ALL historical order items and expenses, then rebuild the 'daily_stats' table. Continue?")) return;

        setProcessing(true);
        setStatus("Initializing...");
        setError(null);

        try {
            // 1. Fetch all order_items (non-deleted)
            setStatus("Scanning order items...");
            const { data: orderItems, error: oiErr } = await supabase
                .from('order_items')
                .select('amount, timestamp, financial_category, is_deleted')
                .eq('is_deleted', false);
            if (oiErr) throw oiErr;

            // 2. Fetch all expenses (non-deleted)
            setStatus("Scanning expenses...");
            const { data: expenses, error: expErr } = await supabase
                .from('expenses')
                .select('amount, timestamp, financial_category, category')
                .eq('is_deleted', false);
            if (expErr) throw expErr;

            // 3. Accumulate daily stats
            setStatus("Aggregating daily statistics...");
            const dailyStats = new Map();

            const ensureDay = (dayKey) => {
                if (!dailyStats.has(dayKey)) {
                    dailyStats.set(dayKey, { date: dayKey, sales: 0, expenses: 0, tx_count: 0, breakdown: {} });
                }
                return dailyStats.get(dayKey);
            };

            for (const item of (orderItems || [])) {
                if (!item.timestamp) continue;
                const dayKey = dayjs(item.timestamp).format("YYYY-MM-DD");
                const stat = ensureDay(dayKey);
                const amt = Number(item.amount || 0);
                stat.sales += amt;
                stat.tx_count += 1;
            }

            for (const exp of (expenses || [])) {
                if (!exp.timestamp) continue;
                const dayKey = dayjs(exp.timestamp).format("YYYY-MM-DD");
                const stat = ensureDay(dayKey);
                // Skip CAPEX from opex stats
                if (exp.financial_category === 'CAPEX' || exp.category === 'Credit') continue;
                stat.expenses += Number(exp.amount || 0);
            }

            // 4. Upsert daily_stats
            setStatus(`Writing ${dailyStats.size} daily summaries...`);
            const rows = Array.from(dailyStats.values()).map(s => ({
                date: s.date,
                sales: s.sales,
                expenses: s.expenses,
                tx_count: s.tx_count,
                breakdown: s.breakdown,
                updated_at: new Date().toISOString(),
            }));

            if (rows.length > 0) {
                const { error: upsertErr } = await supabase.from('daily_stats').upsert(rows, { onConflict: 'date' });
                if (upsertErr) throw upsertErr;
            }

            setStatus("Aggregation Complete!");
            setProcessing(false);
            showSnackbar?.("Stats re-generated successfully!", "success");
        } catch (err) {
            console.error(err);
            setError(err.message);
            setProcessing(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title="Data Core"
                subtitle="Re-scan historical transactions and rebuild daily statistics."
            />
            <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" paragraph>
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
        </Box>
    );
}
