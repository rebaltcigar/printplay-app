import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Grid, Card, TextField, Select, MenuItem,
  FormControl, InputLabel, Paper, Checkbox, IconButton, Stack, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider, Button, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import CommentIcon from '@mui/icons-material/Comment';

import CustomerDialog from './CustomerDialog';
import DebtLookupDialog from './DebtLookupDialog';

import { auth, db } from '../firebase';
import {
  collection, addDoc, query, onSnapshot, orderBy, doc, writeBatch,
  updateDoc, where, setDoc, serverTimestamp, getDocs, getDoc
} from 'firebase/firestore';

import logo from '/icon.ico';

/* ---------- Expense policy ---------- */
const EXPENSE_TYPES_ALL = [
  'Supplies',
  'Maintenance',
  'Utilities',
  'Rent',
  'Internet',
  'Salary',
  'Salary Advance',
  'Misc',
];

const EXPENSE_TYPES_STAFF = [
  'Supplies',
  'Maintenance',
  'Salary Advance',
  'Misc',
];

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
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  const [openEndShiftDialog, setOpenEndShiftDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [openDebtDialog, setOpenDebtDialog] = useState(false);

  const [pcRental, setPcRental] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const [staffOptions, setStaffOptions] = useState([]); // [{id, fullName, email}]
  const [shiftStart, setShiftStart] = useState(null);    // Date
  const [elapsed, setElapsed] = useState('00:00:00');

  const isAdmin = userRole === 'superadmin';
  const ALLOWED_EXPENSE_TYPES = isAdmin ? EXPENSE_TYPES_ALL : EXPENSE_TYPES_STAFF;
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';

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

  // Tick the elapsed time based on saved shiftStart (persists across reloads)
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

  /* ---------- Load Staff list (for Salary/S. Advance) ---------- */
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

  const handleSelectTransaction = (id) => {
    setSelectedTransactions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDeleteSelected = async () => {
    if (selectedTransactions.length === 0) return;
    const reason = window.prompt("Please provide a reason for deleting these entries:");
    if (!reason) return alert("Deletion cancelled. A reason is required.");
    if (window.confirm(`Are you sure you want to delete ${selectedTransactions.length} selected entries?`)) {
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
      } catch (error) {
        console.error("Error performing soft delete: ", error);
      }
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

    // Expense policy validations
    if (item === 'Expenses') {
      if (!expenseType) return alert('Please select an expense type.');
      if (!isAdmin && expenseType === 'Misc' && !String(notes || '').trim()) {
        return alert('Notes are required when expense type is “Misc”.');
      }
      if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) {
        return alert('Please select a staff for Salary or Salary Advance.');
      }
      if (!isAdmin && !EXPENSE_TYPES_STAFF.includes(expenseType)) {
        return alert('This expense type is not allowed for staff.');
      }
    }
    if (isDebtItem && !selectedCustomer && !currentlyEditing) {
      return alert("Please select a customer for this transaction.");
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
      const reason = window.prompt("Please provide a reason for this edit:");
      if (!reason) return alert("Update cancelled. A reason is required.");
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
          ...transactionData,
          isEdited: true,
          lastUpdatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Error updating transaction: ", error);
        alert("Error updating transaction.");
      }
    } else {
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
      } catch (error) {
        console.error("Error adding transaction: ", error);
        alert("Error saving transaction.");
      }
    }
    clearForm();
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
      setServiceItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

  const finalTotal = useMemo(() => {
    return servicesTotal - expensesTotal + Number(pcRental || 0);
  }, [servicesTotal, expensesTotal, pcRental]);

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
      alert('Enter PC Rental total.');
      return;
    }
    const summary = {
      pcRentalTotal: Number(pcRental),
      servicesTotal,
      expensesTotal,
      systemTotal: finalTotal,
      endTime: serverTimestamp()
    };
    try {
      await updateDoc(doc(db, 'shifts', activeShiftId), summary);
      const statusRef = doc(db, 'app_status', 'current_shift');
      await setDoc(statusRef, { activeShiftId: null, staffEmail: user.email }, { merge: true });
      setReceiptData({ ...summary, endTime: new Date() });
      setOpenEndShiftDialog(false);
      setShowReceipt(true);
    } catch (e) {
      console.error(e);
      alert('Failed to end shift.');
    }
  };

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
            <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
              {user.email} ({shiftPeriod} Shift) | {elapsed}
            </Typography>
          </Box>

          {/* Staff dash: NO dedicated Logout button per request */}
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" color="error" onClick={handleEndShiftClick}>
              End Shift
            </Button>
          </Box>
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
        }}
      >
        {/* LEFT: controls */}
        <Card sx={{ width: 360, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
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
                  {ALLOWED_EXPENSE_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
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
          {isDebtItem && (
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

          <TextField type="number" label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          <TextField type="number" label="Price" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Typography variant="body2">Total: ₱{(Number(quantity || 0) * Number(price || 0)).toFixed(2)}</Typography>
          <TextField
            label={item === 'Expenses' && !isAdmin && expenseType === 'Misc' ? "Notes (Required for Misc)" : "Notes (Optional)"}
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
            <Button onClick={handleTransactionSubmit} variant="contained" fullWidth disabled={isDebtItem && !selectedCustomer && !currentlyEditing}>
              {currentlyEditing ? 'Update Entry' : 'Add Entry'}
            </Button>
            {currentlyEditing && <Button variant="outlined" onClick={clearForm} fullWidth>Cancel</Button>}
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Button variant="outlined" fullWidth onClick={() => setOpenDebtDialog(true)}>Customer Look Up</Button>
        </Card>

        {/* RIGHT: table */}
        <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', width: '100%' }}>
          <Box sx={{ p: 2, pt: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>Logs</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title="Delete Selected">
                <Box component="span">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleDeleteSelected}
                    disabled={selectedTransactions.length === 0}
                  >
                    Delete Selected
                  </Button>
                </Box>
              </Tooltip>
            </Box>

            <TableContainer sx={{ flex: 1, minHeight: 0, width: '100%' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Time</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Identifier</TableCell>
                    <TableCell align="right">Controls</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedTransactions.includes(tx.id)}
                          onChange={() => handleSelectTransaction(tx.id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600}>{tx.item}</Typography>
                          {tx.notes && <Tooltip title={tx.notes}><CommentIcon fontSize="inherit" /></Tooltip>}
                          {tx.isEdited && <Tooltip title="Edited"><HistoryIcon fontSize="inherit" /></Tooltip>}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{tx.quantity}</TableCell>
                      <TableCell align="right">₱{(tx.price || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">₱{(tx.total || 0).toFixed(2)}</TableCell>
                      <TableCell>{identifierText(tx)}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setCurrentlyEditing(tx)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        {/* Soft delete is via bulk selection for audit-trail reasons */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Paper>
      </Box>

      {/* End Shift dialog (PC Rental + Totals only) */}
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
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Services Total</Typography>
              <Typography>₱{servicesTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Expenses Total</Typography>
              <Typography>₱{expensesTotal.toFixed(2)}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="h6">Final Total</Typography>
              <Typography variant="h6">₱{finalTotal.toFixed(2)}</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmEndShift}>Confirm & End Shift</Button>
        </DialogActions>
      </Dialog>

      {/* Receipt (big total) */}
      <Dialog open={showReceipt} onClose={() => {}} fullWidth maxWidth="xs">
        <DialogTitle>Shift Summary Receipt</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2">{user.email}</Typography>
          <Typography variant="body2" gutterBottom>
            {shiftPeriod} Shift — {receiptData?.endTime?.toLocaleDateString?.() || new Date().toLocaleDateString()}
          </Typography>

          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Services Total</Typography>
            <Typography>₱{(receiptData?.servicesTotal || 0).toFixed(2)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Expenses Total</Typography>
            <Typography>₱{(receiptData?.expensesTotal || 0).toFixed(2)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>PC Rental</Typography>
            <Typography>₱{(receiptData?.pcRentalTotal || 0).toFixed(2)}</Typography>
          </Box>

          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="h5" fontWeight={700}>TOTAL</Typography>
            <Typography variant="h4" fontWeight={800}>₱{(receiptData?.systemTotal || 0).toFixed(2)}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              try {
                await setDoc(doc(db, 'app_status', 'current_shift'), { activeShiftId: null, staffEmail: user.email }, { merge: true });
              } catch {}
              auth.signOut(); // exits to login
            }}
          >
            Close & Logout
          </Button>
        </DialogActions>
      </Dialog>

      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={user}
      />
      <DebtLookupDialog open={openDebtDialog} onClose={() => setOpenDebtDialog(false)} />
    </Box>
  );
}

export default Dashboard;
