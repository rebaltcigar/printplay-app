import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Grid, Paper, Typography, Button, Tabs, Tab,
    IconButton, List, ListItem, ListItemText, Divider,
    Dialog, DialogTitle, DialogContent, TextField,
    DialogActions, Select, MenuItem, FormControl, InputLabel,
    Card, CardActionArea, CardContent, Chip, Stack
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ReceiptIcon from '@mui/icons-material/Receipt';
import MoneyOffIcon from '@mui/icons-material/MoneyOff'; // For expenses

import { db, auth } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, writeBatch, increment } from 'firebase/firestore';
import { generateOrderNumber, createOrderObject } from '../utils/orderService';
import CustomerDialog from './CustomerDialog';
import CheckoutDialog from './CheckoutDialog';
import ChangeDisplayDialog from './ChangeDisplayDialog';
import { SimpleReceipt } from './SimpleReceipt';

// Initial state for a fresh order
const emptyOrder = {
    items: [],
    customer: null, // { id, fullName }
};

export default function POSView({ showSnackbar }) {
    // --- STATE ---
    const [activeTab, setActiveTab] = useState(0);
    const [orders, setOrders] = useState([{ ...emptyOrder }, { ...emptyOrder }, { ...emptyOrder }]);

    // Data
    const [services, setServices] = useState([]);
    const [staffOptions, setStaffOptions] = useState([]);

    // Dialogs
    const [customerOpen, setCustomerOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [changeDialogOpen, setChangeDialogOpen] = useState(false);
    const [lastChange, setLastChange] = useState(0);
    const [expenseOpen, setExpenseOpen] = useState(false);

    // Printing
    const [printOrder, setPrintOrder] = useState(null);

    // Expense Form State
    const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', staffEmail: '' });

    // --- EFFECT: Load Services ---
    useEffect(() => {
        const q = query(collection(db, 'services'), orderBy('sortOrder'));
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Only show active items, and exclude "Expenses" category from the sales grid
            setServices(items.filter(i => i.active && i.category !== 'Credit'));
        });
        return () => unsub();
    }, []);

    // --- EFFECT: Load Staff (for Expense dropdown) ---
    useEffect(() => {
        const q = query(collection(db, 'users'));
        const unsub = onSnapshot(q, (snap) => {
            setStaffOptions(snap.docs.map(d => d.data()).filter(u => u.email));
        });
        return () => unsub();
    }, []);

    // --- EFFECT: Auto-Print Trigger ---
    useEffect(() => {
        if (printOrder) {
            setTimeout(() => {
                window.print();
                setPrintOrder(null); // Clear after printing
            }, 500);
        }
    }, [printOrder]);

    // --- HELPERS ---
    const currentOrder = orders[activeTab];
    const currentTotal = currentOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    const updateOrder = (idx, updates) => {
        setOrders(prev => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...updates };
            return copy;
        });
    };

    const addToCart = (item) => {
        const items = [...currentOrder.items];
        const existingIdx = items.findIndex(i => i.id === item.id);

        // Stock Validation
        if (item.trackStock && item.type === 'retail') {
            const currentQtyInCart = existingIdx >= 0 ? items[existingIdx].quantity : 0;
            const available = item.stockCount || 0;
            if (currentQtyInCart + 1 > available) {
                showSnackbar?.(`Not enough stock. Only ${available} available.`, 'warning');
                return;
            }
        }

        if (existingIdx >= 0) {
            items[existingIdx].quantity += 1;
        } else {
            items.push({ ...item, quantity: 1 });
        }
        updateOrder(activeTab, { items });
    };


    const adjustQty = (itemId, delta) => {
        const order = currentOrder; // Reference
        const itemIndex = order.items.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        const item = order.items[itemIndex];
        const newQty = item.quantity + delta;

        // Stock Validation on Increment
        if (delta > 0 && item.trackStock && item.type === 'retail') {
            const available = item.stockCount || 0; // The item from the cart might lack stockCount if we didn't preserve it?
            // Wait, the item in cart is a COPY of the service item. 
            // We need to ensure 'stockCount' was copied into the cart item or we look it up.
            // Usually we copy {...item} in addToCart, so it should be there *snapshot* at time of add.
            // Better: look up from `services` state to get real-time stock?
            // `services` state updates via snapshot, so it's accurate.
            const freshItem = services.find(s => s.id === itemId);
            const stock = freshItem ? (freshItem.stockCount || 0) : (item.stockCount || 0);

            if (newQty > stock) {
                showSnackbar?.(`Cannot add more. Only ${stock} in stock.`, 'warning');
                return;
            }
        }

        // Don't go below 1 (use delete for that)
        if (newQty < 1) return;

        const items = [...order.items];
        items[itemIndex] = { ...item, quantity: newQty };
        updateOrder(activeTab, { items });
    };


    const removeFromCart = (itemId) => {
        const items = currentOrder.items.filter(i => i.id !== itemId);
        updateOrder(activeTab, { items });
    };

    const clearCurrentOrder = () => {
        updateOrder(activeTab, { ...emptyOrder });
        showSnackbar?.("Order cleared.", "info");
    };

    // --- ACTIONS ---

    const handleCheckout = async (paymentData, shouldPrint = true) => {
        try {
            const user = auth.currentUser;
            const orderNum = await generateOrderNumber();

            // 1. Prepare Order Object
            const fullOrder = {
                orderNumber: orderNum,
                ...createOrderObject(
                    currentOrder.items,
                    currentTotal,
                    paymentData.paymentMethod,
                    paymentData.paymentDetails,
                    paymentData.amountTendered,
                    paymentData.change,
                    currentOrder.customer,
                    user
                )
            };

            // 2. Save Order to Firestore
            const orderRef = await addDoc(collection(db, 'orders'), fullOrder);

            // 3. Process Transactions & Inventory
            const batch = writeBatch(db);

            // 3a. Add Order Record
            // We can't batch addDoc with auto-ID easily if we need the ID, 
            // but we already did addDoc above. We'll proceed with other updates.

            for (const item of currentOrder.items) {
                // Creates individual transaction record
                // We use addDoc here usually, but since we want to batch everything with inventory updates...
                // actually, we can't batch addDoc easily. Firestore SDK 'batch.set(doc(collection...))' works.
                const txRef = doc(collection(db, 'transactions'));
                batch.set(txRef, {
                    item: item.serviceName,
                    serviceId: item.id, // Linked Service ID
                    price: item.price,
                    quantity: item.quantity,
                    total: item.price * item.quantity,
                    timestamp: serverTimestamp(),
                    staffEmail: user?.email,
                    customerName: currentOrder.customer?.fullName || 'Walk-in',
                    orderId: orderRef.id,
                    orderNumber: orderNum,
                    category: item.category || 'Debit',
                    // NEW: Inventory & Profit Tracking
                    unitCost: Number(item.costPrice || 0),
                    financialCategory: 'Revenue', // Explicitly mark as Revenue
                    // If it's a rental or service, cost might be 0, which is fine.
                });

                // 3b. Decrement Stock if applicable
                if (item.trackStock && item.type === 'retail') {
                    const itemRef = doc(db, 'services', item.id);
                    // Calculates new stock. Note: concurrency handling ideally requires transactions, 
                    // but for this scale, batch decrement is acceptable or we use increment(-quantity).
                    // We will use the safe atomic increment.
                    batch.update(itemRef, {
                        stockCount: increment(-item.quantity)
                    });
                }
            }

            await batch.commit();

            // 4. Close & Print
            setCheckoutOpen(false);

            // Show Change Dialog
            // Show for Cash always, or if there's any change (just in case)
            if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
                setLastChange(paymentData.change);
                setChangeDialogOpen(true);
            }

            if (shouldPrint) {
                setPrintOrder(fullOrder); // Triggers the useEffect to print
            }

            clearCurrentOrder();

        } catch (err) {
            console.error(err);
            showSnackbar?.("Transaction failed. Please try again.", 'error');
        }
    };

    const handleQuickExpense = async () => {
        if (!expenseForm.description || !expenseForm.amount) {
            showSnackbar?.("Description and Amount are required.", "error");
            return;
        }
        try {
            const user = auth.currentUser;

            // Expenses are strictly negative in the legacy system logic (or positive 'Credit' category)
            // Depending on your 'Shifts' logic, expenses are usually summed up separately.

            await addDoc(collection(db, 'transactions'), {
                item: "Expenses", // Legacy indicator
                expenseType: expenseForm.description,
                total: Number(expenseForm.amount), // Shifts.jsx usually expects positive number for expenses and subtracts it
                price: Number(expenseForm.amount),
                quantity: 1,
                timestamp: serverTimestamp(),
                staffEmail: expenseForm.staffEmail || user?.email,
                category: 'Credit',
                financialCategory: 'OPEX', // Default to OPEX for quick expenses
                notes: "Quick Expense via POS"
            });

            setExpenseOpen(false);
            setExpenseForm({ description: '', amount: '', staffEmail: '' });
            showSnackbar?.("Expense recorded.", 'success');
        } catch (e) {
            console.error(e);
            showSnackbar?.("Failed to save expense.", 'error');
        }
    };

    // --- RENDER ---
    return (
        <Box sx={{ display: 'flex', height: '100%', bgcolor: '#f4f6f8' }}>

            {/* Hidden Receipt Component for Printing */}
            <SimpleReceipt order={printOrder} />

            {/* LEFT: Catalog (65%) */}
            <Box sx={{ flex: '65%', p: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                {/* Header with Expense Button */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5" fontWeight="bold">Menu</Typography>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<MoneyOffIcon />}
                        onClick={() => setExpenseOpen(true)}
                    >
                        Add Expense
                    </Button>
                </Box>

                {/* Categories / Grid */}
                <Grid container spacing={2}>
                    {services.map((item) => (
                        <Grid item xs={6} sm={4} md={3} key={item.id}>
                            <Card
                                sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                                onClick={() => addToCart(item)}
                            >
                                <CardActionArea sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                        {item.serviceName}
                                    </Typography>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Chip
                                            label={`₱${item.price}`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                        />
                                        {item.trackStock && item.type === 'retail' && (
                                            <Chip
                                                label={`${item.stockCount || 0} Left`}
                                                size="small"
                                                color={(item.stockCount || 0) <= (item.lowStockThreshold || 5) ? "error" : "default"}
                                                variant="filled"
                                            />
                                        )}
                                    </Stack>
                                </CardActionArea>
                            </Card>

                        </Grid>
                    ))}
                </Grid>
            </Box>

            {/* RIGHT: Cart / Ticket (35%) */}
            <Paper sx={{ flex: '35%', display: 'flex', flexDirection: 'column', borderRadius: 0, borderLeft: '1px solid #ddd' }}>

                {/* Order Tabs */}
                <Tabs
                    value={activeTab}
                    onChange={(e, v) => setActiveTab(v)}
                    variant="fullWidth"
                    indicatorColor="primary"
                    textColor="primary"
                    sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'white' }}
                >
                    <Tab label="Order 1" />
                    <Tab label="Order 2" />
                    <Tab label="Order 3" />
                </Tabs>

                {/* Customer Header */}
                <Box
                    sx={{ p: 2, bgcolor: '#fafafa', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => setCustomerOpen(true)}
                >
                    <PersonAddIcon sx={{ color: 'text.secondary', mr: 1 }} />
                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                        {currentOrder.customer ? currentOrder.customer.fullName : "Select Customer (Walk-in)"}
                    </Typography>
                    <Typography variant="caption" color="primary">CHANGE</Typography>
                </Box>

                {/* Cart Items List */}
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    <List dense>
                        {currentOrder.items.length === 0 && (
                            <Box sx={{ p: 4, textAlign: 'center', opacity: 0.5 }}>
                                <ReceiptIcon sx={{ fontSize: 40, mb: 1 }} />
                                <Typography>Order is empty</Typography>
                            </Box>
                        )}
                        {currentOrder.items.map((item) => (
                            <React.Fragment key={item.id}>
                                <ListItem
                                    secondaryAction={
                                        <IconButton edge="end" size="small" onClick={() => removeFromCart(item.id)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    }
                                >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '90%' }}>
                                            <Typography variant="body2" fontWeight="bold">{item.serviceName}</Typography>
                                            <Typography variant="body2">₱{(item.price * item.quantity).toFixed(2)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                            <IconButton size="small" onClick={() => adjustQty(item.id, -1)}>
                                                <RemoveIcon fontSize="inherit" />
                                            </IconButton>
                                            <Typography variant="body2" sx={{ mx: 1, minWidth: 20, textAlign: 'center' }}>
                                                {item.quantity}
                                            </Typography>
                                            <IconButton size="small" onClick={() => adjustQty(item.id, 1)}>
                                                <AddIcon fontSize="inherit" />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                </ListItem>
                                <Divider />
                            </React.Fragment>
                        ))}
                    </List>
                </Box>

                {/* Footer actions */}
                <Box sx={{ p: 2, bgcolor: 'white', borderTop: '1px solid #ddd' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">Total</Typography>
                        <Typography variant="h5" fontWeight="bold" color="primary">
                            ₱{currentTotal.toFixed(2)}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="outlined"
                            color="error"
                            onClick={clearCurrentOrder}
                            disabled={currentOrder.items.length === 0}
                        >
                            Clear
                        </Button>
                        <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={currentOrder.items.length === 0}
                            onClick={() => setCheckoutOpen(true)}
                        >
                            CHARGE
                        </Button>
                    </Stack>
                </Box>
            </Paper>

            {/* --- DIALOGS --- */}

            {/* Customer Picker */}
            <CustomerDialog
                open={customerOpen}
                onClose={() => setCustomerOpen(false)}
                onSelectCustomer={(cust) => {
                    updateOrder(activeTab, { customer: cust });
                    setCustomerOpen(false);
                }}
            />

            {/* Checkout Payment */}
            <CheckoutDialog
                open={checkoutOpen}
                onClose={() => setCheckoutOpen(false)}
                total={currentTotal}
                onConfirm={handleCheckout}
            />

            {/* Change Display */}
            <ChangeDisplayDialog
                open={changeDialogOpen}
                onClose={() => setChangeDialogOpen(false)}
                change={lastChange}
            />

            {/* Expense Entry */}
            <Dialog open={expenseOpen} onClose={() => setExpenseOpen(false)}>
                <DialogTitle>Quick Expense</DialogTitle>
                <DialogContent sx={{ pt: 1, minWidth: 300 }}>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Description (e.g., Ice, Transpo)"
                            fullWidth
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                        />
                        <TextField
                            label="Amount"
                            type="number"
                            fullWidth
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Staff (Optional)</InputLabel>
                            <Select
                                value={expenseForm.staffEmail}
                                label="Staff (Optional)"
                                onChange={(e) => setExpenseForm({ ...expenseForm, staffEmail: e.target.value })}
                            >
                                <MenuItem value=""><em>Me ({auth.currentUser?.email})</em></MenuItem>
                                {staffOptions.map(s => (
                                    <MenuItem key={s.email} value={s.email}>{s.fullName}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExpenseOpen(false)}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={handleQuickExpense}>Record Expense</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}