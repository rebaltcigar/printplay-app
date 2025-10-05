import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, Grid, Card, Table, TableHead, TableRow, TableCell,
  TableBody, Paper, Tooltip, TableContainer, IconButton, Divider, TextField
} from '@mui/material';
import CommentIcon from '@mui/icons-material/Comment';
import HistoryIcon from '@mui/icons-material/History';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { db, auth } from '../firebase';
  import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import logo from '../assets/react.svg';

const BILL_DENOMS = [1000, 500, 200, 100, 50, 20];
const COIN_DENOMS = [20, 10, 5, 1];

function ShiftDetailView({ shift, userMap, onBack }) {
  const [transactions, setTransactions] = useState([]);
  const [recon, setRecon] = useState({}); // admin-entered denominations
  const [pcRental, setPcRental] = useState(shift.pcRentalTotal || 0);

  useEffect(() => {
    if (!shift?.id) return;
    const q = query(
      collection(db, "transactions"),
      where("shiftId", "==", shift.id),
      orderBy("timestamp", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsubscribe();
  }, [shift]);

  useEffect(() => {
    // load existing reconciliation if present
    (async () => {
      const s = await getDoc(doc(db, 'shifts', shift.id));
      const d = s.data() || {};
      setRecon(d.denominations || {});
      if (typeof d.pcRentalTotal === 'number') setPcRental(d.pcRentalTotal);
    })();
  }, [shift.id]);

  const servicesTotal = useMemo(
    () => transactions.filter(tx => !tx.isDeleted && tx.item !== 'Expenses' && tx.item !== 'New Debt')
      .reduce((sum, tx) => sum + (tx.total || 0), 0),
    [transactions]
  );
  const expensesTotal = useMemo(
    () => transactions.filter(tx => !tx.isDeleted && (tx.item === 'Expenses' || tx.item === 'New Debt'))
      .reduce((sum, tx) => sum + (tx.total || 0), 0),
    [transactions]
  );
  const systemTotal = useMemo(() => servicesTotal - expensesTotal + Number(pcRental || 0), [servicesTotal, expensesTotal, pcRental]);

  const cashOnHand = useMemo(() =>
    Object.entries(recon).reduce((sum, [den, count]) => sum + (Number(den) * Number(count || 0)), 0),
    [recon]
  );

  const handleReconChange = (den, val) => {
    setRecon(prev => ({ ...prev, [den]: val }));
  };

  const saveRecon = async () => {
    try {
      await updateDoc(doc(db, 'shifts', shift.id), {
        denominations: recon,
        pcRentalTotal: Number(pcRental),
        systemTotal
      });
      alert('Cash reconciliation saved.');
    } catch (e) {
      console.error(e);
      alert('Failed to save reconciliation.');
    }
  };

  const handleSoftDelete = async (tx) => {
    const reason = window.prompt("Please provide a reason for deleting this entry:");
    if (!reason) return alert("Deletion cancelled. A reason is required.");
    if (!window.confirm("Delete this entry?")) return;
    try {
      await updateDoc(doc(db, "transactions", tx.id), {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: auth.currentUser.email,
        deleteReason: reason,
      });
    } catch (error) {
      console.error("Error soft-deleting:", error);
      alert("Failed to delete entry.");
    }
  };

  const formatTime = (ts) => ts?.seconds ? new Date(ts.seconds * 1000).toLocaleTimeString() : '—';

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <img src={logo} width={18} height={18} alt="" />
        <Button onClick={onBack} size="small" sx={{ ml: 0.5 }}>&larr; Back to All Shifts</Button>
      </Box>

      <Typography variant="h5">Shift Detail</Typography>
      <Typography variant="body2" color="text.secondary">
        {userMap[shift.staffEmail] || shift.staffEmail} — {shift.shiftPeriod} — {shift.startTime?.seconds ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : ''}
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600}>Admin Cash Reconciliation</Typography>
            <Divider sx={{ my: 1 }} />
            <TextField
              label="PC Rental Total"
              type="number"
              value={pcRental}
              onChange={(e) => setPcRental(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Typography variant="subtitle2">Bills</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {BILL_DENOMS.map(d => (
                <TextField
                  key={d} type="number" size="small"
                  label={`₱${d} x`}
                  value={recon[d] || ''}
                  onChange={(e) => handleReconChange(d, e.target.value)}
                  sx={{ width: 120 }}
                />
              ))}
            </Box>
            <Typography variant="subtitle2">Coins</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {COIN_DENOMS.map(d => (
                <TextField
                  key={d} type="number" size="small"
                  label={`₱${d} x`}
                  value={recon[d] || ''}
                  onChange={(e) => handleReconChange(d, e.target.value)}
                  sx={{ width: 120 }}
                />
              ))}
            </Box>

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>System Total</Typography>
              <Typography>₱{systemTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Cash on Hand</Typography>
              <Typography>₱{cashOnHand.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">Difference</Typography>
              <Typography variant="subtitle1" color={cashOnHand - systemTotal !== 0 ? 'error' : 'inherit'}>
                ₱{(cashOnHand - systemTotal).toFixed(2)}
              </Typography>
            </Box>

            <Button onClick={saveRecon} variant="contained" sx={{ mt: 2 }}>
              Save Reconciliation
            </Button>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle1" fontWeight={600}>Transactions</Typography>
            <TableContainer component={Paper} sx={{ flex: 1, mt: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Customer / Notes</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id} sx={{ opacity: tx.isDeleted ? 0.4 : 1 }}>
                      <TableCell>{formatTime(tx.timestamp)}</TableCell>
                      <TableCell>{tx.item}</TableCell>
                      <TableCell align="right">{tx.quantity}</TableCell>
                      <TableCell align="right">₱{(tx.price || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">₱{(tx.total || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          {tx.customerName || '—'}
                          {tx.notes && <Tooltip title={tx.notes}><CommentIcon fontSize="inherit" /></Tooltip>}
                          {tx.isEdited && <Tooltip title="Edited"><HistoryIcon fontSize="inherit" /></Tooltip>}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => alert('Admin edit coming soon')} disabled={tx.isDeleted}>
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

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Services Total</Typography>
              <Typography>₱{servicesTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography>Expenses Total</Typography>
              <Typography>₱{expensesTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">System Total</Typography>
              <Typography variant="subtitle1">₱{systemTotal.toFixed(2)}</Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ShiftDetailView;
