import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, Button, AppBar, Toolbar, Grid, Card, TextField, Select, MenuItem, FormControl, InputLabel, Paper, Checkbox, IconButton, Stack, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Divider } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import CommentIcon from '@mui/icons-material/Comment';
import CustomerDialog from './CustomerDialog';
import DebtLookupDialog from './DebtLookupDialog';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, onSnapshot, orderBy, doc, deleteDoc, writeBatch, updateDoc, where, setDoc } from 'firebase/firestore';

const denominationsMap = {
  bills: [1000, 500, 200, 100, 50, 20],
  coins: [20, 10, 5, 1],
};

function Dashboard({ user, activeShiftId, shiftPeriod }) {
  const [item, setItem] = useState('');
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
  const [denominations, setDenominations] = useState({});
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';

  const salesBreakdown = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      if (tx.item !== 'New Debt' && tx.item !== 'Expenses') {
        acc[tx.item] = (acc[tx.item] || 0) + tx.total;
      }
      return acc;
    }, {});
  }, [transactions]);

  const creditsBreakdown = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      if (tx.item === 'New Debt' || tx.item === 'Expenses') {
        acc[tx.item] = (acc[tx.item] || 0) + tx.total;
      }
      return acc;
    }, {});
  }, [transactions]);

  const systemTotal = useMemo(() => {
    const transactionTotal = transactions.reduce((sum, tx) => {
      if (tx.item === 'New Debt' || tx.item === 'Expenses') return sum - tx.total;
      return sum + tx.total;
    }, 0);
    return transactionTotal + Number(pcRental || 0);
  }, [transactions, pcRental]);

  const cashOnHand = useMemo(() => {
    return Object.entries(denominations).reduce((sum, [denom, count]) => sum + (Number(denom) * Number(count || 0)), 0);
  }, [denominations]);

  useEffect(() => {
    if (activeShiftId) {
      const q = query(collection(db, "transactions"), where("shiftId", "==", activeShiftId), where("isDeleted", "==", false), orderBy("timestamp", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      });
      return () => unsubscribe();
    }
  }, [activeShiftId]);

  useEffect(() => {
    const q = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setServiceItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentlyEditing) {
      setItem(currentlyEditing.item);
      setQuantity(currentlyEditing.quantity);
      setPrice(currentlyEditing.price);
      setNotes(currentlyEditing.notes || '');
      setTimeout(() => itemInputRef.current?.focus(), 100);
    }
  }, [currentlyEditing]);

  const handleItemChange = (event) => {
    const newItemName = event.target.value;
    setItem(newItemName);
    const selectedService = serviceItems.find(s => s.serviceName === newItemName);
    if (selectedService && typeof selectedService.price === 'number') {
      setPrice(selectedService.price);
    } else {
      setPrice('');
    }
    if (newItemName !== 'New Debt' && newItemName !== 'Paid Debt') {
      setSelectedCustomer(null);
    }
  };

  const handleEndShiftClick = () => setOpenEndShiftDialog(true);
  const handleCloseDialog = () => setOpenEndShiftDialog(false);

  const handleConfirmEndShift = async () => {
    const shiftSummary = { pcRentalTotal: Number(pcRental), denominations, systemTotal, cashOnHand, difference: cashOnHand - systemTotal, endTime: new Date(), salesBreakdown, creditsBreakdown };
    try {
      await updateDoc(doc(db, "shifts", activeShiftId), shiftSummary);
      setReceiptData(shiftSummary);
      handleCloseDialog();
      setShowReceipt(true);
    } catch (error) {
      console.error("Error ending shift:", error);
      alert("Failed to end shift.");
    }
  };

  const handleLogout = async () => {
    try {
      const statusRef = doc(db, "app_status", "current_shift");
      await setDoc(statusRef, { activeShiftId: null, staffEmail: null });
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  const handleSelectTransaction = (id) => { setSelectedTransactions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const handleDeleteSelected = async () => {
    if (selectedTransactions.length === 0) return;
    const reason = window.prompt("Please provide a reason for deleting these entries:");
    if (!reason) return alert("Deletion cancelled. A reason is required.");
    if (window.confirm(`Are you sure you want to delete ${selectedTransactions.length} selected entries?`)) {
      try {
        const batch = writeBatch(db);
        selectedTransactions.forEach(id => {
          const docRef = doc(db, "transactions", id);
          batch.update(docRef, { isDeleted: true, deletedAt: new Date(), deletedBy: user.email, deleteReason: reason });
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
    setQuantity('');
    setPrice('');
    setNotes('');
    setSelectedCustomer(null);
    setCurrentlyEditing(null);
  };

  const handleTransactionSubmit = async (event) => {
    event.preventDefault();
    if (isDebtItem && !selectedCustomer && !currentlyEditing) {
      alert("Please select a customer for this transaction.");
      return;
    }
    const transactionData = { item, quantity: Number(quantity), price: Number(price), total: Number(quantity) * Number(price), notes, customerId: selectedCustomer ? selectedCustomer.id : null, customerName: selectedCustomer ? selectedCustomer.fullName : null };
    if (currentlyEditing) {
      const reason = window.prompt("Please provide a reason for this edit:");
      if (!reason) return alert("Update cancelled. A reason is required.");
      try {
        const transactionRef = doc(db, "transactions", currentlyEditing.id);
        const historyRef = collection(transactionRef, "editHistory");
        const previousData = { item: currentlyEditing.item, quantity: currentlyEditing.quantity, price: currentlyEditing.price, total: currentlyEditing.total, notes: currentlyEditing.notes };
        await addDoc(historyRef, { previousData, updatedAt: new Date(), updatedBy: user.email, updateReason: reason });
        const newTransactionData = { ...transactionData, isEdited: true, lastUpdatedAt: new Date() };
        await updateDoc(transactionRef, newTransactionData);
      } catch (error) {
        console.error("Error updating transaction: ", error);
        alert("Error updating transaction.");
      }
    } else {
      const newTransactionData = { ...transactionData, shiftId: activeShiftId, timestamp: new Date(), staffEmail: user.email, isDeleted: false, isEdited: false };
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{user.email} - {shiftPeriod} Shift</Typography>
          <Button color="inherit" sx={{ mr: 2 }} onClick={() => setOpenDebtDialog(true)}>Customer Look Up</Button>
          <Button variant="contained" color="error" onClick={handleEndShiftClick}>End Shift</Button>
        </Toolbar>
      </AppBar>
      <Grid container spacing={2} sx={{ p: 2, flexGrow: 1, overflow: 'hidden' }}>
        <Grid item xs={12} md={2}>
          <Card sx={{ padding: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box component="form" onSubmit={handleTransactionSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
              <Typography variant="h5">{currentlyEditing ? 'Edit Entry' : 'Log Entry'}</Typography>
              <FormControl fullWidth required>
                <InputLabel>Item</InputLabel>
                <Select value={item} label="Item" onChange={handleItemChange} inputRef={itemInputRef}>
                  {serviceItems.map((service) => (
                    <MenuItem key={service.id} value={service.serviceName}>{service.serviceName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {isDebtItem && (
                <Box sx={{ mt: 1, p: 1, border: '1px dashed grey', borderRadius: 1 }}>
                  <Typography variant="caption">Customer</Typography>
                  {selectedCustomer ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography><strong>{selectedCustomer.fullName}</strong></Typography>
                      <IconButton size="small" onClick={() => setSelectedCustomer(null)}><ClearIcon fontSize="small" /></IconButton>
                    </Box>
                  ) : (
                    <Button onClick={() => setOpenCustomerDialog(true)} fullWidth variant="outlined" size="small" sx={{ mt: 0.5 }}>Select Customer</Button>
                  )}
                </Box>
              )}
              <TextField type="number" label="Quantity" value={quantity} placeholder="1" onChange={(e) => setQuantity(e.target.value)} required />
              <TextField type="number" label="Price" value={price} placeholder="₱3.00" onChange={(e) => setPrice(e.target.value)} required />
              <Typography>Total: ₱{quantity * price || 0}</Typography>
              <TextField label="Notes (Optional)" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                <Button type="submit" variant="contained" fullWidth disabled={isDebtItem && !selectedCustomer && !currentlyEditing}>{currentlyEditing ? 'Update Entry' : 'Add Entry'}</Button>
                {currentlyEditing && (<Button variant="outlined" onClick={clearForm} fullWidth>Cancel</Button>)}
              </Stack>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Button variant="outlined" fullWidth onClick={() => setOpenDebtDialog(true)}>
              Customer Look Up
            </Button>
          </Card>
        </Grid>
        <Grid item xs={12} md={10} sx={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', transition: 'opacity 0.2s', opacity: currentlyEditing ? 0.4 : 1, pointerEvents: currentlyEditing ? 'none' : 'auto' }}>
          <Card sx={{ padding: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5">Logs</Typography>
              <Tooltip title="Delete Selected"><Box component="span"><IconButton color="error" onClick={handleDeleteSelected} disabled={selectedTransactions.length === 0}><DeleteIcon /></IconButton></Box></Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {transactions.map((transaction) => (
                <Paper key={transaction.id} sx={{ padding: 1, pl: 2, mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Checkbox checked={selectedTransactions.includes(transaction.id)} onChange={() => handleSelectTransaction(transaction.id)} />
                  <Box sx={{ flexGrow: 1, ml: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" fontWeight="bold">{transaction.item}</Typography>
                      {transaction.notes && (<Tooltip title={transaction.notes}><CommentIcon fontSize="small" color="action" /></Tooltip>)}
                      {transaction.isEdited && (<Tooltip title={`Last updated at ${transaction.lastUpdatedAt?.seconds ? new Date(transaction.lastUpdatedAt.seconds * 1000).toLocaleTimeString() : ''}`}><HistoryIcon fontSize="small" color="action" /></Tooltip>)}
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap>Qty: {transaction.quantity} | {transaction.customerName ? `Customer: ${transaction.customerName}` : `Notes: ${transaction.notes || 'N/A'}`}</Typography>
                  </Box>
                  <Box sx={{textAlign: 'right'}}>
                    <Typography variant="subtitle1" fontWeight="bold">₱{transaction.total.toFixed(2)}</Typography>
                    <Typography variant="body2" color="text.secondary">{transaction.timestamp && new Date(transaction.timestamp.seconds * 1000).toLocaleTimeString()}</Typography>
                  </Box>
                  <IconButton edge="end" aria-label="edit" onClick={() => setCurrentlyEditing(transaction)} disabled={currentlyEditing !== null}><EditIcon /></IconButton>
                </Paper>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
      <Dialog open={openEndShiftDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>End of Shift Summary</DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>Sales Breakdown</Typography>
          <Box sx={{ maxHeight: 150, overflow: 'auto', mb: 2 }}>{Object.entries(salesBreakdown).map(([name, total]) => (<Box key={name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Typography>{name}:</Typography><Typography>₱{total.toFixed(2)}</Typography></Box>))}</Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Credits / Expenses</Typography>
          <Box sx={{ maxHeight: 150, overflow: 'auto', mb: 2 }}>{Object.entries(creditsBreakdown).map(([name, total]) => (<Box key={name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Typography>{name}:</Typography><Typography>₱{total.toFixed(2)}</Typography></Box>))}</Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Cash Reconciliation</Typography>
          <TextField autoFocus margin="dense" label="PC Rental Total" type="number" fullWidth variant="standard" value={pcRental} onChange={(e) => setPcRental(e.target.value)} />
          <Divider sx={{ my: 2 }} />
          <Typography>Bills</Typography>
          {denominationsMap.bills.map(denom => (<TextField key={denom} margin="dense" label={`₱${denom} x`} type="number" size="small" onChange={(e) => setDenominations(prev => ({...prev, [denom]: e.target.value}))} />))}
          <Divider sx={{ my: 2 }} />
          <Typography>Coins</Typography>
          {denominationsMap.coins.map(denom => (<TextField key={denom} margin="dense" label={`₱${denom} x`} type="number" size="small" onChange={(e) => setDenominations(prev => ({...prev, [denom]: e.target.value}))} />))}
          <Divider sx={{ my: 2 }} />
          <Typography variant="body1">System Expected Total: <strong>₱{systemTotal.toFixed(2)}</strong></Typography>
          <Typography variant="body1">Cash on Hand: <strong>₱{cashOnHand.toFixed(2)}</strong></Typography>
          <Typography variant="h6" color={cashOnHand - systemTotal !== 0 ? 'error' : 'inherit'}>Difference: <strong>₱{(cashOnHand - systemTotal).toFixed(2)}</strong></Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleConfirmEndShift} variant="contained">Confirm & End Shift</Button>
        </DialogActions>
      </Dialog>
      <CustomerDialog open={openCustomerDialog} onClose={() => setOpenCustomerDialog(false)} onSelectCustomer={handleSelectCustomer}/>
      <DebtLookupDialog open={openDebtDialog} onClose={() => setOpenDebtDialog(false)} />
      <Dialog open={showReceipt} onClose={handleLogout} fullWidth maxWidth="xs">
        <DialogTitle>Shift Summary Receipt</DialogTitle>
        <DialogContent dividers>
          <Typography variant="h6">{user.email}</Typography>
          <Typography variant="body2" gutterBottom>{shiftPeriod} Shift - {receiptData?.endTime.toLocaleDateString()}</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" fontWeight="bold">Sales Breakdown</Typography>
          {receiptData && Object.entries(receiptData.salesBreakdown).map(([name, total]) => (<Box key={name} sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">{name}:</Typography><Typography variant="body2">₱{total.toFixed(2)}</Typography></Box>))}
          <Divider sx={{ my: 1, mt: 2 }} />
          <Typography variant="subtitle1" fontWeight="bold">Credits / Expenses</Typography>
          {receiptData && Object.entries(receiptData.creditsBreakdown).map(([name, total]) => (<Box key={name} sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2">{name}:</Typography><Typography variant="body2">₱{total.toFixed(2)}</Typography></Box>))}
           <Divider sx={{ my: 1, mt: 2 }} />
           <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">PC Rental:</Typography>
            <Typography variant="body2">₱{receiptData?.pcRentalTotal.toFixed(2)}</Typography>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography>System Expected: <strong>₱{receiptData?.systemTotal.toFixed(2)}</strong></Typography>
          <Typography>Cash on Hand: <strong>₱{receiptData?.cashOnHand.toFixed(2)}</strong></Typography>
          <Typography variant="h6" color={receiptData?.difference !== 0 ? 'error' : 'inherit'}>Difference: <strong>₱{receiptData?.difference.toFixed(2)}</strong></Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogout}>Close & Logout</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard;