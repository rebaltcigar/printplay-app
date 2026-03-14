import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, Card, Dialog, DialogActions, DialogContent,
    DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Typography, IconButton, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { supabase } from '../../supabase';
import ConfirmationReasonDialog from '../dialogs/ConfirmationReasonDialog';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import DetailDrawer from '../common/DetailDrawer';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import BusinessIcon from '@mui/icons-material/Business';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import { generateUUID } from '../../utils/uuid';


export default function ExpenseSettings({ showSnackbar }) {
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', financialCategory: 'OPEX', active: true });
    const [confirmDialog, setConfirmDialog] = useState({ open: false });

    useEffect(() => {
        const fetchTypes = async () => {
            const { data } = await supabase
                .from('products')
                .select('*')
                .or('category.eq.Expense,financial_category.eq.Expense');
            if (data) {
                const list = [...data].sort((a, b) => {
                    if (a.active === b.active) return a.name.localeCompare(b.name);
                    return b.active ? 1 : -1;
                });
                setTypes(list);
            }
            setLoading(false);
        };

        fetchTypes();

        const channel = supabase.channel('expense-settings-products')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchTypes)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const summaryCards = useMemo(() => {
        const total = types.length;
        const opexCount = types.filter(t => t.financial_category === 'OPEX' || !t.financial_category).length;
        const capexCount = types.filter(t => t.financial_category === 'CAPEX').length;
        const cogsCount = types.filter(t => t.financial_category === 'COGS').length;
        const inactive = types.filter(t => t.active === false).length;
        return [
            { label: "Total Budget Types", value: String(total), icon: <ReceiptLongIcon />, color: "primary.main", highlight: true },
            { label: "OPEX / COGS", value: `${opexCount} / ${cogsCount}`, icon: <AccountBalanceWalletIcon />, color: "info.main" },
            { label: "CAPEX (Assets)", value: String(capexCount), icon: <BusinessIcon />, color: "secondary.main" },
            { label: "Inactive", value: String(inactive), icon: <HighlightOffIcon />, color: inactive > 0 ? "warning.main" : "text.secondary" }
        ];
    }, [types]);

    const handleOpen = (item = null) => {
        if (item) {
            setEditing(item);
            setForm({ name: item.name, financialCategory: item.financial_category || 'OPEX', active: item.active !== false });
        } else {
            setEditing(null);
            setForm({ name: '', financialCategory: 'OPEX', active: true });
        }
        setOpen(true);
    };

    const handleClose = () => { setOpen(false); setEditing(null); };

    const handleSave = async () => {
        if (!form.name.trim()) { showSnackbar('Name is required', 'warning'); return; }
        try {
            const payload = {
                name: form.name.trim(),
                category: 'Expense',
                financial_category: form.financialCategory || 'OPEX',
                active: form.active,
                updated_at: new Date().toISOString(),
            };
            if (editing) {
                const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
                if (error) throw error;
                showSnackbar('Expense type updated', 'success');
            } else {
                const { error } = await supabase.from('products').insert([{
                    id: generateUUID(),
                    ...payload,
                    price: 0,
                    sort_order: 999,
                    created_at: new Date().toISOString(),
                }]);
                if (error) throw error;
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
            message: `Permanently delete "${item.name}"? Consider disabling instead.`,
            confirmText: 'Delete',
            confirmColor: 'error',
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('products').delete().eq('id', item.id);
                    if (error) throw error;
                    showSnackbar('Deleted successfully', 'success');
                } catch (e) {
                    showSnackbar('Failed to delete', 'error');
                }
            },
            onClose: () => setConfirmDialog(p => ({ ...p, open: false }))
        });
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', p: 2 }}>
            <PageHeader
                title="Expense Configuration"
                subtitle="Define types of obligations (OPEX) and assets (CAPEX)."
                actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>Add Type</Button>}
            />

            <SummaryCards cards={summaryCards} loading={loading} sx={{ mb: 3 }} />

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
                                    <TableCell>{t.name}</TableCell>
                                    <TableCell>
                                        <Chip label={t.financial_category || 'OPEX'} color={t.financial_category === 'CAPEX' ? 'secondary' : 'default'} size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell>
                                        {t.active !== false
                                            ? <Chip label="Active" color="success" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                            : <Chip label="Inactive" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                        }
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => handleOpen(t)}><EditIcon fontSize="small" /></IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(t)}><DeleteIcon fontSize="small" /></IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {types.length === 0 && !loading && (
                                <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>No expense types defined.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>

            <DetailDrawer
                open={open} onClose={handleClose}
                title={editing ? 'Edit Expense Type' : 'New Expense Type'}
                subtitle={editing ? editing.name : 'Configure a category of business spending'}
                actions={<><Button onClick={handleClose}>Cancel</Button><Button variant="contained" onClick={handleSave}>Save</Button></>}
            >
                <Stack spacing={3}>
                    <TextField label="Name (e.g. Rent, Internet)" fullWidth value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                    <FormControl fullWidth>
                        <InputLabel>Financial Category</InputLabel>
                        <Select value={form.financialCategory} label="Financial Category" onChange={e => setForm({ ...form, financialCategory: e.target.value })}>
                            <MenuItem value="OPEX"><Box sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={600}>OPEX</Typography><Typography variant="caption" color="text.secondary" display="block">Recurring costs (Rent, Salaries, Utilities)</Typography></Box></MenuItem>
                            <MenuItem value="CAPEX"><Box sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={600}>CAPEX</Typography><Typography variant="caption" color="text.secondary" display="block">Assets, Equipment, Renovations</Typography></Box></MenuItem>
                            <MenuItem value="COGS"><Box sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={600}>COGS</Typography><Typography variant="caption" color="text.secondary" display="block">Direct costs: raw materials, resold goods</Typography></Box></MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select value={form.active ? 'active' : 'inactive'} label="Status" onChange={e => setForm({ ...form, active: e.target.value === 'active' })}>
                            <MenuItem value="active">Active (Visible in POS)</MenuItem>
                            <MenuItem value="inactive">Inactive (Hidden)</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </DetailDrawer>

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
