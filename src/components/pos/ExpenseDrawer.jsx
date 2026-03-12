import React, { useState, useEffect } from 'react';
import {
    Drawer, Box, Typography, IconButton, TextField, FormControl,
    InputLabel, Select, MenuItem, Stack, Button, Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { recordExpense } from '../../services/transactionService';
import LoadingScreen from '../common/LoadingScreen';
import { useGlobalUI } from '../../contexts/GlobalUIContext';
import { getFriendlyErrorMessage } from '../../services/errorService';

/**
 * A sidebar drawer for POS cashiers to log expenses.
 * Replaces the old popup ExpenseDialog.
 */
export default function ExpenseDrawer({ open, onClose, user, activeShiftId, expenseTypes, staffOptions }) {
    const { showSnackbar } = useGlobalUI();
    const [form, setForm] = useState({
        type: '',
        staffId: '',
        staffName: '',
        staffEmail: '',
        amount: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);

    // Reset form when opening
    useEffect(() => {
        if (open) {
            setForm({ type: '', staffId: '', staffName: '', staffEmail: '', amount: '', notes: '' });
        }
    }, [open]);

    const handleSave = async () => {
        if (!form.type || !form.amount) {
            showSnackbar("Please fill in Expense Type and Amount.", 'warning');
            return;
        }

        // Notes Validation: Required for EVERYTHING except 'Salary Advance'
        if (form.type !== 'Salary Advance' && !form.notes.trim()) {
            showSnackbar("Notes are required for this expense type.", 'warning');
            return;
        }

        // Salary Validation
        const isSalary = form.type === 'Salary' || form.type === 'Salary Advance';
        if (isSalary && !form.staffId) {
            showSnackbar("Please select a staff member for Salary expenses.", 'warning');
            return;
        }

        try {
            setLoading(true);

            // Using centralized transactionService
            await recordExpense({
                item: "Expenses",
                expenseType: form.type,
                expenseStaffId: form.staffId,
                expenseStaffName: form.staffName,
                expenseStaffEmail: form.staffEmail,
                quantity: 1,
                price: Number(form.amount),
                notes: form.notes,
                userEmail: user.email,
                user: user,
                activeShiftId: activeShiftId,
                financialCategory: 'OPEX' // recordExpense auto-detects CAPEX if type mentions 'capital'
            });

            onClose();
            showSnackbar("Expense saved.", 'success');
        } catch (e) {
            console.error(e);
            showSnackbar(getFriendlyErrorMessage(e) || "Failed to save expense.", 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, display: 'flex', flexDirection: 'column' } }}
        >
            {/* Header */}
            <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'background.default' }}>
                <Typography variant="h6" fontWeight={700}>Log Expense</Typography>
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <Divider />

            {/* Form Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                <Stack spacing={3}>
                    <FormControl fullWidth variant="outlined">
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
                        <FormControl fullWidth variant="outlined">
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
                        variant="outlined"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        InputProps={{
                            startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary' }}>₱</Typography>
                        }}
                    />

                    <TextField
                        label={form.type === 'Salary Advance' ? "Notes (Optional)" : "Notes (Required)"}
                        multiline
                        rows={4}
                        fullWidth
                        variant="outlined"
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="Provide details about this expense..."
                    />
                </Stack>
            </Box>

            <Divider />

            {/* Actions */}
            <Box sx={{ p: 2, display: 'flex', gap: 2 }}>
                <Button fullWidth onClick={onClose} disabled={loading} variant="outlined">
                    Cancel
                </Button>
                <Button
                    fullWidth
                    variant="contained"
                    color="error"
                    onClick={handleSave}
                    disabled={loading}
                    sx={{ py: 1.2, fontWeight: 'bold' }}
                >
                    Save Expense
                </Button>
            </Box>

            {loading && <LoadingScreen overlay={true} message="Saving expense..." />}
        </Drawer>
    );
}
