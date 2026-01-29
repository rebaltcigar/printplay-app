import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Card, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, IconButton, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Stack, InputAdornment, Grid
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History'; // For audits
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { fmtPeso } from '../../utils/analytics'; // Ensure this exists or reimplement

export default function InventoryManagement({ showSnackbar }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Restock Dialog State
    const [restockDialog, setRestockDialog] = useState({ open: false, item: null });
    const [restockForm, setRestockForm] = useState({ qtyAdded: '', unitCost: '', totalCost: '' });

    // Load Retail Items (Track Stock = True)
    useEffect(() => {
        // We only care about items that are "retail" OR "trackStock" is true
        // Filtering client side is easier since composite indexes might be missing
        const q = query(collection(db, 'services'), where('category', '==', 'Debit'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setItems(list.filter(i => i.type === 'retail' || i.trackStock));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleOpenRestock = (item) => {
        setRestockDialog({ open: true, item });
        // Pre-fill cost with current costPrice if available, else 0
        setRestockForm({ qtyAdded: '', unitCost: item.costPrice || '', totalCost: '' });
    };

    const calculateRestock = () => {
        const qty = Number(restockForm.qtyAdded);
        if (restockForm.totalCost) {
            // user entered total, calc unit
            return { qty, total: Number(restockForm.totalCost), unit: Number(restockForm.totalCost) / qty };
        } else {
            // user entered unit, calc total
            const unit = Number(restockForm.unitCost);
            return { qty, total: unit * qty, unit };
        }
    };

    const handlePerformRestock = async () => {
        const { item } = restockDialog;
        if (!item) return;

        const { qty, total, unit } = calculateRestock();
        if (qty <= 0) {
            showSnackbar?.('Quantity must be positive', 'warning');
            return;
        }

        try {
            // Weighted Average Cost Calculation
            const oldQty = Number(item.stockCount || 0);
            const oldCost = Number(item.costPrice || 0);
            const oldTotalValue = oldQty * oldCost;

            const newTotalValue = oldTotalValue + total;
            const newTotalQty = oldQty + qty;

            // Avoid divide by zero if newQty is 0 (unlikely here)
            const newAverageCost = newTotalQty > 0 ? (newTotalValue / newTotalQty) : unit;

            // 1. Update Item
            await updateDoc(doc(db, 'services', item.id), {
                stockCount: newTotalQty,
                costPrice: newAverageCost,
                lastRestocked: serverTimestamp()
            });

            // 2. Create "Inventory Purchase" Transaction (Asset)
            // This effectively logs the "Buy" action
            await addDoc(collection(db, 'transactions'), {
                item: `Restock: ${item.serviceName}`,
                quantity: qty,
                price: unit, // Unit Cost
                total: total, // Total Cost
                financialCategory: 'InventoryAsset', // Asset Purchase
                category: 'Credit', // Technically an expense workflow but logged as Asset
                timestamp: serverTimestamp(),
                staffEmail: auth.currentUser?.email || 'admin',
                notes: `Restocked ${qty} units. Old Cost: ${oldCost.toFixed(2)}, New Cost: ${newAverageCost.toFixed(2)}`,
                inventoryItemId: item.id
            });

            showSnackbar?.(`Restocked ${item.serviceName}. New Cost: ${fmtPeso(newAverageCost)}`, 'success');
            setRestockDialog({ open: false, item: null });
        } catch (e) {
            console.error(e);
            showSnackbar?.('Restock failed', 'error');
        }
    };

    // Handlers for form inputs to auto-cal total/unit
    const onUnitChange = (val) => {
        const qty = Number(restockForm.qtyAdded || 0);
        setRestockForm({ ...restockForm, unitCost: val, totalCost: (qty * Number(val)).toFixed(2) });
    };

    const onTotalChange = (val) => {
        const qty = Number(restockForm.qtyAdded || 1); // avoid NaN
        setRestockForm({ ...restockForm, totalCost: val, unitCost: (Number(val) / qty).toFixed(2) });
    };

    const onQtyChange = (val) => {
        const unit = Number(restockForm.unitCost || 0);
        setRestockForm({ ...restockForm, qtyAdded: val, totalCost: (Number(val) * unit).toFixed(2) });
    };

    return (
        <Box sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Inventory Management</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Manage retail stock, supplies, and track inventory value.
                    </Typography>
                </Box>
                {/* <Button variant="outlined" startIcon={<HistoryIcon />}>Audit Logs</Button> */}
            </Stack>

            {/* KPI Cards (Optional Future) */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary">Total Inventory Value</Typography>
                        <Typography variant="h6" fontWeight="bold">
                            {fmtPeso(items.reduce((acc, i) => acc + ((i.stockCount || 0) * (i.costPrice || 0)), 0))}
                        </Typography>
                    </Card>
                </Grid>
            </Grid>

            <Card>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Item Name</TableCell>
                                <TableCell align="right">Current Stock</TableCell>
                                <TableCell align="right">Avg Cost</TableCell>
                                <TableCell align="right">Stock Value</TableCell>
                                <TableCell align="right">Sell Price</TableCell>
                                <TableCell align="right">Margin (Est)</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map(item => {
                                const stock = item.stockCount || 0;
                                const cost = item.costPrice || 0;
                                const price = item.price || 0;
                                const margin = price - cost;
                                const marginPct = price > 0 ? (margin / price) * 100 : 0;
                                const isLow = stock <= (item.lowStockThreshold || 5);

                                return (
                                    <TableRow key={item.id} hover>
                                        <TableCell fontWeight="bold">{item.serviceName}</TableCell>
                                        <TableCell align="right">
                                            <Typography color={isLow ? 'error' : 'inherit'} fontWeight={isLow ? 'bold' : 'normal'}>
                                                {stock}
                                            </Typography>
                                            {isLow && <Typography variant="caption" color="error">Low</Typography>}
                                        </TableCell>
                                        <TableCell align="right">{fmtPeso(cost)}</TableCell>
                                        <TableCell align="right">{fmtPeso(stock * cost)}</TableCell>
                                        <TableCell align="right">{fmtPeso(price)}</TableCell>
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <Typography variant="body2">{fmtPeso(margin)}</Typography>
                                                <Typography variant="caption" color={marginPct < 20 ? 'warning.main' : 'success.main'}>
                                                    {marginPct.toFixed(1)}%
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                variant="contained"
                                                startIcon={<AddIcon />}
                                                onClick={() => handleOpenRestock(item)}
                                            >
                                                Restock
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {items.length === 0 && !loading && (
                                <TableRow><TableCell colSpan={7} align="center">No retail items found. Add them in Service Catalog first.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>

            {/* Restock Dialog */}
            <Dialog open={restockDialog.open} onClose={() => setRestockDialog({ open: false, item: null })} maxWidth="xs" fullWidth>
                <DialogTitle>Restock Inventory</DialogTitle>
                <DialogContent>
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight="bold">{restockDialog.item?.serviceName}</Typography>
                        <Typography variant="body2" color="text.secondary">Current Stock: {restockDialog.item?.stockCount}</Typography>
                    </Box>
                    <Stack spacing={2}>
                        <TextField
                            label="Quantity Added"
                            type="number"
                            fullWidth
                            autoFocus
                            value={restockForm.qtyAdded}
                            onChange={e => onQtyChange(e.target.value)}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Unit Cost"
                                type="number"
                                fullWidth
                                value={restockForm.unitCost}
                                onChange={e => onUnitChange(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                            />
                            <TextField
                                label="Total Cost"
                                type="number"
                                fullWidth
                                value={restockForm.totalCost}
                                onChange={e => onTotalChange(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                            />
                        </Stack>
                        {restockForm.qtyAdded && restockForm.unitCost && (
                            <Box sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                                <Typography variant="caption" display="block">New Weighted Cost will be:</Typography>
                                {(() => {
                                    const oldQ = restockDialog.item?.stockCount || 0;
                                    const oldC = restockDialog.item?.costPrice || 0;
                                    const newQ = oldQ + Number(restockForm.qtyAdded);
                                    const newVal = (oldQ * oldC) + Number(restockForm.totalCost);
                                    return <Typography fontWeight="bold">{fmtPeso(newVal / newQ)}</Typography>
                                })()}
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRestockDialog({ open: false, item: null })}>Cancel</Button>
                    <Button variant="contained" onClick={handlePerformRestock}>Confirm Restock</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
