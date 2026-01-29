import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, Table, TableHead, TableBody,
    TableRow, TableCell, Stack, IconButton, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';

// Components
import EditTransactionDialog from './EditTransactionDialog';
import OrderCustomerDialog from './OrderCustomerDialog';

// Firebase
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, serverTimestamp, orderBy } from 'firebase/firestore';

const currency = (num) => `₱${Number(num || 0).toFixed(2)}`;

export default function OrderDetailsDialog({ open, onClose, order, onUpdate, onPrint, showSnackbar }) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editTxDialog, setEditTxDialog] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [customerDialog, setCustomerDialog] = useState(false);

    // Order-level overrides (customer info)
    const [currentCustomer, setCurrentCustomer] = useState(null);

    // Fetch Transactions Live
    useEffect(() => {
        if (open && order?.orderNumber) {
            setLoading(true);
            const q = query(
                collection(db, 'transactions'),
                where('orderNumber', '==', order.orderNumber),
                where('isDeleted', '==', false) // Exclude soft deleted
            );
            getDocs(q).then(snap => {
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setTransactions(docs);
                setLoading(false);
            });
            setCurrentCustomer({
                customerName: order.customerName,
                customerPhone: order.customerPhone,
                customerAddress: order.customerAddress,
                customerId: order.customerId
            });
        }
    }, [open, order]);

    const handleEditTx = (tx) => {
        setEditingTx(tx);
        setEditTxDialog(true);
    };

    const handleSaveTx = async (id, updates) => {
        // Save to DB immediately (Transaction Level)
        try {
            await updateDoc(doc(db, 'transactions', id), updates);
            // Refresh
            setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
            setEditTxDialog(false);
        } catch (e) {
            console.error("Error updating tx:", e);
            showSnackbar?.("Failed to update transaction", 'error');
        }
    };

    const handleUpdateCustomer = (customerData) => {
        setCurrentCustomer(prev => ({
            ...prev,
            customerName: customerData.fullName || customerData.name || 'Walk-in',
            customerPhone: customerData.phone || '',
            customerAddress: customerData.address || '',
            customerId: customerData.id || null
        }));
        setCustomerDialog(false);
    };

    const total = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
    const canConfirm = transactions.length > 0; // Check something?

    const syncOrderDoc = async () => {
        // Sync the 'orders' doc with latest transaction data and customer info
        const orderRef = doc(db, 'orders', order.id);

        // Reconstruct items list for the order doc (snapshot)
        const items = transactions.map(t => ({
            name: t.item,
            serviceName: t.item, // Compatibility
            quantity: t.quantity,
            price: t.price,
            total: t.total,
            subtotal: t.total,
            notes: t.notes
        }));

        await updateDoc(orderRef, {
            items: items,
            total: total,
            subtotal: total,
            customerName: currentCustomer.customerName,
            customerPhone: currentCustomer.customerPhone || null,
            customerAddress: currentCustomer.customerAddress || null,
            customerId: currentCustomer.customerId || null,
            updatedAt: serverTimestamp(),
            // Ensure payment fields are present even if not changed here
            paymentMethod: order.paymentMethod || 'Cash',
            amountTendered: order.amountTendered || 0,
            change: order.change || 0,
            paymentDetails: order.paymentDetails || {}
        });
    };

    const handleConfirm = async () => {
        await syncOrderDoc();
        if (onUpdate) onUpdate();
        onClose();
    };

    const handlePrintConfirm = async () => {
        await syncOrderDoc();
        // Construct print object
        const fullOrder = {
            ...order,
            items: transactions.map(t => ({ // Use latest items
                name: t.item,
                serviceName: t.item,
                quantity: t.quantity,
                price: t.price,
                subtotal: t.total,
                total: t.total
            })),
            total: total,
            subtotal: total,
            customerName: currentCustomer.customerName,
            customerPhone: currentCustomer.customerPhone,
            customerAddress: currentCustomer.customerAddress,
        };
        onPrint(fullOrder); // callback to print
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Order #{order?.orderNumber}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {order?.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000).toLocaleString() : ''}
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
                                    <Typography variant="body2">{tx.item}</Typography>
                                    {tx.notes && <Typography variant="caption" color="text.secondary" display="block">{tx.notes}</Typography>}
                                </TableCell>
                                <TableCell align="right">{tx.quantity}</TableCell>
                                <TableCell align="right">{currency(tx.price)}</TableCell>
                                <TableCell align="right">{currency(tx.total)}</TableCell>
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

            {/* Sub-Dialogs */}
            <EditTransactionDialog
                open={editTxDialog}
                onClose={() => setEditTxDialog(false)}
                transaction={editingTx}
                onSave={handleSaveTx}
            />
            {/* Reuse OrderCustomerDialog. NOTE: It expects `onSelect` and `onClose`. 
                It's designed for selecting a customer from a list or creating one.
                If we use `OrderCustomerDialog`, passing `onSelect` handles the returned data.
            */}
            <OrderCustomerDialog
                open={customerDialog}
                onClose={() => setCustomerDialog(false)}
                onSelect={handleUpdateCustomer}
            />
        </Dialog>
    );
}
