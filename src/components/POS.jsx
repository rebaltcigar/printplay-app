import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, AppBar, Toolbar, TextField,
  Select, MenuItem, FormControl, InputLabel, Paper, IconButton, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Menu as MuiMenu, useMediaQuery, Chip, Tabs, Tab, List, ListItem,
  Grid, Checkbox, Avatar, CssBaseline, Tooltip, Divider, ListItemButton, Switch,
  Autocomplete, Snackbar, Alert, Backdrop, CircularProgress, Collapse // ADDED
} from '@mui/material';
import html2canvas from 'html2canvas';
import { useTheme } from '@mui/material/styles';

// Icons
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit'; // ADDED
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error'; // ADDED
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import PrintIcon from '@mui/icons-material/Print';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ExpandLessIcon from '@mui/icons-material/ExpandLess'; // ADDED
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // ADDED
import SettingsIcon from '@mui/icons-material/Settings'; // ADDED
import MonitorIcon from '@mui/icons-material/Monitor'; // ADDED for PC Rental
import ContentCopyIcon from '@mui/icons-material/ContentCopy'; // ADDED for Photocopy
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'; // ADDED for Photo
import LayersIcon from '@mui/icons-material/Layers'; // ADDED for Laminate
import DownloadIcon from '@mui/icons-material/Download'; // ADDED
import ViewListIcon from '@mui/icons-material/ViewList';
import AppsIcon from '@mui/icons-material/Apps';

// Components
import OrderCustomerDialog from './OrderCustomerDialog';
import CustomerDialog from './CustomerDialog';
import CheckoutDialog from './CheckoutDialog';
import ExpenseDialog from './ExpenseDialog';
import POSInvoiceLookupDrawer from './pos/POSInvoiceLookupDrawer';
import DrawerDialog from './DrawerDialog';
import EndShiftDialog from './EndShiftDialog';
import POSSidebar from './pos/POSSidebar';
import EditTransactionDialog from './EditTransactionDialog';
import DeleteTransactionDialog from './DeleteTransactionDialog'; // ADDED
import ChangeDisplayDialog from './ChangeDisplayDialog'; // ADDED
import { SimpleReceipt } from './SimpleReceipt';
import POSHistoryDrawer from './pos/POSHistoryDrawer';
import POSItemGrid from './pos/POSItemGrid';
import { VariablePriceDialog } from './pos/POSHelperDialogs';
// removed duplicate ServiceInvoice import if any, handled above

// Firebase
import { auth, db } from '../firebase';
import {
  collection, addDoc, query, onSnapshot, orderBy, doc, writeBatch,
  updateDoc, where, serverTimestamp, getDocs, getDoc, increment
} from 'firebase/firestore';

// Helpers
import { openDrawer } from '../utils/drawerService';
import { generateOrderNumber, createOrderObject } from '../utils/orderService';
import { createInvoice } from '../utils/invoiceService';

import { generateDisplayId, generateBatchIds } from '../utils/idGenerator';
import { normalizeReceiptData, normalizeInvoiceData, safePrint, safePrintInvoice } from '../utils/printHelper';
import { ServiceInvoice } from './ServiceInvoice';
import LoadingScreen from './common/LoadingScreen';
import { fmtCurrency } from '../utils/formatters';
import { usePOSServices } from '../hooks/usePOSServices';
import { useStaffList } from '../hooks/useStaffList';

import logo from '/icon.ico';

// Helper for currency display — imported from shared formatters
const currency = fmtCurrency;



function POSContent({ user, userRole, activeShiftId, shiftPeriod, shiftStartTime, appSettings, staffDisplayName: initialStaffDisplayName }) {
  const theme = useTheme();

  // --- CORE POS STATE ---
  const [activeTab, setActiveTab] = useState(0);
  const [orders, setOrders] = useState([{ id: 1, items: [], customer: null }]);

  // Services and staff from shared hooks (replaces manual useEffect blocks)
  const { serviceList, expenseTypes: expenseServiceItems, posItems, variantMap } = usePOSServices();
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

  // --- LEGACY SHIFT STATE ---
  const [shiftStart, setShiftStart] = useState(shiftStartTime || null);
  const [elapsed, setElapsed] = useState(() => {
    if (!shiftStartTime) return '00:00:00';
    const diffMs = Date.now() - shiftStartTime.getTime();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(diffMs / 3600000))}:${pad(Math.floor((diffMs % 3600000) / 60000))}:${pad(Math.floor((diffMs % 60000) / 1000))}`;
  });
  const [elapsedMs, setElapsedMs] = useState(() =>
    shiftStartTime ? Date.now() - shiftStartTime.getTime() : 0
  );

  // --- SIDEBAR ---
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [staffDisplayName, setStaffDisplayName] = useState(initialStaffDisplayName || user?.email || '');

  // --- DIALOGS ---
  const [openDrawerDialog, setOpenDrawerDialog] = useState(false);
  const [openEndShiftDialog, setOpenEndShiftDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [openOrderCustomerDialog, setOpenOrderCustomerDialog] = useState(false);
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

  // --- SNACKBAR STATE ---
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const handleCloseSnackbar = () => setSnackbar(prev => ({ ...prev, open: false }));
  const showSnackbar = (msg, sev = 'success') => setSnackbar({ open: true, message: msg, severity: sev });

  const togglePosView = () => {
    const next = posView === 'new' ? 'legacy' : 'new';
    setPosView(next);
    setGridTab(0); // always reset so cart is visible
    localStorage.setItem('kunek_posView', next);
  };

  // --- SETTINGS STATE (seeded from App-level fetch — no separate load needed) ---
  const [systemSettings] = useState(() => ({
    drawerHotkey: { altKey: true, code: 'Backquote' },
    checkoutHotkey: { code: 'F10', key: 'F10', display: 'F10' },
    logoUrl: null,
    storeName: 'Kunek',
    ...(appSettings || {}),
  }));

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

  const currentOrder = orders[activeTab] || orders[0];
  const currentTotal = currentOrder?.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0;
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';
  const isAdmin = userRole === 'superadmin';

  // =========================================================================
  // 1. DATA LOADING & INITIALIZATION
  // =========================================================================



  // Load Shift Orders
  useEffect(() => {
    if (!activeShiftId) return;
    const q = query(
      collection(db, 'orders'),
      where('shiftId', '==', activeShiftId),
      orderBy('orderNumber', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.isDeleted !== true);
      setShiftOrders(docs);
    });
    return () => unsub();
  }, [activeShiftId]);



  // Shift Timer — shiftStart seeded from prop (fetched by App.jsx during auth bootstrap)

  useEffect(() => {
    if (!shiftStart) return;
    const id = setInterval(() => {
      const diffMs = Date.now() - shiftStart.getTime();
      setElapsedMs(diffMs);
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, '0');
      setElapsed(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }, 1000);
    return () => clearInterval(id);
  }, [shiftStart]);

  // Shift alert state (soft enforce)
  const shiftDurationMs = (systemSettings.shiftDurationHours || 12) * 3_600_000;
  const alertThresholdMs = (systemSettings.shiftAlertMinutes || 30) * 60_000;
  const shiftAlertState = elapsedMs === 0 ? 'normal'
    : elapsedMs >= shiftDurationMs ? 'danger'
      : elapsedMs >= shiftDurationMs - alertThresholdMs ? 'warning'
        : 'normal';
  const minsRemaining = Math.ceil((shiftDurationMs - elapsedMs) / 60_000);

  // Load Transactions Log
  useEffect(() => {
    if (!activeShiftId) return;
    const qTx = query(
      collection(db, "transactions"),
      where("shiftId", "==", activeShiftId),
      where("isDeleted", "==", false)
      // orderBy("timestamp", "desc") // Client-side sort to avoid index requirements
    );
    const unsubscribe = onSnapshot(qTx, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      docs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setTransactions(docs);
    });
    return () => unsubscribe();
  }, [activeShiftId]);


  const handleLogoutOnly = () => {
    auth.signOut();
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

  const addItemToCart = (itemData, qty = 1, overridePrice = null) => {
    const p = overridePrice !== null ? overridePrice : Number(itemData.price || 0);
    const cartItem = {
      id: Date.now() + Math.random(),
      serviceId: itemData.id || null,
      parentServiceId: itemData.parentServiceId || null,
      variantGroup: itemData.variantGroup || null,
      variantLabel: itemData.posLabel || null,
      serviceName: itemData.serviceName || itemData.posLabel,
      price: p,
      costPrice: itemData.costPrice || 0,
      trackStock: itemData.trackStock || false,
      quantity: qty,
    };

    const newItems = [...currentOrder.items];
    const existing = newItems.find(i => i.serviceName === cartItem.serviceName && i.price === cartItem.price);
    if (existing) {
      existing.quantity += qty;
    } else {
      newItems.push(cartItem);
    }
    updateCurrentOrder({ items: newItems });
    // showSnackbar(`Added ${qty}x ${cartItem.serviceName}`); // Optional, can be noisy
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
      if (expenseType !== 'Salary Advance' && !isAdmin && !notes) {
        return showSnackbar("Notes required for expenses.", "error");
      }

      if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) return showSnackbar("Select Staff.", "error");

      setIsLoading(true); // START LOADING
      try {
        const displayId = await generateDisplayId("expenses", "EXP");

        await addDoc(collection(db, 'transactions'), {
          displayId,
          item,
          expenseType,
          expenseStaffId: expenseStaffId || null,
          expenseStaffName: expenseStaffName || null,
          quantity: qtyNum,
          price: priceNum,
          total: qtyNum * priceNum,
          notes: notes || '',
          timestamp: serverTimestamp(),
          staffEmail: user.email,
          shiftId: activeShiftId,
          category: 'Expense',
          isDeleted: false
        });
        setItem(''); setQuantity(''); setPrice(''); setNotes('');
        setExpenseType('');
        showSnackbar(`${item} recorded successfully.`);
      } catch (e) {
        console.error(e);
        showSnackbar("Failed to save action.", "error");
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

  const addOrderTab = () => {
    const newOrderIds = orders
      .filter(o => !o.isExisting && typeof o.id === 'number')
      .map(o => o.id);
    const maxId = newOrderIds.length > 0 ? Math.max(...newOrderIds) : 0;
    const newId = maxId + 1;
    setOrders([...orders, { id: newId, items: [], customer: null }]);
    setActiveTab(orders.length);
  };

  const closeOrderTab = (e, index) => {
    e.stopPropagation();
    if (orders.length === 1) {
      setOrders([{ id: 1, items: [], customer: null }]);
      return;
    }
    const newOrders = orders.filter((_, i) => i !== index);
    setOrders(newOrders);
    if (activeTab >= index && activeTab > 0) setActiveTab(activeTab - 1);
  };

  const updateCurrentOrder = (updates) => {
    setOrders(prev => {
      const copy = [...prev];
      copy[activeTab] = { ...copy[activeTab], ...updates };
      return copy;
    });
  };

  const removeFromCart = (index) => {
    const item = currentOrder.items[index];
    if (currentOrder.isExisting && item.transactionId) {
      setDeleteCartItemState({ tabIndex: activeTab, itemIndex: index });
    } else {
      const items = currentOrder.items.filter((_, i) => i !== index);
      updateCurrentOrder({ items });
    }
  };

  const openLineItemEdit = (item, index) => {
    setEditingLineItem({ ...item, index });
    setEditItemError('');
    setEditItemDialog(true);
  };

  const saveLineItemEdit = () => {
    if (editingLineItem.transactionId && !editingLineItem.editReason?.trim()) {
      setEditItemError("Reason for edit is required.");
      return;
    }

    const items = [...currentOrder.items];
    const idx = editingLineItem.index;
    if (idx >= 0 && idx < items.length) {
      items[idx] = {
        ...items[idx],
        price: Number(editingLineItem.price),
        quantity: Number(editingLineItem.quantity),
        serviceName: editingLineItem.serviceName,
        editReason: editingLineItem.editReason
      };
      updateCurrentOrder({ items });
    }
    setEditItemDialog(false);
  };

  const handleCheckout = async (paymentData, shouldPrint = false) => {
    setIsLoading(true); // START LOADING
    try {
      const isUnpaid = paymentData.paymentMethod === 'Charge' || paymentData.paymentMethod === 'Pay Later'; // Detect Debt
      const orderNum = await generateOrderNumber();
      const fullOrder = {
        orderNumber: orderNum,
        shiftId: activeShiftId,
        invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID',
        isDeleted: false,
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

      const orderRef = await addDoc(collection(db, 'orders'), fullOrder);

      // Create AR invoice when payment method is Charge
      if (paymentData.paymentMethod === 'Charge') {
        await createInvoice(
          { ...fullOrder, id: orderRef.id },
          { staffEmail: user.email, shiftId: activeShiftId, dueDate: paymentData.dueDate || null }
        );
      }

      // Generate Batch IDs for line items
      const txIds = await generateBatchIds("transactions", "TX", currentOrder.items.length);

      const batch = writeBatch(db);
      currentOrder.items.forEach((item, index) => {
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          displayId: txIds[index],
          item: item.serviceName,
          serviceId: item.serviceId || null,
          parentServiceId: item.parentServiceId || null,
          variantGroup: item.variantGroup || null,
          variantLabel: item.variantLabel || null,
          price: Number(item.price),
          unitCost: Number(item.costPrice || 0),
          quantity: Number(item.quantity),
          total: Number(item.price) * Number(item.quantity),
          timestamp: serverTimestamp(),
          staffEmail: user.email,
          customerName: currentOrder.customer?.fullName || 'Walk-in',
          customerId: currentOrder.customer?.id || null,
          shiftId: activeShiftId,
          orderNumber: orderNum,
          category: 'Revenue',
          financialCategory: 'Revenue',
          paymentMethod: paymentData.paymentMethod,
          paymentDetails: paymentData.paymentDetails || {},
          invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID',
          isDeleted: false
        });

        // INVENTORY DEDUCTION
        if (item.trackStock && item.serviceId) {
          const svcRef = doc(db, 'services', item.serviceId);
          batch.update(svcRef, {
            stockCount: increment(-Number(item.quantity))
          });
        }
      });
      await batch.commit();


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
        // Use shared normalizer for consistent receipt
        setPrintOrder(normalizeReceiptData(fullOrder, {
          staffName: staffDisplayName,
          isReprint: false // Use current timestamp
        }));
      }

      if (orders.length > 1) {
        closeOrderTab({ stopPropagation: () => { } }, activeTab);
      } else {
        updateCurrentOrder({ items: [], customer: null });
      }

    } catch (err) {
      console.error(err);
      showSnackbar("Transaction failed.", 'error');
    } finally {
      setIsLoading(false); // STOP LOADING
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
      const batch = writeBatch(db);
      selectedTransactions.forEach(id => {
        batch.update(doc(db, 'transactions', id), {
          isDeleted: true,
          deletedBy: user.email,
          deleteReason: reason,
          deletedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setSelectedTransactions([]);
      showSnackbar("Transaction(s) successfully deleted.");
    } catch (e) {
      console.error("Error deleting transactions:", e);
      showSnackbar("Failed to delete transactions", 'error');
    }
  };
  // --- ORDER DELETION HANDLERS ---
  const handleDeleteOrders = () => {
    if (selectedOrders.length === 0) return;
    setDeleteOrderDialog(true);
  };

  const handleConfirmDeleteOrders = async (reason) => {
    try {
      // Collect orderNumbers for the selected orders
      const deletedOrderNums = selectedOrders
        .map(id => shiftOrders.find(o => o.id === id)?.orderNumber)
        .filter(Boolean);

      const batch = writeBatch(db);

      // Mark orders as deleted
      selectedOrders.forEach(id => {
        batch.update(doc(db, 'orders', id), {
          isDeleted: true,
          deletedBy: user.email,
          deleteReason: reason,
          deletedAt: serverTimestamp()
        });
      });

      // Cascade: soft-delete all linked transactions
      await Promise.all(deletedOrderNums.map(async (orderNum) => {
        const txSnap = await getDocs(query(
          collection(db, 'transactions'),
          where('orderNumber', '==', orderNum),
          where('shiftId', '==', activeShiftId)
        ));
        txSnap.forEach(d => {
          batch.update(d.ref, {
            isDeleted: true,
            deletedBy: user.email,
            deleteReason: reason,
            deletedAt: serverTimestamp()
          });
        });
      }));

      await batch.commit();
      setSelectedOrders([]);
      showSnackbar("Order(s) and linked transactions successfully deleted.");
    } catch (e) {
      console.error("Error deleting orders:", e);
      showSnackbar("Failed to delete orders", 'error');
    }
  };

  const handleOpenEditTx = (tx) => {
    setEditingTx(tx);
    setEditTxDialog(true);
  };

  const handleEditTx = async (id, updates) => {
    try {
      await updateDoc(doc(db, 'transactions', id), updates);
      setEditTxDialog(false);
      setEditingTx(null);
      showSnackbar("Transaction successfully updated.");
    } catch (e) {
      console.error("Error editing transaction:", e);
      showSnackbar("Failed to edit transaction", 'error');
    }
  };

  const handleOpenOrderAsTab = async (order) => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('orderNumber', '==', order.orderNumber),
        where('isDeleted', '==', false)
      );
      const snap = await getDocs(q);
      const loadedItems = snap.docs.map(d => {
        const data = d.data();
        return {
          id: Date.now() + Math.random(), // Temp UI ID
          transactionId: d.id, // Real DB ID
          name: data.item,
          serviceName: data.item, // For backward compatibility in UI
          price: Number(data.price),
          quantity: Number(data.quantity),
          subtotal: Number(data.total), // ADDED
          total: Number(data.total), // ADDED
          notes: data.notes || '',
        };
      });

      const newTab = {
        id: 'ord-' + order.orderNumber,
        isExisting: true,
        orderNumber: order.orderNumber,
        originalId: order.id,
        items: loadedItems,
        deletedItems: [],
        customer: {
          fullName: order.customerName,
          id: order.customerId,
          email: '',
          phone: order.customerPhone || '',
          address: order.customerAddress || '',
          tin: order.customerTin || '', // Ensure legacy orders work too
        },
        paymentMethod: order.paymentMethod,
        paymentDetails: order.paymentDetails,
        amountTendered: order.amountTendered,
        change: order.change,
        total: order.total
      };

      setOrders(prev => {
        const exists = prev.findIndex(o => o.orderNumber === order.orderNumber);
        if (exists >= 0) {
          // Update existing tab with fresh data (e.g. if TIN was added)
          const next = [...prev];
          next[exists] = newTab;
          setActiveTab(exists);
          return next;
        }
        const next = [...prev, newTab];
        setActiveTab(prev.length);
        return next;
      });
    } catch (e) {
      console.error("Error opening order:", e);
      showSnackbar("Failed to open order.", 'error');
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
    setIsLoading(true); // START LOADING
    try {
      const batch = writeBatch(db);
      const finalItems = [];

      // 1. Pre-generate IDs for new items
      const newItemsCount = order.items.filter(i => !i.transactionId).length;
      let newIds = [];
      if (newItemsCount > 0) {
        newIds = await generateBatchIds("transactions", "TX", newItemsCount);
      }
      let newIdIndex = 0;

      // 2. Process Items (Add & Update)
      for (const item of order.items) {
        const itemData = {
          item: item.name || item.serviceName,
          price: Number(item.price),
          quantity: Number(item.quantity),
          total: Number(item.price) * Number(item.quantity),
          notes: item.notes || '',
        };
        if (item.editReason) itemData.editReason = item.editReason;

        if (item.transactionId) {
          const ref = doc(db, 'transactions', item.transactionId);
          batch.update(ref, {
            ...itemData,
            paymentMethod: paymentData.paymentMethod,
            paymentDetails: paymentData.paymentDetails || {} // ADDED
          });
        } else {
          const ref = doc(collection(db, 'transactions'));
          // Use pre-generated ID
          const displayId = newIds[newIdIndex++] || `TEMP-${Date.now()}`;

          batch.set(ref, {
            ...itemData,
            displayId, // Assigned here
            timestamp: serverTimestamp(),
            staffEmail: user.email,
            customerName: order.customer?.fullName || 'Walk-in',
            customerId: order.customer?.id || null,
            shiftId: activeShiftId,
            orderNumber: order.orderNumber,
            category: 'Revenue',
            financialCategory: 'Revenue', // Explicit
            paymentMethod: paymentData.paymentMethod,
            paymentDetails: paymentData.paymentDetails || {}, // ADDED
            isDeleted: false
          });
        }
        finalItems.push({
          ...itemData,
          name: itemData.item // Ensuring 'name' is saved in 'orders' items array too
        });
      }

      // 2. Process Deletions
      if (order.deletedItems) {
        order.deletedItems.forEach(delItem => {
          const ref = doc(db, 'transactions', delItem.transactionId);
          batch.update(ref, {
            isDeleted: true,
            deletedBy: user.email,
            deleteReason: delItem.deleteReason,
            deletedAt: serverTimestamp()
          });
        });
      }

      // 3. Update Order Doc
      const orderRef = doc(db, 'orders', order.originalId);
      const updateObj = {
        items: finalItems,
        total: currentTotal,
        subtotal: currentTotal,
        paymentMethod: paymentData.paymentMethod,
        paymentDetails: paymentData.paymentDetails || {},
        amountTendered: Number(paymentData.amountTendered),
        change: Number(paymentData.change),
        updatedAt: serverTimestamp()
      };

      batch.update(orderRef, updateObj);

      await batch.commit();

      // TRIGGER DRAWER for Updates too
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
          ...updateObj,
          id: order.originalId,
          timestamp: new Date()
        });
      }

      // Close Tab Logic (Manually remove from state)
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
      showSnackbar("Update failed.", 'error');
    } finally {
      setIsLoading(false); // STOP LOADING
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
      <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          {/* Hamburger → opens staff sidebar */}
          <IconButton size="small" onClick={() => setSidebarOpen(true)} sx={{ mr: 0.5 }}>
            <MenuIcon />
          </IconButton>

          {/* Branding */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {systemSettings.logoUrl ? (
              <img src={systemSettings.logoUrl} alt="logo" height={32} style={{ maxWidth: 120, objectFit: 'contain' }} />
            ) : (
              <img src={logo} alt="logo" width={24} height={24} />
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', lineHeight: 1.2, color: 'text.primary', letterSpacing: '0.02em' }}>
                {systemSettings.storeName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem', opacity: 0.8 }}>
                {staffDisplayName} • {shiftPeriod}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Shift timer */}
          {elapsed !== '00:00:00' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'monospace', mr: 1 }}>
              {elapsed}
            </Typography>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, alignItems: 'center' }}>
            <Tooltip title={posView === 'new' ? 'Switch to Classic POS' : 'Switch to New POS (Grid)'}>
              <Chip
                size="small"
                icon={posView === 'new' ? <ViewListIcon sx={{ fontSize: '1rem !important' }} /> : <AppsIcon sx={{ fontSize: '1rem !important' }} />}
                label={posView === 'new' ? 'Classic' : 'Grid'}
                onClick={togglePosView}
                variant="outlined"
                sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
              />
            </Tooltip>
            <Button size="small" variant="outlined" color="primary" onClick={() => setOpenHistoryDrawer(true)} startIcon={<HistoryIcon />}>Logs</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => setOpenDrawerDialog(true)}>Drawer</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => setOpenExpense(true)}>+ Expense</Button>
            <Button size="small" variant="contained" color="error" onClick={() => setOpenEndShiftDialog(true)}>End Shift</Button>
          </Box>

          {/* Mobile Menu */}
          <MuiMenu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenHistoryDrawer(true); }}>Logs</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenExpense(true); }}>+ Expense</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenInvoiceLookup(true); }}>Invoices / Receivables</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenEndShiftDialog(true); }}>End Shift</MenuItem>
          </MuiMenu>
        </Toolbar>
      </AppBar>

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
      <POSSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogoutOnly}
        showSnackbar={showSnackbar}
        onOpenInvoices={() => setOpenInvoiceLookup(true)}
      />

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
              <POSItemGrid posItems={posItems} variantMap={variantMap} onItemClick={handleGridItemClick} onPCSession={handlePCSession} onTabChange={setGridTab} pcRentalEnabled={systemSettings.pcRentalEnabled !== false} />
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
            {/* TOP: Add to Order form (classic) or collapsible manual entry (grid) */}
            {posView === 'legacy' && (
              <Box sx={{ borderBottom: 1, borderColor: 'divider', p: 1.5, flexShrink: 0, bgcolor: 'background.default' }}>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5, fontSize: '0.65rem', display: 'block', mb: 0.75 }}>
                  Add to Order
                </Typography>

                {/* Contextual: Expense type + staff */}
                {item === 'Expenses' && (
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Type</InputLabel>
                      <Select value={expenseType} label="Type" onChange={e => setExpenseType(e.target.value)}>
                        {expenseServiceItems.map(e => <MenuItem key={e.id} value={e.serviceName}>{e.serviceName}</MenuItem>)}
                      </Select>
                    </FormControl>
                    {(expenseType === 'Salary' || expenseType === 'Salary Advance') && (
                      <FormControl fullWidth size="small">
                        <InputLabel>Staff</InputLabel>
                        <Select value={expenseStaffEmail} label="Staff" onChange={e => {
                          const s = staffOptions.find(o => o.email === e.target.value);
                          if (s) { setExpenseStaffEmail(s.email); setExpenseStaffId(s.id); setExpenseStaffName(s.fullName); }
                        }}>
                          {staffOptions.map(s => <MenuItem key={s.id} value={s.email}>{s.fullName}</MenuItem>)}
                        </Select>
                      </FormControl>
                    )}
                  </Stack>
                )}

                {/* Contextual: Debt customer */}
                {(item === 'New Debt' || item === 'Paid Debt') && (
                  <Box sx={{ border: '1px dashed', borderColor: 'divider', p: 1, borderRadius: 1, mb: 1 }}>
                    {selectedCustomer ? (
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" fontWeight="bold">{selectedCustomer.fullName}</Typography>
                        <IconButton size="small" onClick={() => setSelectedCustomer(null)}><ClearIcon fontSize="small" /></IconButton>
                      </Box>
                    ) : (
                      <Button fullWidth size="small" variant="outlined" onClick={() => setOpenCustomerDialog(true)}>Select Customer</Button>
                    )}
                  </Box>
                )}

                {/* Notes for expenses — shown above main row */}
                {item === 'Expenses' && (
                  <TextField
                    label="Notes"
                    size="small"
                    fullWidth
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                )}

                {/* Main row: Item | Qty | Price | Add */}
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Autocomplete
                    sx={{ flex: 3 }}
                    size="small"
                    freeSolo
                    options={[...new Set([...services.map(s => s.serviceName), "Expenses"])]}
                    value={item}
                    onChange={(e, newVal) => handleItemChange({ target: { value: newVal || '' } })}
                    renderInput={(params) => <TextField {...params} label="Item / Service" placeholder="Search or type..." />}
                  />
                  <TextField
                    label="Qty"
                    type="number"
                    size="small"
                    inputRef={quantityInputRef}
                    sx={{ flex: 1, minWidth: 60 }}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    disabled={!item}
                    onKeyDown={e => e.key === 'Enter' && handleAddEntry()}
                  />
                  <TextField
                    label="Price"
                    type="number"
                    size="small"
                    inputRef={priceInputRef}
                    sx={{ flex: 1, minWidth: 70 }}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    disabled={!item}
                    onKeyDown={e => e.key === 'Enter' && handleAddEntry()}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddEntry}
                    disabled={!item || !quantity || !price}
                    sx={{ height: 40, px: 2, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {item === 'Expenses' || isDebtItem ? 'Log' : 'Add'}
                  </Button>
                </Stack>
              </Box>
            )}

            {posView === 'new' && <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Box
                p={1}
                bgcolor="background.default"
                display="flex"
                alignItems="center"
                sx={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setManualEntryOpen(o => !o)}
              >
                <AddIcon sx={{ mr: 1, opacity: 0.6, fontSize: '1.2rem' }} />
                <Typography variant="body2" fontWeight="bold" color="text.primary" sx={{ flex: 1 }}>Manual Entry / Misc</Typography>
                {manualEntryOpen
                  ? <ExpandLessIcon fontSize="small" sx={{ opacity: 0.4 }} />
                  : <ExpandMoreIcon fontSize="small" sx={{ opacity: 0.4 }} />}
              </Box>
              <Collapse in={manualEntryOpen}>
                <Box p={1} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* CONDITIONAL EXTRA FIELDS (Expenses/Debt) */}
                  {item === 'Expenses' && (
                    <Stack direction="row" spacing={1}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select value={expenseType} label="Type" onChange={e => setExpenseType(e.target.value)}>
                          {expenseServiceItems.map(e => <MenuItem key={e.id} value={e.serviceName}>{e.serviceName}</MenuItem>)}
                        </Select>
                      </FormControl>
                      {(expenseType === 'Salary' || expenseType === 'Salary Advance') && (
                        <FormControl fullWidth size="small">
                          <InputLabel>Staff</InputLabel>
                          <Select value={expenseStaffEmail} label="Staff" onChange={e => {
                            const s = staffOptions.find(o => o.email === e.target.value);
                            if (s) { setExpenseStaffEmail(s.email); setExpenseStaffId(s.id); }
                          }}>
                            {staffOptions.map(s => <MenuItem key={s.id} value={s.email}>{s.fullName}</MenuItem>)}
                          </Select>
                        </FormControl>
                      )}
                    </Stack>
                  )}

                  {(item === 'New Debt' || item === 'Paid Debt') && (
                    <Box sx={{ border: '1px dashed', borderColor: 'divider', p: 1, borderRadius: 1 }}>
                      {selectedCustomer ? (
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight="bold">{selectedCustomer.fullName}</Typography>
                          <IconButton size="small" onClick={() => setSelectedCustomer(null)}><ClearIcon fontSize="small" /></IconButton>
                        </Box>
                      ) : (
                        <Button fullWidth size="small" variant="outlined" onClick={() => setOpenCustomerDialog(true)}>Select Customer</Button>
                      )}
                    </Box>
                  )}

                  {/* MAIN MANUAL INPUT ROW */}
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      sx={{ flex: 3 }}
                      size="small"
                      freeSolo
                      options={[...new Set([
                        ...services.map(s => s.serviceName),
                        "Expenses"
                      ])]}
                      value={item}
                      onChange={(e, newVal) => handleItemChange({ target: { value: newVal } })}
                      renderInput={(params) => <TextField {...params} label="Item / Service" placeholder="Keyboard Search" />}
                    />

                    <TextField
                      label="Qty"
                      type="number"
                      size="small"
                      inputRef={quantityInputRef}
                      sx={{ flex: 1.5 }}
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      disabled={!item}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                    />
                    <TextField
                      label="Price"
                      type="number"
                      size="small"
                      inputRef={priceInputRef}
                      sx={{ flex: 1.5 }}
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      disabled={!item}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                    />

                    <Button
                      variant="outlined"
                      size="large"
                      onClick={handleAddEntry}
                      sx={{ flex: 1.5, height: 40, whiteSpace: 'nowrap', minWidth: 'auto', px: 1 }}
                      disabled={!item || !quantity || !price}
                    >
                      {item === 'Expenses' || isDebtItem ? "Log" : "Add"}
                    </Button>
                  </Stack>
                </Box>
              </Collapse>
            </Box>}

            {/* CART (Flex Grow) */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider">
                <ShoppingCartIcon sx={{ mr: 1, opacity: 0.6 }} />
                <Typography variant="subtitle2" fontWeight="bold">Current Order</Typography>
              </Box>

              {/* Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', display: 'flex', alignItems: 'center' }}>
                <Tabs
                  value={activeTab}
                  onChange={(e, v) => setActiveTab(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 40, flex: 1, '& .MuiTab-root': { minHeight: 40 } }}
                >
                  {orders.map((ord, idx) => (
                    <Tab
                      key={ord.id}
                      label={
                        <Box display="flex" alignItems="center" gap={1}>
                          {ord.isExisting ? ord.orderNumber : `Order ${ord.id}`}
                          {orders.length > 1 && (
                            <CloseIcon
                              fontSize="small"
                              onClick={(e) => closeOrderTab(e, idx)}
                              sx={{ opacity: 0.6, '&:hover': { opacity: 1 }, ml: 0.5 }}
                            />
                          )}
                        </Box>
                      }
                    />
                  ))}
                </Tabs>
                <IconButton onClick={addOrderTab} size="small" sx={{ mx: 1 }}><AddIcon fontSize="small" /></IconButton>
              </Box>

              {/* Customer */}
              <Box
                sx={{
                  p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', cursor: 'pointer',
                  bgcolor: currentOrder?.customer ? 'rgba(209, 0, 0, 0.15)' : 'background.paper'
                }}
                onClick={() => setOpenOrderCustomerDialog(true)}
              >
                <PersonAddIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="body2" fontWeight="bold" sx={{ flexGrow: 1 }}>
                  {currentOrder?.customer ? currentOrder.customer.fullName : "Customer: Walk-in"}
                </Typography>
              </Box>

              {/* Order Total — prominent, above cart items */}
              <Box sx={{
                px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                bgcolor: 'background.paper', flexShrink: 0,
              }}>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                  Order Total
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="primary">
                  {currency(currentTotal)}
                </Typography>
              </Box>

              {/* Cart Items Table */}
              <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'background.paper', width: '40%' }}>Product</TableCell>
                      <TableCell align="center" sx={{ bgcolor: 'background.paper', width: '15%' }}>Qty</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '15%' }}>Price</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '20%' }}>Total</TableCell>
                      <TableCell align="center" sx={{ bgcolor: 'background.paper', width: '10%' }}><CloseIcon fontSize="small" sx={{ opacity: 0.5 }} /></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentOrder.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>Cart is empty</TableCell>
                      </TableRow>
                    ) : (
                      currentOrder.items.map((it, idx) => (
                        <TableRow
                          key={idx}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => openLineItemEdit(it, idx)}
                        >
                          <TableCell sx={{ width: '40%' }}>
                            <Typography variant="body2" fontWeight="bold">{it.serviceName}</Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ width: '15%' }}>{it.quantity}</TableCell>
                          <TableCell align="right" sx={{ width: '15%' }}>{currency(it.price)}</TableCell>
                          <TableCell align="right" sx={{ width: '20%' }}>{currency(it.price * it.quantity)}</TableCell>
                          <TableCell align="center" sx={{ width: '10%' }} onClick={(e) => e.stopPropagation()}>
                            <IconButton size="small" color="error" onClick={() => removeFromCart(idx)}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Footer */}
              <Box p={2} borderTop={1} borderColor="divider" bgcolor="background.paper">
                {currentOrder.isExisting ? (
                  <Stack direction="row" spacing={1}>
                    <Button fullWidth variant="contained" size="large" onClick={() => setOpenCheckout(true)} disabled={currentOrder.items.length === 0}>
                      UPDATE
                    </Button>
                    <Button variant="outlined" size="large" startIcon={<PrintIcon />} onClick={() => handlePrintExistingOrder({ ...currentOrder, total: currentTotal })}>
                      RECEIPT
                    </Button>
                    <Button variant="outlined" size="large" onClick={() => handlePrintExistingInvoice({ ...currentOrder, total: currentTotal })}>
                      INVOICE
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={() => setOpenCheckout(true)}
                    disabled={currentOrder.items.length === 0}
                  >
                    CHECKOUT
                    {systemSettings.checkoutHotkey?.display && (
                      <Box component="span" sx={{ ml: 0.75, fontSize: '0.55rem', opacity: 0.55, fontWeight: 'normal', letterSpacing: 0 }}>
                        [{systemSettings.checkoutHotkey.display}]
                      </Box>
                    )}
                  </Button>
                )}
              </Box>
            </Box>
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
      <DrawerDialog open={openDrawerDialog} onClose={() => setOpenDrawerDialog(false)} user={user} showSnackbar={showSnackbar} />

      {/* End Shift Dialog Component */}
      <EndShiftDialog
        open={openEndShiftDialog}
        onClose={() => setOpenEndShiftDialog(false)}
        activeShiftId={activeShiftId}
        user={user}
        transactions={transactions}
        onShiftEnded={onShiftEnded}
        showSnackbar={showSnackbar}
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
      />
      <POSInvoiceLookupDrawer
        open={openInvoiceLookup}
        onClose={() => setOpenInvoiceLookup(false)}
        user={user}
        showSnackbar={showSnackbar}
        activeShiftId={activeShiftId}
      />

      {/* Customer Dialog (For Debt Log) */}
      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        user={user}
        showSnackbar={showSnackbar}
        onSelectCustomer={(c) => {
          // Only used for Debt now
          setSelectedCustomer(c);
          setOpenCustomerDialog(false);
        }}
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

      <VariablePriceDialog
        open={Boolean(variablePriceItem)}
        item={variablePriceItem}
        onClose={() => setVariablePriceItem(null)}
        onSubmit={(price) => {
          addItemToCart(variablePriceItem, 1, price);
          setVariablePriceItem(null);
        }}
      />

      {/* NEW: Order Customer Dialog (For POS) */}
      <OrderCustomerDialog
        open={openOrderCustomerDialog}
        onClose={() => setOpenOrderCustomerDialog(false)}
        currentCustomer={currentOrder?.customer}
        onSetCustomer={(c) => updateCurrentOrder({ customer: c })}
        showSnackbar={showSnackbar}
      />

      {/* Edit Line Item */}
      <Dialog open={editItemDialog} onClose={() => setEditItemDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Name" fullWidth value={editingLineItem?.serviceName || ''} onChange={e => setEditingLineItem({ ...editingLineItem, serviceName: e.target.value })} />
            <TextField label="Price" type="number" fullWidth value={editingLineItem?.price || ''} onChange={e => setEditingLineItem({ ...editingLineItem, price: e.target.value })} />
            <TextField label="Qty" type="number" fullWidth value={editingLineItem?.quantity || ''} onChange={e => setEditingLineItem({ ...editingLineItem, quantity: e.target.value })} />
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

      <ExpenseDialog
        open={openExpense}
        onClose={() => setOpenExpense(false)}
        user={user}
        userRole={userRole}
        activeShiftId={activeShiftId}
        expenseTypes={expenseServiceItems} // Re-using fetched types
        staffOptions={staffOptions}
        showSnackbar={showSnackbar}
      />

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
                  {shiftPeriod} Shift — {new Date().toLocaleDateString()}
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
                  {endShiftReceiptData.arGcashTotal > 0 && (
                    <Box display="flex" justifyContent="space-between" pl={1}>
                      <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (GCash)</Typography>
                      <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arGcashTotal)}</Typography>
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
                  <Typography variant="body2">GCash</Typography>
                  <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.gcash)}</Typography>
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
                {shiftPeriod} Shift — {new Date().toLocaleDateString()}
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
                {endShiftReceiptData.arGcashTotal > 0 && (
                  <Box display="flex" justifyContent="space-between" pl={1}>
                    <Typography sx={{ fontSize: '0.75rem' }}>AR Payments (GCash)</Typography>
                    <Typography sx={{ fontSize: '0.75rem' }}>{currency(endShiftReceiptData.arGcashTotal)}</Typography>
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
                <Typography variant="body2">GCash</Typography>
                <Typography variant="body2">{currency(endShiftReceiptData?.breakdown?.gcash)}</Typography>
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
            onClick={() => auth.signOut()}
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
      {/* GLOBAL SNACKBAR */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>






      {/* GLOBAL LOADING BACKDROP */}
      {isLoading && <LoadingScreen overlay={true} message="Processing..." />}
    </Box >
  );
}

// Wrapper to export
export default POSContent;