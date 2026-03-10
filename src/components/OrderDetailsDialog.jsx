import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, Table, TableHead, TableBody,
    TableRow, TableCell, Stack, IconButton, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';

// Components
import EditTransactionDialog from './EditTransactionDialog';
import CustomerSelectionDrawer from './pos/CustomerSelectionDrawer';

import { supabase } from '../supabase';
import { fmtCurrency, fmtDateTime } from '../utils/formatters';
const currency = fmtCurrency;

export default function OrderDetailsDialog({ open, onClose, order, onUpdate, onPrint, showSnackbar }) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editTxDialog, setEditTxDialog] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [customerDialog, setCustomerDialog] = useState(false);

    // Order-level overrides (customer info)
    const [currentCustomer, setCurrentCustomer] = useState(null);

    // Fetch order items
    useEffect(() => {
        if (open && order?.id) {
            setLoading(true);
            supabase
                .from('order_items')
                .select('*')
                .eq('parent_order_id', order.id)
                .eq('is_deleted', false)
                .then(({ data }) => {
                    if (data) setTransactions(data);
                    setLoading(false);
                });
            setCurrentCustomer({
                customerName: order.customer_name,
                customerPhone: order.customer_phone,
                customerAddress: order.customer_address,
                customerTin: order.customer_tin,
                customerId: order.customer_id
            });
        }
    }, [open, order]);

    const handleEditTx = (tx) => {
        setEditingTx(tx);
        setEditTxDialog(true);
    };

    const handleSaveTx = async (id, updates) => {
        // Map old field names (item, total) to Supabase snake_case (name, amount)
        const payload = {
            name: updates.item || updates.name,
            quantity: updates.quantity,
            price: updates.price,
            amount: updates.total ?? updates.amount,
            is_edited: true,
        };
        try {
            const { error } = await supabase.from('order_items').update(payload).eq('id', id);
            if (error) throw error;
            setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...payload } : t));
            setEditTxDialog(false);
        } catch (e) {
            console.error("Error updating order item:", e);
            showSnackbar?.("Failed to update transaction", 'error');
        }
    };

    const handleUpdateCustomer = (customerData) => {
        setCurrentCustomer(prev => ({
            ...prev,
            customerName: customerData.fullName || customerData.name || 'Walk-in',
            customerPhone: customerData.phone || '',
            customerAddress: customerData.address || '',
            customerTin: customerData.tin || '',
            customerId: customerData.id || null
        }));
        setCustomerDialog(false);
    };

    const total = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const syncOrderDoc = async () => {
        const { error } = await supabase.from('orders').update({
            customer_name: currentCustomer.customerName,
            customer_phone: currentCustomer.customerPhone || null,
            customer_address: currentCustomer.customerAddress || null,
            customer_tin: currentCustomer.customerTin || null,
            customer_id: currentCustomer.customerId || null,
            total,
            subtotal: total,
        }).eq('id', order.id);
        if (error) throw error;
    };

    const handleConfirm = async () => {
        await syncOrderDoc();
        if (onUpdate) onUpdate();
        onClose();
    };

    const handlePrintConfirm = async () => {
        await syncOrderDoc();
        const fullOrder = {
            ...order,
            items: transactions.map(t => ({
                name: t.name,
                serviceName: t.name,
                quantity: t.quantity,
                price: t.price,
                subtotal: t.amount,
                total: t.amount
            })),
            total,
            subtotal: total,
            customerName: currentCustomer.customerName,
            customerPhone: currentCustomer.customerPhone,
            customerAddress: currentCustomer.customerAddress,
            customerTin: currentCustomer.customerTin,
        };
        onPrint(fullOrder);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Order #{order?.order_number}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {order?.timestamp ? fmtDateTime(order.timestamp) : ''}
                    </Typography>
                </Box>
            </DialogTitle>
            <DialogContent dividers>
                {/* Customer Section */}
                <Box mb={2} p={2} bgcolor="background.paper" borderRadius={1} display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="caption" color="text.secondary">CUSTOMER</Typography>
                        <Typography variant="subtitle1" fontWeight="bold">
                            {currentCustomer?.customerName || 'Walk-in Customer'}
                        </Typography>
                        {currentCustomer?.customerPhone && (
                            <Typography variant="body2">{currentCustomer.customerPhone}</Typography>
                        )}
                        {currentCustomer?.customerAddress && (
                            <Typography variant="body2" color="text.secondary">{currentCustomer.customerAddress}</Typography>
                        )}
                        {currentCustomer?.customerTin && (
                            <Typography variant="body2" color="text.secondary">TIN: {currentCustomer.customerTin}</Typography>
                        )}
                    </Box>
                    <Button startIcon={<EditIcon />} size="small" onClick={() => setCustomerDialog(true)}>
                        Edit Info
                    </Button>
                </Box>

                {/* Line Items */}
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>LINE ITEMS</Typography>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell align="right">Qty</TableCell>
                            <TableCell align="right">Price</TableCell>
                            <TableCell align="right">Total</TableCell>
                            <TableCell align="center">Edit</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell>
                                    <Typography variant="body2">{tx.name}</Typography>
                                </TableCell>
                                <TableCell align="right">{tx.quantity}</TableCell>
                                <TableCell align="right">{currency(tx.price)}</TableCell>
                                <TableCell align="right">{currency(tx.amount)}</TableCell>
                                <TableCell align="center">
                                    <IconButton size="small" onClick={() => handleEditTx(tx)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell colSpan={3} align="right" sx={{ fontWeight: 'bold' }}>TOTAL</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currency(total)}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button variant="outlined" startIcon={<SaveIcon />} onClick={handleConfirm}>
                    Update
                </Button>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrintConfirm}>
                    Print & Update
                </Button>
            </DialogActions>

            <EditTransactionDialog
                open={editTxDialog}
                onClose={() => setEditTxDialog(false)}
                transaction={editingTx}
                onSave={handleSaveTx}
            />
            <CustomerSelectionDrawer
                open={customerDialog}
                onClose={() => setCustomerDialog(false)}
                currentCustomer={currentCustomer}
                onSelectCustomer={handleUpdateCustomer}
            />
        </Dialog>
    );
}
