import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, List, ListItemText, ListItemButton, Box, Typography, Divider, Paper, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';

function CustomerSearch({ onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    const searchCustomers = async () => {
      if (typeof searchTerm !== 'string' || searchTerm.trim() === '') {
        setCustomers([]);
        return;
      }
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      const customersRef = collection(db, "customers");
      const q = query(customersRef, where("username", ">=", lowerCaseSearchTerm), where("username", "<=", lowerCaseSearchTerm + '\uf8ff'));
      const querySnapshot = await getDocs(q);
      setCustomers(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    };
    const debounceSearch = setTimeout(() => searchCustomers(), 300);
    return () => clearTimeout(debounceSearch);
  }, [searchTerm]);

  return (
    <Box>
      <TextField
        autoFocus
        margin="dense"
        label="Search by username..."
        type="text"
        fullWidth
        variant="outlined"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <List sx={{ maxHeight: 200, overflow: 'auto' }}>
        {(customers || []).map(customer => (
          <ListItemButton key={customer.id} onClick={() => onSelect(customer)}>
            <ListItemText primary={customer.fullName} secondary={`@${customer.username}`} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

function DebtHistory({ customer }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!customer?.id) return;

    const q = query(
      collection(db, "transactions"),
      where("customerId", "==", customer.id),
      where("item", "in", ["New Debt", "Paid Debt"]),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(doc => doc.data());
      setTransactions(fetchedTransactions);

      const calculatedBalance = fetchedTransactions.reduce((bal, tx) => {
        if (tx.item === 'New Debt') return bal + tx.total;
        if (tx.item === 'Paid Debt') return bal - tx.total;
        return bal;
      }, 0);
      setBalance(calculatedBalance);
    });

    return () => unsubscribe();
  }, [customer]);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6">{customer.fullName}</Typography>
      <Typography variant="h5" color={balance > 0 ? 'error.main' : 'success.main'}>
        Current Balance: ₱{balance.toFixed(2)}
      </Typography>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
        {(transactions || []).map((tx, index) => (
          <Paper key={index} sx={{ p: 2, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography fontWeight="bold" color={tx.item === 'New Debt' ? 'error.light' : 'success.light'}>{tx.item}</Typography>
              <Typography variant="caption" display="block">{tx.timestamp && new Date(tx.timestamp.seconds * 1000).toLocaleString()}</Typography>
              <Typography variant="caption" display="block" sx={{ fontStyle: 'italic' }}>by: {tx.staffEmail}</Typography>
            </Box>
            <Typography variant="h6">{tx.item === 'New Debt' ? '+' : '-'} ₱{tx.total.toFixed(2)}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

function DebtLookupDialog({ open, onClose, initialCustomer = null }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    if (initialCustomer) {
      setSelectedCustomer(initialCustomer);
    }
  }, [initialCustomer, open]);

  const handleClose = () => {
    setSelectedCustomer(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Debt Look Up
        <IconButton edge="end" onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {!selectedCustomer ? (
          <CustomerSearch onSelect={setSelectedCustomer} />
        ) : (
          <DebtHistory customer={selectedCustomer} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DebtLookupDialog;