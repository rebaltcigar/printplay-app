import React, { useState, useEffect } from 'react';
import { Box, Typography, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';
import DebtLookupDialog from './DebtLookupDialog';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

function DebtReport() {
  const [debtors, setDebtors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerToView, setCustomerToView] = useState(null);

  useEffect(() => {
    const calculateBalances = async () => {
      setIsLoading(true);
      
      // 1. Fetch all customers
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customerMap = {};
      customersSnapshot.forEach(doc => {
        customerMap[doc.id] = { ...doc.data(), id: doc.id, balance: 0 };
      });

      // 2. Fetch all debt-related transactions
      const transactionsQuery = query(collection(db, "transactions"), where("item", "in", ["New Debt", "Paid Debt"]));
      const transactionsSnapshot = await getDocs(transactionsQuery);

      // 3. Process transactions to calculate balances
      transactionsSnapshot.forEach(doc => {
        const tx = doc.data();
        if (customerMap[tx.customerId]) {
          if (tx.item === 'New Debt') {
            customerMap[tx.customerId].balance += tx.total;
          } else if (tx.item === 'Paid Debt') {
            customerMap[tx.customerId].balance -= tx.total;
          }
        }
      });

      // 4. Filter for customers with a positive balance and set state
      const finalDebtors = Object.values(customerMap).filter(c => c.balance >= 1);
      setDebtors(finalDebtors);
      setIsLoading(false);
    };

    calculateBalances();
  }, []);

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Customer Debt Summary</Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Customer Name</TableCell>
              <TableCell>Username</TableCell>
              <TableCell align="right">Current Balance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {debtors.map((customer) => (
              <TableRow 
                key={customer.id} 
                hover 
                onClick={() => setCustomerToView(customer)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{customer.fullName}</TableCell>
                <TableCell>@{customer.username}</TableCell>
                <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                  ₱{customer.balance.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      {customerToView && (
        <DebtLookupDialog
          open={!!customerToView}
          onClose={() => setCustomerToView(null)}
          initialCustomer={customerToView}
        />
      )}
    </Box>
  );
}

export default DebtReport;