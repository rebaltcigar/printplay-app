import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent,
    DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Typography, IconButton, Chip, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import {
    collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog'; // Assuming relative path, adjust if needed

export default function ExpenseSettings({ showSnackbar }) {
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Dialog State
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({
        name: '',
        financialCategory: 'OPEX', // OPEX or CAPEX
        active: true
    });

    // Confirm Delete
    const [confirmDialog, setConfirmDialog] = useState({ open: false });

    // Load "Credit" services (Expense Types)
    useEffect(() => {
        const q = query(collection(db, 'services'), where('category', '==', 'Credit'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort: Active first, then alphabet
            list.sort((a, b) => {
                if (a.active === b.active) return a.serviceName.localeCompare(b.serviceName);
                return b.active ? 1 : -1;
            });
            setTypes(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleOpen = (item = null) => {
        if (item) {
            setEditing(item);
            setForm({
                name: item.serviceName,
                financialCategory: item.financialCategory || 'OPEX',
                active: item.active !== false
            });
        } else {
            setEditing(null);
            setForm({ name: '', financialCategory: 'OPEX', active: true });
        }
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setEditing(null);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            showSnackbar('Name is required', 'warning');
            return;
        }

        try {
            const payload = {
                serviceName: form.name.trim(),
                category: 'Credit', // Always Credit for Expenses
                financialCategory: form.financialCategory,
                active: form.active,
                lastUpdated: serverTimestamp()
            };

            if (editing) {
                await updateDoc(doc(db, 'services', editing.id), payload);
                showSnackbar('Expense type updated', 'success');
            } else {
                await addDoc(collection(db, 'services'), {
                    ...payload,
                    price: 0, // Expenses don't have a "price" in the service catalog sense usually
                    sortOrder: 999
                });
                showSnackbar('New expense type added', 'success');
            }
            handleClose();
        } catch (e) {
            console.error(e);
            showSnackbar('Failed to save', 'error');
        }
    };

    const handleDelete = (item) => {
        setConfirmDialog({
            open: true,
            title: 'Delete Expense Type',
            message: `Permanently delete "${item.serviceName}"? This may affect historical reports if they rely on this specific ID. Consider disabling instead.`,
            confirmText: 'Delete',
            confirmColor: 'error',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'services', item.id));
                    showSnackbar('Deleted successfully', 'success');
                } catch (e) {
                    showSnackbar('Failed to delete', 'error');
                }
            },
            onClose: () => setConfirmDialog({ ...confirmDialog, open: false })
        });
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Expense Configuration</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Define types of obligations (OPEX) and assets (CAPEX).
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
                    Add Type
                </Button>
            </Stack>

            <Card>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Expense Name</TableCell>
                                <TableCell>Financial Category</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {types.map(t => (
                                <TableRow key={t.id} hover>
                                    <TableCell fontWeight="bold">{t.serviceName}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={t.financialCategory || 'OPEX'}
                                            color={t.financialCategory === 'CAPEX' ? 'secondary' : 'default'}
                                            size="small"
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {t.active !== false ? (
                                            <Chip label="Active" color="success" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                        ) : (
                                            <Chip label="Inactive" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => handleOpen(t)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(t)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {types.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                        No expense types defined. Add one to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>

            {/* Editor Dialog */}
            <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
                <DialogTitle>{editing ? 'Edit Expense Type' : 'New Expense Type'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Name (e.g. Rent, Internet)"
                            fullWidth
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            autoFocus
                        />
                        <FormControl fullWidth>
                            <InputLabel>Financial Category</InputLabel>
                            <Select
                                value={form.financialCategory}
                                label="Financial Category"
                                onChange={e => setForm({ ...form, financialCategory: e.target.value })}
                            >
                                <MenuItem value="OPEX">
                                    <Box>
                                        <Typography variant="body1">OPEX (Operating Expense)</Typography>
                                        <Typography variant="caption" color="text.secondary">Recurring costs (Rent, Salaries, Utilities)</Typography>
                                    </Box>
                                </MenuItem>
                                <MenuItem value="CAPEX">
                                    <Box>
                                        <Typography variant="body1">CAPEX (Capital Expenditure)</Typography>
                                        <Typography variant="caption" color="text.secondary">Assets, Equipment, Renovations</Typography>
                                    </Box>
                                </MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl>
                            <InputLabel shrink>Status</InputLabel>
                            <Select
                                value={form.active ? 'active' : 'inactive'}
                                label="Status"
                                onChange={e => setForm({ ...form, active: e.target.value === 'active' })}
                                native={false}
                            >
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="inactive">Inactive (Hidden)</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation Wrapper */}
            <ConfirmationReasonDialog
                open={confirmDialog.open}
                onClose={confirmDialog.onClose}
                onConfirm={confirmDialog.onConfirm}
                title={confirmDialog.title}
                message={confirmDialog.message}
                confirmText={confirmDialog.confirmText}
                confirmColor={confirmDialog.confirmColor}
                requireReason={false}
            />
        </Box>
    );
}
