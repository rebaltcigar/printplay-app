import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button, Grid, Card, Table, TableHead, TableRow, TableCell, TableBody, Paper, Tooltip, TableContainer, IconButton } from '@mui/material';
import CommentIcon from '@mui/icons-material/Comment';
import HistoryIcon from '@mui/icons-material/History';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

function ShiftDetailView({ shift, userMap, onBack }) {
  const [transactions, setTransactions] = useState([]);
  const [isLegacyShift, setIsLegacyShift] = useState(false);

  useEffect(() => {
    if (shift?.id) {
      if (!shift.salesBreakdown) {
        setIsLegacyShift(true);
      }
      const q = query(
        collection(db, "transactions"),
        where("shiftId", "==", shift.id),
        orderBy("timestamp", "asc")
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      });
      return () => unsubscribe();
    }
  }, [shift]);
  
  const calculatedBreakdowns = useMemo(() => {
    const sales = {};
    const credits = {};
    const activeTransactions = transactions.filter(tx => !tx.isDeleted);
    activeTransactions.forEach(tx => {
      if (tx.item === 'New Debt' || tx.item === 'Expenses') {
        credits[tx.item] = (credits[tx.item] || 0) + tx.total;
      } else {
        sales[tx.item] = (sales[tx.item] || 0) + tx.total;
      }
    });
    return { sales, credits };
  }, [transactions]);

  const handleUpdateLegacyShift = async () => {
    if (!window.confirm("This will save the calculated breakdowns to this shift record permanently. Continue?")) return;
    try {
      const shiftDocRef = doc(db, "shifts", shift.id);
      await updateDoc(shiftDocRef, {
        salesBreakdown: calculatedBreakdowns.sales,
        creditsBreakdown: calculatedBreakdowns.credits,
      });
      alert("Shift record updated successfully!");
      setIsLegacyShift(false);
    } catch (error) {
      console.error("Error updating legacy shift:", error);
      alert("Failed to update shift record.");
    }
  };
  
  const handleSoftDelete = async (tx) => {
    const reason = window.prompt("Please provide a reason for deleting this entry:");
    if (!reason) {
      alert("Deletion cancelled. A reason is required.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this entry?")) {
      try {
        await updateDoc(doc(db, "transactions", tx.id), {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: auth.currentUser.email,
          deleteReason: reason,
        });
      } catch (error) { 
        console.error("Error soft-deleting transaction:", error);
        alert("Failed to delete entry.");
      }
    }
  };

  const formatTime = (timestamp) => {
    if (timestamp && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000).toLocaleTimeString();
    }
    return 'N/A';
  };

  return (
    <Box>
      <Button onClick={onBack} sx={{ mb: 2 }}>&larr; Back to All Shifts</Button>
      <Typography variant="h4">Detailed Shift Report</Typography>
      <Typography variant="body1" color="text.secondary">
        {userMap[shift.staffEmail] || shift.staffEmail} - {shift.shiftPeriod} Shift on {shift.startTime ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : ''}
      </Typography>

      {isLegacyShift && (
        <Card sx={{ p: 2, mt: 2, backgroundColor: 'warning.dark' }}>
          <Typography>This is an older shift record. Calculated totals are shown below.</Typography>
          <Button variant="contained" sx={{ mt: 1 }} onClick={handleUpdateLegacyShift}>
            Recalculate & Save Totals Permanently
          </Button>
        </Card>
      )}

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Item Totals (Active)</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(calculatedBreakdowns.sales).map(([name, total]) => (
                  <TableRow key={name}><TableCell>{name}</TableCell><TableCell align="right">₱{total.toFixed(2)}</TableCell></TableRow>
                ))}
                {Object.entries(calculatedBreakdowns.credits).map(([name, total]) => (
                  <TableRow key={name}><TableCell>{name}</TableCell><TableCell align="right">(₱{total.toFixed(2)})</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Raw Data Entries</Typography>
            <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id} sx={{ opacity: tx.isDeleted ? 0.4 : 1, '& .MuiTableCell-root': { textDecoration: tx.isDeleted ? 'line-through' : 'none' } }}>
                      <TableCell>{formatTime(tx.timestamp)}</TableCell>
                      <TableCell>{tx.item}</TableCell>
                      <TableCell align="right">{tx.quantity}</TableCell>
                      <TableCell align="right">₱{tx.price.toFixed(2)}</TableCell>
                      <TableCell align="right">₱{tx.total.toFixed(2)}</TableCell>
                      <TableCell>{tx.customerName || 'N/A'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {tx.notes && <Tooltip title={tx.notes}><CommentIcon fontSize="inherit" /></Tooltip>}
                          {tx.isEdited && <Tooltip title="Edited"><HistoryIcon fontSize="inherit" /></Tooltip>}
                          {tx.isDeleted && (
                            <Tooltip title={`Deleted by ${tx.deletedBy} for reason: ${tx.deleteReason}`}>
                              <DeleteIcon fontSize="inherit" color="error" />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => alert('Edit feature coming soon!')} disabled={tx.isDeleted}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleSoftDelete(tx)} disabled={tx.isDeleted}>
                          <DeleteIcon fontSize="inherit" color="error" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ShiftDetailView;