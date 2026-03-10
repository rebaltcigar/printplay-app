// src/components/HistoryGeneratorDialog.jsx
// This development utility has been deprecated — the seed script was removed
// as part of the Supabase migration. Use Supabase's built-in data editor or SQL instead.
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert } from "@mui/material";

export default function HistoryGeneratorDialog({ open, onClose }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Fake History Generator</DialogTitle>
            <DialogContent>
                <Alert severity="info" sx={{ mt: 1 }}>
                    This tool has been removed as part of the Supabase migration.
                    Use Supabase's data editor or SQL console to seed test data.
                </Alert>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
