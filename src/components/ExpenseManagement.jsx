import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Card, TextField, Select, MenuItem, FormControl, InputLabel, Paper, Table, TableHead, TableRow, TableCell, TableBody, Stack, Grid, TableContainer } from '@mui/material';
import { db, auth } from '../firebase';
import { collection, addDoc, query, onSnapshot, orderBy } from 'firebase/firestore';

function ExpenseManagement() {
  // State for the form
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [expenseType, setExpenseType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');

  // State for the data
  const [expenses, setExpenses] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState(['Bills', 'Payroll', 'Consumables', 'Rent', 'Other']); // Initial types

  // Listener to fetch expenses
  useEffect(() => {
    const q = query(collection(db, "businessExpenses"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const clearForm = () => {
    setExpenseType('');
    setQuantity(1);
    setPrice('');
    setNotes('');
  };

  const handleAddExpense = async (event) => {
    event.preventDefault();
    if (!date || !expenseType || !price) {
      alert("Date, Expense Type, and Price are required.");
      return;
    }
    try {
      await addDoc(collection(db, "businessExpenses"), {
        date: new Date(date),
        expenseType,
        quantity: Number(quantity),
        price: Number(price),
        total: Number(quantity) * Number(price),
        notes,
        loggedBy: auth.currentUser.email,
      });
      clearForm();
    } catch (error) {
      console.error("Error adding expense:", error);
      alert("Failed to add expense.");
    }
  };

  return (
    <Grid container spacing={2}>
      {/* Form Section */}
      <Grid item xs={12} md={4}>
        <Card sx={{ p: 2 }}>
          <Box component="form" onSubmit={handleAddExpense} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h5">Log a Business Expense</Typography>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
            <FormControl fullWidth required>
              <InputLabel>Expense Type</InputLabel>
              <Select value={expenseType} label="Expense Type" onChange={(e) => setExpenseType(e.target.value)}>
                {expenseTypes.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField type="number" label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            <TextField type="number" label="Price / Amount" value={price} onChange={(e) => setPrice(e.target.value)} required />
            <Typography>Total: ₱{quantity * price || 0}</Typography>
            <TextField label="Notes (Optional)" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button type="submit" variant="contained">Add Expense</Button>
          </Box>
        </Card>
      </Grid>
      
      {/* Table Section */}
      <Grid item xs={12} md={8}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id} hover>
                  <TableCell>{new Date(expense.date.seconds * 1000).toLocaleDateString()}</TableCell>
                  <TableCell>{expense.expenseType}</TableCell>
                  <TableCell>{expense.notes || 'N/A'}</TableCell>
                  <TableCell align="right">₱{expense.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Grid>
    </Grid>
  );
}

export default ExpenseManagement;