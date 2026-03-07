import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Card, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, IconButton, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Stack, InputAdornment, Grid
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History'; // For audits
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { fmtCurrency, fmtPesoWhole } from '../../utils/formatters';
import { restockItem, getInventoryLogs } from '../../services/inventoryService';
import { useInventoryAnalytics } from '../../hooks/useInventoryAnalytics';
import ValidatedInput from '../common/ValidatedInput';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import DetailDrawer from '../common/DetailDrawer';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TollIcon from '@mui/icons-material/Toll';
import SellIcon from '@mui/icons-material/Sell';

export default function InventoryManagement({ showSnackbar }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Restock Dialog State
    const [restockDialog, setRestockDialog] = useState({ open: false, item: null });
    const [restockForm, setRestockForm] = useState({ qtyAdded: '', unitCost: '', totalCost: '' });

    // Audit History State
    const [auditDrawer, setAuditDrawer] = useState({ open: false, logs: [], loading: false });

    // Load Retail Items (Track Stock = True)
    useEffect(() => {
        // We only care about items that are "retail" OR "trackStock" is true
        // Filtering client side is easier since composite indexes might be missing
        const q = query(collection(db, 'services'), where('category', '==', 'Sale'));
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
            const newAverageCost = await restockItem({
                item,
                qtyAdded: qty,
                unitCost: unit,
                totalCost: total,
                staffEmail: auth.currentUser?.email || 'admin'
            });

            showSnackbar?.(`Restocked ${item.serviceName}. New Cost: ${fmtCurrency(newAverageCost)}`, 'success');
            setRestockDialog({ open: false, item: null });
        } catch (e) {
            console.error('Restock failed:', e);
            showSnackbar?.('Failed to update inventory', 'error');
        }
    };

    // Handlers for form inputs
    const onUnitChange = (val) => {
        const qty = parseFloat(restockForm.qtyAdded) || 0;
        setRestockForm({ ...restockForm, unitCost: val, totalCost: (qty * parseFloat(val || 0)).toFixed(2) });
    };

    const onTotalChange = (val) => {
        const qty = parseFloat(restockForm.qtyAdded) || 1; // avoid NaN
        setRestockForm({ ...restockForm, totalCost: val, unitCost: (parseFloat(val || 0) / qty).toFixed(2) });
    };

    const onQtyChange = (val) => {
        const unit = parseFloat(restockForm.unitCost) || 0;
        setRestockForm({ ...restockForm, qtyAdded: val, totalCost: (parseFloat(val || 0) * unit).toFixed(2) });
    };

    // Analytics
    const { velocityData, loading: analyticsLoading } = useInventoryAnalytics(items);
    const summaryCards = useMemo(() => {
        const totalValue = items.reduce((acc, i) => acc + ((i.stockCount || 0) * (i.costPrice || 0)), 0);
        const lowStockCount = items.filter(i => (i.stockCount || 0) <= (i.lowStockThreshold || 5)).length;
        const totalItems = items.length;
        const totalRetailValue = items.reduce((acc, i) => acc + ((i.stockCount || 0) * (i.price || 0)), 0);

        return [
            {
                label: "Total Value (Cost)",
                value: fmtPesoWhole(totalValue),
                icon: <TollIcon />,
                color: "primary.main",
                highlight: true
            },
            {
                label: "Est. Retail Value",
                value: fmtPesoWhole(totalRetailValue),
                icon: <SellIcon />,
                color: "success.main"
            },
            {
                label: "Tracked Items",
                value: String(totalItems),
                icon: <InventoryIcon />,
                color: "info.main"
            },
            {
                label: "Low Stock Alert",
                value: String(lowStockCount),
                icon: <WarningAmberIcon />,
                color: lowStockCount > 0 ? "error.main" : "text.secondary",
                highlight: lowStockCount > 0
            }
        ];
    }, [items]);

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title="Inventory Management"
                subtitle="Track stock levels and perform restocking for retail goods."
                actions={
                    <Button
                        variant="contained"
                        startIcon={<HistoryIcon />}
                        onClick={async () => {
                            setAuditDrawer({ ...auditDrawer, open: true, loading: true });
                            const logs = await getInventoryLogs();
                            setAuditDrawer({ open: true, logs, loading: false });
                        }}
                    >
                        Audit History
                    </Button>
                }
            />

            <SummaryCards cards={summaryCards} loading={loading} sx={{ mb: 3 }} />

            <Card>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Item Name</TableCell>
                                <TableCell align="right">Current Stock</TableCell>
                                <TableCell align="right">Avg Sales/Day</TableCell>
                                <TableCell align="right">Stock Life</TableCell>
                                <TableCell align="right">Avg Cost</TableCell>
                                <TableCell align="right">Stock Value</TableCell>
                                <TableCell align="right">Sell Price</TableCell>
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

                                const vData = velocityData[item.id] || { velocity: 0, daysRemaining: null };

                                return (
                                    <TableRow key={item.id} hover>
                                        <TableCell fontWeight="bold">{item.serviceName}</TableCell>
                                        <TableCell align="right">
                                            <Typography color={isLow ? 'error' : 'inherit'} fontWeight={isLow ? 'bold' : 'normal'}>
                                                {stock}
                                            </Typography>
                                            {isLow && <Typography variant="caption" color="error">Low</Typography>}
                                        </TableCell>
                                        <TableCell align="right">
                                            {analyticsLoading ? '...' : vData.velocity.toFixed(2)}
                                        </TableCell>
                                        <TableCell align="right">
                                            {analyticsLoading ? '...' :
                                                vData.daysRemaining !== null
                                                    ? <Typography variant="body2" color={vData.daysRemaining < 3 ? 'error' : 'inherit'}>
                                                        {vData.daysRemaining} days
                                                    </Typography>
                                                    : <Typography variant="caption" color="text.secondary">No sales</Typography>
                                            }
                                        </TableCell>
                                        <TableCell align="right">{fmtCurrency(cost)}</TableCell>
                                        <TableCell align="right">{fmtPesoWhole(stock * cost)}</TableCell>
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <Typography variant="body2">{fmtCurrency(price)}</Typography>
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

            {/* Restock DetailDrawer */}
            <DetailDrawer
                open={restockDialog.open}
                onClose={() => setRestockDialog({ open: false, item: null })}
                title="Restock Inventory"
                subtitle={restockDialog.item?.serviceName}
                actions={
                    <>
                        <Button onClick={() => setRestockDialog({ open: false, item: null })}>Cancel</Button>
                        <Button variant="contained" onClick={handlePerformRestock}>Confirm Restock</Button>
                    </>
                }
            >
                <Stack spacing={3}>
                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>CURRENT STATUS</Typography>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2">Current Stock:</Typography>
                            <Typography variant="body2" fontWeight="bold">{restockDialog.item?.stockCount || 0} units</Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2">Current Cost:</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtCurrency(restockDialog.item?.costPrice || 0)}</Typography>
                        </Stack>
                    </Box>

                    <ValidatedInput
                        label="Quantity Added"
                        rule="numeric"
                        fullWidth
                        autoFocus
                        value={restockForm.qtyAdded}
                        onChange={onQtyChange}
                        placeholder="How many units were received?"
                    />

                    <Stack direction="row" spacing={2}>
                        <ValidatedInput
                            label="Unit Cost"
                            rule="numeric"
                            fullWidth
                            value={restockForm.unitCost}
                            onChange={onUnitChange}
                            InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                        />
                        <ValidatedInput
                            label="Total Cost"
                            rule="numeric"
                            fullWidth
                            value={restockForm.totalCost}
                            onChange={onTotalChange}
                            InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                        />
                    </Stack>

                    {restockForm.qtyAdded && restockForm.unitCost && (
                        <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                            <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                                NEW VALUATION (Weighted Average)
                            </Typography>
                            {(() => {
                                const oldQ = restockDialog.item?.stockCount || 0;
                                const oldC = restockDialog.item?.costPrice || 0;
                                const newQ = oldQ + Number(restockForm.qtyAdded);
                                const newVal = (oldQ * oldC) + Number(restockForm.totalCost);
                                return (
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" color="primary.main" fontWeight="bold">
                                            {fmtCurrency(newVal / newQ)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Per unit
                                        </Typography>
                                    </Stack>
                                );
                            })()}
                        </Box>
                    )}
                </Stack>
            </DetailDrawer>

            {/* Audit History Drawer */}
            <DetailDrawer
                open={auditDrawer.open}
                onClose={() => setAuditDrawer({ ...auditDrawer, open: false })}
                title="Inventory Audit History"
                subtitle="Recent stock movements across all retail items."
                width={600}
                loading={auditDrawer.loading}
            >
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Item</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell align="right">Qty</TableCell>
                                <TableCell>Staff</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {auditDrawer.logs.map(log => (
                                <TableRow key={log.id} hover>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </TableCell>
                                    <TableCell fontWeight="bold">{log.itemName}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.type}
                                            size="small"
                                            color={log.type === 'Restock' ? 'success' : log.type === 'Sale' ? 'info' : 'warning'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: log.qtyChange > 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                                        {log.qtyChange > 0 ? `+${log.qtyChange}` : log.qtyChange}
                                    </TableCell>
                                    <TableCell variant="caption">{log.staffEmail?.split('@')[0]}</TableCell>
                                </TableRow>
                            ))}
                            {auditDrawer.logs.length === 0 && !auditDrawer.loading && (
                                <TableRow><TableCell colSpan={5} align="center">No logs found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DetailDrawer>
        </Box >
    );
}
