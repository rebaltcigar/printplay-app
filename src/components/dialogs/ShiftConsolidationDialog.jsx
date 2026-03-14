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
import { supabase } from '../../supabase';
import { sumDenominations, computeShiftFinancials, isDigitalPayment } from '../../utils/shiftFinancials';
import { fmtCurrency, fmtTime } from '../../utils/formatters';
import { useGlobalUI } from '../../contexts/GlobalUIContext';

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
    open, onClose, shift, transactions
}) {
    const { showSnackbar } = useGlobalUI();
    const [tab, setTab] = useState(0);

    // --- CASE 1: Cash ---
    const [saving, setSaving] = useState(false);
    const [recon, setRecon] = useState({});

    useEffect(() => {
        if (open && shift) {
            setRecon(shift.denominations || {});
        }
    }, [open, shift]);

    const handleReconChange = (denKey, val) =>
        setRecon((p) => ({ ...p, [denKey]: val }));

    const cashOnHand = useMemo(() => sumDenominations(recon), [recon]);


    // Single source of truth: all financial computations via shiftFinancials.js
    const {
        expectedCash,
        expensesTotal,
        totalDigital: digitalSalesTotal,
        totalAr: arTotal,
        totalCash,
        loggedPcNonCash,
    } = useMemo(
        () => computeShiftFinancials(transactions, shift?.pcRentalTotal || 0),
        [transactions, shift?.pcRentalTotal]
    );

    // Breakdown display values for Cash tab
    const pcRentalCash = Math.max(0, Number(shift?.pcRentalTotal || 0) - loggedPcNonCash);
    const cashSalesTotal = totalCash - pcRentalCash;


    // --- CASE 2: Digital (GCash, Maya, Bank Transfer, Card) ---
    const digitalTransactions = useMemo(() =>
        transactions.filter(t => isDigitalPayment(t.paymentMethod || t.payment_method) && (t.item ?? t.name) !== 'Expenses'),
        [transactions]
    );

    // Local state for per-transaction reconciliation statuses
    const [digitalStatuses, setDigitalStatuses] = useState({});

    useEffect(() => {
        if (open && digitalTransactions) {
            const initial = {};
            digitalTransactions.forEach(t => {
                initial[t.id] = t.reconciliation_status || t.reconciliationStatus || 'Verified';
            });
            setDigitalStatuses(initial);
        }
    }, [open, digitalTransactions]);

    const handleDigitalStatusChange = (id, status) => {
        setDigitalStatuses(prev => ({ ...prev, [id]: status }));
    };

    const verifiedDigitalTotal = useMemo(() => {
        return digitalTransactions.reduce((acc, t) => {
            const status = digitalStatuses[t.id] || 'Verified';
            if (status === 'Verified') return acc + (t.total || 0);
            return acc;
        }, 0);
    }, [digitalTransactions, digitalStatuses]);


    // --- CASE 3: Accounts Receivable ---
    const arTransactions = useMemo(() =>
        transactions.filter(t => (t.paymentMethod === 'Charge' || t.payment_method === 'Charge') && (t.item ?? t.name) !== 'Expenses'),
        [transactions]
    );

    // arTotal is now derived from computeShiftFinancials (see above)


    // --- ACTION: SAVE ALL ---
    const handleSave = async () => {
        if (cashOnHand === 0) {
            const ok = window.confirm(
                'No denominations have been entered — cash on hand is ₱0.\n\nSave anyway?'
            );
            if (!ok) return;
        }
        try {
            setSaving(true);
            const now = new Date().toISOString();

            // 1. Update Shift Denominations + authoritative cash_difference
            const cashDifference = Number((cashOnHand - expectedCash).toFixed(2));
            const { error: shiftError } = await supabase
                .from('shifts')
                .update({
                    denominations: recon,
                    cash_difference: cashDifference,
                    last_consolidated_at: now
                })
                .eq('id', shift.id);

            if (shiftError) throw shiftError;

            // 2. Update Digital Transaction Statuses (in parallel)
            const txUpdates = Object.entries(digitalStatuses).map(async ([txId, status]) => {
                // Determine which table the transaction might be in based on ID prefix
                // The consolidated transactions array mixes order_items and pc_transactions
                // But generally, digital transactions shown here are mostly order_items or pc_transactions
                const isPcTxn = txId.startsWith('TXN');
                const table = isPcTxn ? 'pc_transactions' : 'order_items';

                const { error } = await supabase
                    .from(table)
                    .update({ reconciliation_status: status })
                    .eq('id', txId);

                if (error) throw error;
            });

            await Promise.all(txUpdates);

            showSnackbar("Consolidation saved.", 'success');
            onClose();
        } catch (e) {
            console.error(e);
            showSnackbar("Failed to save consolidation: " + e.message, 'error');
        } finally {
            setSaving(false);
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
                    <Tab icon={<PhoneAndroidIcon />} label={`Digital (${digitalTransactions.length})`} />
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
                                    <Typography variant="body2">{fmtCurrency(cashSalesTotal)}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">PC Rental (Cash)</Typography>
                                    <Typography variant="body2">{fmtCurrency(pcRentalCash)}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
                                    <Typography variant="body2">Expenses (Cash)</Typography>
                                    <Typography variant="body2">-{fmtCurrency(expensesTotal)}</Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                    <Typography>Expected Cash in Drawer</Typography>
                                    <Typography>{fmtCurrency(expectedCash)}</Typography>
                                </Box>

                                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="subtitle1">Actual Count</Typography>
                                    <Typography variant="h5" color="primary">{fmtCurrency(cashOnHand)}</Typography>
                                </Box>

                                <Box sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: (cashOnHand - expectedCash) < 0 ? 'error.main' : 'success.main'
                                }}>
                                    <Typography>Difference</Typography>
                                    <Typography fontWeight="bold">
                                        {(cashOnHand - expectedCash) > 0 ? '+' : ''}
                                        {fmtCurrency(cashOnHand - expectedCash)}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Box>
                </TabPanel>

                {/* --- DIGITAL TAB --- */}
                <TabPanel value={tab} index={1}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1">
                            Total Expected: {fmtCurrency(digitalSalesTotal)}
                        </Typography>
                        <ChipLabel label={`Verified: ${fmtCurrency(verifiedDigitalTotal)}`} color="primary" />
                    </Box>

                    <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Method</TableCell>
                                    <TableCell>Ref No.</TableCell>
                                    <TableCell>Amount</TableCell>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {digitalTransactions.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center">No digital transactions</TableCell></TableRow>
                                )}
                                {digitalTransactions.map((tx, idx) => (
                                    <TableRow key={tx.id || idx}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">{tx.paymentMethod || tx.payment_method}</Typography>
                                            {(tx.paymentDetails?.bankName || tx.payment_details?.bankName) && (
                                                <Typography variant="caption" color="text.secondary">{tx.paymentDetails?.bankName || tx.payment_details?.bankName}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {tx.paymentDetails?.refNumber || tx.payment_details?.refNumber || tx.payment_details?.ref_number || '—'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {tx.paymentDetails?.phone || tx.payment_details?.phone}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{fmtCurrency(tx.total ?? tx.amount)}</TableCell>
                                        <TableCell>{tx.customerName || tx.customer_name || 'Walk-in'}</TableCell>
                                        <TableCell>
                                            <Select
                                                size="small"
                                                variant="standard"
                                                value={digitalStatuses[tx.id] || 'Verified'}
                                                onChange={(e) => handleDigitalStatusChange(tx.id, e.target.value)}
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
                        Total Receivables: {fmtCurrency(arTotal)}
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
                                        <TableCell>{tx.customerName || tx.customer_name}</TableCell>
                                        <TableCell>{fmtCurrency(tx.total ?? tx.amount)}</TableCell>
                                        <TableCell>{tx.item || tx.name}</TableCell>
                                        <TableCell>
                                            {tx.timestamp ? fmtTime(tx.timestamp) : ''}
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
                <Button onClick={handleSave} variant="contained" color="primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Consolidation'}
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
