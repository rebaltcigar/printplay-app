import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, IconButton, Stack, TextField, Button, Chip, Tooltip,
    FormControl, InputLabel, Select, MenuItem, useMediaQuery, Divider,
    InputAdornment, Autocomplete
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
    collection, query, orderBy, limit, getDocs, startAfter, where,
    doc, getDoc, writeBatch, serverTimestamp, deleteField
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { generateBatchIds } from '../services/orderService';

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
import SummaryCards from './common/SummaryCards';
import DetailDrawer from './common/DetailDrawer';
import { SimpleReceipt } from './SimpleReceipt';
import { ServiceInvoice } from './ServiceInvoice';
import { normalizeReceiptData, normalizeInvoiceData, safePrint, safePrintInvoice } from '../services/printService';
import ConfirmationReasonDialog from './ConfirmationReasonDialog';
import { fmtCurrency as currency, fmtDateTime, toDatetimeLocal } from '../utils/formatters';
import { usePOSServices } from '../hooks/usePOSServices';
import { useStaffList } from '../hooks/useStaffList';

export default function OrderManagement({ showSnackbar }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Logic State
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [systemSettings, setSystemSettings] = useState({});

    // Services and staff from shared hooks
    const { serviceList: services } = usePOSServices();
    const { userMap: users } = useStaffList();

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [staffFilter, setStaffFilter] = useState('ALL');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    // Unified drawer state — mode: 'view' | 'edit'
    const [orderDrawer, setOrderDrawer] = useState({ open: false, mode: null, order: null, saving: false });

    const openViewDrawer = (order) => setOrderDrawer({ open: true, mode: 'view', order, saving: false });
    const openEditDrawer = (order) => {
        // Robust mapping of items to handle legacy field names and missing data
        const items = (order.items || []).map(i => {
            const qty = i.quantity ?? i.qty ?? i.itemQuantity ?? i.item_quantity ?? i.itemQty ?? 1;
            const price = i.price ?? i.unitPrice ?? 0;
            const total = i.total ?? i.subtotal ?? (Number(qty) * Number(price));
            
            return {
                ...i,
                name: i.name || i.serviceName || i.item || 'Item',
                quantity: Number(qty),
                price: Number(price),
                total: Number(total)
            };
        });
        setEditItems(items);

        const ts = order.timestamp || order.createdAt || order.serverTime;
        setEditForm({
            customerName: order.customerName || '',
            paymentMethod: order.paymentMethod || 'Cash',
            amountTendered: order.amountTendered || 0,
            timestamp: toDatetimeLocal(ts),
            editReason: ''
        });
        setOrderDrawer({ open: true, mode: 'edit', order, saving: false });
    };
    const closeDrawer = () => setOrderDrawer({ open: false, mode: null, order: null, saving: false });

    // Void / Restore confirmations (stay as lightweight dialogs)
    const [voidDialogOpen, setVoidDialogOpen] = useState(false);
    const [orderToVoid, setOrderToVoid] = useState(null);
    const [orderToRestore, setOrderToRestore] = useState(null);
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

    // Printing
    const [reprintOrder, setReprintOrder] = useState(null);
    const [printInvoiceData, setPrintInvoiceData] = useState(null);

    // Edit form state
    const [editItems, setEditItems] = useState([]);
    const [editForm, setEditForm] = useState({
        customerName: '',
        paymentMethod: '',
        amountTendered: 0,
        timestamp: '',
        editReason: ''
    });
    // Load settings
    useEffect(() => {
        getDoc(doc(db, 'settings', 'config')).then(snap => {
            if (snap.exists()) setSystemSettings(snap.data());
        });
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
                restoredBy: auth.currentUser?.email || 'admin'
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

    const handleEditOrder = (order) => openEditDrawer(order);

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
        const editingOrder = orderDrawer.order;
        if (!editingOrder || !editForm.editReason.trim()) {
            showSnackbar?.("Edit reason is required.", "warning");
            return;
        }

        setOrderDrawer(p => ({ ...p, saving: true }));
        try {
            const batch = writeBatch(db);
            const newTotal = editItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
            const amtTendered = Number(editForm.amountTendered) || 0;
            const newChange = Math.max(0, amtTendered - newTotal);

            const newTimestamp = editForm.timestamp ? new Date(editForm.timestamp) : serverTimestamp();

            // 1. Update Order Document
            const orderRef = doc(db, 'orders', editingOrder.id);
            const orderUpdate = {
                items: editItems,
                total: newTotal,
                amountTendered: amtTendered,
                change: newChange,
                customerName: editForm.customerName,
                paymentMethod: editForm.paymentMethod,
                timestamp: newTimestamp, // Allow editing time
                isEdited: true,
                editReason: editForm.editReason,
                editedAt: serverTimestamp()
            };
            batch.update(orderRef, orderUpdate);

            // 2. Sync Transactions
            const q = query(collection(db, 'transactions'), where('orderNumber', '==', editingOrder.orderNumber));
            const txSnap = await getDocs(q);

            // Collect metadata from first ACTIVE (non-deleted) transaction to preserve shiftId, staffEmail, etc.
            // We must skip soft-deleted docs so a re-edit doesn't inherit isDeleted: true into new transactions.
            let rawBaseTx = null;
            for (const d of txSnap.docs) {
                const data = d.data();
                if (!data.isDeleted) { rawBaseTx = data; break; }
            }
            if (!rawBaseTx && txSnap.docs.length > 0) rawBaseTx = txSnap.docs[0].data();

            // Strip soft-delete markers and timestamp fields we set explicitly, so they don't leak into new docs.
            const {
                isDeleted: _isDeleted,
                deletedAt: _deletedAt,
                deleteReason: _deleteReason,
                replacedByEdit: _replacedByEdit,
                timestamp: _oldTs,
                serverTime: _oldServerTime,
                ...cleanBaseTx
            } = rawBaseTx || {};

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
                    ...cleanBaseTx, // Preserve shiftId, staffEmail, etc. (soft-delete fields stripped above)
                    displayId: newIds[idx],
                    item: item.name || item.serviceName || 'Item',
                    quantity: txQty,
                    price: txPrice,
                    total: txTotal,
                    customerName: editForm.customerName || 'Walk-in',
                    paymentMethod: editForm.paymentMethod || 'Cash',
                    isEdited: true,
                    isDeleted: false,
                    editReason: editForm.editReason || 'Administrative Edit',
                    orderId: editingOrder.id,
                    orderNumber: editingOrder.orderNumber,
                    timestamp: newTimestamp, // Reflects the updated order date/time
                    serverTime: serverTimestamp()
                });
            });

            await batch.commit();
            showSnackbar?.("Order updated successfully.", "success");
            closeDrawer();
            fetchOrders();
        } catch (e) {
            console.error("Save edit failed:", e);
            showSnackbar?.("Failed to update order.", "error");
        } finally {
            setOrderDrawer(p => ({ ...p, saving: false }));
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

    // Summary card data
    const summaryData = useMemo(() => {
        const revenue = filteredOrders
            .filter(o => o.status !== 'VOIDED')
            .reduce((s, o) => s + Number(o.total || 0), 0);
        const unpaid = filteredOrders.filter(o => o.paymentMethod === 'Charge' && o.status !== 'VOIDED').length;
        const voided = filteredOrders.filter(o => o.status === 'VOIDED').length;
        return { revenue, unpaid, voided };
    }, [filteredOrders]);

    if (loading && orders.length === 0) return <LoadingScreen message="Loading orders..." />;

    return (
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>

            <PageHeader
                title="Order Management"
                subtitle="View, edit, and void customer orders."
                actions={<Button variant="contained" onClick={() => fetchOrders()}>Refresh List</Button>}
            />

            <SummaryCards
                loading={loading && orders.length === 0}
                cards={[
                    { label: "Orders", value: String(filteredOrders.length), sub: "in current filter" },
                    { label: "Revenue", value: currency(summaryData.revenue), color: "success.main", highlight: true },
                    { label: "Unpaid / Charge", value: String(summaryData.unpaid), color: summaryData.unpaid > 0 ? "warning.main" : "text.secondary" },
                    { label: "Voided", value: String(summaryData.voided), color: summaryData.voided > 0 ? "error.main" : "text.secondary" },
                ]}
                sx={{ mb: 2 }}
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
                                                <IconButton size="small" onClick={() => openViewDrawer(o)}>
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

            {/* ── Order Drawer (View + Edit) ─────────────────────────────────────── */}
            <DetailDrawer
                open={orderDrawer.open}
                onClose={closeDrawer}
                disableClose={orderDrawer.saving}
                loading={orderDrawer.saving}
                title={
                    orderDrawer.mode === 'edit'
                        ? `Edit Order ${orderDrawer.order?.orderNumber}`
                        : `Order ${orderDrawer.order?.orderNumber}`
                }
                subtitle={
                    orderDrawer.mode === 'view'
                        ? fmtDateTime(orderDrawer.order?.timestamp)
                        : undefined
                }
                width={620}
                actions={
                    orderDrawer.mode === 'view' ? (
                        <>
                            <Button size="small" startIcon={<ReceiptIcon />} onClick={() => handlePrintReceipt(orderDrawer.order)}>Receipt</Button>
                            <Button size="small" startIcon={<PrintIcon />} onClick={() => handlePrintInvoice(orderDrawer.order)}>Invoice</Button>
                            {orderDrawer.order?.status !== 'VOIDED' && (
                                <Button size="small" variant="contained" startIcon={<EditIcon />} onClick={() => openEditDrawer(orderDrawer.order)}>
                                    Edit Order
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Button size="small" onClick={closeDrawer} disabled={orderDrawer.saving}>Cancel</Button>
                            <Button
                                size="small"
                                variant="contained"
                                startIcon={<SaveIcon />}
                                onClick={saveEditOrder}
                                disabled={!editForm.editReason.trim() || orderDrawer.saving}
                            >
                                Save Changes
                            </Button>
                        </>
                    )
                }
            >
                {/* View mode content */}
                {orderDrawer.mode === 'view' && orderDrawer.order && (() => {
                    const o = orderDrawer.order;
                    return (
                        <Stack spacing={2}>
                            {o.status === 'VOIDED' && (
                                <Chip label="VOIDED" color="error" size="small" sx={{ alignSelf: 'flex-start' }} />
                            )}
                            <TableContainer component={Paper} variant="outlined">
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
                                        {o.items?.map((item, idx) => (
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
                            </TableContainer>

                            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                <Stack spacing={1.5}>
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Cashier:</Typography>
                                        <Typography variant="body2" fontWeight="bold">{users[o.staffEmail] || '---'}</Typography>
                                    </Box>
                                    <Divider sx={{ borderStyle: 'dashed' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block">Customer:</Typography>
                                        <Typography variant="body2" fontWeight="bold">{o.customerName || 'Walk-in'}</Typography>
                                        {o.customerPhone && <Typography variant="caption" display="block">Phone: {o.customerPhone}</Typography>}
                                        {o.customerAddress && <Typography variant="caption" display="block">Addr: {o.customerAddress}</Typography>}
                                        {o.customerTin && <Typography variant="caption" display="block">TIN: {o.customerTin}</Typography>}
                                    </Box>
                                    <Divider sx={{ borderStyle: 'dashed' }} />
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Payment:</Typography>
                                        <Typography variant="body2" fontWeight="bold" color="primary">
                                            {o.paymentMethod === 'Charge' ? 'UNPAID (Charge)' : o.paymentMethod}
                                        </Typography>
                                    </Box>
                                    {o.paymentMethod === 'GCash' && o.gcashRef && (
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="body2" color="text.secondary">GCash Ref:</Typography>
                                            <Typography variant="body2" fontWeight="bold">{o.gcashRef}</Typography>
                                        </Box>
                                    )}
                                    <Box display="flex" justifyContent="space-between" sx={{ pt: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold">Total:</Typography>
                                        <Typography variant="subtitle1" fontWeight="bold" color="primary">{currency(o.total)}</Typography>
                                    </Box>
                                    {o.amountTendered > 0 && (
                                        <>
                                            <Box display="flex" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">Tendered:</Typography>
                                                <Typography variant="body2">{currency(o.amountTendered)}</Typography>
                                            </Box>
                                            <Box display="flex" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">Change:</Typography>
                                                <Typography variant="body2">{currency(o.change)}</Typography>
                                            </Box>
                                        </>
                                    )}
                                </Stack>
                            </Box>

                            {o.status === 'VOIDED' && (
                                <Box sx={{ p: 2, bgcolor: 'error.main', opacity: 0.85, borderRadius: 1 }}>
                                    <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: '#fff' }}>VOID REASON</Typography>
                                    <Typography variant="body2" sx={{ color: '#fff', fontStyle: 'italic' }}>{o.voidReason || "No reason provided."}</Typography>
                                    <Typography variant="caption" sx={{ color: '#fff', opacity: 0.8 }} display="block">Voided: {fmtDateTime(o.voidedAt)}</Typography>
                                </Box>
                            )}

                            {o.isEdited && (
                                <Box sx={{ p: 2, bgcolor: 'warning.main', opacity: 0.85, borderRadius: 1 }}>
                                    <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: '#fff' }}>EDIT HISTORY</Typography>
                                    <Typography variant="body2" sx={{ color: '#fff', fontStyle: 'italic' }}>{o.editReason || "Modified by admin."}</Typography>
                                    <Typography variant="caption" sx={{ color: '#fff', opacity: 0.8 }} display="block">Edited: {fmtDateTime(o.editedAt)}</Typography>
                                </Box>
                            )}
                        </Stack>
                    );
                })()}

                {/* Edit mode content */}
                {orderDrawer.mode === 'edit' && (
                    <Stack spacing={3}>
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
                                    InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                                />
                            )}
                            <TextField
                                label="Order Date & Time"
                                type="datetime-local"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={editForm.timestamp}
                                onChange={(e) => setEditForm(prev => ({ ...prev, timestamp: e.target.value }))}
                            />
                        </Box>

                        <Divider>Items</Divider>

                        <TableContainer sx={{ maxHeight: 280 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item</TableCell>
                                        <TableCell align="right" width={70}>Qty</TableCell>
                                        <TableCell align="right" width={100}>Price</TableCell>
                                        <TableCell align="right" width={100}>Total</TableCell>
                                        <TableCell align="right" width={90}>Actions</TableCell>
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
                                                        if (svc && svc.price) handleUpdateEditItem(idx, 'price', svc.price);
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
                                                <TextField size="small" type="number" value={item.quantity} onChange={(e) => handleUpdateEditItem(idx, 'quantity', e.target.value)} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <TextField size="small" type="number" value={item.price} onChange={(e) => handleUpdateEditItem(idx, 'price', e.target.value)} />
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>{currency(item.total)}</TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title={item.isVoided ? "Unvoid Item" : "Void Item"}>
                                                        <IconButton size="small" onClick={() => handleVoidEditItem(idx)}>
                                                            {item.isVoided ? <RestoreFromTrashIcon fontSize="small" color="success" /> : <BlockIcon fontSize="small" color="error" />}
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

                        <Button startIcon={<AddIcon />} onClick={handleAddEditItem}>Add Item</Button>

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
                )}
            </DetailDrawer>

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

        </Box>
    );
}
