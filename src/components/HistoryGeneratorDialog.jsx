// src/components/HistoryGeneratorDialog.jsx
import React, { useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Typography,
    TextField,
    Button,
    FormControlLabel,
    Checkbox,
    LinearProgress,
    Alert
} from "@mui/material";
import { generateFakeHistory } from "../utils/seedHistoricalData";
import { db } from "../firebase";

export default function HistoryGeneratorDialog({ open, onClose, showSnackbar }) {
    const [startDate, setStartDate] = useState("2026-03-01");
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [purge, setPurge] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [log, setLog] = useState([]);

    const addLog = (msg) => {
        setLog((prev) => [...prev, msg]);
    };

    const handleRun = async () => {
        if (!startDate || !endDate) return;
        setGenerating(true);
        setLog([]); // Clear log
        addLog("Initializing...");

        try {
            await generateFakeHistory({
                db,
                startISO: startDate,
                endISO: endDate,
                doPurgeFirst: purge,
                onLog: addLog
            });
            showSnackbar("History generated successfully!", "success");
        } catch (e) {
            console.error(e);
            addLog(`ERROR: ${e.message}`);
            showSnackbar("Failed to generate history.", "error");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Dialog open={open} onClose={!generating ? onClose : undefined} maxWidth="md" fullWidth>
            <DialogTitle>Fake History Generator</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
                    <Alert severity="warning">
                        This tool generates realistic fake shifts, transactions, and expenses.
                        <b> Use with caution in production.</b>
                    </Alert>

                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <TextField
                            label="End Date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                    </Box>

                    <FormControlLabel
                        control={<Checkbox checked={purge} onChange={(e) => setPurge(e.target.checked)} />}
                        label="Purge existing data first? (Dangerous)"
                    />

                    {generating && <LinearProgress />}

                    {/* LOG CONSOLE */}
                    <Box sx={{
                        bgcolor: '#121212',
                        border: '1px solid #333',
                        color: '#e0e0e0',
                        p: 2,
                        borderRadius: 1,
                        height: 300,
                        overflow: 'auto',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem'
                    }}>
                        <Typography variant="subtitle2" sx={{ color: '#90caf9', mb: 1, borderBottom: '1px solid #333', pb: 0.5 }}>
                            Process Log:
                        </Typography>
                        {log.length === 0 && <span style={{ color: '#666' }}>Ready...</span>}
                        {log.map((line, i) => (
                            <div key={i} style={{ marginBottom: '2px' }}>
                                <span style={{ color: '#555', marginRight: '8px' }}>&gt;</span>
                                {line}
                            </div>
                        ))}
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={generating}>Close</Button>
                <Button
                    variant="contained"
                    onClick={handleRun}
                    disabled={generating}
                    color="secondary"
                >
                    {generating ? "Generating..." : "Generate History"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
