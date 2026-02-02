import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Tabs, Tab, Box, Typography, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Select, MenuItem, FormControl, InputLabel, Divider, Stack, Alert
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const BILL_DENOMS = [1000, 500, 200, 100, 50, 20];
const COIN_DENOMS = [20, 10, 5, 1];

const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && (
                <Box sx={{ p: 2 }}>{children}</Box>
            )}
        </div>
    );
};

export default function ShiftConsolidationDialog({
    open, onClose, shift, transactions, showSnackbar
}) {
    const [tab, setTab] = useState(0);

    // --- CASE 1: Cash ---
    const [recon, setRecon] = useState({});

    useEffect(() => {
        if (open && shift) {
            setRecon(shift.denominations || {});
        }
    }, [open, shift]);

    const handleReconChange = (denKey, val) =>
        setRecon((p) => ({ ...p, [denKey]: val }));

    const cashOnHand = useMemo(
        () =>
            Object.entries(recon).reduce((sum, [key, count]) => {
                const denominationValue = Number(key.split("_")[1]);
                if (!isNaN(denominationValue)) {
                    return sum + denominationValue * Number(count || 0);
                }
                return sum;
            }, 0),
        [recon]
    );

    const cashTransactions = useMemo(() =>
        transactions.filter(t => (t.paymentMethod === 'Cash' || !t.paymentMethod) && t.item !== 'Expenses'),
        [transactions]
    );

    const expensesTotal = useMemo(() =>
        transactions
            .filter(t => t.item === 'Expenses')
            .reduce((acc, t) => acc + (t.total || 0), 0),
        [transactions]
    );

    const cashSalesTotal = useMemo(() =>
        cashTransactions.reduce((acc, t) => acc + (t.total || 0), 0),
        [cashTransactions]
    );

    const expectedCash = cashSalesTotal - expensesTotal + (Number(shift?.pcRentalTotal || 0));


    // --- CASE 2: GCash ---
    const gcashTransactions = useMemo(() =>
        transactions.filter(t => t.paymentMethod === 'GCash' && t.item !== 'Expenses'),
        [transactions]
    );

    // We maintain local state for gcash statuses before saving
    const [gcashStatuses, setGcashStatuses] = useState({});

    useEffect(() => {
        if (open && gcashTransactions) {
            const initial = {};
            gcashTransactions.forEach(t => {
                initial[t.id] = t.reconciliationStatus || 'Verified';
            });
            setGcashStatuses(initial);
        }
    }, [open, gcashTransactions]);

    const handleGcashStatusChange = (id, status) => {
        setGcashStatuses(prev => ({ ...prev, [id]: status }));
    };

    const gcashSalesTotal = useMemo(() =>
        gcashTransactions.reduce((acc, t) => acc + (t.total || 0), 0),
        [gcashTransactions]
    );

    const verifiedGcashTotal = useMemo(() => {
        return gcashTransactions.reduce((acc, t) => {
            const status = gcashStatuses[t.id] || 'Verified';
            if (status === 'Verified') return acc + (t.total || 0);
            return acc;
        }, 0);
    }, [gcashTransactions, gcashStatuses]);


    // --- CASE 3: Accounts Receivable ---
    const arTransactions = useMemo(() =>
        transactions.filter(t => t.paymentMethod === 'Charge' && t.item !== 'Expenses'),
        [transactions]
    );

    const arTotal = useMemo(() =>
        arTransactions.reduce((acc, t) => acc + (t.total || 0), 0),
        [arTransactions]
    );


    // --- ACTION: SAVE ALL ---
    const handleSave = async () => {
        try {
            const batch = writeBatch(db);

            // 1. Update Shift Denominations
            const shiftRef = doc(db, 'shifts', shift.id);
            batch.update(shiftRef, {
                denominations: recon,
                lastConsolidatedAt: new Date()
            });

            // 2. Update GCash Transaction Statuses
            Object.entries(gcashStatuses).forEach(([txId, status]) => {
                const txRef = doc(db, 'transactions', txId);
                // Only update if changed (optimization, but batch limits ok for typical shift)
                batch.update(txRef, { reconciliationStatus: status });
            });

            await batch.commit();
            showSnackbar?.("Consolidation saved.", 'success');
            onClose();
        } catch (e) {
            console.error(e);
            showSnackbar?.("Failed to save consolidation.", 'error');
        }
    };


    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Shift Consolidation</DialogTitle>
            <DialogContent dividers sx={{ p: 0, minHeight: 400 }}>
                <Tabs
                    value={tab}
                    onChange={(e, v) => setTab(v)}
                    variant="fullWidth"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab icon={<PaymentsIcon />} label="Cash" />
                    <Tab icon={<PhoneAndroidIcon />} label={`GCash (${gcashTransactions.length})`} />
                    <Tab icon={<ReceiptIcon />} label={`Receivables (${arTransactions.length})`} />
                </Tabs>

                {/* --- CASH TAB --- */}
                <TabPanel value={tab} index={0}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>Bills</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                {BILL_DENOMS.map(d => (
                                    <TextField
                                        key={d}
                                        label={`₱${d}`}
                                        type="number"
                                        size="small"
                                        value={recon[`bill_${d}`] || ''}
                                        onChange={e => handleReconChange(`bill_${d}`, e.target.value)}
                                    />
                                ))}
                            </Box>
                            <Typography variant="subtitle2" sx={{ mt: 2 }} gutterBottom>Coins</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                {COIN_DENOMS.map(d => (
                                    <TextField
                                        key={d}
                                        label={`₱${d}`}
                                        type="number"
                                        size="small"
                                        value={recon[`coin_${d}`] || ''}
                                        onChange={e => handleReconChange(`coin_${d}`, e.target.value)}
                                    />
                                ))}
                            </Box>
                        </Box>

                        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>Cash Summary</Typography>
                            <Stack spacing={1}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">Expected Cash Sales</Typography>
                                    <Typography variant="body2">₱{cashSalesTotal.toLocaleString()}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">PC Rental (Cash)</Typography>
                                    <Typography variant="body2">₱{Number(shift?.pcRentalTotal || 0).toLocaleString()}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
                                    <Typography variant="body2">Expenses (Cash)</Typography>
                                    <Typography variant="body2">-₱{expensesTotal.toLocaleString()}</Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                    <Typography>Expected Cash in Drawer</Typography>
                                    <Typography>₱{expectedCash.toLocaleString()}</Typography>
                                </Box>

                                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="subtitle1">Actual Count</Typography>
                                    <Typography variant="h5" color="primary">₱{cashOnHand.toLocaleString()}</Typography>
                                </Box>

                                <Box sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: (cashOnHand - expectedCash) < 0 ? 'error.main' : 'success.main'
                                }}>
                                    <Typography>Difference</Typography>
                                    <Typography fontWeight="bold">
                                        {(cashOnHand - expectedCash) > 0 ? '+' : ''}
                                        ₱{(cashOnHand - expectedCash).toLocaleString()}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Box>
                </TabPanel>

                {/* --- GCASH TAB --- */}
                <TabPanel value={tab} index={1}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1">
                            Total Expected: ₱{gcashSalesTotal.toLocaleString()}
                        </Typography>
                        <ChipLabel label={`Verified: ₱${verifiedGcashTotal.toLocaleString()}`} color="primary" />
                    </Box>

                    <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Ref No.</TableCell>
                                    <TableCell>Amount</TableCell>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {gcashTransactions.length === 0 && (
                                    <TableRow><TableCell colSpan={4} align="center">No GCash transactions</TableCell></TableRow>
                                )}
                                {gcashTransactions.map((tx, idx) => (
                                    <TableRow key={tx.id || idx}>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {tx.paymentDetails?.refNumber || '—'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {tx.paymentDetails?.phone}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>₱{Number(tx.total).toLocaleString()}</TableCell>
                                        <TableCell>{tx.customerName || 'Walk-in'}</TableCell>
                                        <TableCell>
                                            <Select
                                                size="small"
                                                variant="standard"
                                                value={gcashStatuses[tx.id] || 'Verified'}
                                                onChange={(e) => handleGcashStatusChange(tx.id, e.target.value)}
                                                sx={{ fontSize: '0.875rem' }}
                                            >
                                                <MenuItem value="Verified">Verified</MenuItem>
                                                <MenuItem value="Missing">Missing</MenuItem>
                                                <MenuItem value="Fraud">Fraud</MenuItem>
                                                <MenuItem value="Insufficient">Insufficient</MenuItem>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>

                {/* --- ACCOUNTS RECEIVABLE TAB --- */}
                <TabPanel value={tab} index={2}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        These transactions are recorded as Accounts Receivable. Invoicing module coming soon.
                    </Alert>

                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                        Total Receivables: ₱{arTotal.toLocaleString()}
                    </Typography>

                    <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Amount</TableCell>
                                    <TableCell>Items</TableCell>
                                    <TableCell>Time</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {arTransactions.length === 0 && (
                                    <TableRow><TableCell colSpan={4} align="center">No AR transactions</TableCell></TableRow>
                                )}
                                {arTransactions.map((tx, idx) => (
                                    <TableRow key={tx.id || idx}>
                                        <TableCell>{tx.customerName}</TableCell>
                                        <TableCell>₱{Number(tx.total).toLocaleString()}</TableCell>
                                        <TableCell>{tx.item}</TableCell>
                                        <TableCell>
                                            {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString() : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary">
                    Save Consolidation
                </Button>
            </DialogActions>
        </Dialog>
    );
}

const ChipLabel = ({ label, color }) => (
    <Box sx={{
        bgcolor: `${color}.main`,
        color: `${color}.contrastText`,
        px: 1.5, py: 0.5,
        borderRadius: 4,
        fontSize: '0.75rem',
        fontWeight: 'bold'
    }}>
        {label}
    </Box>
);
