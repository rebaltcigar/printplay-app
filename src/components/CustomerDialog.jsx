import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, Button, List, ListItemText, ListItemButton, Box, Typography, Divider, Stack, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

function CustomerDialog({ open, onClose, onSelectCustomer }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');

  const clearAddForm = () => {
    setNewUsername('');
    setNewFullName('');
  };

  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setCustomers([]);
      clearAddForm();
      return;
    }

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

    const debounceSearch = setTimeout(() => {
      searchCustomers();
    }, 300);

    return () => clearTimeout(debounceSearch);
  }, [searchTerm, open]);

  const handleAddNewCustomer = async (event) => {
    event.preventDefault();
    if (!newUsername || !newFullName) {
      alert("Both username and full name are required.");
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "customers"), {
        username: newUsername.toLowerCase().trim(),
        fullName: newFullName,
        createdAt: serverTimestamp()
      });
      onSelectCustomer({ id: docRef.id, username: newUsername.toLowerCase().trim(), fullName: newFullName });
    } catch (error) {
      console.error("Error adding new customer: ", error);
      alert("Failed to add new customer.");
    }
  };

  const handleSelect = (customer) => {
    onSelectCustomer(customer);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Select or Add Customer
        <IconButton edge="end" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
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
        <List sx={{ maxHeight: 150, overflow: 'auto' }}>
          {(customers || []).map(customer => (
            <ListItemButton key={customer.id} onClick={() => handleSelect(customer)}>
              <ListItemText primary={customer.fullName} secondary={`@${customer.username}`} />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ my: 2 }} />
        <Typography variant="h6">Add New Customer</Typography>
        <Box component="form" onSubmit={handleAddNewCustomer} sx={{ mt: 1 }}>
          <TextField
            margin="dense"
            label="Username (unique, no spaces)"
            type="text"
            fullWidth
            variant="outlined"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
          />
          <TextField
            margin="dense"
            label="Full Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            required
          />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button type="submit" variant="contained" fullWidth>Add and Select</Button>
            <Button variant="text" onClick={clearAddForm}>Clear</Button>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerDialog;