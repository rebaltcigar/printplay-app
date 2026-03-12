import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Stack, Typography, Box
} from '@mui/material';

export default function EditTransactionDialog({ open, onClose, transaction, onSave }) {
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState('');
    const [price, setPrice] = useState('');
    const [amount, setAmount] = useState('');
    const [initialNotes, setInitialNotes] = useState('');
    const [editReason, setEditReason] = useState('');
    const [isExpense, setIsExpense] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (open && transaction) {
            const expense = transaction.item === 'Expenses';
            setIsExpense(expense);
            setInitialNotes(transaction.notes || '');
            setEditReason('');
            setErrors({});

            if (expense) {
                setDescription(transaction.expenseType || '');
                setAmount(transaction.total?.toString() || '0');
                setQuantity('1');
                setPrice('0');
            } else {
                setDescription(transaction.item || '');
                setQuantity(transaction.quantity?.toString() || '1');
                setPrice(transaction.price?.toString() || transaction.total?.toString() || '0');
                setAmount(transaction.total?.toString() || '0');
            }
        }
    }, [open, transaction]);

    useEffect(() => {
        if (!open || isExpense) return;
        const q = parseFloat(quantity) || 0;
        const p = parseFloat(price) || 0;
        setAmount((q * p).toFixed(2));
    }, [quantity, price, open, isExpense]);

    const handleSave = () => {
        const newErrors = {};
        if (!editReason.trim()) newErrors.editReason = "Reason for edit is required";

        let val, qty, pr;
        if (isExpense) {
            val = parseFloat(amount);
            if (isNaN(val) || val < 0) newErrors.amount = "Invalid amount";
        } else {
            qty = parseFloat(quantity);
            pr = parseFloat(price);
            if (isNaN(qty) || qty <= 0) newErrors.quantity = "Invalid quantity";
            if (isNaN(pr) || pr < 0) newErrors.price = "Invalid price";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const updates = {
            notes: initialNotes.trim(), // Update the main notes
            editReason: editReason.trim() // Log the reason
        };

        if (isExpense) {
            updates.expenseType = description;
            updates.total = parseFloat(amount);
        } else {
            updates.item = description;
            updates.quantity = qty;
            updates.price = pr;
            updates.total = qty * pr;
        }

        onSave(transaction.id, updates);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{isExpense ? 'Edit Expense' : 'Edit Sale Item'}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} pt={1}>
                    <TextField
                        label={isExpense ? "Expense Type" : "Item Name"}
                        fullWidth
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />

                    {!isExpense && (
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Qty"
                                type="number"
                                required
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                sx={{ width: '40%' }}
                                error={!!errors.quantity}
                                helperText={errors.quantity}
                            />
                            <TextField
                                label="Unit Price"
                                type="number"
                                required
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                InputProps={{ startAdornment: <Typography variant="body2" sx={{ mr: 0.5 }}>₱</Typography> }}
                                sx={{ flex: 1 }}
                                error={!!errors.price}
                                helperText={errors.price}
                            />
                        </Stack>
                    )}

                    <TextField
                        label={isExpense ? "Amount" : "Total (Calculated)"}
                        type="number"
                        required
                        fullWidth
                        value={amount}
                        onChange={isExpense ? (e) => setAmount(e.target.value) : undefined}
                        InputProps={{
                            readOnly: !isExpense,
                            startAdornment: <Typography variant="body2" sx={{ mr: 0.5 }}>₱</Typography>
                        }}
                        error={!!errors.amount}
                        helperText={errors.amount}
                    />

                    {/* Original Notes (Editable) */}
                    <TextField
                        label="Initial Notes / Description"
                        fullWidth
                        multiline
                        rows={2}
                        value={initialNotes}
                        onChange={(e) => setInitialNotes(e.target.value)}
                    />

                    {/* Reason for Edit (Required) */}
                    <TextField
                        label="Reason for Edit (Required)"
                        fullWidth
                        multiline
                        rows={2}
                        required
                        value={editReason}
                        onChange={(e) => {
                            setEditReason(e.target.value);
                            if (e.target.value.trim()) setErrors(prev => ({ ...prev, editReason: null }));
                        }}
                        placeholder="Why is this being edited?"
                        error={!!errors.editReason}
                        helperText={errors.editReason}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleSave}>Save Changes</Button>
            </DialogActions>
        </Dialog>
    );
}
