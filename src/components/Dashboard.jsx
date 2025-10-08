import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Card, TextField, Select, MenuItem,
  FormControl, InputLabel, Paper, Checkbox, IconButton, Stack, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider, Button, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer, Collapse, Menu as MuiMenu, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import CommentIcon from '@mui/icons-material/Comment';

import CustomerDialog from './CustomerDialog';
import StaffDebtLookupDialog from '../components/StaffDebtLookupDialog';

import { auth, db } from '../firebase';
import {
  collection, addDoc, query, onSnapshot, orderBy, doc, writeBatch,
  updateDoc, where, setDoc, serverTimestamp, getDocs, getDoc
} from 'firebase/firestore';

import logo from '/icon.ico';

function Dashboard({ user, userRole, activeShiftId, shiftPeriod }) {
  // --- STATE ---
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

  const [transactions, setTransactions] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [expenseServiceItems, setExpenseServiceItems] = useState([]);
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  const [openEndShiftDialog, setOpenEndShiftDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);

  // Staff Debt Lookup (read-only)
  const [openDebtDialog, setOpenDebtDialog] = useState(false);
  const [presetCustomer, setPresetCustomer] = useState(null);
  const [selectToken, setSelectToken] = useState(0);

  const [pcRental, setPcRental] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const [staffOptions, setStaffOptions] = useState([]); // [{id, fullName, email}]
  const [shiftStart, setShiftStart] = useState(null);     // Date
  const [elapsed, setElapsed] = useState('00:00:00');

  const [staffDisplayName, setStaffDisplayName] = useState(user?.email || ''); // header name

  const isAdmin = userRole === 'superadmin';
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';

  // --- NEW (mobile) ---
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [controlsOpen, setControlsOpen] = useState(true); // collapsible controls on mobile
  const controlsRef = useRef(null);
  const [menuAnchor, setMenuAnchor] = useState(null); // hamburger menu

  // NEW: staff name dropdown anchor (for hidden logout)
  const [staffMenuAnchor, setStaffMenuAnchor] = useState(null);

  // --- LOGOUT (no DB writes, no shift changes) ---
  const handleLogoutOnly = () => {
    try {
      auth.signOut(); // pure sign-out; does not touch Firestore
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  // ---------- Polished MUI popups (replace window.*) ----------
  // Generic error dialog
  const [errorDialog, setErrorDialog] = useState({ open: false, message: '' });
  const showError = (message) => setErrorDialog({ open: true, message });

  // Delete Selected dialog (reason + confirm)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, reason: '' });

  // Edit reason dialog (when updating an entry)
  const [editReasonDialog, setEditReasonDialog] = useState({ open: false, reason: '' });
  const [pendingEditData, setPendingEditData] = useState(null); // holds transactionData while we ask for reason

  // Auto-open controls & scroll up when editing on mobile
  const openControlsAndScroll = () => {
    setControlsOpen(true);
    setTimeout(() => {
      controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      itemInputRef.current?.focus?.();
    }, 220);
  };

  /* ---------- Load shift start (for the header timer) ---------- */
  useEffect(() => {
    let unsub = () => {};
    const run = async () => {
      if (!activeShiftId) return;
      const sDoc = await getDoc(doc(db, 'shifts', activeShiftId));
      const data = sDoc.data();
      if (data?.startTime?.seconds) {
        setShiftStart(new Date(data.startTime.seconds * 1000));
      } else if (data?.startTime instanceof Date) {
        setShiftStart(data.startTime);
      }
    };
    run();
    return () => unsub();
  }, [activeShiftId]);

  // Tick the elapsed time
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

  /* ---------- Load Staff list ---------- */
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
      } catch {
        setStaffOptions([]);
      }
    };
    loadStaff();
  }, []);

  // Resolve header staff name
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const qMe = query(collection(db, 'users'), where('email', '==', user.email));
        const snap = await getDocs(qMe);
        if (!isMounted) return;
        if (!snap.empty) {
          const d = snap.docs[0].data() || {};
          setStaffDisplayName(d.fullName || d.name || d.displayName || user.email);
        } else {
          const mo = staffOptions.find(s => s.email === user.email);
          setStaffDisplayName(mo?.fullName || user.email);
        }
      } catch {
        if (isMounted) setStaffDisplayName(user.email);
      }
    })();
    return () => { isMounted = false; };
  }, [user?.email, staffOptions]);

  useEffect(() => {
    if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId && staffOptions.length) {
      const me = staffOptions.find(o => o.email === user.email) || staffOptions[0];
      if (me) {
        setExpenseStaffId(me.id);
        setExpenseStaffName(me.fullName);
        setExpenseStaffEmail(me.email);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseType, staffOptions]);

  // --- hydrate form when clicking Edit on a row ---
  useEffect(() => {
    if (!currentlyEditing) return;

    // Core fields
    setItem(currentlyEditing.item || '');
    setExpenseType(currentlyEditing.expenseType || '');
    setExpenseStaffId(currentlyEditing.expenseStaffId || '');
    setExpenseStaffName(currentlyEditing.expenseStaffName || '');
    setExpenseStaffEmail(currentlyEditing.expenseStaffEmail || '');
    setQuantity(String(currentlyEditing.quantity ?? ''));
    setPrice(String(currentlyEditing.price ?? ''));
    setNotes(currentlyEditing.notes || '');

    // Debt customer (if applicable)
    if (currentlyEditing.customerId) {
      setSelectedCustomer({
        id: currentlyEditing.customerId,
        fullName: currentlyEditing.customerName || '',
      });
    } else {
      setSelectedCustomer(null);
    }

    if (isMobile) openControlsAndScroll();
    else setTimeout(() => itemInputRef.current?.focus?.(), 0);
  }, [currentlyEditing, isMobile]);

  // --- CORE HANDLERS ---
  const handleItemChange = (event) => {
    const newItemName = event.target.value;
    setItem(newItemName);
    const selectedService = serviceItems.find(s => s.serviceName === newItemName);
    if (selectedService && typeof selectedService.price === 'number') {
      setPrice(selectedService.price);
    } else {
      setPrice('');
    }
    if (newItemName !== 'New Debt' && newItemName !== 'Paid Debt') setSelectedCustomer(null);
    if (newItemName !== 'Expenses') {
      setExpenseType('');
      setExpenseStaffId('');
      setExpenseStaffName('');
      setExpenseStaffEmail('');
    }
  };

  const handleStaffSelect = (uid) => {
    setExpenseStaffId(uid);
    const found = staffOptions.find(s => s.id === uid);
    setExpenseStaffName(found?.fullName || '');
    setExpenseStaffEmail(found?.email || '');
  };

  const handleEndShiftClick = () => setOpenEndShiftDialog(true);
  const handleCloseDialog = () => setOpenEndShiftDialog(false);

  // --- Delete selected -> open dialog instead of confirm/prompt ---
  const handleDeleteSelected = () => {
    if (selectedTransactions.length === 0) return;
    setDeleteDialog({ open: true, reason: '' });
  };

  const performDeleteSelected = async () => {
    const reason = (deleteDialog.reason || '').trim();
    if (!reason) {
      showError('A reason is required to delete entries.');
      return;
    }
    try {
      const batch = writeBatch(db);
      selectedTransactions.forEach(id => {
        const docRef = doc(db, "transactions", id);
        batch.update(docRef, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user.email,
          deleteReason: reason
        });
      });
      await batch.commit();
      setSelectedTransactions([]);
      setDeleteDialog({ open: false, reason: '' });
    } catch (error) {
      console.error("Error performing soft delete: ", error);
      showError('Failed to delete the selected entries.');
    }
  };

  const clearForm = () => {
    setItem('');
    setExpenseType('');
    setExpenseStaffId('');
    setExpenseStaffName('');
    setExpenseStaffEmail('');
    setQuantity('');
    setPrice('');
    setNotes('');
    setSelectedCustomer(null);
    setCurrentlyEditing(null);
  };

  const handleTransactionSubmit = async (event) => {
    event.preventDefault();

    // --- new validations ---
    if (!quantity || !price || Number(quantity) <= 0 || Number(price) <= 0) {
      return showError("Quantity and Price must be greater than 0.");
    }

    // --- existing validations ---
    if (item === 'Expenses') {
      if (!expenseType) return showError('Please select an expense type.');
      if (!isAdmin && expenseType === 'Misc' && !String(notes || '').trim()) {
        return showError('Notes are required when expense type is “Misc”.');
      }
      if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) {
        return showError('Please select a staff for Salary or Salary Advance.');
      }
    }
    if (isDebtItem && !selectedCustomer && !currentlyEditing) {
      return showError('Please select a customer for this transaction.');
    }

    const transactionData = {
      item,
      expenseType: item === 'Expenses' ? expenseType : null,
      expenseStaffId: item === 'Expenses' ? (expenseStaffId || null) : null,
      expenseStaffName: item === 'Expenses' ? (expenseStaffName || null) : null,
      expenseStaffEmail: item === 'Expenses' ? (expenseStaffEmail || null) : null,
      quantity: Number(quantity),
      price: Number(price),
      total: Number(quantity) * Number(price),
      notes,
      customerId: selectedCustomer ? selectedCustomer.id : null,
      customerName: selectedCustomer ? selectedCustomer.fullName : null
    };

    if (currentlyEditing) {
      // Open reason dialog; perform update after confirmation
      setPendingEditData(transactionData);
      setEditReasonDialog({ open: true, reason: '' });
      return;
    }

    // New entry
    const newTransactionData = {
      ...transactionData,
      shiftId: activeShiftId,
      timestamp: serverTimestamp(),
      staffEmail: user.email,
      isDeleted: false,
      isEdited: false
    };
    try {
      await addDoc(collection(db, "transactions"), newTransactionData);
      clearForm();
      if (isMobile) setControlsOpen(false);
    } catch (error) {
      console.error("Error adding transaction: ", error);
      showError('Error saving transaction.');
    }
  };

  const handleEnterSubmit = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleTransactionSubmit(event);
    }
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setOpenCustomerDialog(false);
  };

  // --- QUERIES ---
  useEffect(() => {
    if (!activeShiftId) return;
    const qTx = query(
      collection(db, "transactions"),
      where("shiftId", "==", activeShiftId),
      where("isDeleted", "==", false),
      orderBy("timestamp", "desc")
    );
    const unsubscribe = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsubscribe();
  }, [activeShiftId]);

  useEffect(() => {
    const qServices = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubscribe = onSnapshot(qServices, (snapshot) => {
      const allServices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter for main "Item" dropdown (parent items, not admin-only)
      const parentServices = allServices.filter(s => !s.parentServiceId && s.adminOnly === false);
      setServiceItems(parentServices);

      // Dynamically find the "Expenses" parent service ID
      const expensesParent = allServices.find(s => s.serviceName === "Expenses");
      const expensesParentId = expensesParent ? expensesParent.id : null;

      // Filter for expense sub-services using the dynamic parent ID
      let expenseSubServices = [];
      if (expensesParentId) {
        expenseSubServices = allServices.filter(s => s.parentServiceId === expensesParentId && s.adminOnly === false);
      }
      setExpenseServiceItems(expenseSubServices);
    });
    return () => unsubscribe();
  }, []);


  // --- CALCS ---
  const servicesTotal = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      if (tx.item !== 'Expenses' && tx.item !== 'New Debt') return sum + (tx.total || 0);
      return sum;
    }, 0);
  }, [transactions]);

  const expensesTotal = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      if (tx.item === 'Expenses' || tx.item === 'New Debt') return sum + (tx.total || 0);
      return sum;
    }, 0);
  }, [transactions]);

  const pcRentalNum = useMemo(() => Number(pcRental || 0), [pcRental]);
  const salesTotalWithPc = useMemo(() => servicesTotal + pcRentalNum, [servicesTotal, pcRentalNum]);

  const finalTotal = useMemo(() => {
    return servicesTotal - expensesTotal + pcRentalNum;
  }, [servicesTotal, expensesTotal, pcRentalNum]);

  // Detailed breakdowns for dialogs
  const salesBreakdown = useMemo(() => {
    const m = new Map();
    transactions.forEach(tx => {
      if (tx.item === 'Expenses' || tx.item === 'New Debt') return;
      const key = tx.item || '—';
      m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [transactions]);

  const expensesBreakdown = useMemo(() => {
    const m = new Map();
    transactions.forEach(tx => {
      if (tx.item === 'Expenses') {
        const key = `Expense: ${tx.expenseType || 'Other'}`;
        m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
      } else if (tx.item === 'New Debt') {
        const key = 'New Debt';
        m.set(key, (m.get(key) || 0) + Number(tx.total || 0));
      }
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [transactions]);

  const identifierText = (tx) => {
    if (tx.item === 'Expenses') {
      const staffChunk = tx.expenseStaffName ? ` · ${tx.expenseStaffName}` : '';
      return `${tx.expenseType || ''}${staffChunk}`;
    }
    if (tx.customerName) return tx.customerName;
    return '—';
  };

  const handleConfirmEndShift = async () => {
    if (pcRental === '') {
      showError('Enter PC Rental total.');
      return;
    }
    const summary = {
      pcRentalTotal: pcRentalNum,
      servicesTotal,
      expensesTotal,
      systemTotal: finalTotal,
      endTime: serverTimestamp()
    };
    try {
      await updateDoc(doc(db, 'shifts', activeShiftId), summary);
      const statusRef = doc(db, 'app_status', 'current_shift');
      await setDoc(statusRef, { activeShiftId: null, staffEmail: user.email }, { merge: true });
      setReceiptData({ ...summary, endTime: new Date(), salesBreakdown, expensesBreakdown });
      setOpenEndShiftDialog(false);
      setShowReceipt(true);
    } catch (e) {
      console.error(e);
      showError('Failed to end shift.');
    }
  };

  const tableDisabled = Boolean(currentlyEditing);

  // --- VIEW ---
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
      }}
    >
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <img src={logo} alt="logo" width={20} height={20} />
            {/* Staff name -> dropdown trigger */}
            <Box
              onClick={(e) => setStaffMenuAnchor(e.currentTarget)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStaffMenuAnchor(e.currentTarget);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              aria-haspopup="menu"
              aria-controls={staffMenuAnchor ? 'staff-menu' : undefined}
              aria-expanded={Boolean(staffMenuAnchor)}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
                {staffDisplayName} ({shiftPeriod} Shift) | {elapsed}
              </Typography>
            </Box>
          </Box>

          {/* Desktop actions */}
          <Box sx={{ ml: 'auto', display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => { setPresetCustomer(null); setOpenDebtDialog(true); }}>
              Debt Lookup
            </Button>
            <Button size="small" variant="contained" color="error" onClick={handleEndShiftClick}>
              End Shift
            </Button>
          </Box>

          {/* Mobile actions */}
          <IconButton
            sx={{ ml: 'auto', display: { xs: 'inline-flex', sm: 'none' } }}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label="menu"
          >
            <MenuIcon />
          </IconButton>
          <MuiMenu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onClick={() => { setMenuAnchor(null); setPresetCustomer(null); setOpenDebtDialog(true); }}>Debt Lookup</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); handleEndShiftClick(); }}>End Shift</MenuItem>
          </MuiMenu>

          {/* Staff dropdown (hidden logout) */}
          <MuiMenu
            id="staff-menu"
            anchorEl={staffMenuAnchor}
            open={Boolean(staffMenuAnchor)}
            onClose={() => setStaffMenuAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                setStaffMenuAnchor(null);
                handleLogoutOnly();
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LogoutIcon fontSize="small" />
                Logout
              </Box>
            </MenuItem>
          </MuiMenu>
        </Toolbar>
      </AppBar>

      {/* BODY */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          gap: 2,
          p: 2,
          width: '100%',
          alignItems: 'stretch',
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        {/* LEFT: controls */}
        <Box
          ref={controlsRef}
          sx={{
            width: { xs: '100%', sm: 360 },
          }}
        >
          {/* Mobile header for controls */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ display: { xs: 'flex', sm: 'none' }, mb: 1 }}
          >
            <Typography variant="subtitle1" fontWeight={600}>Log Entry</Typography>
            <Button size="small" onClick={() => setControlsOpen(v => !v)}>
              {controlsOpen ? 'Hide' : 'Show'}
            </Button>
          </Stack>

          {/* Form card */}
          <Collapse in={controlsOpen} timeout="auto" collapsedSize={0} unmountOnExit={false} sx={{ display: { xs: 'block', sm: 'block' } }}>
            <Card
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                '& .MuiFormControl-root, & .MuiTextField-root': { my: { xs: 0, sm: 0 } },
              }}
            >
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: { xs: 'none', sm: 'block' }}}>
                Log Entry
              </Typography>

              <FormControl fullWidth required>
                <InputLabel>Item</InputLabel>
                <Select value={item} label="Item" onChange={handleItemChange} inputRef={itemInputRef}>
                  {serviceItems.map((service) => (
                    <MenuItem key={service.id} value={service.serviceName}>
                      {service.serviceName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Expense details */}
              {item === 'Expenses' && (
                <>
                  <FormControl fullWidth required>
                    <InputLabel>Expense Type</InputLabel>
                    <Select
                      label="Expense Type"
                      value={expenseType}
                      onChange={(e) => setExpenseType(e.target.value)}
                    >
                      {expenseServiceItems.map((s) => (
                        <MenuItem key={s.id} value={s.serviceName}>{s.serviceName}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {(expenseType === 'Salary' || expenseType === 'Salary Advance') && (
                    <FormControl fullWidth required>
                      <InputLabel>Staff</InputLabel>
                      <Select
                        label="Staff"
                        value={expenseStaffId}
                        onChange={(e) => handleStaffSelect(e.target.value)}
                      >
                        {staffOptions.length === 0 ? (
                          <MenuItem value="" disabled>No staff available</MenuItem>
                        ) : (
                          staffOptions.map(s => (
                            <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>
                          ))
                        )}
                      </Select>
                    </FormControl>
                  )}
                </>
              )}

              {/* Debt customer picker */}
              {(item === 'New Debt' || item === 'Paid Debt') && (
                <Box sx={{ mt: 1, p: 1, border: '1px dashed grey', borderRadius: 1 }}>
                  <Typography variant="caption">Customer</Typography>
                  {selectedCustomer ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography><strong>{selectedCustomer.fullName}</strong></Typography>
                      <IconButton size="small" onClick={() => setSelectedCustomer(null)}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Button onClick={() => setOpenCustomerDialog(true)} fullWidth variant="outlined" size="small" sx={{ mt: 0.5 }}>
                      Select Customer
                    </Button>
                  )}
                </Box>
              )}

              <Stack direction={{ xs: 'row', sm: 'row' }} spacing={1}>
                <TextField onKeyDown={handleEnterSubmit} type="number" label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} required fullWidth />
                <TextField onKeyDown={handleEnterSubmit} type="number" label="Price" value={price} onChange={(e) => setPrice(e.target.value)} required fullWidth />
              </Stack>

              <Typography variant="body2">Total: ₱{(Number(quantity || 0) * Number(price || 0)).toFixed(2)}</Typography>
              <TextField
                label={item === 'Expenses' && !isAdmin && expenseType === 'Misc' ? "Notes (Required for Misc)" : "Notes (Optional)"}
                multiline
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              {/* Add / Cancel */}
              <Stack direction="row" spacing={1}>
                <Button
                  onClick={handleTransactionSubmit}
                  variant="contained"
                  fullWidth
                  disabled={(item === 'New Debt' || item === 'Paid Debt') && !selectedCustomer && !currentlyEditing}
                >
                  {currentlyEditing ? 'Update Entry' : 'Add Entry'}
                </Button>
                {currentlyEditing && (
                  <Button variant="outlined" onClick={clearForm} fullWidth>
                    Cancel
                  </Button>
                )}
              </Stack>
            </Card>
          </Collapse>
        </Box>

        {/* RIGHT: table */}
        <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', width: '100%' }}>
          <Box sx={{ p: 2, pt: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>Logs</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title={tableDisabled ? "Finish editing to delete" : "Delete Selected"}>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-block' } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleDeleteSelected}
                    disabled={tableDisabled || selectedTransactions.length === 0}
                  >
                    Delete Selected
                  </Button>
                </Box>
              </Tooltip>
            </Box>

            <TableContainer
              sx={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                ...(tableDisabled ? { pointerEvents: 'none', opacity: 0.55 } : {}),
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  '& th, & td': {
                    py: { xs: 0.5, sm: 1 },
                    px: { xs: 0.75, sm: 1.5 },
                    borderBottomWidth: { xs: 0.5, sm: 1 },
                  },
                  '& thead th': {
                    fontSize: { xs: '0.72rem', sm: '0.875rem' },
                    whiteSpace: { xs: 'nowrap', sm: 'normal' },
                  },
                  '& tbody td': {
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Time</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Qty</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Identifier</TableCell>
                    <TableCell align="right">Edit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} hover={!tableDisabled}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedTransactions.includes(tx.id)}
                          onChange={() =>
                            setSelectedTransactions(prev =>
                              prev.includes(tx.id) ? prev.filter(i => i !== tx.id) : [...prev, tx.id]
                            )
                          }
                          size="small"
                          disabled={tableDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600} noWrap>{tx.item}</Typography>
                          {tx.notes && <Tooltip title={tx.notes}><CommentIcon fontSize="inherit" /></Tooltip>}
                          {tx.isEdited && <Tooltip title="Edited"><HistoryIcon fontSize="inherit" /></Tooltip>}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ display: { xs: 'block', sm: 'none' }, opacity: 0.8 }}
                        >
                          {identifierText(tx)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{tx.quantity}</TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>₱{(tx.price || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">₱{(tx.total || 0).toFixed(2)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{identifierText(tx)}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setCurrentlyEditing(tx);
                            if (isMobile) openControlsAndScroll();
                          }}
                          disabled={tableDisabled && (!currentlyEditing || currentlyEditing?.id !== tx.id)}
                        >
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* mobile delete button */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, mt: 1 }}>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={handleDeleteSelected}
                disabled={tableDisabled || selectedTransactions.length === 0}
                fullWidth
              >
                Delete Selected
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* End Shift dialog */}
      <Dialog open={openEndShiftDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>End of Shift</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              label="PC Rental Total"
              type="number"
              value={pcRental}
              onChange={(e) => setPcRental(e.target.value)}
              required
              fullWidth
            />

            <Typography variant="subtitle2" sx={{ mt: 1 }}>Sales</Typography>
            {salesBreakdown.length === 0 && (
              <Typography variant="body2" sx={{ opacity: 0.7 }}>No sales entries.</Typography>
            )}
            {salesBreakdown.map(([label, amt]) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>{label}</Typography>
                <Typography>₱{Number(amt).toFixed(2)}</Typography>
              </Box>
            ))}

            <Divider />

            <Typography variant="subtitle2">Expenses</Typography>
            {expensesBreakdown.length === 0 && (
              <Typography variant="body2" sx={{ opacity: 0.7 }}>No expense entries.</Typography>
            )}
            {expensesBreakdown.map(([label, amt]) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>{label}</Typography>
                <Typography>₱{Number(amt).toFixed(2)}</Typography>
              </Box>
            ))}

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Total Sales</Typography>
              <Typography>₱{salesTotalWithPc.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Total Expenses</Typography>
              <Typography>₱{expensesTotal.toFixed(2)}</Typography>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography variant="h6">SYSTEM TOTAL</Typography>
              <Typography variant="h5" fontWeight={800}>₱{finalTotal.toFixed(2)}</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmEndShift}>Confirm & End Shift</Button>
        </DialogActions>
      </Dialog>

      {/* Receipt */}
      <Dialog open={showReceipt} onClose={() => {}} fullWidth maxWidth="xs">
        <DialogTitle>Shift Summary Receipt</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2">{staffDisplayName}</Typography>
          <Typography variant="body2" gutterBottom>
            {shiftPeriod} Shift — {receiptData?.endTime?.toLocaleDateString?.() || new Date().toLocaleDateString()}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>PC Rental</Typography>
            <Typography>₱{pcRentalNum.toFixed(2)}</Typography>
          </Box>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>Sales</Typography>
          {salesBreakdown.length === 0 && (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>No sales entries.</Typography>
          )}
          {salesBreakdown.map(([label, amt]) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>{label}</Typography>
              <Typography>₱{Number(amt).toFixed(2)}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2">Expenses</Typography>
          {expensesBreakdown.length === 0 && (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>No expense entries.</Typography>
          )}
          {expensesBreakdown.map(([label, amt]) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>{label}</Typography>
              <Typography>₱{Number(amt).toFixed(2)}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Total Sales</Typography>
            <Typography>₱{salesTotalWithPc.toFixed(2)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Total Expenses</Typography>
            <Typography>₱{expensesTotal.toFixed(2)}</Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="h5" fontWeight={700}>SYSTEM TOTAL</Typography>
            <Typography variant="h4" fontWeight={800}>₱{finalTotal.toFixed(2)}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              try {
                await setDoc(doc(db, 'app_status', 'current_shift'), { activeShiftId: null, staffEmail: user.email }, { merge: true });
              } catch {}
              auth.signOut();
            }}
          >
            Close & Logout
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customer picker */}
      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={user}
      />

      {/* Read-only debt lookup */}
      <StaffDebtLookupDialog
        open={openDebtDialog}
        onClose={() => setOpenDebtDialog(false)}
        presetCustomer={presetCustomer}
        selectToken={selectToken}
      />

      {/* --------- Reusable Dialogs (polished replacements) --------- */}

      {/* Error dialog */}
      <Dialog open={errorDialog.open} onClose={() => setErrorDialog({ open: false, message: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{errorDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialog({ open: false, message: '' })} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Selected dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, reason: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Selected</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="body2">
            You are about to delete <b>{selectedTransactions.length}</b> entr{selectedTransactions.length === 1 ? 'y' : 'ies'}.
            This is a soft delete and can be audited later.
          </Typography>
          <TextField
            label="Reason (required)"
            value={deleteDialog.reason}
            onChange={(e) => setDeleteDialog(d => ({ ...d, reason: e.target.value }))}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, reason: '' })}>Cancel</Button>
          <Button color="error" variant="contained" onClick={performDeleteSelected}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Edit reason dialog */}
      <Dialog open={editReasonDialog.open} onClose={() => setEditReasonDialog({ open: false, reason: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Reason for Edit</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="body2">
            Please provide a brief reason for updating this entry.
          </Typography>
          <TextField
            label="Reason (required)"
            value={editReasonDialog.reason}
            onChange={(e) => setEditReasonDialog(d => ({ ...d, reason: e.target.value }))}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditReasonDialog({ open: false, reason: '' })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const reason = (editReasonDialog.reason || '').trim();
              if (!reason) {
                showError('A reason is required to update this entry.');
                return;
              }
              try {
                const transactionRef = doc(db, "transactions", currentlyEditing.id);
                const historyRef = collection(transactionRef, "editHistory");
                await addDoc(historyRef, {
                  previousData: {
                    item: currentlyEditing.item,
                    expenseType: currentlyEditing.expenseType || null,
                    expenseStaffId: currentlyEditing.expenseStaffId || null,
                    expenseStaffName: currentlyEditing.expenseStaffName || null,
                    expenseStaffEmail: currentlyEditing.expenseStaffEmail || null,
                    quantity: currentlyEditing.quantity,
                    price: currentlyEditing.price,
                    total: currentlyEditing.total,
                    notes: currentlyEditing.notes
                  },
                  updatedAt: serverTimestamp(),
                  updatedBy: user.email,
                  updateReason: reason
                });
                await updateDoc(transactionRef, {
                  ...pendingEditData,
                  isEdited: true,
                  lastUpdatedAt: serverTimestamp()
                });
                setEditReasonDialog({ open: false, reason: '' });
                setPendingEditData(null);
                clearForm();
                if (isMobile) setControlsOpen(false);
              } catch (error) {
                console.error("Error updating transaction: ", error);
                showError('Error updating transaction.');
              }
            }}
          >
            Save Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard;