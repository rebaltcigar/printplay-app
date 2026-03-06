import React, { useState } from 'react';
import {
    Typography, Box, Stack, Divider, Chip, Table, TableHead,
    TableBody, TableRow, TableCell, Button, Grid
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import { fmtCurrency } from '../../utils/formatters';
import { displayStatus, writeOffInvoice } from '../../utils/invoiceService';
import RecordPaymentDialog from '../RecordPaymentDialog';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';
import { safePrintInvoice } from '../../utils/printHelper';
import DetailDrawer from '../common/DetailDrawer';

const STATUS_COLORS = {
    unpaid: 'warning',
    partial: 'info',
    paid: 'success',
    written_off: 'default',
    overdue: 'error',
};

function toDateStr(val) {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function InvoiceDetailDrawer({ open, onClose, invoice, user, showSnackbar, activeShiftId, onPaymentSuccess }) {
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', requireReason: false, onConfirm: null });

    if (!invoice) return <DetailDrawer open={open} onClose={onClose} title="Loading..." />;

    const status = displayStatus(invoice);
    const canPay = status !== 'paid' && status !== 'written_off';

    const handleWriteOff = () => {
        setConfirmDialog({
            open: true,
            title: 'Write Off Invoice',
            message: `Are you sure you want to write off the remaining balance of ${fmtCurrency(invoice.balance)}? This will mark the invoice as fully resolved as Bad Debt.`,
            requireReason: true,
            confirmText: 'Confirm Write-Off',
            confirmColor: 'error',
            onConfirm: async (reason) => {
                try {
                    await writeOffInvoice(invoice.id, { reason, staffEmail: user?.email }, invoice);
                    showSnackbar('Invoice written off successfully.', 'success');
                    onClose();
                } catch (err) {
                    console.error('Failed to write off:', err);
                    showSnackbar('Failed to write off invoice.', 'error');
                }
            }
        });
    };

    const handlePrint = () => {
        safePrintInvoice(() => { }, "Invoice Detail", { ...invoice, isAR: true });
    };

    return (
        <>
            <DetailDrawer
                open={open}
                onClose={onClose}
                title={`Invoice ${invoice.invoiceNumber || invoice.id?.slice(-6).toUpperCase()}`}
                width={800}
                actions={
                    <>
                        <Button onClick={onClose} color="inherit">Close</Button>
                        <Box sx={{ flexGrow: 1 }} />
                        {canPay && user?.role === 'admin' && (
                            <Button
                                startIcon={<AssignmentReturnIcon />}
                                onClick={handleWriteOff}
                                color="warning"
                                sx={{ mr: 1 }}
                            >
                                Write Off
                            </Button>
                        )}
                        <Button
                            startIcon={<PrintIcon />}
                            onClick={handlePrint}
                            variant="outlined"
                            sx={{ mr: 1 }}
                        >
                            Print Invoice
                        </Button>
                        {canPay && (
                            <Button
                                startIcon={<PaymentsIcon />}
                                onClick={() => setPaymentDialogOpen(true)}
                                variant="contained"
                                color="primary"
                            >
                                Record Payment
                            </Button>
                        )}
                    </>
                }
            >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Chip
                        size="small"
                        label={status.toUpperCase()}
                        color={STATUS_COLORS[status] || 'default'}
                    />
                </Box>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ mb: 4 }}>
                    <Box flex={1}>
                        <Typography variant="overline" color="text.secondary">Customer Details</Typography>
                        <Typography variant="subtitle1" fontWeight="bold">{invoice.customerName || 'Walk-in Customer'}</Typography>
                        {invoice.customerAddress && <Typography variant="body2">{invoice.customerAddress}</Typography>}
                        {invoice.customerTin && <Typography variant="body2">TIN: {invoice.customerTin}</Typography>}
                    </Box>
                    <Box flex={1}>
                        <Typography variant="overline" color="text.secondary">Invoice Details</Typography>
                        <Grid container spacing={1}>
                            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Date Issued:</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2" fontWeight="medium">{toDateStr(invoice.createdAt)}</Typography></Grid>

                            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Due Date:</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2" fontWeight="medium" color={status === 'overdue' ? 'error.main' : 'inherit'}>{toDateStr(invoice.dueDate)}</Typography></Grid>

                            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Order Ref:</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2" fontWeight="medium">{invoice.orderNumber || '—'}</Typography></Grid>
                        </Grid>
                    </Box>
                </Stack>

                <Typography variant="overline" color="text.secondary">Line Items</Typography>
                <Table size="small" sx={{ mb: 4 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell align="right">Qty</TableCell>
                            <TableCell align="right">Price</TableCell>
                            <TableCell align="right">Total</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(invoice.items || []).map((item, i) => (
                            <TableRow key={i}>
                                <TableCell>{item.description || item.name}</TableCell>
                                <TableCell align="right">{item.quantity}</TableCell>
                                <TableCell align="right">{fmtCurrency(item.price)}</TableCell>
                                <TableCell align="right">{fmtCurrency(item.total)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', mr: 2, mb: 4 }}>
                    <Box sx={{ width: 250 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2">Subtotal:</Typography>
                            <Typography variant="body2" fontWeight="bold">{fmtCurrency(invoice.subtotal || invoice.total)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, color: 'success.main' }}>
                            <Typography variant="body2">Amount Paid:</Typography>
                            <Typography variant="body2" fontWeight="bold">-{fmtCurrency(invoice.amountPaid || 0)}</Typography>
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', color: invoice.balance > 0 ? 'error.main' : 'text.primary' }}>
                            <Typography variant="subtitle1" fontWeight="bold">Balance Due:</Typography>
                            <Typography variant="subtitle1" fontWeight="bold">{fmtCurrency(invoice.balance || 0)}</Typography>
                        </Box>
                    </Box>
                </Box>

                {invoice.payments && invoice.payments.length > 0 && (
                    <>
                        <Typography variant="overline" color="text.secondary">Payment History</Typography>
                        <Table size="small" sx={{ mt: 1 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Method</TableCell>
                                    <TableCell>Ref / Notes</TableCell>
                                    <TableCell>Staff</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {invoice.payments.map((p, i) => (
                                    <TableRow key={p.paymentId || i}>
                                        <TableCell>{toDateStr(p.date)}</TableCell>
                                        <TableCell sx={{ textTransform: 'capitalize' }}>{p.method.replace('_', ' ')}</TableCell>
                                        <TableCell>{p.note || '—'}</TableCell>
                                        <TableCell>{p.staffEmail?.split('@')[0] || '—'}</TableCell>
                                        <TableCell align="right" fontWeight={p.method === 'write_off' ? 'normal' : 'bold'} color={p.method === 'write_off' ? 'text.secondary' : 'inherit'}>
                                            {fmtCurrency(p.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </>
                )}

            </DetailDrawer>

            <RecordPaymentDialog
                open={paymentDialogOpen}
                onClose={() => setPaymentDialogOpen(false)}
                invoice={invoice}
                user={user}
                showSnackbar={showSnackbar}
                activeShiftId={activeShiftId}
                onSuccess={onPaymentSuccess}
            />

            <ConfirmationReasonDialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
                {...confirmDialog}
            />
        </>
    );
}
