import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, IconButton, Stack, TextField, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, Tooltip, FormControl, InputLabel, Select,
    MenuItem, useMediaQuery, Divider, InputAdornment, Autocomplete
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
    collection, query, orderBy, limit, getDocs, startAfter, where,
    doc, getDoc, writeBatch, serverTimestamp, onSnapshot, deleteField
} from 'firebase/firestore';
import { db } from '../firebase';
import { generateBatchIds } from '../utils/idGenerator';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BlockIcon from '@mui/icons-material/Block';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import DeleteIcon from '@mui/icons-material/Delete';

// Components & Helpers
import LoadingScreen from './common/LoadingScreen';
import PageHeader from './common/PageHeader';
import { SimpleReceipt } from './SimpleReceipt';
import { ServiceInvoice } from './ServiceInvoice';
import { normalizeReceiptData, safePrint } from '../utils/receiptHelper';
import { normalizeInvoiceData, safePrintInvoice } from '../utils/invoiceHelper';
import ConfirmationReasonDialog from './ConfirmationReasonDialog';

const currency = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDateTime = (ts) => {
    if (!ts) return "---";
    let d;
    if (ts.seconds) d = new Date(ts.seconds * 1000);
    else if (ts instanceof Date) d = ts;
    else d = new Date(ts);
    return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

export default function OrderManagement({ showSnackbar }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Logic State
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [users, setUsers] = useState({}); // {email: fullName}
    const [systemSettings, setSystemSettings] = useState({});
    const [services, setServices] = useState([]); // List of products/services for selection

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [staffFilter, setStaffFilter] = useState('ALL');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    // Dialogs
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [voidDialogOpen, setVoidDialogOpen] = useState(false);
    const [orderToVoid, setOrderToVoid] = useState(null);

    // RESTORE STATE
    const [orderToRestore, setOrderToRestore] = useState(null);
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

    // Printing
    const [reprintOrder, setReprintOrder] = useState(null);
    const [printInvoiceData, setPrintInvoiceData] = useState(null);

    // Editing
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [editForm, setEditForm] = useState({
        customerName: '',
        paymentMethod: '',
        amountTendered: 0,
        editReason: ''
    });

    // 1. Initial Load: Users & Settings
    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
            const map = {};
            snap.forEach(d => {
                const u = d.data();
                map[u.email] = u.fullName || u.name || u.email;
            });
            setUsers(map);
        });

        const unsubServices = onSnapshot(query(collection(db, "services"), orderBy('sortOrder')), (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const expenseParent = items.find(i => i.serviceName === "Expenses");
            const expenseParentId = expenseParent ? expenseParent.id : null;

            // Filter out expenses and hidden/internal items (Exact POS logic)
            let list = items.filter(i =>
                i.active &&
                i.category !== 'Credit' &&
                i.serviceName !== 'New Debt' &&
                i.serviceName !== 'Paid Debt' &&
                i.id !== expenseParentId &&
                i.parentServiceId !== expenseParentId &&
                i.adminOnly === false
            );

            // Add PC Rental hardcoded if not present (User's prioritization request)
            if (!list.find(s => s.serviceName === 'PC Rental')) {
                list.push({ id: 'pcrental_hc', serviceName: 'PC Rental', price: 0 });
            }

            // Prioritize PC Rental
            list.sort((a, b) => {
                if (a.serviceName === 'PC Rental') return -1;
                if (b.serviceName === 'PC Rental') return 1;
                return 0; // Keep Firestore sortOrder for others
            });

            setServices(list);
        });

        getDoc(doc(db, 'settings', 'config')).then(snap => {
            if (snap.exists()) setSystemSettings(snap.data());
        });

        return () => {
            unsubUsers();
            unsubServices();
        };
    }, []);

    // 2. Fetch Orders Logic
    const fetchOrders = async (isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        else setLoadingMore(true);

        try {
            let q = query(
                collection(db, "orders"),
                orderBy("timestamp", "desc"),
                limit(50)
            );

            // Apply basic filters if any
            // Note: Firestore doesn't support complex substring search like 'searchTerm'
            // We'll filter searchTerm in memory for simplicity unless it's a specific Order No.
            if (statusFilter !== 'ALL') {
                q = query(q, where("status", "==", statusFilter));
            }

            if (isLoadMore && lastDoc) {
                q = query(q, startAfter(lastDoc));
            }

            const snap = await getDocs(q);
            const newOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (isLoadMore) {
                setOrders(prev => [...prev, ...newOrders]);
            } else {
                setOrders(newOrders);
            }

            if (snap.docs.length < 50) setHasMore(false);
            else {
                setHasMore(true);
                setLastDoc(snap.docs[snap.docs.length - 1]);
            }
        } catch (e) {
            console.error("Error fetching orders:", e);
            showSnackbar?.("Failed to load orders.", "error");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [statusFilter]); // Re-fetch on status change. Search/Date we might do manually or debounced.

    // 3. Search & In-Memory Filtering
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            // 1. Search
            const search = searchTerm.toLowerCase().trim();
            const matchesSearch = !search ||
                String(o.orderNumber || "").toLowerCase().includes(search) ||
                String(o.customerName || "").toLowerCase().includes(search);

            // 2. Staff Filter
            const matchesStaff = staffFilter === 'ALL' || o.staffEmail === staffFilter;

            // 3. Date Filter
            let matchesDate = true;
            if (o.timestamp) {
                const d = o.timestamp.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
                if (dateStart) {
                    const startAt = new Date(dateStart + "T00:00:00");
                    if (d < startAt) matchesDate = false;
                }
                if (dateEnd) {
                    const endAt = new Date(dateEnd + "T23:59:59");
                    if (d > endAt) matchesDate = false;
                }
            }

            return matchesSearch && matchesStaff && matchesDate;
        });
    }, [orders, searchTerm, staffFilter, dateStart, dateEnd]);

    // 4. Action Handlers
    const handleOpenDetails = (order) => {
        setSelectedOrder(order);
        setDetailsOpen(true);
    };

    const handleVoidOrder = (order) => {
        setOrderToVoid(order);
        setVoidDialogOpen(true);
    };

    const confirmVoid = async (reason) => {
        if (!orderToVoid) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);

            // Update Order
            const orderRef = doc(db, 'orders', orderToVoid.id);
            batch.update(orderRef, {
                isDeleted: true,
                status: 'VOIDED',
                voidReason: reason,
                voidedAt: serverTimestamp()
            });

            // Update associated transactions
            // We need to query transactions by orderNumber
            const q = query(collection(db, 'transactions'), where('orderNumber', '==', orderToVoid.orderNumber));
            const txSnap = await getDocs(q);
            txSnap.forEach(d => {
                batch.update(d.ref, {
                    isDeleted: true,
                    deleteReason: `Order Voided: ${reason}`,
                    deletedAt: serverTimestamp()
                });
            });

            await batch.commit();
            showSnackbar?.("Order successfully voided.", "success");

            // Update local state
            setOrders(prev => prev.map(o => o.id === orderToVoid.id ? { ...o, status: 'VOIDED', isDeleted: true } : o));
        } catch (e) {
            console.error("Void failed:", e);
            showSnackbar?.("Failed to void order.", "error");
        } finally {
            setLoading(false);
            setVoidDialogOpen(false);
        }
    };

    const handleRestoreOrder = (order) => {
        setOrderToRestore(order);
        setRestoreDialogOpen(true);
    };

    const confirmRestore = async (reason) => {
        if (!orderToRestore) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);

            // Update Order
            const orderRef = doc(db, 'orders', orderToRestore.id);
            batch.update(orderRef, {
                isDeleted: false,
                status: deleteField(),
                voidReason: deleteField(),
                voidedAt: deleteField(),
                restoredAt: serverTimestamp(),
                restoreReason: reason,
                restoredBy: user.email
            });

            // Update associated transactions
            const q = query(collection(db, 'transactions'), where('orderNumber', '==', orderToRestore.orderNumber));
            const txSnap = await getDocs(q);
            txSnap.forEach(d => {
                batch.update(d.ref, {
                    isDeleted: false,
                    restoreReason: `Order Restored: ${reason}`,
                    restoredAt: serverTimestamp()
                });
            });

            await batch.commit();
            showSnackbar?.("Order successfully restored.", "success");

            // Update local state
            setOrders(prev => prev.map(o => o.id === orderToRestore.id ? { ...o, status: null, isDeleted: false } : o));
        } catch (e) {
            console.error("Restore failed:", e);
            showSnackbar?.("Failed to restore order.", "error");
        } finally {
            setLoading(false);
            setRestoreDialogOpen(false);
        }
    };

    const handleEditOrder = (order) => {
        setEditingOrder(order);
        setEditItems([...(order.items || [])]);
        setEditForm({
            customerName: order.customerName || '',
            paymentMethod: order.paymentMethod || 'Cash',
            amountTendered: order.amountTendered || 0,
            editReason: ''
        });
        setEditDialogOpen(true);
    };

    const handleUpdateEditItem = (index, field, value) => {
        const newItems = [...editItems];
        const item = { ...newItems[index], [field]: value };

        // Recalculate total for this item
        if (field === 'price' || field === 'quantity' || field === 'isVoided') {
            const qty = Number(item.quantity) || 0;
            const prc = Number(item.price) || 0;
            item.total = item.isVoided ? 0 : qty * prc;
            item.subtotal = item.total;
        }

        newItems[index] = item;
        setEditItems(newItems);
    };

    const handleVoidEditItem = (index) => {
        const item = editItems[index];
        handleUpdateEditItem(index, 'isVoided', !item.isVoided);
    };

    const handleRemoveEditItem = (index) => {
        setEditItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddEditItem = () => {
        setEditItems(prev => [...prev, { name: 'New Item', quantity: 1, price: 0, total: 0 }]);
    };

    const saveEditOrder = async () => {
        if (!editingOrder || !editForm.editReason.trim()) {
            showSnackbar?.("Edit reason is required.", "warning");
            return;
        }

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const newTotal = editItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
            const amtTendered = Number(editForm.amountTendered) || 0;
            const newChange = Math.max(0, amtTendered - newTotal);

            // 1. Update Order Document
            const orderRef = doc(db, 'orders', editingOrder.id);
            const orderUpdate = {
                items: editItems,
                total: newTotal,
                amountTendered: amtTendered,
                change: newChange,
                customerName: editForm.customerName,
                paymentMethod: editForm.paymentMethod,
                isEdited: true,
                editReason: editForm.editReason,
                editedAt: serverTimestamp()
            };
            batch.update(orderRef, orderUpdate);

            // 2. Sync Transactions
            const q = query(collection(db, 'transactions'), where('orderNumber', '==', editingOrder.orderNumber));
            const txSnap = await getDocs(q);

            // Collect metadata from first existing transaction to preserve context (date, staff, etc)
            let baseTx = txSnap.docs.length > 0 ? txSnap.docs[0].data() : null;

            // Delete (Soft Delete) old transactions
            txSnap.forEach(d => {
                batch.update(d.ref, {
                    isDeleted: true,
                    deleteReason: `Order Edited: ${editForm.editReason}`,
                    replacedByEdit: true,
                    deletedAt: serverTimestamp()
                });
            });

            // Create new transactions
            const validItems = editItems.filter(item => !item.isVoided);
            const newTxs = [];
            const newIds = await generateBatchIds("transactions", "TX", validItems.length);

            validItems.forEach((item, idx) => {
                const txRef = doc(collection(db, 'transactions'));

                // Final sanitization of values
                const txQty = Number(item.quantity) || 0;
                const txPrice = Number(item.price) || 0;
                const txTotal = txQty * txPrice;

                batch.set(txRef, {
                    ...baseTx, // Preserve shiftId, staffEmail, timestamp, etc.
                    displayId: newIds[idx],
                    item: item.name || item.serviceName || 'Item',
                    quantity: txQty,
                    price: txPrice,
                    total: txTotal,
                    customerName: editForm.customerName || 'Walk-in',
                    paymentMethod: editForm.paymentMethod || 'Cash',
                    isEdited: true,
                    editReason: editForm.editReason || 'Administrative Edit',
                    orderId: editingOrder.id,
                    orderNumber: editingOrder.orderNumber,
                    timestamp: baseTx ? baseTx.timestamp : serverTimestamp(), // Keep original time
                    serverTime: serverTimestamp()
                });
            });

            await batch.commit();
            showSnackbar?.("Order updated successfully.", "success");
            setEditDialogOpen(false);
            fetchOrders(); // Refresh list
        } catch (e) {
            console.error("Save edit failed:", e);
            showSnackbar?.("Failed to update order.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handlePrintReceipt = (order) => {
        const data = normalizeReceiptData(order, {
            staffName: users[order.staffEmail] || 'Staff',
            isReprint: true
        });
        setReprintOrder(data);
    };

    const handlePrintInvoice = (order) => {
        const data = normalizeInvoiceData(order, {
            staffName: users[order.staffEmail] || 'Staff',
            isReprint: true
        });
        setPrintInvoiceData(data);
    };

    const isPrintingReprint = useRef(false);
    useEffect(() => {
        let timer;
        if (reprintOrder && !isPrintingReprint.current) {
            isPrintingReprint.current = true;
            timer = setTimeout(() => {
                safePrint(() => {
                    setReprintOrder(null);
                    isPrintingReprint.current = false;
                }, "OrderManagement");
            }, 500);
        }
        return () => clearTimeout(timer);
    }, [reprintOrder]);

    const isPrintingInvoice = useRef(false);
    useEffect(() => {
        let timer;
        if (printInvoiceData && !isPrintingInvoice.current) {
            isPrintingInvoice.current = true;
            console.log("[OrderManagement] Triggering Invoice Print for:", printInvoiceData.orderNumber);
            timer = setTimeout(() => {
                safePrintInvoice(() => {
                    setPrintInvoiceData(null);
                    isPrintingInvoice.current = false;
                }, "OrderManagement");
            }, 1000); // Increased delay for portal stability
        }
        return () => clearTimeout(timer);
    }, [printInvoiceData]);

    if (loading && orders.length === 0) return <LoadingScreen message="Loading orders..." />;

    return (
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>

            <PageHeader
                title="Order Management"
                subtitle="View, edit, and void customer orders."
                actions={<Button variant="contained" onClick={() => fetchOrders()}>Refresh List</Button>}
            />

            {/* Filter Controls */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
                    <TextField
                        size="small"
                        placeholder="Search Order # or Customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ flex: 1 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Stack direction="row" spacing={1}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={statusFilter}
                                label="Status"
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <MenuItem value="ALL">All Status</MenuItem>
                                <MenuItem value="PAID">Paid</MenuItem>
                                <MenuItem value="UNPAID">Unpaid</MenuItem>
                                <MenuItem value="VOIDED">Voided</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Cashier</InputLabel>
                            <Select
                                value={staffFilter}
                                label="Cashier"
                                onChange={(e) => setStaffFilter(e.target.value)}
                            >
                                <MenuItem value="ALL">All Staff</MenuItem>
                                {Object.entries(users).map(([email, name]) => (
                                    <MenuItem key={email} value={email}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            size="small"
                            type="date"
                            label="Start"
                            InputLabelProps={{ shrink: true }}
                            value={dateStart}
                            onChange={(e) => setDateStart(e.target.value)}
                        />
                        <TextField
                            size="small"
                            type="date"
                            label="End"
                            InputLabelProps={{ shrink: true }}
                            value={dateEnd}
                            onChange={(e) => setDateEnd(e.target.value)}
                        />

                        {(searchTerm || statusFilter !== 'ALL' || staffFilter !== 'ALL' || dateStart || dateEnd) && (
                            <IconButton onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setStaffFilter('ALL'); setDateStart(''); setDateEnd(''); }}>
                                <ClearIcon />
                            </IconButton>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            {/* Table Section */}
            <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', width: 80 }}>Order #</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Method</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Cashier</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredOrders.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                                    <Typography color="text.secondary">No orders found.</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredOrders.map((o) => (
                                <TableRow key={o.id} hover sx={{ opacity: o.status === 'VOIDED' ? 0.6 : 1 }}>
                                    <TableCell sx={{ fontWeight: 600 }}>{o.orderNumber}</TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 400,
                                                color: o.status === 'VOIDED' ? 'error.main' :
                                                    o.paymentMethod === 'Charge' ? 'warning.main' : 'success.main'
                                            }}
                                        >
                                            {o.status === 'VOIDED' ? 'Voided' : o.paymentMethod === 'Charge' ? 'Unpaid' : ('Paid')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{o.customerName || 'Walk-in'}</TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(o.timestamp)}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{currency(o.total)}</TableCell>
                                    <TableCell>{o.paymentMethod || 'Cash'}</TableCell>
                                    <TableCell>{users[o.staffEmail] || '---'}</TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                            <Tooltip title="View Details">
                                                <IconButton size="small" onClick={() => handleOpenDetails(o)}>
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Print Receipt">
                                                <IconButton size="small" onClick={() => handlePrintReceipt(o)}>
                                                    <ReceiptIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Print Invoice">
                                                <IconButton size="small" onClick={() => handlePrintInvoice(o)}>
                                                    <PrintIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            {o.status !== 'VOIDED' && (
                                                <>
                                                    <Tooltip title="Edit Order">
                                                        <IconButton size="small" color="primary" onClick={() => handleEditOrder(o)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Void Order">
                                                        <IconButton size="small" color="error" onClick={() => handleVoidOrder(o)}>
                                                            <BlockIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}
                                            {o.status === 'VOIDED' && (
                                                <Tooltip title="Restore Order">
                                                    <IconButton size="small" color="success" onClick={() => handleRestoreOrder(o)}>
                                                        <RestoreFromTrashIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {hasMore && !searchTerm && !dateStart && !dateEnd && (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Button
                            variant="outlined"
                            onClick={() => fetchOrders(true)}
                            disabled={loadingMore}
                        >
                            {loadingMore ? 'Loading...' : 'Load More Orders'}
                        </Button>
                    </Box>
                )}
            </TableContainer>

            {/* Details Dialog */}
            <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h6">Order {selectedOrder?.orderNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {fmtDateTime(selectedOrder?.timestamp)}
                        </Typography>
                    </Box>
                    {selectedOrder?.status === 'VOIDED' && (
                        <Typography color="error" variant="caption" fontWeight="bold">VOIDED</Typography>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Item</TableCell>
                                <TableCell align="right" width={60}>Qty</TableCell>
                                <TableCell align="right">Price</TableCell>
                                <TableCell align="right">Total</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {selectedOrder?.items?.map((item, idx) => (
                                <TableRow key={idx} sx={{ opacity: item.isVoided ? 0.4 : 1 }}>
                                    <TableCell sx={{ textDecoration: item.isVoided ? 'line-through' : 'none' }}>
                                        {item.name || item.serviceName}
                                        {item.isVoided && <Typography variant="caption" color="error" sx={{ ml: 1 }}>(Voided)</Typography>}
                                    </TableCell>
                                    <TableCell align="right">{item.quantity}</TableCell>
                                    <TableCell align="right">{currency(item.price)}</TableCell>
                                    <TableCell align="right">{currency(item.total)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="caption" color="primary" fontWeight="bold" sx={{ mb: 1, display: 'block', textTransform: 'uppercase' }}>
                            Order Details & Payment
                        </Typography>
                        <Stack spacing={1.5}>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">Staff / Cashier:</Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {users[selectedOrder?.staffEmail] || '---'}
                                </Typography>
                            </Box>

                            <Divider sx={{ borderStyle: 'dashed' }} />

                            <Box>
                                <Typography variant="caption" color="text.secondary" display="block">Customer Info:</Typography>
                                <Typography variant="body2" fontWeight="bold">{selectedOrder?.customerName || 'Walk-in'}</Typography>
                                {selectedOrder?.customerPhone && (
                                    <Typography variant="caption" display="block">Phone: {selectedOrder.customerPhone}</Typography>
                                )}
                                {selectedOrder?.customerAddress && (
                                    <Typography variant="caption" display="block">Addr: {selectedOrder.customerAddress}</Typography>
                                )}
                                {selectedOrder?.customerTin && (
                                    <Typography variant="caption" display="block">TIN: {selectedOrder.customerTin}</Typography>
                                )}
                            </Box>

                            <Divider sx={{ borderStyle: 'dashed' }} />

                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">Payment Method:</Typography>
                                <Typography variant="body2" fontWeight="bold" color="primary">
                                    {selectedOrder?.paymentMethod === 'Charge' ? 'UNPAID (Charge)' : selectedOrder?.paymentMethod}
                                </Typography>
                            </Box>

                            {selectedOrder?.paymentMethod === 'GCash' && selectedOrder?.gcashRef && (
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2" color="text.secondary">GCash Ref:</Typography>
                                    <Typography variant="body2" fontWeight="bold">{selectedOrder.gcashRef}</Typography>
                                </Box>
                            )}

                            <Box display="flex" justifyContent="space-between" sx={{ pt: 1 }}>
                                <Typography variant="subtitle1" fontWeight="bold">Total Amount:</Typography>
                                <Typography variant="subtitle1" fontWeight="bold" color="primary">{currency(selectedOrder?.total)}</Typography>
                            </Box>

                            {selectedOrder?.amountTendered > 0 && (
                                <>
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Amount Tendered:</Typography>
                                        <Typography variant="body2">{currency(selectedOrder.amountTendered)}</Typography>
                                    </Box>
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Change:</Typography>
                                        <Typography variant="body2">{currency(selectedOrder.change)}</Typography>
                                    </Box>
                                </>
                            )}

                            {selectedOrder?.status === 'VOIDED' && (
                                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                    <Typography variant="caption" color="error" display="block" fontWeight="bold">VOID REASON:</Typography>
                                    <Typography variant="body2" color="error" sx={{ fontStyle: 'italic' }}>
                                        {selectedOrder?.voidReason || "No reason provided."}
                                    </Typography>
                                    <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                                        Voided on: {fmtDateTime(selectedOrder?.voidedAt)}
                                    </Typography>
                                </Box>
                            )}

                            {selectedOrder?.isEdited && (
                                <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider', opacity: 0.8 }}>
                                    <Typography variant="caption" color="warning.main" display="block" fontWeight="bold">EDIT HISTORY:</Typography>
                                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                        Reason: {selectedOrder?.editReason || "Modified by admin."}
                                    </Typography>
                                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                                        Last Edited: {fmtDateTime(selectedOrder?.editedAt)}
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                    <Button startIcon={<ReceiptIcon />} onClick={() => handlePrintReceipt(selectedOrder)}>Print Receipt</Button>
                    {selectedOrder?.status !== 'VOIDED' && (
                        <Button startIcon={<EditIcon />} color="primary" onClick={() => { setDetailsOpen(false); handleEditOrder(selectedOrder); }}>
                            Edit Order
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Confirmation Dialog for Void */}
            <ConfirmationReasonDialog
                open={voidDialogOpen}
                onClose={() => setVoidDialogOpen(false)}
                onConfirm={confirmVoid}
                title="Void Order"
                message={`Are you sure you want to void Order #${orderToVoid?.orderNumber}? This will also delete all associated transactions and is irreversible.`}
            />

            {/* Confirmation Dialog for Restore */}
            <ConfirmationReasonDialog
                open={restoreDialogOpen}
                onClose={() => setRestoreDialogOpen(false)}
                onConfirm={confirmRestore}
                title="Restore Order"
                message={`Are you sure you want to restore Order #${orderToRestore?.orderNumber}? All associated transactions will also be restored.`}
                confirmColor="success"
                confirmText="Restore"
            />

            {/* Hidden Print Elements */}
            {reprintOrder && (
                <SimpleReceipt
                    order={reprintOrder}
                    settings={systemSettings}
                    staffName={users[reprintOrder.staffEmail]}
                />
            )}
            {printInvoiceData && (
                <ServiceInvoice
                    order={printInvoiceData}
                    settings={systemSettings}
                />
            )}

            {/* Edit Order Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Edit Order #{editingOrder?.orderNumber}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={3}>
                        {/* BASIC INFO */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            <TextField
                                label="Customer Name"
                                fullWidth
                                value={editForm.customerName}
                                onChange={(e) => setEditForm(prev => ({ ...prev, customerName: e.target.value }))}
                            />
                            <FormControl fullWidth>
                                <InputLabel>Payment Method</InputLabel>
                                <Select
                                    value={editForm.paymentMethod}
                                    label="Payment Method"
                                    onChange={(e) => setEditForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                >
                                    <MenuItem value="Cash">Cash</MenuItem>
                                    <MenuItem value="GCash">GCash</MenuItem>
                                    <MenuItem value="Charge">Charge (Debt)</MenuItem>
                                </Select>
                            </FormControl>
                            {editForm.paymentMethod === 'Cash' && (
                                <TextField
                                    label="Amount Tendered"
                                    type="number"
                                    fullWidth
                                    value={editForm.amountTendered}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, amountTendered: e.target.value }))}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                                    }}
                                />
                            )}
                        </Box>

                        <Divider>Items</Divider>

                        {/* ITEMS TABLE */}
                        <TableContainer sx={{ maxHeight: 300 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item Name</TableCell>
                                        <TableCell align="right" width={80}>Qty</TableCell>
                                        <TableCell align="right" width={110}>Price</TableCell>
                                        <TableCell align="right" width={110}>Total</TableCell>
                                        <TableCell align="right" width={100}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {editItems.map((item, idx) => (
                                        <TableRow key={idx} sx={{ opacity: item.isVoided ? 0.4 : 1 }}>
                                            <TableCell>
                                                <Autocomplete
                                                    size="small"
                                                    freeSolo
                                                    options={services.map(s => s.serviceName)}
                                                    value={item.name}
                                                    onChange={(e, newValue) => {
                                                        const svc = services.find(s => s.serviceName === newValue);
                                                        handleUpdateEditItem(idx, 'name', newValue || '');
                                                        if (svc && svc.price) {
                                                            handleUpdateEditItem(idx, 'price', svc.price);
                                                        }
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label="Item / Service"
                                                            onChange={(e) => handleUpdateEditItem(idx, 'name', e.target.value)}
                                                            sx={{ textDecoration: item.isVoided ? 'line-through' : 'none' }}
                                                        />
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateEditItem(idx, 'quantity', e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={item.price}
                                                    onChange={(e) => handleUpdateEditItem(idx, 'price', e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                {currency(item.total)}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title={item.isVoided ? "Unvoid Item" : "Void Item"}>
                                                        <IconButton size="small" onClick={() => handleVoidEditItem(idx)}>
                                                            {item.isVoided ? (
                                                                <RestoreFromTrashIcon fontSize="small" color="success" />
                                                            ) : (
                                                                <BlockIcon fontSize="small" color="error" />
                                                            )}
                                                        </IconButton>
                                                    </Tooltip>
                                                    <IconButton size="small" onClick={() => handleRemoveEditItem(idx)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Button startIcon={<AddIcon />} onClick={handleAddEditItem}>
                            Add Item
                        </Button>

                        <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, textAlign: 'right' }}>
                            <Typography variant="h6" fontWeight="bold">
                                New Total: {currency(editItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0))}
                            </Typography>
                        </Box>

                        <Divider>Audit Trail</Divider>

                        <TextField
                            label="Reason for Edit (Required)"
                            fullWidth
                            multiline
                            rows={2}
                            placeholder="e.g., Corrected quantity, Changed payment method..."
                            value={editForm.editReason}
                            onChange={(e) => setEditForm(prev => ({ ...prev, editReason: e.target.value }))}
                            required
                            error={!editForm.editReason.trim() && editForm.editReason.length > 0}
                            helperText={!editForm.editReason.trim() ? "A reason is required to save changes." : ""}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<SaveIcon />}
                        onClick={saveEditOrder}
                        disabled={!editForm.editReason.trim()}
                    >
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
