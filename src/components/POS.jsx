import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Paper, IconButton, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Menu as MuiMenu, useMediaQuery, Chip, Tabs, Tab, List, ListItem,
  Grid, Checkbox, Avatar, CssBaseline, Tooltip, Divider, ListItemButton, Switch,
  Snackbar, Alert, Backdrop, CircularProgress
} from '@mui/material';
import html2canvas from 'html2canvas';
import { useTheme } from '@mui/material/styles';

// Icons
import LogoutIcon from '@mui/icons-material/Logout';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import PrintIcon from '@mui/icons-material/Print';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SettingsIcon from '@mui/icons-material/Settings';
import MonitorIcon from '@mui/icons-material/Monitor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import LayersIcon from '@mui/icons-material/Layers';
import DownloadIcon from '@mui/icons-material/Download';

// Components

import { SimpleReceipt } from './SimpleReceipt';
import POSItemGrid from './pos/POSItemGrid';
import { VariablePriceDialog } from './pos/POSHelperDialogs';
import { ServiceInvoice } from './ServiceInvoice';
import LoadingScreen from './common/LoadingScreen';

import POSHeader from './pos/POSHeader';
import POSEntryPanel from './pos/POSEntryPanel';
import POSCartPanel from './pos/POSCartPanel';

// Lazy load dialogs & drawers
const CheckoutDialog = lazy(() => import('./CheckoutDialog'));
const ExpenseDrawer = lazy(() => import('./pos/ExpenseDrawer'));
const POSInvoiceLookupDrawer = lazy(() => import('./pos/POSInvoiceLookupDrawer'));
const DrawerDialog = lazy(() => import('./DrawerDialog'));
const EndShiftDialog = lazy(() => import('./EndShiftDialog'));
const POSSidebar = lazy(() => import('./pos/POSSidebar'));
const EditTransactionDialog = lazy(() => import('./EditTransactionDialog'));
const DeleteTransactionDialog = lazy(() => import('./DeleteTransactionDialog'));
const ChangeDisplayDialog = lazy(() => import('./ChangeDisplayDialog'));
const POSHistoryDrawer = lazy(() => import('./pos/POSHistoryDrawer'));
const CustomerSelectionDrawer = lazy(() => import('./pos/CustomerSelectionDrawer'));


// Supabase
import { supabase } from '../supabase';

// Helpers
import { openDrawer } from '../services/drawerService';
import { generateOrderNumber, createOrderObject, deleteOrder } from '../services/orderService';
import { createInvoice } from '../services/invoiceService';

import { normalizeReceiptData, normalizeInvoiceData, safePrint, safePrintInvoice } from '../services/printService';
import { fmtCurrency, fmtDate } from '../utils/formatters';
import { usePOSServices } from '../hooks/usePOSServices';
import { useStaffList } from '../hooks/useStaffList';
import { usePOSCart } from '../hooks/usePOSCart';
import { useShiftTimer } from '../hooks/useShiftTimer';
import { saveCheckout, updateCheckout } from '../services/checkoutService';
import { recordExpense, deleteTransactions, updateTransaction } from '../services/transactionService';

import { useGlobalUI } from '../contexts/GlobalUIContext';
import { canViewFinancials } from '../utils/permissions';
import { getFriendlyErrorMessage } from '../services/errorService';

// Helper for currency display — imported from shared formatters
const currency = fmtCurrency;



export default function POS({ user, userRole, activeShiftId, shiftPeriod, shiftStartTime, appSettings, staffDisplayName: staffDisplayNameProp }) {
  const { showSnackbar, showConfirm } = useGlobalUI();
  const theme = useTheme();

  // --- CORE POS STATE ---
  const {
    orders, setOrders, activeTab, setActiveTab, currentOrder, currentTotal,
    updateCurrentOrder, addOrderTab, closeOrderTab: closeTabHook,
    addItemToCart, removeItemFromCart, updateItemInCart, clearCart, loadOrder
  } = usePOSCart();

  // --- SETTINGS STATE (seeded from App-level fetch — no separate load needed) ---
  const [systemSettings] = useState(() => ({
    drawerHotkey: { altKey: true, code: 'Backquote' },
    checkoutHotkey: { code: 'F10', key: 'F10', display: 'F10' },
    logoUrl: null,
    storeName: 'Kunek',
    ...(appSettings || {}),
  }));

  // Services and staff from shared hooks (replaces manual useEffect blocks)
  const { allServices, serviceList, expenseTypes: expenseServiceItems, posItems, variantMap } = usePOSServices();
  const services = serviceList;
  const { staffOptions } = useStaffList();

  // --- LEGACY INPUT STATE (Left Panel) ---
  const [item, setItem] = useState('');
  const [expenseType, setExpenseType] = useState('');
  const [expenseStaffId, setExpenseStaffId] = useState('');
  const [expenseStaffName, setExpenseStaffName] = useState('');
  const [expenseStaffEmail, setExpenseStaffEmail] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const quantityInputRef = useRef(null);
  const priceInputRef = useRef(null);

  // --- SHIFT TIMER ---
  const {
    elapsed, elapsedMs, shiftAlertState, minsRemaining
  } = useShiftTimer(shiftStartTime, systemSettings);

  // --- SIDEBAR ---
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [staffDisplayName, setStaffDisplayName] = useState(staffDisplayNameProp || user?.email || '');
  const [sessionStaffEmail, setSessionStaffEmail] = useState(user.email);
  const [openHandoverDialog, setOpenHandoverDialog] = useState(false);

  // --- DIALOGS ---
  const [openDrawerDialog, setOpenDrawerDialog] = useState(false);
  const [openEndShiftDialog, setOpenEndShiftDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false); // For Debt Log
  // --- CUSTOMERS ---
  const [openCustomerSelection, setOpenCustomerSelection] = useState(false);
  const [openInvoiceLookup, setOpenInvoiceLookup] = useState(false);

  const [openCheckout, setOpenCheckout] = useState(false);
  const [openExpense, setOpenExpense] = useState(false); // For header button

  // --- EDIT LINE ITEM (Price/Qty) ---
  const [editItemDialog, setEditItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState(null);

  // --- NEW POS GRID DIALOGS ---
  const [openHistoryDrawer, setOpenHistoryDrawer] = useState(false);
  const [variablePriceItem, setVariablePriceItem] = useState(null);

  // --- EDIT PAST TX ---
  const [editTxDialog, setEditTxDialog] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deleteTxDialog, setDeleteTxDialog] = useState(false);
  const [deleteCartItemState, setDeleteCartItemState] = useState(null); // { tabIndex, itemIndex }
  const [editItemError, setEditItemError] = useState('');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [deleteOrderDialog, setDeleteOrderDialog] = useState(false);

  // --- PRINTING ---
  const [printOrder, setPrintOrder] = useState(null);
  const [printInvoiceData, setPrintInvoiceData] = useState(null); // ADDED
  const [printShiftData, setPrintShiftData] = useState(null);
  const receiptRef = useRef(null); // ADDED
  const [showEndShiftReceipt, setShowEndShiftReceipt] = useState(false);
  const [endShiftReceiptData, setEndShiftReceiptData] = useState(null);

  // --- EFFECT: Auto-Print Trigger ---
  // --- EFFECT: Auto-Print Trigger ---
  const isPrintingLocal = useRef(false);
  useEffect(() => {
    let timer;
    if ((printOrder || printShiftData) && !isPrintingLocal.current) {
      isPrintingLocal.current = true;
      timer = setTimeout(() => {
        safePrint(() => {
          setPrintOrder(null);
          setPrintShiftData(null);
          isPrintingLocal.current = false;
        }, "POS");
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [printOrder, printShiftData]);

  // EFFECT: Auto-Print Invoice
  const isPrintingInvoice = useRef(false);
  useEffect(() => {
    let timer;
    if (printInvoiceData && !isPrintingInvoice.current) {
      isPrintingInvoice.current = true;
      timer = setTimeout(() => {
        safePrintInvoice(() => {
          setPrintInvoiceData(null);
          isPrintingInvoice.current = false;
        }, "Dashboard-Invoice");
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [printInvoiceData]);

  // --- UI STATE ---
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [gridTab, setGridTab] = useState(0); // 0=Sale, 1=PC Rental
  const [posView, setPosView] = useState('legacy'); // Changed from localStorage to enforce Classic as default on load
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [shiftOrders, setShiftOrders] = useState([]);

  // Change Dialog State
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [lastChange, setLastChange] = useState(0);

  // Loading State
  const [isLoading, setIsLoading] = useState(false);

  // Removed OrderDetailsDialog state



  const togglePosView = () => {
    const next = posView === 'new' ? 'legacy' : 'new';
    setPosView(next);
    setGridTab(0); // always reset so cart is visible
    localStorage.setItem('kunek_posView', next);
  };


  // Removed OrderDetailsDialog state

  // Hotkey for Drawer (Dynamic)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const hk = systemSettings.drawerHotkey;
      if (!hk) return;

      // Check modifiers
      const altMatch = !!hk.altKey === e.altKey;
      const ctrlMatch = !!hk.ctrlKey === e.ctrlKey;
      const shiftMatch = !!hk.shiftKey === e.shiftKey;

      // Check key code (preferred) or key
      // If capturing "Alt", altMatch is handled.
      // e.code for 'Backquote' is reliable.

      const keyMatch = (hk.code && e.code === hk.code) || (hk.key && e.key === hk.key);

      if (keyMatch && altMatch && ctrlMatch && shiftMatch) {
        e.preventDefault();
        setOpenDrawerDialog(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [systemSettings.drawerHotkey]);

  // Hotkey for Checkout
  useEffect(() => {
    const handleKeyDown = (e) => {
      const hk = systemSettings.checkoutHotkey;
      if (!hk) return;
      const altMatch = !!hk.altKey === e.altKey;
      const ctrlMatch = !!hk.ctrlKey === e.ctrlKey;
      const shiftMatch = !!hk.shiftKey === e.shiftKey;
      const keyMatch = (hk.code && e.code === hk.code) || (hk.key && e.key === hk.key);
      if (keyMatch && altMatch && ctrlMatch && shiftMatch) {
        e.preventDefault();
        const order = orders[activeTab] || orders[0];
        if (gridTab === 0 && order?.items?.length > 0 && !openCheckout) {
          setOpenCheckout(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [systemSettings.checkoutHotkey, gridTab, orders, activeTab, openCheckout]);

  const isManualEntryItem = posItems.some(i => i.serviceName === item) || item === '';
  const canViewFin = canViewFinancials(userRole);

  // =========================================================================
  // 1. DATA LOADING & INITIALIZATION
  // =========================================================================



  // Load Shift Orders
  useEffect(() => {
    if (!activeShiftId) return;

    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('shift_id', activeShiftId)
        .eq('is_deleted', false)
        .order('order_number', { ascending: false });

      if (data) {
        setShiftOrders(data.map(d => ({
          ...d,
          shiftId: d.shift_id,
          orderNumber: d.order_number,
          isDeleted: d.is_deleted,
          subtotal: d.subtotal,
          totalDue: d.total_due,
          amountPaid: d.amount_paid,
          createdAt: d.created_at,
          paymentMethod: d.payment_method
        })));
      }
    };

    fetchOrders();

    const channel = supabase.channel('public:orders:shift')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shift_id=eq.${activeShiftId}` }, fetchOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeShiftId]);



  // Shift Timer — shiftStart seeded from prop (fetched by App.jsx during auth bootstrap)

  // Shift Timer logic moved to useShiftTimer hook



  // Load Transactions Log
  useEffect(() => {
    if (!activeShiftId) return;

    const fetchTransactions = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('shift_id', activeShiftId)
        .eq('is_deleted', false)
        .order('timestamp', { ascending: false });

      if (data) {
        setTransactions(data.map(d => ({
          ...d,
          shiftId: d.shift_id,
          orderNumber: d.order_number,
          isDeleted: d.is_deleted,
          paymentMethod: d.payment_method,
          staffEmail: d.staff_email,
          createdAt: d.created_at
        })));
      }
    };

    fetchTransactions();

    const channel = supabase.channel('public:transactions:shift')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `shift_id=eq.${activeShiftId}` }, fetchTransactions)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeShiftId]);


  const handleLogoutOnly = () => {
    supabase.auth.signOut();
  };
  const handleDownloadReceipt = async () => {
    if (receiptRef.current) {
      try {
        const canvas = await html2canvas(receiptRef.current, {
          backgroundColor: '#1E1E1E', // Dark theme dialog paper color
          scale: 2,
        });
        const image = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = image;
        link.download = `Shift-Receipt-${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      } catch (error) {
        console.error("Receipt capture failed:", error);
        showSnackbar("Failed to generate image.", "error");
      }
    }
  };

  // =========================================================================
  // 2. LEFT PANEL HANDLERS (LEGACY INPUT)
  // =========================================================================

  const handleItemChange = (e) => {
    const val = e.target.value;
    setItem(val);

    const svc = services.find(s => s.serviceName === val);
    if (svc && svc.price) setPrice(svc.price);
    else setPrice('');

    if (val !== 'Expenses') {
      setExpenseType('');
      setExpenseStaffId('');
    }

    // UX: Auto-focus Quantity after selecting item
    if (val) {
      setTimeout(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      }, 100);
    }
  };

  // Receives leaf items only — variant drill-down is handled inside POSItemGrid
  const handleGridItemClick = (item, qty = 1) => {
    if (item.priceType === 'variable') {
      setVariablePriceItem(item);
    } else {
      addItemToCart(item, qty);
    }
  };

  const handlePCSession = ({ pcName, customer, amount }) => {
    addItemToCart({
      id: null,
      serviceName: `PC Rental — ${pcName}`,
      price: amount,
      priceType: 'fixed',
      costPrice: 0,
      trackStock: false,
    }, 1, amount);
    showSnackbar(`${pcName} billed — ${fmtCurrency(amount)}`);
  };

  const handleAddEntry = async () => {
    if (!item) return showSnackbar("Please select an item.", "error");
    if (!quantity || !price) return showSnackbar("Quantity and Price are required.", "error");

    const qtyNum = Number(quantity);
    const priceNum = Number(price);
    if (isNaN(qtyNum) || qtyNum <= 0) return showSnackbar("Invalid quantity.", "error");
    if (isNaN(priceNum) || priceNum < 0) return showSnackbar("Invalid price.", "error");

    // A. DIRECT DATABASE WRITES (Expenses)
    if (item === 'Expenses') {

      // Expense Validation
      if (!expenseType) return showSnackbar("Select Expense Type.", "error");

      // Validation with Admin Override
      if (expenseType !== 'Salary Advance' && !canViewFin && !notes) {
        return showSnackbar("Notes required for expenses.", "error");
      }

      if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) return showSnackbar("Select Staff.", "error");

      setIsLoading(true); // START LOADING
      try {
        await recordExpense({
          item,
          expenseType,
          expenseStaffId,
          expenseStaffName,
          quantity: qtyNum,
          price: priceNum,
          notes,
          userEmail: user.email,
          activeShiftId
        });
        setItem(''); setQuantity(''); setPrice(''); setNotes('');
        setExpenseType('');
        showSnackbar(`${item} recorded successfully.`);
      } catch (e) {
        console.error(e);
        showSnackbar(getFriendlyErrorMessage(e), "error");
      } finally {
        setIsLoading(false); // STOP LOADING
      }
      return;
    }

    // B. ADD TO CART (Standard Services)
    const svc = services.find(s => s.serviceName === item);
    const cartItem = {
      id: Date.now(),
      serviceId: svc?.id || null, // CAPTURE ID
      serviceName: item,
      price: priceNum,
      costPrice: svc?.costPrice || 0, // CAPTURE COST
      trackStock: svc?.trackStock || false, // CAPTURE FLAG
      quantity: qtyNum,
    };

    const newItems = [...currentOrder.items];
    const existing = newItems.find(i => i.serviceName === item && i.price === priceNum);
    if (existing) {
      existing.quantity += qtyNum;
    } else {
      newItems.push(cartItem);
    }
    updateCurrentOrder({ items: newItems });
    showSnackbar(`Added ${qtyNum}x ${item} to cart`);
    setItem(''); setQuantity(''); setPrice(''); setNotes('');
  };

  // =========================================================================
  // 3. POS / MIDDLE PANEL LOGIC
  // =========================================================================

  const closeOrderTab = (e, index) => {
    if (e?.stopPropagation) e.stopPropagation();
    closeTabHook(index);
  };

  const removeFromCart = (index) => {
    const item = currentOrder.items[index];
    if (currentOrder.isExisting && item.transactionId) {
      setDeleteCartItemState({ tabIndex: activeTab, itemIndex: index });
    } else {
      removeItemFromCart(index);
    }
  };

  const openLineItemEdit = (item, index) => {
    setEditingLineItem({ ...item, index });
    setEditItemError('');
    setEditItemDialog(true);
  };

  const saveLineItemEdit = () => {
    const idx = editingLineItem.index;
    if (idx >= 0) {
      updateItemInCart(idx, {
        price: Number(editingLineItem.price),
        quantity: Number(editingLineItem.quantity),
        serviceName: editingLineItem.serviceName,
        note: editingLineItem.note,
        editReason: editingLineItem.editReason
      });
    }
    setEditItemDialog(false);
  };

  const handleCheckout = async (paymentData, shouldPrint = false) => {
    setIsLoading(true);
    try {
      const fullOrder = await saveCheckout({
        currentOrder,
        paymentData,
        user: { ...user, email: sessionStaffEmail, displayName: staffDisplayName },
        activeShiftId,
        currentTotal
      });

      if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
        setLastChange(paymentData.change);
        setChangeDialogOpen(true);
      }
      showSnackbar("Transaction completed!", "success");

      openDrawer(user, 'transaction').then(success => {
        if (!success) {
          showSnackbar("Drawer connection check failed. Click 'Drawer' manually if needed.", "warning");
        }
      }).catch(console.warn);

      setOpenCheckout(false);

      if (shouldPrint) {
        setPrintOrder(normalizeReceiptData(fullOrder, {
          staffName: staffDisplayName,
          isReprint: false
        }));
      }

      if (orders.length > 1) {
        closeOrderTab({ stopPropagation: () => { } }, activeTab);
      } else {
        updateCurrentOrder({ items: [], customer: null });
      }

    } catch (err) {
      console.error(err);
      showSnackbar(getFriendlyErrorMessage(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // 4. LOGS & ACTIONS
  // =========================================================================

  const handleDeleteLogs = () => {
    if (selectedTransactions.length === 0) return;
    setDeleteTxDialog(true);
  };

  const handleConfirmDelete = async (reason) => {
    try {
      await deleteTransactions(selectedTransactions, user.email, reason);
      setSelectedTransactions([]);
      showSnackbar("Transaction(s) successfully deleted.");
    } catch (e) {
      console.error("Error deleting transactions:", e);
      showSnackbar(getFriendlyErrorMessage(e), 'error');
    }
  };
  // --- ORDER DELETION HANDLERS ---
  const handleDeleteOrders = () => {
    if (selectedOrders.length === 0) return;
    setDeleteOrderDialog(true);
  };

  const handleConfirmDeleteOrders = async (reason) => {
    try {
      await Promise.all(selectedOrders.map(async (id) => {
        const orderNum = shiftOrders.find(o => o.id === id)?.orderNumber;
        if (orderNum) {
          await deleteOrder(id, orderNum, activeShiftId, user.email, reason);
        }
      }));
      setSelectedOrders([]);
      showSnackbar("Order(s) and linked transactions successfully deleted.");
    } catch (e) {
      console.error("Error deleting orders:", e);
      showSnackbar(getFriendlyErrorMessage(e), 'error');
    }
  };

  const handleOpenEditTx = (tx) => {
    setEditingTx(tx);
    setEditTxDialog(true);
  };

  const handleEditTx = async (id, updates) => {
    try {
      await updateTransaction(id, updates);
      setEditTxDialog(false);
      setEditingTx(null);
      showSnackbar("Transaction successfully updated.");
    } catch (e) {
      console.error("Error editing transaction:", e);
      showSnackbar(getFriendlyErrorMessage(e), 'error');
    }
  };

  const handleOpenOrderAsTab = async (order) => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('order_number', order.orderNumber);

      const transactions = (data || []).map(d => ({
        ...d,
        orderNumber: d.order_number,
        paymentMethod: d.payment_method
      }));
      loadOrder(order, transactions);
    } catch (e) {
      console.error("Error opening order:", e);
      showSnackbar(getFriendlyErrorMessage(e), 'error');
    }
  };

  const handleUpdateOrder = async () => {
    const order = currentOrder;
    if (!order.isExisting) return;
    setOpenCheckout(true);
  };

  const actuallyUpdateOrder = async (paymentData, shouldPrint = false) => {
    const order = currentOrder;
    if (!order.isExisting) return;
    setIsLoading(true);
    try {
      const updatedOrder = await updateCheckout({
        order,
        paymentData,
        user: { ...user, email: sessionStaffEmail, displayName: staffDisplayName },
        activeShiftId,
        currentTotal
      });

      openDrawer(user, 'transaction').then(success => {
        if (!success) {
          showSnackbar("Drawer not connected. Click 'Drawer' to connect.", "warning");
        }
      }).catch(console.warn);

      if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
        setLastChange(paymentData.change);
        setChangeDialogOpen(true);
      }
      setOpenCheckout(false);

      if (shouldPrint) {
        handlePrintExistingOrder({
          ...order,
          ...updatedOrder,
          timestamp: new Date()
        });
      }

      // Close Tab Logic
      if (orders.length === 1) {
        setOrders([{ id: 1, items: [], customer: null }]);
        setActiveTab(0);
      } else {
        const newOrders = orders.filter((_, i) => i !== activeTab);
        setOrders(newOrders);
        setActiveTab(Math.max(0, activeTab - 1));
      }
      showSnackbar("Order has been updated successfully.", "success");

    } catch (e) {
      console.error("Update failed:", e);
      showSnackbar(getFriendlyErrorMessage(e), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintExistingOrder = (orderData) => {
    // Use the shared normalizer to ensure consistent receipt format
    const printData = normalizeReceiptData(orderData, {
      staffName: staffDisplayName,
      isReprint: true // Use original timestamp if available
    });
    setPrintOrder(printData);
  };

  const handlePrintExistingInvoice = (orderData) => {
    // Normalization logic for Invoice
    const invData = normalizeInvoiceData(orderData, {
      staffName: staffDisplayName,
      isReprint: true
    });
    setPrintInvoiceData(invData);
  };

  const handleConfirmDeleteCartItem = (reason) => {
    const { tabIndex, itemIndex } = deleteCartItemState;
    setOrders(prev => {
      const copy = [...prev];
      const ord = { ...copy[tabIndex], items: [...copy[tabIndex].items] };
      const item = ord.items[itemIndex];
      ord.deletedItems = [...(ord.deletedItems || []), { ...item, deleteReason: reason }];
      ord.items = ord.items.filter((_, i) => i !== itemIndex);
      copy[tabIndex] = ord;
      return copy;
    });
    setDeleteCartItemState(null);
  };


  const onShiftEnded = (data) => {
    setEndShiftReceiptData(data);
    setShowEndShiftReceipt(true);
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  if (!user || !activeShiftId) return <LoadingScreen message="Initializing POS..." />;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', bgcolor: 'background.default', color: 'text.primary' }}>

      {/* FIXED: Passing 'order' to fix printing */}
      <SimpleReceipt order={printOrder} shiftData={printShiftData} staffName={staffDisplayName} settings={systemSettings} />
      <ServiceInvoice order={printInvoiceData} settings={systemSettings} />

      {/* --- HEADER --- */}
      <POSHeader
        systemSettings={systemSettings}
        staffDisplayName={staffDisplayName}
        shiftPeriod={shiftPeriod}
        elapsed={elapsed}
        posView={posView}
        togglePosView={togglePosView}
        setSidebarOpen={setSidebarOpen}
        setOpenHistoryDrawer={setOpenHistoryDrawer}
        setOpenDrawerDialog={setOpenDrawerDialog}
        setOpenExpense={setOpenExpense}
        setOpenEndShiftDialog={setOpenEndShiftDialog}
        menuAnchor={menuAnchor}
        setMenuAnchor={setMenuAnchor}
        setOpenInvoiceLookup={setOpenInvoiceLookup}
        onSwitchStaff={() => setOpenHandoverDialog(true)}
      />

      {/* Shift duration warning banners */}
      {shiftAlertState === 'warning' && (
        <Alert severity="warning" sx={{ borderRadius: 0, py: 0.5 }}>
          Shift ending in {minsRemaining} min — prepare your cash count and end shift when ready.
        </Alert>
      )}
      {shiftAlertState === 'danger' && (
        <Alert severity="error" sx={{ borderRadius: 0, py: 0.5 }}>
          Shift limit reached. Please perform your cash count and end shift.
        </Alert>
      )}

      {/* Staff sidebar */}
      <Suspense fallback={null}>
        <POSSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
          onLogout={handleLogoutOnly}

          onOpenInvoices={() => setOpenInvoiceLookup(true)}
        />
      </Suspense>

      {/* --- REDESIGNED LAYOUT: GRID + CART --- */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: '#0e0e0e' }}>
        <Grid container sx={{ flex: 1, overflow: 'hidden', maxWidth: '1400px', width: '100%', bgcolor: 'background.default', borderLeft: 1, borderRight: 1, borderColor: 'divider' }}>

          {/* LEFT COLUMN: tile grid — only in new/grid view */}
          {posView === 'new' && (
            <Box sx={{
              width: gridTab === 1 ? '100%' : { xs: '100%', md: '65%', lg: '70%' },
              flexBasis: gridTab === 1 ? '100%' : { md: '65%', lg: '70%' },
              display: 'flex',
              flexDirection: 'column',
              borderRight: gridTab === 1 ? 0 : 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              overflow: 'hidden',
            }}>
              <POSItemGrid
                posItems={posItems}
                allServices={allServices}
                variantMap={variantMap}
                onItemClick={handleGridItemClick}
                onPCSession={handlePCSession}
                onTabChange={setGridTab}
                pcRentalEnabled={systemSettings.pcRentalEnabled !== false} />
            </Box>
          )}

          {/* RIGHT COLUMN: full-width in classic, ~35% in grid view. Hidden on PC Rental tab (grid only). */}
          {(posView === 'legacy' || gridTab !== 1) && <Box sx={{
            width: posView === 'legacy' ? '100%' : { xs: '100%', md: '35%', lg: '30%' },
            maxWidth: posView === 'legacy' ? '100%' : { md: '35%', lg: '30%' },
            flexBasis: posView === 'legacy' ? '100%' : { md: '35%', lg: '30%' },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            height: '100%',
            overflow: 'hidden',
          }}>
            <POSEntryPanel
              posView={posView}
              item={item}
              setItem={setItem}
              expenseType={expenseType}
              setExpenseType={setExpenseType}
              expenseStaffEmail={expenseStaffEmail}
              setExpenseStaffEmail={setExpenseStaffEmail}
              expenseStaffId={expenseStaffId}
              setExpenseStaffId={setExpenseStaffId}
              staffOptions={staffOptions}
              notes={notes}
              setNotes={setNotes}
              quantity={quantity}
              setQuantity={setQuantity}
              price={price}
              setPrice={setPrice}
              handleAddEntry={handleAddEntry}
              handleItemChange={handleItemChange}
              services={services}
              expenseServiceItems={expenseServiceItems}
              quantityInputRef={quantityInputRef}
              priceInputRef={priceInputRef}
            />

            {posView === 'new' && (
              <POSEntryPanel
                posView={posView}
                manualEntryOpen={manualEntryOpen}
                setManualEntryOpen={setManualEntryOpen}
                item={item}
                setItem={setItem}
                expenseType={expenseType}
                setExpenseType={setExpenseType}
                expenseStaffEmail={expenseStaffEmail}
                setExpenseStaffEmail={setExpenseStaffEmail}
                expenseStaffId={expenseStaffId}
                setExpenseStaffId={setExpenseStaffId}
                staffOptions={staffOptions}
                notes={notes}
                setNotes={setNotes}
                quantity={quantity}
                setQuantity={setQuantity}
                price={price}
                setPrice={setPrice}
                handleAddEntry={handleAddEntry}
                handleItemChange={handleItemChange}
                services={services}
                expenseServiceItems={expenseServiceItems}
                quantityInputRef={quantityInputRef}
                priceInputRef={priceInputRef}
              />
            )}

            {/* CART (Flex Grow) */}
            <POSCartPanel
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              orders={orders}
              closeOrderTab={closeOrderTab}
              addOrderTab={addOrderTab}
              currentOrder={currentOrder}
              updateCurrentOrder={updateCurrentOrder}
              currentTotal={currentTotal}
              currency={currency}
              openLineItemEdit={openLineItemEdit}
              removeFromCart={removeFromCart}
              setOpenCheckout={setOpenCheckout}
              systemSettings={systemSettings}
              handlePrintExistingOrder={handlePrintExistingOrder}
              handlePrintExistingInvoice={handlePrintExistingInvoice}
              setOpenCustomerSelection={setOpenCustomerSelection}
            />
          </Box>}
        </Grid>
      </Box>

      {/* Powered by footer */}
      <Box sx={{ textAlign: 'center', py: 0.4, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="caption" sx={{ opacity: 0.3, fontSize: '0.6rem', letterSpacing: '0.08em' }}>
          Powered by Kunek
        </Typography>
      </Box>

      {/* --- DIALOGS --- */}
      <Suspense fallback={null}>
        <DrawerDialog open={openDrawerDialog} onClose={() => setOpenDrawerDialog(false)} user={user} />

        {/* End Shift Dialog Component */}
        <EndShiftDialog
          open={openEndShiftDialog}
          onClose={() => setOpenEndShiftDialog(false)}
          activeShiftId={activeShiftId}
          user={user}
          transactions={transactions}
          onShiftEnded={onShiftEnded}

          settings={systemSettings}
        />
        <EditTransactionDialog open={editTxDialog} onClose={() => setEditTxDialog(false)} transaction={editingTx} onSave={handleEditTx} />
        <DeleteTransactionDialog
          open={!!deleteCartItemState}
          onClose={() => setDeleteCartItemState(null)}
          onConfirm={handleConfirmDeleteCartItem}
        />

        <CheckoutDialog
          open={openCheckout}
          onClose={() => setOpenCheckout(false)}
          total={currentTotal}
          onConfirm={currentOrder.isExisting ? actuallyUpdateOrder : handleCheckout}
          customer={currentOrder.customer}
          defaultDueDays={systemSettings.invoiceDueDays || 7}
          appSettings={systemSettings}
        />
        <POSInvoiceLookupDrawer
          open={openInvoiceLookup}
          onClose={() => setOpenInvoiceLookup(false)}
          user={user}

          activeShiftId={activeShiftId}
        />

        <CustomerSelectionDrawer
          open={openCustomerSelection}
          onClose={() => setOpenCustomerSelection(false)}
          currentCustomer={currentOrder?.customer}
          onSelectCustomer={(cust) => updateCurrentOrder({ customer: cust })}
        />

        <POSHistoryDrawer
          open={openHistoryDrawer}
          onClose={() => setOpenHistoryDrawer(false)}
          transactions={transactions}
          shiftOrders={shiftOrders}
          selectedTransactions={selectedTransactions}
          setSelectedTransactions={setSelectedTransactions}
          selectedOrders={selectedOrders}
          setSelectedOrders={setSelectedOrders}
          handleOpenEditTx={handleOpenEditTx}
          handleDeleteLogs={handleDeleteLogs}
          handleDeleteOrders={handleDeleteOrders}
          handleOpenOrderAsTab={handleOpenOrderAsTab}
        />
      </Suspense>

      <VariablePriceDialog
        open={Boolean(variablePriceItem)}
        item={variablePriceItem}
        onClose={() => setVariablePriceItem(null)}
        onSubmit={(price) => {
          addItemToCart(variablePriceItem, 1, price);
          setVariablePriceItem(null);
        }}
      />

      {/* Order Customer Dialog Replaced by inline Autocomplete -> removed OrderCustomerDialog entirely */}

      {/* Edit Line Item */}
      <Dialog open={editItemDialog} onClose={() => setEditItemDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Name" fullWidth value={editingLineItem?.serviceName || ''} onChange={e => setEditingLineItem({ ...editingLineItem, serviceName: e.target.value })} />
            <TextField label="Price" type="number" fullWidth value={editingLineItem?.price || ''} onChange={e => setEditingLineItem({ ...editingLineItem, price: e.target.value })} />
            <TextField label="Qty" type="number" fullWidth value={editingLineItem?.quantity || ''} onChange={e => setEditingLineItem({ ...editingLineItem, quantity: e.target.value })} />
            <TextField
              label="Note (Optional)"
              fullWidth
              multiline
              rows={2}
              value={editingLineItem?.note || ''}
              onChange={e => setEditingLineItem({ ...editingLineItem, note: e.target.value })}
              placeholder="e.g. Extra spicy, Large size, etc."
            />
            {editingLineItem?.transactionId && (
              <TextField
                label="Reason for Edit (Required)"
                fullWidth
                multiline
                rows={2}
                value={editingLineItem?.editReason || ''}
                onChange={e => {
                  setEditingLineItem({ ...editingLineItem, editReason: e.target.value });
                  if (e.target.value.trim()) setEditItemError('');
                }}
                error={!!editItemError}
                helperText={editItemError || "Required for existing items"}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditItemDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveLineItemEdit}>Update</Button>
        </DialogActions>
      </Dialog>

      <Suspense fallback={null}>
        <ExpenseDrawer
          open={openExpense}
          onClose={() => setOpenExpense(false)}
          user={user}
          activeShiftId={activeShiftId}
          expenseTypes={expenseServiceItems}
          staffOptions={staffOptions}
        />
      </Suspense>

      {/* End Receipt */}
      {/* End Receipt */}
      <Dialog
        open={showEndShiftReceipt}

        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #333', pb: 2 }}>
          Shift Summary Receipt
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0, height: '70vh' }}>

          {/* === HIDDEN FULL RECEIPT FOR IMAGE CAPTURE === */}
          <Box sx={{ position: 'absolute', top: -9999, left: -9999, width: 400, bgcolor: '#1E1E1E' }}>
            <Stack spacing={0.5} ref={receiptRef} sx={{ p: 2, bgcolor: '#1E1E1E' }}>
              <Box mb={2}>
                <Typography variant="body2" fontWeight="bold">{staffDisplayName}</Typography>
                <Typography variant="caption" color="gray">
                  {shiftPeriod} Shift — {fmtDate(new Date())}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.primary" display="block" flexShrink={0} fontWeight="bold">SALES</Typography>
              <Box display="flex" justifyContent="space-between" pl={1}>
                <Typography sx={{ fontSize: '0.75rem' }}>PC Rental</Typography>
                <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData?.pcRentalTotal)}</Typography>
              </Box>
              {endShiftReceiptData?.salesBreakdown?.map(([label, amt]) => (
                <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                  <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" fontWeight="bold">Total Sales</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {currency((endShiftReceiptData?.servicesTotal || 0) + (endShiftReceiptData?.pcRentalTotal || 0))}
                </Typography>
              </Box>
              {/* AR Payments moved to bottom Collections section */}
              <Box mt={1}>
                <Typography variant="caption" color="text.primary" display="block" fontWeight="bold">EXPENSES</Typography>
                {endShiftReceiptData?.expensesBreakdown?.map(([label, amt]) => (
                  <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                    <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight="bold">Total Expenses</Typography>
                  <Typography variant="body2" fontWeight="bold">{currency(endShiftReceiptData?.expensesTotal)}</Typography>
                </Box>
              </Box>
              {endShiftReceiptData?.arPaymentsTotal > 0 && (
                <Box mt={1}>
                  <Typography variant="caption" color="gray" display="block" fontWeight="bold">COLLECTIONS</Typography>
                  {endShiftReceiptData.arCashTotal > 0 && (
                    <Box display="flex" justifyContent="space-between" pl={1}>
                      <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (Cash)</Typography>
                      <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arCashTotal)}</Typography>
                    </Box>
                  )}
                  {endShiftReceiptData.arDigitalTotal > 0 && (
                    <Box display="flex" justifyContent="space-between" pl={1}>
                      <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (Digital)</Typography>
                      <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arDigitalTotal)}</Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" fontWeight="bold">Total Collections</Typography>
                    <Typography variant="body2" fontWeight="bold">{currency(endShiftReceiptData.arPaymentsTotal)}</Typography>
                  </Box>
                </Box>
              )}
              <Divider sx={{ borderColor: '#333', my: 2 }} />
              <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                <Typography variant="h6" fontWeight="900">SYSTEM TOTAL</Typography>
                <Typography variant="h4" fontWeight="900">{currency(endShiftReceiptData?.systemTotal)}</Typography>
              </Box>
              <Divider sx={{ borderColor: '#333', my: 2 }} />
              <Box mt={1}>
                <Typography variant="caption" color="text.primary" display="block" mb={0.5} fontWeight="bold">PAYMENT BREAKDOWN</Typography>
                <Box display="flex" justifyContent="space-between" pl={1}>
                  <Typography variant="body2">Cash</Typography>
                  <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.cash)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" pl={1}>
                  <Typography variant="body2">Digital</Typography>
                  <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.digital)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" pl={1}>
                  <Typography variant="body2">Receivables</Typography>
                  <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.receivables)}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle1" fontWeight="bold" color="text.primary">Expected Cash on Hand</Typography>
                <Typography variant="subtitle1" fontWeight="bold" color="text.primary">
                  {currency((endShiftReceiptData?.breakdown?.cash || 0) - (endShiftReceiptData?.expensesTotal || 0))}
                </Typography>
              </Box>
            </Stack>
          </Box>


          {/* === VISIBLE SCROLLABLE LAYOUT === */}

          {/* ANCHORED HEADER: STAFF & DATE */}
          <Box sx={{ p: 2, pb: 1, borderBottom: '1px solid #333', bgcolor: '#1E1E1E' }}>
            <Box>
              <Typography variant="body2" fontWeight="bold">{staffDisplayName}</Typography>
              <Typography variant="caption" color="gray">
                {shiftPeriod} Shift — {fmtDate(new Date())}
              </Typography>
            </Box>
          </Box>

          {/* SCROLLABLE AREA: LISTS */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>

            {/* SALES */}
            <Typography variant="caption" color="text.primary" display="block" flexShrink={0} fontWeight="bold">SALES</Typography>
            <Box display="flex" justifyContent="space-between" pl={1}>
              <Typography sx={{ fontSize: '0.75rem' }}>PC Rental</Typography>
              <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData?.pcRentalTotal)}</Typography>
            </Box>
            {endShiftReceiptData?.salesBreakdown?.map(([label, amt]) => (
              <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
              </Box>
            ))}

            <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />

            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" fontWeight="bold">Total Sales</Typography>
              <Typography variant="body2" fontWeight="bold">
                {currency((endShiftReceiptData?.servicesTotal || 0) + (endShiftReceiptData?.pcRentalTotal || 0))}
              </Typography>
            </Box>

            {/* AR Payments moved to bottom Collections section */}

            {/* EXPENSES */}
            <Box mt={2}>
              <Typography variant="caption" color="text.primary" display="block" fontWeight="bold">EXPENSES</Typography>
              {endShiftReceiptData?.expensesBreakdown?.length === 0 && (
                <Typography variant="caption" color="text.secondary" pl={1}>No expenses</Typography>
              )}
              {endShiftReceiptData?.expensesBreakdown?.map(([label, amt]) => (
                <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                  <Typography sx={{ fontSize: '0.75rem' }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.75rem' }}>{currency(amt)}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" fontWeight="bold">Total Expenses</Typography>
                <Typography variant="body2" fontWeight="bold">{currency(endShiftReceiptData?.expensesTotal)}</Typography>
              </Box>
            </Box>

            {/* COLLECTIONS */}
            {endShiftReceiptData?.arPaymentsTotal > 0 && (
              <Box mt={2}>
                <Typography variant="caption" color="text.primary" display="block" fontWeight="bold">COLLECTIONS</Typography>
                {endShiftReceiptData.arCashTotal > 0 && (
                  <Box display="flex" justifyContent="space-between" pl={1}>
                    <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (Cash)</Typography>
                    <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arCashTotal)}</Typography>
                  </Box>
                )}
                {endShiftReceiptData.arDigitalTotal > 0 && (
                  <Box display="flex" justifyContent="space-between" pl={1}>
                    <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (Digital)</Typography>
                    <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arDigitalTotal)}</Typography>
                  </Box>
                )}
                <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight="bold">Total Collections</Typography>
                  <Typography variant="body2" fontWeight="bold">{currency(endShiftReceiptData.arPaymentsTotal)}</Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* ANCHORED FOOTER: TOTALS */}
          <Box sx={{ p: 2, pt: 1, borderTop: '1px solid #333', bgcolor: '#1E1E1E' }}>
            <Divider sx={{ borderColor: '#333', mb: 1, display: 'none' }} />

            <Box display="flex" justifyContent="space-between" alignItems="center" mt={0}>
              <Typography variant="h6" fontWeight="900">SYSTEM TOTAL</Typography>
              <Typography variant="h4" fontWeight="900">{currency(endShiftReceiptData?.systemTotal)}</Typography>
            </Box>

            <Divider sx={{ borderColor: '#333', my: 2 }} />

            {/* SECTION 4: PAYMENT BREAKDOWN */}
            <Box mt={1}>
              <Typography variant="caption" color="text.primary" display="block" mb={0.5} fontWeight="bold">PAYMENT BREAKDOWN</Typography>
              <Box display="flex" justifyContent="space-between" pl={1}>
                <Typography variant="body2">Cash</Typography>
                <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.cash)}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" pl={1}>
                <Typography variant="body2">Digital</Typography>
                <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.digital)}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" pl={1}>
                <Typography variant="body2">Receivables</Typography>
                <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.receivables)}</Typography>
              </Box>
            </Box>

            {/* SECTION 5: EXPECTED CASH */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle1" fontWeight="bold" color="text.primary">Expected Cash on Hand</Typography>
              <Typography variant="subtitle1" fontWeight="bold" color="text.primary">
                {currency((endShiftReceiptData?.breakdown?.cash || 0) - (endShiftReceiptData?.expensesTotal || 0))}
              </Typography>
            </Box>
          </Box>

        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #333', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            onClick={handleDownloadReceipt}
            startIcon={<DownloadIcon />}
          >
            DOWNLOAD
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => supabase.auth.signOut()}
            sx={{ fontWeight: 'bold' }}
          >
            CLOSE & LOGOUT
          </Button>
        </DialogActions>
      </Dialog>

      {/* Existing Log Edit/Delete Dialogs */}
      <DeleteTransactionDialog
        open={deleteTxDialog}
        onClose={() => setDeleteTxDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Transaction(s)"
        warning="This action cannot be undone. These transactions will be marked as deleted."
      />

      {/* NEW: Delete Order Dialog */}
      <DeleteTransactionDialog
        open={deleteOrderDialog}
        onClose={() => setDeleteOrderDialog(false)}
        onConfirm={handleConfirmDeleteOrders}
        title="Delete Order(s)"
        warning="This action cannot be undone. These orders will be marked as deleted."
      />

      {/* Change Display Dialog */}
      <ChangeDisplayDialog
        open={changeDialogOpen}
        onClose={() => setChangeDialogOpen(false)}
        change={lastChange}
      />







      {/* Staff Handover Dialog */}
      <Dialog open={openHandoverDialog} onClose={() => setOpenHandoverDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Staff Handover</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, opacity: 0.7 }}>
            Switch the active cashier for the current terminal session. The shift remains active under the original owner.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Select Staff</InputLabel>
            <Select
              value={sessionStaffEmail}
              label="Select Staff"
              onChange={e => {
                const s = staffOptions.find(o => o.email === e.target.value);
                if (s) {
                  setSessionStaffEmail(s.email);
                  setStaffDisplayName(s.fullName);
                  setOpenHandoverDialog(false);
                  showSnackbar(`Switched to ${s.fullName}`, "info");
                }
              }}
            >
              {staffOptions.map(s => <MenuItem key={s.id} value={s.email}>{s.fullName}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenHandoverDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
      {isLoading && <LoadingScreen overlay={true} message="Processing..." />}
    </Box >
  );
}