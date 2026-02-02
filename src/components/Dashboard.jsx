import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, AppBar, Toolbar, TextField,
  Select, MenuItem, FormControl, InputLabel, Paper, IconButton, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Menu as MuiMenu, useMediaQuery, Chip, Tabs, Tab, List, ListItem,
  Grid, Checkbox, Avatar, CssBaseline, Tooltip, Divider, ListItemButton, Switch,
  Autocomplete, Snackbar, Alert, Backdrop, CircularProgress // ADDED
} from '@mui/material';
import { useTheme, createTheme, ThemeProvider } from '@mui/material/styles';

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

// Components
import OrderCustomerDialog from './OrderCustomerDialog';
import CustomerDialog from './CustomerDialog';
import StaffDebtLookupDialog from './StaffDebtLookupDialog';
import CheckoutDialog from './CheckoutDialog';
import ExpenseDialog from './ExpenseDialog';
import DrawerDialog from './DrawerDialog';
import EndShiftDialog from './EndShiftDialog';
import EditTransactionDialog from './EditTransactionDialog';
import DeleteTransactionDialog from './DeleteTransactionDialog'; // ADDED
import ChangeDisplayDialog from './ChangeDisplayDialog'; // ADDED
import { SimpleReceipt } from './SimpleReceipt';

// Firebase
import { auth, db } from '../firebase';
import {
  collection, addDoc, query, onSnapshot, orderBy, doc, writeBatch,
  updateDoc, where, setDoc, serverTimestamp, getDocs, getDoc
} from 'firebase/firestore';

// Helpers
import { openDrawer } from '../utils/drawerService';
import { generateOrderNumber, createOrderObject } from '../utils/orderService';

import logo from '/icon.ico';

// Helper for currency display
const currency = (num) => `₱${Number(num || 0).toFixed(2)}`;

// --- DEFINING THEME LOCALLY TO FORCE DARK/RED COLORS ---
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#d10000', // Red Primary
    },
    background: {
      default: '#000000', // Pure Black Background
      paper: '#0a0a0a',   // Off-Black Panels
    },
    text: {
      primary: '#ffffff',
      secondary: '#e0e0e0',
    },
    divider: '#333333',
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove default MUI gradients
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0a0a0a',
          backgroundImage: 'none',
          borderBottom: '1px solid #333333',
        }
      }
    }
  },
});

function DashboardContent({ user, userRole, activeShiftId, shiftPeriod }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // --- CORE POS STATE ---
  const [activeTab, setActiveTab] = useState(0);
  const [orders, setOrders] = useState([{ id: 1, items: [], customer: null }]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);

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
  const itemInputRef = useRef(null);

  // --- LEGACY SHIFT STATE ---
  const [shiftStart, setShiftStart] = useState(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [transactions, setTransactions] = useState([]);
  const [staffDisplayName, setStaffDisplayName] = useState(user?.email || '');
  const [staffOptions, setStaffOptions] = useState([]);
  const [expenseServiceItems, setExpenseServiceItems] = useState([]);

  // --- DIALOGS ---
  const [openDrawerDialog, setOpenDrawerDialog] = useState(false);
  const [openEndShiftDialog, setOpenEndShiftDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [customerDialogMode, setCustomerDialogMode] = useState('pos'); // 'pos' or 'debt'
  const [openOrderCustomerDialog, setOpenOrderCustomerDialog] = useState(false);
  const [openDebtDialog, setOpenDebtDialog] = useState(false);
  const [openCheckout, setOpenCheckout] = useState(false);
  const [openExpense, setOpenExpense] = useState(false); // For header button

  // --- EDIT LINE ITEM (Price/Qty) ---
  const [editItemDialog, setEditItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState(null);

  // --- EDIT PAST TX ---
  const [editTxDialog, setEditTxDialog] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deleteTxDialog, setDeleteTxDialog] = useState(false);
  const [deleteCartItemState, setDeleteCartItemState] = useState(null); // { tabIndex, itemIndex }
  const [openTxLog, setOpenTxLog] = useState(true); // NEW
  const [openOrderHistory, setOpenOrderHistory] = useState(true); // NEW
  const [editItemError, setEditItemError] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);

  // --- ORDER HISTORY SELECTION ---
  const [orderSelectionMode, setOrderSelectionMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [deleteOrderDialog, setDeleteOrderDialog] = useState(false);

  // --- PRINTING ---
  const [printOrder, setPrintOrder] = useState(null);
  const [printShiftData, setPrintShiftData] = useState(null); // ADDED
  const [showEndShiftReceipt, setShowEndShiftReceipt] = useState(false);
  const [endShiftReceiptData, setEndShiftReceiptData] = useState(null);

  // --- UI STATE ---
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [staffMenuAnchor, setStaffMenuAnchor] = useState(null);


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

  useEffect(() => {
    if (!selectionMode) setSelectedTransactions([]);
  }, [selectionMode]);

  // --- SETTINGS STATE ---
  const [systemSettings, setSystemSettings] = useState({
    drawerHotkey: { altKey: true, code: 'Backquote' }, // Fallback default
    logoUrl: null, // Fallback
  });

  // Load Settings on Mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSystemSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (e) { console.error("Error loading settings:", e); }
    };
    loadSettings();
  }, []);

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

  const currentOrder = orders[activeTab] || orders[0];
  const currentTotal = currentOrder?.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0;
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';
  const isAdmin = userRole === 'superadmin';

  // =========================================================================
  // 1. DATA LOADING & INITIALIZATION
  // =========================================================================

  // Load Services (Legacy + New Categories)
  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('sortOrder'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const expenseParent = items.find(i => i.serviceName === "Expenses");
      const expenseParentId = expenseParent ? expenseParent.id : null;

      // Main Service List (Exclude Expenses & Hidden)
      const serviceList = items.filter(i =>
        i.active &&
        i.category !== 'Credit' &&
        i.serviceName !== 'New Debt' && // ADDED
        i.serviceName !== 'Paid Debt' && // ADDED
        i.id !== expenseParentId &&
        i.parentServiceId !== expenseParentId &&
        i.adminOnly === false
      );

      // Expense Types (Children of "Expenses") - RESTORED FILTER
      const expTypes = items.filter(i =>
        i.parentServiceId === expenseParentId &&
        i.adminOnly === false
      );

      // Combine for Legacy Dropdown
      const comboList = [
        ...serviceList,
        // { id: 'nd', serviceName: 'New Debt' }, // DEPRECATED: Use 'Charge' at checkout
        { id: 'pd', serviceName: 'Paid Debt' } // Keep 'Paid Debt' for accepting payments for now
      ];

      const uniqueCats = [...new Set(serviceList.map(i => i.category || 'Other'))].sort();

      setServices(comboList);
      setCategories(uniqueCats);
      setExpenseServiceItems(expTypes);
    });
    return () => unsub();
  }, []);

  // Load Shift Orders
  useEffect(() => {
    if (!activeShiftId) return;
    const q = query(
      collection(db, 'orders'),
      where('shiftId', '==', activeShiftId),
      orderBy('orderNumber', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setShiftOrders(docs);
    });
    return () => unsub();
  }, [activeShiftId]);

  // Load Staff
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'staff'));
        const snap = await getDocs(q);
        const opts = snap.docs.map(d => {
          const data = d.data() || {};
          return {
            id: d.id,
            fullName: data.fullName || data.name || data.displayName || data.email || 'Staff',
            email: data.email || '',
          };
        });
        opts.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'en', { sensitivity: 'base' }));
        setStaffOptions(opts);
      } catch { setStaffOptions([]); }
    };
    loadStaff();
  }, []);

  // Shift Timer
  useEffect(() => {
    if (!activeShiftId) return;
    const fetchStart = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'shifts', activeShiftId));
        if (sDoc.exists()) {
          const data = sDoc.data();
          if (data?.startTime?.seconds) setShiftStart(new Date(data.startTime.seconds * 1000));
          else if (data?.startTime instanceof Date) setShiftStart(data.startTime);
        }
      } catch (e) {
        console.error("Error fetching shift start:", e);
      }
    };
    fetchStart();
  }, [activeShiftId]);

  useEffect(() => {
    if (!shiftStart) return;
    const id = setInterval(() => {
      const diffMs = Date.now() - shiftStart.getTime();
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, '0');
      setElapsed(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }, 1000);
    return () => clearInterval(id);
  }, [shiftStart]);

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

  // Display Name Logic
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const qMe = query(collection(db, 'users'), where('email', '==', user.email));
        const snap = await getDocs(qMe);
        if (!isMounted) return;
        if (!snap.empty) {
          setStaffDisplayName(snap.docs[0].data().fullName || snap.docs[0].data().name || snap.docs[0].data().displayName || user.displayName || user.email);
        } else {
          setStaffDisplayName(user.displayName || user.email);
        }
      } catch { }
    })();
    return () => { isMounted = false; };
  }, [user?.email]);

  // Auto-Print Trigger
  useEffect(() => {
    if (printOrder || printShiftData) {
      setTimeout(() => {
        window.print();
        setPrintOrder(null);
        setPrintShiftData(null);
      }, 500);
    }
  }, [printOrder, printShiftData]);

  const handleLogoutOnly = () => {
    try { auth.signOut(); } catch (e) { console.error('Logout failed:', e); }
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
    if (val !== 'New Debt' && val !== 'Paid Debt') {
      setSelectedCustomer(null);
    }
  };

  const handleAddEntry = async () => {
    if (!item) return showSnackbar("Please select an item.", "error");
    if (!quantity || !price) return showSnackbar("Quantity and Price are required.", "error");

    const qtyNum = Number(quantity);
    const priceNum = Number(price);
    if (isNaN(qtyNum) || qtyNum <= 0) return showSnackbar("Invalid quantity.", "error");
    if (isNaN(priceNum) || priceNum < 0) return showSnackbar("Invalid price.", "error");

    // A. DIRECT DATABASE WRITES (Expenses & Debts)
    if (item === 'Expenses' || item === 'New Debt' || item === 'Paid Debt') {

      // Expense Validation
      if (item === 'Expenses') {
        if (!expenseType) return showSnackbar("Select Expense Type.", "error");

        // Validation with Admin Override
        if (expenseType !== 'Salary Advance' && !isAdmin && !notes) {
          return showSnackbar("Notes required for expenses.", "error");
        }

        if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) return showSnackbar("Select Staff.", "error");
      }
      // Debt Validation
      if ((item === 'New Debt' || item === 'Paid Debt') && !selectedCustomer) {
        return showSnackbar("Select a Customer for debt.", "error");
      }

      setIsLoading(true); // START LOADING
      try {
        await addDoc(collection(db, 'transactions'), {
          item,
          expenseType: item === 'Expenses' ? expenseType : null,
          expenseStaffId: expenseStaffId || null,
          expenseStaffName: expenseStaffName || null,
          quantity: qtyNum,
          price: priceNum,
          total: qtyNum * priceNum,
          notes: notes || '',
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.fullName || null,
          timestamp: serverTimestamp(),
          staffEmail: user.email,
          shiftId: activeShiftId,
          category: item === 'Expenses' ? 'Credit' : 'Debt',
          isDeleted: false
        });
        setItem(''); setQuantity(''); setPrice(''); setNotes('');
        setExpenseType(''); setSelectedCustomer(null);
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
      serviceName: item,
      price: priceNum,
      costPrice: svc?.costPrice || 0, // CAPTURE COST
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
        invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID', // ADD STATUS
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

      await addDoc(collection(db, 'orders'), fullOrder);
      const batch = writeBatch(db);
      currentOrder.items.forEach(item => {
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          item: item.serviceName,
          price: Number(item.price),
          costPrice: Number(item.costPrice || 0), // SAVE COST
          quantity: Number(item.quantity),
          total: Number(item.price) * Number(item.quantity),
          timestamp: serverTimestamp(),
          staffEmail: user.email,
          customerName: currentOrder.customer?.fullName || 'Walk-in',
          customerId: currentOrder.customer?.id || null,
          shiftId: activeShiftId,
          orderNumber: orderNum,
          category: 'Revenue', // Always Revenue (Accrual)
          financialCategory: 'Revenue', // Explicit
          paymentMethod: paymentData.paymentMethod,
          paymentDetails: paymentData.paymentDetails || {}, // ADDED
          invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID', // ADD STATUS
          isDeleted: false
        });
      });
      await batch.commit();


      if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
        setLastChange(paymentData.change);
        setChangeDialogOpen(true);
      }
      showSnackbar("Transaction completed!", "success");

      openDrawer(user, 'transaction').catch(console.warn);

      setOpenCheckout(false);

      if (shouldPrint) {
        setPrintOrder(fullOrder);
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
      const batch = writeBatch(db);
      selectedOrders.forEach(id => {
        batch.update(doc(db, 'orders', id), {
          isDeleted: true,
          deletedBy: user.email,
          deleteReason: reason,
          deletedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setSelectedOrders([]);
      showSnackbar("Order(s) successfully deleted.");
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
          setActiveTab(exists);
          return prev;
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
    try {
      const batch = writeBatch(db);
      const finalItems = [];

      // 1. Process Items (Add & Update)
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
          batch.set(ref, {
            ...itemData,
            timestamp: serverTimestamp(),
            staffEmail: user.email,
            customerName: order.customer?.fullName || 'Walk-in',
            customerId: order.customer?.id || null,
            shiftId: activeShiftId,
            orderNumber: order.orderNumber,
            category: 'Revenue',
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
      setSuccessMessage("Order has been updated successfully.");
      setUpdateSuccessDialog(true);

    } catch (e) {
      console.error("Update failed:", e);
      showSnackbar("Update failed.", 'error');
    }
  };

  const handlePrintExistingOrder = (orderData) => {
    setPrintOrder({ ...orderData, timestamp: new Date() });
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
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', bgcolor: 'background.default', color: 'text.primary' }}>

      {/* FIXED: Passing 'order' to fix printing */}
      <SimpleReceipt order={printOrder} shiftData={printShiftData} staffName={staffDisplayName} settings={systemSettings} />

      {/* --- HEADER --- */}
      <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {systemSettings.logoUrl ? (
              <img src={systemSettings.logoUrl} alt="logo" height={25} style={{ maxWidth: 100, objectFit: 'contain' }} />
            ) : (
              <img src={logo} alt="logo" width={20} height={20} />
            )}
            <Box onClick={(e) => setStaffMenuAnchor(e.currentTarget)} sx={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2" sx={{ opacity: 0.9, lineHeight: 1, color: 'text.primary' }}>
                {staffDisplayName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                {shiftPeriod} Shift • {elapsed}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Action Buttons */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
            <Button size="small" variant="outlined" color="error" onClick={() => setOpenDrawerDialog(true)}>Drawer</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => setOpenExpense(true)}>+ Expense</Button>
            <Button size="small" variant="contained" color="error" onClick={() => setOpenEndShiftDialog(true)}>End Shift</Button>
          </Box>

          {/* Mobile Menu */}
          <IconButton sx={{ ml: 'auto', display: { xs: 'flex', sm: 'none' } }} onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MenuIcon />
          </IconButton>

          <MuiMenu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenDrawerDialog(true); }}>Drawer</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenExpense(true); }}>+ Expense</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenDebtDialog(true); }}>Debt Log</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenEndShiftDialog(true); }}>End Shift</MenuItem>
          </MuiMenu>

          <MuiMenu id="staff-menu" anchorEl={staffMenuAnchor} open={Boolean(staffMenuAnchor)} onClose={() => setStaffMenuAnchor(null)}>
            <MenuItem onClick={() => { setStaffMenuAnchor(null); setOpenDebtDialog(true); }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MoneyOffIcon fontSize="small" color="action" /> Debt Log
              </Box>
            </MenuItem>



            <MenuItem onClick={() => { setStaffMenuAnchor(null); handleLogoutOnly(); }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LogoutIcon fontSize="small" /> Logout
              </Box>
            </MenuItem>
          </MuiMenu>
        </Toolbar>
      </AppBar>

      {/* --- 2-COLUMN LAYOUT (50/50) --- */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: '#0e0e0e' }}>
        <Grid container sx={{ flex: 1, overflow: 'hidden', maxWidth: '1300px', width: '100%', bgcolor: 'background.default', borderLeft: 1, borderRight: 1, borderColor: 'divider' }}>

          {/* LEFT COLUMN (50%): ADD PRODUCT + CART */}
          <Box sx={{
            width: { xs: '100%', md: '50%' },
            maxWidth: { md: '50%' },
            flexBasis: { md: '50%' },
            display: 'flex',
            flexDirection: 'column',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            height: '100%',
            overflow: 'hidden'
          }}>
            {/* TOP: ADD PRODUCT */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider">
                <AddIcon sx={{ mr: 1, opacity: 0.6 }} />
                <Typography variant="subtitle2" fontWeight="bold" color="text.primary">Add Product</Typography>
              </Box>
              <Box p={2}>
                <Stack spacing={1}>
                  {/* Quick Actions (MOVED) */}
                  <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<MonitorIcon />}
                      onClick={() => { setItem("PC Rental"); setQuantity(1); setPrice(''); }}
                      sx={{ flex: 1, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                    >
                      PC Rental
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PrintIcon />}
                      onClick={() => { setItem("Print"); setQuantity(1); setPrice(''); }}
                      sx={{ flex: 1, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                    >
                      Print
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => { setItem("Photocopy"); setQuantity(1); setPrice(''); }}
                      sx={{ flex: 1, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                    >
                      Photocopy
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PhotoCameraIcon />}
                      onClick={() => { setItem("Photo"); setQuantity(1); setPrice(''); }}
                      sx={{ flex: 1, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                    >
                      ID Photo
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<LayersIcon />}
                      onClick={() => { setItem("Laminate"); setQuantity(1); setPrice(''); }}
                      sx={{ flex: 1, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                    >
                      Laminate
                    </Button>
                  </Stack>
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
                            if (s) { setExpenseStaffEmail(s.email); setExpenseStaffId(s.id); setExpenseStaffName(s.fullName); }
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
                        <Button fullWidth size="small" variant="outlined" onClick={() => { setCustomerDialogMode('debt'); setOpenCustomerDialog(true); }}>Select Customer</Button>
                      )}
                    </Box>
                  )}

                  {/* MAIN PRODUCT ROW (40/20/20/20) */}
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      sx={{ flex: 4 }}
                      size="small"
                      freeSolo
                      options={[...new Set([
                        ...services.map(s => s.serviceName),
                        "Expenses", "New Debt", "Paid Debt"
                      ])]}
                      value={item}
                      onChange={(e, newVal) => handleItemChange({ target: { value: newVal } })}
                      renderInput={(params) => <TextField {...params} label="Item / Service" />}
                    />

                    <TextField
                      label="Qty"
                      type="number"
                      size="small"
                      sx={{ flex: 2 }}
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      disabled={!item}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                    />
                    <TextField
                      label="Price"
                      type="number"
                      size="small"
                      sx={{ flex: 2 }}
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      disabled={!item}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                    />

                    <Button
                      variant="outlined"
                      size="large"
                      onClick={handleAddEntry}
                      sx={{ flex: 2, height: 40, whiteSpace: 'nowrap', minWidth: 'auto' }}
                      disabled={!item || !quantity || !price}
                    >
                      {item === 'Expenses' || isDebtItem ? "Log" : "Add"}
                    </Button>
                  </Stack>


                </Stack>


              </Box>
            </Box>

            {/* BOTTOM: POS CART (Flex Grow) */}
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
                <Box display="flex" justifyContent="space-between" mb={2}>
                  <Typography variant="h6">Total</Typography>
                  <Typography variant="h5" fontWeight="bold" color="primary">{currency(currentTotal)}</Typography>
                </Box>
                {currentOrder.isExisting ? (
                  <Stack direction="row" spacing={1}>
                    <Button fullWidth variant="contained" size="large" onClick={() => setOpenCheckout(true)} disabled={currentOrder.items.length === 0}>
                      UPDATE
                    </Button>
                    <Button variant="outlined" size="large" startIcon={<PrintIcon />} onClick={() => handlePrintExistingOrder({ ...currentOrder, total: currentTotal })}>
                      RECEIPT
                    </Button>
                  </Stack>
                ) : (
                  <Button fullWidth variant="contained" size="large" onClick={() => setOpenCheckout(true)} disabled={currentOrder.items.length === 0}>
                    CHECKOUT
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* RIGHT COLUMN (50%): LOGS + HISTORY */}
          <Box sx={{
            width: { xs: '100%', md: '50%' },
            maxWidth: { md: '50%' },
            flexBasis: { md: '50%' },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            height: '100%',
            overflow: 'hidden',
            justifyContent: 'flex-start' // Anchor to top
          }}>
            {/* TOP: TRANSACTION LOG */}
            <Box sx={{
              flexGrow: openTxLog ? 1 : 0,
              flexShrink: 0,
              flexBasis: '49px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderBottom: 1,
              borderColor: 'divider',
              transition: 'flex-grow 0.3s ease'
            }}>
              <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider" sx={{ height: 49, boxSizing: 'border-box' }}>
                <IconButton size="small" onClick={() => setOpenTxLog(!openTxLog)} sx={{ mr: 1 }}>
                  {openTxLog ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <HistoryIcon sx={{ mr: 1, opacity: 0.6 }} />
                <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1 }}>Transaction Log</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Toggle Selection Mode">
                    <Switch size="small" checked={selectionMode} onChange={(e) => setSelectionMode(e.target.checked)} />
                  </Tooltip>
                  {selectionMode && selectedTransactions.length === 1 && (
                    <Button size="small" variant="outlined" onClick={() => {
                      const tx = transactions.find(t => t.id === selectedTransactions[0]);
                      if (tx) handleOpenEditTx(tx);
                    }}>Edit</Button>
                  )}
                  {selectionMode && selectedTransactions.length > 0 && (
                    <Button size="small" color="error" onClick={handleDeleteLogs}>Delete</Button>
                  )}
                </Stack>
              </Box>
              <TableContainer sx={{ flex: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {selectionMode ? (
                        <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', width: '10%' }} />
                      ) : (
                        <TableCell sx={{ bgcolor: 'background.paper', width: '10%' }}>Select</TableCell>
                      )}
                      <TableCell sx={{ bgcolor: 'background.paper', width: '15%' }}>Time</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Product</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Details</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '15%' }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} hover selected={selectedTransactions.includes(tx.id)}>
                        {selectionMode ? (
                          <TableCell padding="checkbox" sx={{ width: '10%' }}>
                            <Checkbox size="small" checked={selectedTransactions.includes(tx.id)} onChange={() => setSelectedTransactions(p => p.includes(tx.id) ? p.filter(x => x !== tx.id) : [...p, tx.id])} />
                          </TableCell>
                        ) : (
                          <TableCell sx={{ width: '10%', opacity: 0.3 }}><Checkbox size="small" disabled /></TableCell>
                        )}
                        <TableCell sx={{ width: '15%' }}>{tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</TableCell>
                        <TableCell sx={{ width: '30%' }}>
                          {tx.item === 'Expenses' ? (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <Avatar sx={{ width: 16, height: 16, bgcolor: 'error.main', fontSize: 10 }}>E</Avatar>
                              <Typography variant="body2">{tx.expenseType}</Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" fontWeight="bold">{tx.item}</Typography>
                          )}
                          <Typography variant="caption" display="block" color="text.secondary">
                            {tx.expenseStaffName || ''}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: '30%' }}>
                          <Typography variant="caption" color="text.secondary">
                            {tx.quantity} x {currency(tx.price)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ width: '15%' }}>{currency(tx.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* BOTTOM: ORDER HISTORY */}
            <Box sx={{
              flexGrow: openOrderHistory ? 1 : 0,
              flexShrink: 0,
              flexBasis: '49px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: 'flex-grow 0.3s ease'
            }}>
              <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider" sx={{ height: 49, boxSizing: 'border-box' }}>
                <IconButton size="small" onClick={() => setOpenOrderHistory(!openOrderHistory)} sx={{ mr: 1 }}>
                  {openOrderHistory ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <PointOfSaleIcon sx={{ mr: 1, opacity: 0.6 }} />
                <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1 }}>Order History</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Toggle Selection Mode">
                    <Switch size="small" checked={orderSelectionMode} onChange={(e) => setOrderSelectionMode(e.target.checked)} />
                  </Tooltip>
                  {orderSelectionMode && selectedOrders.length > 0 && (
                    <Button size="small" color="error" onClick={handleDeleteOrders}>Delete</Button>
                  )}
                </Stack>
              </Box>
              <TableContainer sx={{ flex: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {orderSelectionMode ? (
                        <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', width: '10%' }} />
                      ) : (
                        <TableCell sx={{ bgcolor: 'background.paper', width: '10%' }}>Select</TableCell>
                      )}
                      <TableCell sx={{ bgcolor: 'background.paper', width: '15%' }}>Time</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Order No</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Customer Name</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '15%' }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shiftOrders.map((o) => (
                      <TableRow key={o.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleOpenOrderAsTab(o)} selected={selectedOrders.includes(o.id)}>
                        {orderSelectionMode ? (
                          <TableCell padding="checkbox" sx={{ width: '10%' }} onClick={(e) => e.stopPropagation()}>
                            <Checkbox size="small" checked={selectedOrders.includes(o.id)} onChange={() => setSelectedOrders(p => p.includes(o.id) ? p.filter(x => x !== o.id) : [...p, o.id])} />
                          </TableCell>
                        ) : (
                          <TableCell sx={{ width: '10%', opacity: 0.3 }}>
                            <Checkbox size="small" disabled />
                          </TableCell>
                        )}
                        <TableCell sx={{ width: '15%' }}>{o.timestamp?.seconds ? new Date(o.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</TableCell>
                        <TableCell sx={{ width: '30%' }}>#{o.orderNumber}</TableCell>
                        <TableCell sx={{ width: '30%' }}>{o.customerName || 'Walk-in'}</TableCell>
                        <TableCell align="right" sx={{ width: '15%' }}>{currency(o.items?.reduce((s, i) => s + (i.price * i.quantity), 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>

        </Grid>
      </Box > {/* Close centered content box - FIXED */}

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
      />
      <EditTransactionDialog open={editTxDialog} onClose={() => setEditTxDialog(false)} transaction={editingTx} onSave={handleEditTx} />
      <DeleteTransactionDialog open={deleteTxDialog} onClose={() => setDeleteTxDialog(false)} onConfirm={handleConfirmDelete} />
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
      />
      <StaffDebtLookupDialog open={openDebtDialog} onClose={() => setOpenDebtDialog(false)} />

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
        onClose={() => auth.signOut()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #333', pb: 2 }}>
          Shift Summary Receipt
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={1}>
            {/* Header Info */}
            <Box mb={2}>
              <Typography variant="body2" fontWeight="bold">{staffDisplayName}</Typography>
              <Typography variant="caption" color="gray">
                {shiftPeriod} Shift — {new Date().toLocaleDateString()}
              </Typography>
            </Box>

            {/* SECTION 1: SALES */}
            <Typography variant="caption" color="gray" display="block" mb={0.5} fontWeight="bold">SALES</Typography>
            <Box display="flex" justifyContent="space-between" pl={1}>
              <Typography variant="body2">PC Rental</Typography>
              <Typography variant="body2">{currency(endShiftReceiptData?.pcRentalTotal)}</Typography>
            </Box>
            {endShiftReceiptData?.salesBreakdown?.map(([label, amt]) => (
              <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                <Typography variant="body2">{label}</Typography>
                <Typography variant="body2">{currency(amt)}</Typography>
              </Box>
            ))}

            <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />

            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" fontWeight="bold">Total Sales</Typography>
              <Typography variant="body2" fontWeight="bold">
                {currency((endShiftReceiptData?.servicesTotal || 0) + (endShiftReceiptData?.pcRentalTotal || 0))}
              </Typography>
            </Box>

            {/* SECTION 2: EXPENSES */}
            <Box mt={2}>
              <Typography variant="caption" color="gray" display="block" mb={0.5} fontWeight="bold">EXPENSES</Typography>
              {endShiftReceiptData?.expensesBreakdown?.length === 0 && (
                <Typography variant="caption" color="text.secondary" pl={1}>No expenses</Typography>
              )}
              {endShiftReceiptData?.expensesBreakdown?.map(([label, amt]) => (
                <Box key={label} display="flex" justifyContent="space-between" pl={1}>
                  <Typography variant="body2">{label}</Typography>
                  <Typography variant="body2">{currency(amt)}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 0.5, borderStyle: 'dashed', borderColor: '#555' }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" fontWeight="bold">Total Expenses</Typography>
                <Typography variant="body2" fontWeight="bold">{currency(endShiftReceiptData?.expensesTotal)}</Typography>
              </Box>
            </Box>

            <Divider sx={{ borderColor: '#333', my: 2 }} />

            {/* SECTION 3: SYSTEM TOTAL */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
              <Typography variant="h6" fontWeight="900">SYSTEM TOTAL</Typography>
              <Typography variant="h4" fontWeight="900">{currency(endShiftReceiptData?.systemTotal)}</Typography>
            </Box>

            <Divider sx={{ borderColor: '#333', my: 2 }} />

            {/* SECTION 4: PAYMENT BREAKDOWN */}
            <Box mt={1}>
              <Typography variant="caption" color="gray" display="block" mb={0.5} fontWeight="bold">PAYMENT BREAKDOWN</Typography>
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

          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #333', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            onClick={() => setPrintShiftData(endShiftReceiptData)}
            startIcon={<PrintIcon />}
          >
            PRINT
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
      {
        editingTx && (
          <EditTransactionDialog
            open={editTxDialog}
            onClose={() => setEditTxDialog(false)}
            transaction={editingTx}
            user={user}
          />
        )
      }
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
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 9999 }}
        open={isLoading}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    </Box >
  );
}

// Wrapper to export
export default function Dashboard(props) {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <DashboardContent {...props} />
    </ThemeProvider>
  );
}