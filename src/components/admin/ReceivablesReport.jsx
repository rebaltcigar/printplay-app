import React, { useState, useMemo, useEffect } from 'react';
import {
    Box, Typography, Card, CircularProgress, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useInvoices } from '../../hooks/useInvoices';
import { useOutstandingReceivables } from '../../hooks/useInvoices';
import { fmtCurrency, fmtDate } from '../../utils/formatters';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import GroupsIcon from '@mui/icons-material/Groups';
import ReceiptIcon from '@mui/icons-material/Receipt';

export default function ReceivablesReport({ showSnackbar }) {
    const { invoices, loading: invoicesLoading } = useInvoices();
    const { total: outstandingTotal, loading: totalLoading } = useOutstandingReceivables();

    // Grouping invoices by customer
    const groupedByCustomer = useMemo(() => {
        if (!invoices) return {};

        const groups = {};
        invoices.forEach(inv => {
            // Include overdue, unpaid, partial
            if (inv.status === 'paid' || inv.status === 'written_off') return;

            const cid = inv.customerId || inv.customerName || 'Walk-in';
            const cName = inv.customerName || 'Walk-in Customer';

            if (!groups[cid]) {
                groups[cid] = {
                    customerId: cid,
                    customerName: cName,
                    invoices: [],
                    totalBalance: 0
                };
            }
            groups[cid].invoices.push(inv);
            groups[cid].totalBalance += (inv.balance || 0);
        });

        // Convert to array and sort by highest balance
        return Object.values(groups).sort((a, b) => b.totalBalance - a.totalBalance);
    }, [invoices]);

    const summaryCards = useMemo(() => {
        const uniqueCustomers = groupedByCustomer.length;
        let totalInvoices = 0;
        groupedByCustomer.forEach(g => {
            totalInvoices += g.invoices.length;
        });

        const avgPerCustomer = uniqueCustomers > 0 ? (outstandingTotal / uniqueCustomers) : 0;

        return [
            {
                label: "Total Outstanding AR",
                value: fmtCurrency(outstandingTotal),
                icon: <AccountBalanceWalletIcon />,
                color: "error.main",
                highlight: true
            },
            {
                label: "Customers Owe",
                value: String(uniqueCustomers),
                icon: <GroupsIcon />,
                color: "warning.main"
            },
            {
                label: "Unpaid Invoices",
                value: String(totalInvoices),
                icon: <ReceiptIcon />,
                color: "info.main"
            },
            {
                label: "Avg. per Customer",
                value: fmtCurrency(avgPerCustomer),
                icon: <AccountBalanceWalletIcon />,
                color: "text.secondary"
            }
        ];
    }, [groupedByCustomer, outstandingTotal]);





    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <PageHeader
                title="Receivables Report"
                subtitle="Track outstanding balances and expected payments by customer"
            />

            <SummaryCards cards={summaryCards} loading={invoicesLoading || totalLoading} sx={{ mb: 4 }} />

            <Typography variant="h6" sx={{ mb: 2 }}>Receivables by Customer</Typography>

            <Box sx={{ flex: 1, overflowY: 'auto', pb: 4 }}>
                {groupedByCustomer.length === 0 ? (
                    <Typography color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                        No outstanding receivables at this time.
                    </Typography>
                ) : (
                    groupedByCustomer.map(group => (
                        <Accordion key={group.customerId} sx={{ mb: 1 }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                                    <Typography fontWeight="bold">{group.customerName}</Typography>
                                    <Typography fontWeight="bold" color="error.main">
                                        {fmtCurrency(group.totalBalance)}
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Invoice #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell>Due Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                                <TableCell align="right">Paid</TableCell>
                                                <TableCell align="right">Balance</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {group.invoices.map(inv => (
                                                <TableRow key={inv.id}>
                                                    <TableCell sx={{ fontFamily: 'monospace' }}>
                                                        {inv.invoiceNumber || inv.id.slice(-6).toUpperCase()}
                                                    </TableCell>
                                                    <TableCell>{fmtDate(inv.createdAt)}</TableCell>
                                                    <TableCell>{fmtDate(inv.dueDate)}</TableCell>
                                                    <TableCell align="right">{fmtCurrency(inv.total)}</TableCell>
                                                    <TableCell align="right">{fmtCurrency(inv.amountPaid)}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                        {fmtCurrency(inv.balance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
            </Box>
        </Box>
    );
}
