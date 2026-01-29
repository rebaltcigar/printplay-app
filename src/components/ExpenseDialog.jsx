import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, FormControl, InputLabel, Select, MenuItem, Stack
} from '@mui/material';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function ExpenseDialog({ open, onClose, user, activeShiftId, expenseTypes, staffOptions, showSnackbar }) {
    const [form, setForm] = useState({
        type: '',
        staffId: '',
        staffName: '',
        staffEmail: '',
        amount: '',
        notes: ''
    });

    // Reset form when opening
    useEffect(() => {
        if (open) {
            setForm({ type: '', staffId: '', staffName: '', staffEmail: '', amount: '', notes: '' });
        }
    }, [open]);

    const handleSave = async () => {
        if (!form.type || !form.amount) {
            showSnackbar?.("Please fill in Expense Type and Amount.", 'warning');
            return;
        }

        // 1. Notes Validation: Required for EVERYTHING except 'Salary Advance'
        if (form.type !== 'Salary Advance' && !form.notes.trim()) {
            showSnackbar?.("Notes are required for this expense type.", 'warning');
            return;
        }

        // 2. Salary Validation (Legacy)
        const isSalary = form.type === 'Salary' || form.type === 'Salary Advance';
        if (isSalary && !form.staffId) {
            showSnackbar?.("Please select a staff member for Salary expenses.", 'warning');
            return;
        }

        try {
            await addDoc(collection(db, 'transactions'), {
                item: "Expenses",
                expenseType: form.type,
                expenseStaffId: form.staffId || null,
                expenseStaffName: form.staffName || null,
                expenseStaffEmail: form.staffEmail || null,
                total: Number(form.amount),
                price: Number(form.amount),
                quantity: 1,
                timestamp: serverTimestamp(),
                staffEmail: user.email,
                shiftId: activeShiftId,
                category: 'Credit',
                notes: form.notes || "",
                isDeleted: false
            });
            // No alert, just close
            onClose();
            if (showSnackbar) showSnackbar("Expense saved.", 'success');
        } catch (e) {
            console.error(e);
            showSnackbar?.("Failed to save expense.", 'error');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Log Expense</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <FormControl fullWidth>
                        <InputLabel>Expense Type</InputLabel>
                        <Select
                            value={form.type}
                            label="Expense Type"
                            onChange={e => setForm({ ...form, type: e.target.value })}
                        >
                            {expenseTypes.map(t => (
                                <MenuItem key={t.id} value={t.serviceName}>{t.serviceName}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {(form.type === 'Salary' || form.type === 'Salary Advance') && (
                        <FormControl fullWidth>
                            <InputLabel>Staff</InputLabel>
                            <Select
                                value={form.staffEmail}
                                label="Staff"
                                onChange={e => {
                                    const s = staffOptions.find(o => o.email === e.target.value);
                                    if (s) {
                                        setForm({ ...form, staffEmail: s.email, staffId: s.id, staffName: s.fullName });
                                    }
                                }}
                            >
                                {staffOptions.map(s => (
                                    <MenuItem key={s.id} value={s.email}>{s.fullName}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}

                    <TextField
                        label="Amount"
                        type="number"
                        fullWidth
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                    />
                    <TextField
                        label={form.type === 'Salary Advance' ? "Notes (Optional)" : "Notes (Required)"}
                        multiline
                        rows={2}
                        fullWidth
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleSave}>Save Expense</Button>
            </DialogActions>
        </Dialog>
    );
}