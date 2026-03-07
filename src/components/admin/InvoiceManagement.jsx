// src/components/admin/InvoiceManagement.jsx
import React, { useState, useMemo } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Paper, Chip, Typography, Stack, TextField, InputAdornment, ToggleButtonGroup,
  ToggleButton, IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PageHeader from '../common/PageHeader';
import { useInvoices } from '../../hooks/useInvoices';
import { displayStatus, isOverdue } from '../../services/invoiceService';
import { fmtCurrency, fmtDate } from '../../utils/formatters';
import InvoiceDetailDrawer from './InvoiceDetailDrawer';
import SummaryCards from '../common/SummaryCards';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const STATUS_COLORS = {
  unpaid: 'warning',
  partial: 'info',
  paid: 'success',
  written_off: 'default',
  overdue: 'error',
};

const STATUS_LABELS = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  written_off: 'Written Off',
  overdue: 'Overdue',
};



export default function InvoiceManagement({ user, userRole, showSnackbar }) {
  const [statusFilter, setStatusFilter] = useState(null); // null = all
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { invoices, loading } = useInvoices(); // Fetch all

  const filtered = useMemo(() => {
    let list = invoices;

    // 1. Filter by Status
    if (statusFilter) {
      if (statusFilter === 'overdue') {
        list = list.filter(inv => isOverdue(inv));
      } else {
        list = list.filter(inv => (inv.status || 'unpaid') === statusFilter);
      }
    }

    // 2. Filter by Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(inv =>
        inv.customerName?.toLowerCase().includes(q) ||
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.orderNumber?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [invoices, statusFilter, search]);

  const summaryCards = useMemo(() => {
    let outstandingVal = 0;
    let overdueCount = 0;
    let unpaidCount = 0;
    let paidVal = 0;

    invoices.forEach(inv => {
      if (inv.status !== 'paid' && inv.status !== 'written_off') {
        outstandingVal += (inv.balance || 0);
        unpaidCount++;
        if (isOverdue(inv)) overdueCount++;
      }
      if (inv.status === 'paid' || inv.amountPaid > 0) {
        paidVal += (inv.amountPaid || 0);
      }
    });

    return [
      {
        label: "Outstanding AR",
        value: fmtCurrency(outstandingVal),
        icon: <AccountBalanceWalletIcon />,
        color: "primary.main",
        highlight: true
      },
      {
        label: "Collected Payments",
        value: fmtCurrency(paidVal),
        icon: <PriceCheckIcon />,
        color: "success.main"
      },
      {
        label: "Active Invoices",
        value: String(unpaidCount),
        icon: <RequestQuoteIcon />,
        color: "info.main"
      },
      {
        label: "Overdue Invoices",
        value: String(overdueCount),
        icon: <WarningAmberIcon />,
        color: overdueCount > 0 ? "error.main" : "text.secondary",
        highlight: overdueCount > 0
      }
    ];
  }, [invoices]);

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title="Invoices"
        subtitle="Accounts receivable — charge-to-account orders"
      />

      <SummaryCards cards={summaryCards} loading={loading} sx={{ mb: 2 }} />

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search customer or invoice #"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 260 }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v)}
        >
          <ToggleButton value={null}>All</ToggleButton>
          <ToggleButton value="unpaid">Unpaid</ToggleButton>
          <ToggleButton value="partial">Partial</ToggleButton>
          <ToggleButton value="overdue">Overdue</ToggleButton>
          <ToggleButton value="paid">Paid</ToggleButton>
          <ToggleButton value="written_off">Written Off</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 6, opacity: 0.5 }}>
            <ReceiptLongIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography>No invoices found.</Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Invoice #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Due</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(inv => {
                const ds = displayStatus(inv);
                return (
                  <TableRow
                    key={inv.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelected(inv)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{inv.invoiceNumber || inv.id.slice(-6).toUpperCase()}</Typography>
                    </TableCell>
                    <TableCell>{inv.customerName || '—'}</TableCell>
                    <TableCell>{fmtDate(inv.createdAt)}</TableCell>
                    <TableCell sx={{ color: isOverdue(inv) ? 'error.main' : 'text.primary' }}>
                      {fmtDate(inv.dueDate)}
                    </TableCell>
                    <TableCell align="right">{fmtCurrency(inv.total)}</TableCell>
                    <TableCell align="right">{fmtCurrency(inv.amountPaid)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmtCurrency(inv.balance)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABELS[ds] || ds} color={STATUS_COLORS[ds] || 'default'} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Detail Drawer */}
      <InvoiceDetailDrawer
        invoice={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        user={user}
        userRole={userRole}
        showSnackbar={showSnackbar}
      />
    </Box>
  );
}
