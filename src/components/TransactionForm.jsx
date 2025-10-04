import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Stack, IconButton } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';

function TransactionForm({
  serviceItems,
  onSubmit,
  initialData = null,
  onCancel,
  onSelectCustomerClick,
  selectedCustomer,
  clearSelectedCustomer
}) {
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const itemInputRef = useRef(null);

  const isEditing = !!initialData;
  const isDebtItem = item === 'New Debt' || item === 'Paid Debt';

  useEffect(() => {
    if (initialData) {
      setItem(initialData.item || '');
      setQuantity(initialData.quantity || '');
      setPrice(initialData.price || '');
      setNotes(initialData.notes || '');
    }
  }, [initialData]);

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
      if (clearSelectedCustomer) clearSelectedCustomer();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isDebtItem && !selectedCustomer && !isEditing) {
      alert("Please select a customer for this transaction.");
      return;
    }
    const transactionData = {
      item,
      quantity: Number(quantity),
      price: Number(price),
      total: Number(quantity) * Number(price),
      notes,
    };
    onSubmit(transactionData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
      <Typography variant="h5">{isEditing ? 'Edit Entry' : 'Log Entry'}</Typography>
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
          {selectedCustomer || (isEditing && initialData.customerName) ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography><strong>{selectedCustomer?.fullName || initialData.customerName}</strong></Typography>
              <IconButton size="small" onClick={clearSelectedCustomer}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Button onClick={onSelectCustomerClick} fullWidth variant="outlined" size="small" sx={{ mt: 0.5 }}>Select Customer</Button>
          )}
        </Box>
      )}
      <TextField type="number" label="Quantity" value={quantity} placeholder="1" onChange={(e) => setQuantity(e.target.value)} required />
      <TextField type="number" label="Price" value={price} placeholder="₱3.00" onChange={(e) => setPrice(e.target.value)} required />
      <Typography>Total: ₱{quantity * price || 0}</Typography>
      <TextField label="Notes (Optional)" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
        <Button type="submit" variant="contained" fullWidth disabled={isDebtItem && !selectedCustomer && !isEditing}>
          {isEditing ? 'Update Entry' : 'Add Entry'}
        </Button>
        {isEditing && (<Button variant="outlined" onClick={onCancel} fullWidth>Cancel</Button>)}
      </Stack>
    </Box>
  );
}

export default TransactionForm;