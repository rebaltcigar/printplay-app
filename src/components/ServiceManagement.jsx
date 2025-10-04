import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, TextField, Stack, DialogActions, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, FormControl, InputLabel, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { db } from '../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, orderBy, query } from 'firebase/firestore';

const defaultService = { serviceName: '', price: '', category: 'Debit', sortOrder: 0 };

function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState(defaultService);
  const isEditing = !!serviceToEdit.id;

  useEffect(() => {
    // Sort by the new sortOrder field
    const q = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleOpenDialog = (service = defaultService) => {
    setServiceToEdit(service);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setServiceToEdit(defaultService);
  };

  const handleInputChange = (e) => {
    setServiceToEdit({ ...serviceToEdit, [e.target.name]: e.target.value });
  };

  const handleSaveService = async (event) => {
    event.preventDefault();
    const data = {
      ...serviceToEdit,
      price: Number(serviceToEdit.price) || null,
      sortOrder: Number(serviceToEdit.sortOrder) || 0, // Ensure sortOrder is a number
    };

    try {
      if (isEditing) {
        const docRef = doc(db, "services", serviceToEdit.id);
        await updateDoc(docRef, data);
      } else {
        await addDoc(collection(db, "services"), data);
      }
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving service:", error);
      alert("Failed to save service.");
    }
  };

  const handleDeleteService = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this service?")) {
      try {
        await deleteDoc(doc(db, "services", id));
      } catch (error) {
        console.error("Error deleting service:", error);
        alert("Failed to delete service.");
      }
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Manage Services</Typography>
        <Button variant="contained" onClick={() => handleOpenDialog()}>Add New Service</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Sort Order</TableCell>
              <TableCell>Service Name</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell>{service.sortOrder}</TableCell>
                <TableCell>{service.serviceName}</TableCell>
                <TableCell>{service.price ? `₱${service.price.toFixed(2)}` : 'N/A'}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{service.category}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => handleOpenDialog(service)}><EditIcon /></IconButton>
                  <IconButton onClick={() => handleDeleteService(service.id)}><DeleteIcon color="error" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>{isEditing ? 'Edit Service' : 'Add New Service'}</DialogTitle>
        <Box component="form" onSubmit={handleSaveService}>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1, minWidth: 400 }}>
              <TextField name="serviceName" label="Service Name" value={serviceToEdit.serviceName} onChange={handleInputChange} required autoFocus />
              <TextField name="price" label="Price (optional)" type="number" value={serviceToEdit.price} onChange={handleInputChange} />
              <TextField name="sortOrder" label="Sort Order" type="number" value={serviceToEdit.sortOrder} onChange={handleInputChange} required />
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select name="category" value={serviceToEdit.category} label="Category" onChange={handleInputChange}>
                  <MenuItem value="Debit">Debit (Sale)</MenuItem>
                  <MenuItem value="Credit">Credit (Expense)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

export default ServiceManagement;