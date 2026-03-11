import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, IconButton, Stack, TextField, Button, Chip, Tooltip,
    FormControl, InputLabel, Select, MenuItem, useMediaQuery, Divider,
    InputAdornment, Autocomplete
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { supabase } from '../supabase';

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
import { fmtCurrency as currency, fmtDateTime } from '../utils/formatters';
import { usePOSServices } from '../hooks/usePOSServices';
import { useStaff } from '../contexts/StaffContext';
import { generateUUID } from '../utils/uuid';


export default function OrderManagement({ showSnackbar }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Logic State
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastOffset, setLastOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [systemSettings, setSystemSettings] = useState({});

    // Services and staff from shared context providers
    const { serviceList: services } = usePOSServices();
    const { userMap: users } = useStaff();

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [staffFilter, setStaffFilter] = useState('ALL');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    // Unified drawer state — mode: 'view' | 'edit'
    const [orderDrawer, setOrderDrawer] = useState({ open: false, mode: null, order: null, saving: false });
    const [drawerItems, setDrawerItems] = useState([]);

    const openViewDrawer = async (order) => {
        setOrderDrawer({ open: true, mode: 'view', order, saving: false });
        const { data } = await supabase
            .from('order_items')
            .select('*')
            .eq('parent_order_id', order.id)
            .eq('is_deleted', false);
        if (data) setDrawerItems(data);
    };
    const openEditDrawer = (order) => {
        setEditItems(drawerItems.map(i => ({ ...i, name: i.name, price: i.price, quantity: i.quantity, total: i.amount })));
        setEditForm({
            customerName: order.customer_name || '',
            paymentMethod: order.payment_method || 'Cash',
            amountTendered: order.amount_tendered || 0,
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
        editReason: ''
    });

    // Load settings
    useEffect(() => {
        const loadSettings = async () => {
            const { data: settingsData } = await supabase
                .from('settings')
                .select('*')
                .eq('id', 'config')
                .single();
            if (settingsData) setSystemSettings(settingsData);
        };
        loadSettings();
    }, []);


    // 2. Fetch Orders Logic
    const fetchOrders = async (isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        else setLoadingMore(true);

        try {
            const offset = isLoadMore ? lastOffset : 0;

            let q = supabase
                .from('orders')
                .select('*')
                .order('timestamp', { ascending: false })
                .range(offset, offset + 49);

            if (statusFilter !== 'ALL') {
                q = q.eq('status', statusFilter);
            }

            const { data: newOrders, error } = await q;

            if (error) throw error;

            if (isLoadMore) {
                setOrders(prev => [...prev, ...(newOrders || [])]);
            } else {
                setOrders(newOrders || []);
            }

            const fetched = newOrders?.length || 0;
            if (fetched < 50) setHasMore(false);
            else {
                setHasMore(true);
                setLastOffset(offset + fetched);
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
        setLastOffset(0);
        fetchOrders();
    }, [statusFilter]); // Re-fetch on status change. Search/Date we might do manually or debounced.

    // Realtime: new/updated/voided orders appear instantly without manual refresh
    useEffect(() => {
        const channel = supabase.channel('order-management-orders')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                const newOrder = payload.new;
                if (statusFilter !== 'ALL' && newOrder.status !== statusFilter) return;
                setOrders(prev => [newOrder, ...prev]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;
                setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
                setOrders(prev => prev.filter(o => o.id !== payload.old.id));
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [statusFilter]);

    // 3. Search & In-Memory Filtering
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            // 1. Search
            const search = searchTerm.toLowerCase().trim();
            const matchesSearch = !search ||
                String(o.order_number || "").toLowerCase().includes(search) ||
                String(o.customer_name || "").toLowerCase().includes(search);

            // 2. Staff Filter
            const matchesStaff = staffFilter === 'ALL' || o.staff_email === staffFilter;

            // 3. Date Filter
            let matchesDate = true;
            if (o.timestamp) {
                const d = new Date(o.timestamp);
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
            await supabase
                .from('orders')
                .update({ status: 'VOIDED' })
                .eq('id', orderToVoid.id);

            await supabase
                .from('order_items')
                .update({ is_deleted: true })
                .eq('parent_order_id', orderToVoid.id);

            showSnackbar?.("Order successfully voided.", "success");

            // Update local state
            setOrders(prev => prev.map(o => o.id === orderToVoid.id ? { ...o, status: 'VOIDED' } : o));
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
            await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', orderToRestore.id);

            await supabase
                .from('order_items')
                .update({ is_deleted: false })
                .eq('parent_order_id', orderToRestore.id);

            showSnackbar?.("Order successfully restored.", "success");

            // Update local state
            setOrders(prev => prev.map(o => o.id === orderToRestore.id ? { ...o, status: 'completed' } : o));
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
            const newTotal = editItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
            const amtTendered = Number(editForm.amountTendered) || 0;
            const newChange = Math.max(0, amtTendered - newTotal);

            // 1. Soft-delete old order_items
            await supabase
                .from('order_items')
                .update({ is_deleted: true })
                .eq('parent_order_id', editingOrder.id);

            // 2. Create new order_items
            const validItems = editItems.filter(item => !item.isVoided);
            await supabase.from('order_items').insert(
                validItems.map(item => ({
                    id: generateUUID(),
                    parent_order_id: editingOrder.id,
                    name: item.name,
                    quantity: Number(item.quantity),
                    price: Number(item.price),
                    amount: Number(item.total || 0),
                    is_edited: true,
                    financial_category: 'Sale',
                    timestamp: new Date().toISOString(),
                }))
            );

            // 3. Update order
            await supabase
                .from('orders')
                .update({
                    customer_name: editForm.customerName,
                    payment_method: editForm.paymentMethod,
                    amount_tendered: Number(editForm.amountTendered),
                    change: newChange,
                    total: newTotal,
                    subtotal: newTotal,
                })
                .eq('id', editingOrder.id);

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
            staffName: users[order.staff_email] || 'Staff',
            isReprint: true
        });
        setReprintOrder(data);
    };

    const handlePrintInvoice = (order) => {
        const data = normalizeInvoiceData(order, {
            staffName: users[order.staff_email] || 'Staff',
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
            console.log("[OrderManagement] Triggering Invoice Print for:", printInvoiceData.order_number);
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
        const unpaid = filteredOrders.filter(o => o.payment_method === 'Charge' && o.status !== 'VOIDED').length;
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
                                    <TableCell sx={{ fontWeight: 600 }}>{o.order_number}</TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 400,
                                                color: o.status === 'VOIDED' ? 'error.main' :
                                                    o.payment_method === 'Charge' ? 'warning.main' : 'success.main'
                                            }}
                                        >
                                            {o.status === 'VOIDED' ? 'Voided' : o.payment_method === 'Charge' ? 'Unpaid' : ('Paid')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{o.customer_name || 'Walk-in'}</TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(o.timestamp)}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{currency(o.total)}</TableCell>
                                    <TableCell>{o.payment_method || 'Cash'}</TableCell>
                                    <TableCell>{users[o.staff_email] || '---'}</TableCell>
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
                        ? `Edit Order ${orderDrawer.order?.order_number}`
                        : `Order ${orderDrawer.order?.order_number}`
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
                                        {drawerItems.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell align="right">{item.quantity}</TableCell>
                                                <TableCell align="right">{currency(item.price)}</TableCell>
                                                <TableCell align="right">{currency(item.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                <Stack spacing={1.5}>
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Cashier:</Typography>
                                        <Typography variant="body2" fontWeight="bold">{users[o.staff_email] || '---'}</Typography>
                                    </Box>
                                    <Divider sx={{ borderStyle: 'dashed' }} />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block">Customer:</Typography>
                                        <Typography variant="body2" fontWeight="bold">{o.customer_name || 'Walk-in'}</Typography>
                                        {o.customerPhone && <Typography variant="caption" display="block">Phone: {o.customerPhone}</Typography>}
                                        {o.customerAddress && <Typography variant="caption" display="block">Addr: {o.customerAddress}</Typography>}
                                        {o.customerTin && <Typography variant="caption" display="block">TIN: {o.customerTin}</Typography>}
                                    </Box>
                                    <Divider sx={{ borderStyle: 'dashed' }} />
                                    <Box display="flex" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">Payment:</Typography>
                                        <Typography variant="body2" fontWeight="bold" color="primary">
                                            {o.payment_method === 'Charge' ? 'UNPAID (Charge)' : o.payment_method}
                                        </Typography>
                                    </Box>
                                    {o.payment_method === 'GCash' && (o.payment_details?.gcashRef || o.payment_details?.ref) && (
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="body2" color="text.secondary">GCash Ref:</Typography>
                                            <Typography variant="body2" fontWeight="bold">{o.payment_details?.gcashRef || o.payment_details?.ref}</Typography>
                                        </Box>
                                    )}
                                    <Box display="flex" justifyContent="space-between" sx={{ pt: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold">Total:</Typography>
                                        <Typography variant="subtitle1" fontWeight="bold" color="primary">{currency(o.total)}</Typography>
                                    </Box>
                                    {o.amount_tendered > 0 && (
                                        <>
                                            <Box display="flex" justifyContent="space-between">
                                                <Typography variant="body2" color="text.secondary">Tendered:</Typography>
                                                <Typography variant="body2">{currency(o.amount_tendered)}</Typography>
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
                message={`Are you sure you want to void Order #${orderToVoid?.order_number}? This will also delete all associated transactions and is irreversible.`}
            />

            {/* Confirmation Dialog for Restore */}
            <ConfirmationReasonDialog
                open={restoreDialogOpen}
                onClose={() => setRestoreDialogOpen(false)}
                onConfirm={confirmRestore}
                title="Restore Order"
                message={`Are you sure you want to restore Order #${orderToRestore?.order_number}? All associated transactions will also be restored.`}
                confirmColor="success"
                confirmText="Restore"
            />

            {/* Hidden Print Elements */}
            {reprintOrder && (
                <SimpleReceipt
                    order={reprintOrder}
                    settings={systemSettings}
                    staffName={users[reprintOrder.staff_email]}
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
