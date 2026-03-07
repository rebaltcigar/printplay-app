import React, { useState, useMemo } from 'react';
import {
    Drawer, Box, Typography, IconButton, TextField, InputAdornment,
    List, ListItem, ListItemButton, ListItemText, Chip, Divider,
    CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';

import { useInvoices } from '../../hooks/useInvoices';
import { fmtCurrency, fmtDate } from '../../utils/formatters';
import { useGlobalUI } from '../../contexts/GlobalUIContext';
import InvoiceDetailDrawer from '../admin/InvoiceDetailDrawer';
import CustomerSearchAutocomplete from './CustomerSearchAutocomplete';

/**
 * A sidebar drawer for POS cashiers to search for customers and view their unpaid invoices.
 * Mirrors the style of `MyScheduleDrawer` etc.
 */
export default function POSInvoiceLookupDrawer({ open, onClose, user, userRole, activeShiftId }) {
    const { showSnackbar } = useGlobalUI();
    const [search, setSearch] = useState('');
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // Fetch invoices — we only care about unpaid/partial for the POS lookup.
    // The hook will pull all recent invoices, we filter locally for speed given expected volume.
    const { invoices, loading } = useInvoices({ limitCount: 500 });

    // Find unpaid/partial invoices that match the search term
    const filteredInvoices = useMemo(() => {
        if (!invoices) return [];

        let filtered = invoices.filter(inv =>
            inv.status === 'unpaid' || inv.status === 'partial'
        );

        const term = search.trim().toLowerCase();
        if (term) {
            filtered = filtered.filter(inv =>
                (inv.customerName || '').toLowerCase().includes(term) ||
                (inv.invoiceNumber || '').toLowerCase().includes(term) ||
                (inv.customerTin || '').toLowerCase().includes(term)
            );
        }

        // Sort by oldest due date first
        return filtered.sort((a, b) => {
            const dateA = a.dueDate?.seconds || 0;
            const dateB = b.dueDate?.seconds || 0;
            return dateA - dateB;
        });

    }, [invoices, search]);

    // Auto-close sequence
    const handlePaymentSuccess = () => {
        setSelectedInvoice(null); // Close detail drawer
        onClose(); // Close lookup drawer
    };


    return (
        <>
            <Drawer
                anchor="left"
                open={open}
                onClose={onClose}
                PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, display: 'flex', flexDirection: 'column' } }}
            >
                {/* Header */}
                <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'background.default' }}>
                    <Typography variant="h6" fontWeight={700}>Invoices / Receivables</Typography>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />

                {/* Search Bar */}
                <Box sx={{ p: 2 }}>
                    <CustomerSearchAutocomplete
                        label="Search customer, invoice #, TIN..."
                        inputValue={search}
                        onInputChange={(e, val) => setSearch(val || '')}
                        onChange={(newVal) => {
                            if (typeof newVal === 'string') setSearch(newVal);
                            else if (newVal?.fullName) setSearch(newVal.fullName);
                            else setSearch('');
                        }}
                    />
                </Box>

                {/* List */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : filteredInvoices.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', opacity: 0.6 }}>
                            <Typography variant="body2">
                                {search ? 'No unpaid invoices found for this search.' : 'No unpaid invoices right now. You are all caught up!'}
                            </Typography>
                        </Box>
                    ) : (
                        <List disablePadding>
                            {filteredInvoices.map((inv) => (
                                <React.Fragment key={inv.id}>
                                    <ListItem disablePadding>
                                        <ListItemButton
                                            onClick={() => setSelectedInvoice(inv)}
                                            sx={{ py: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                                        >
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {inv.customerName || 'Walk-in Customer'}
                                                </Typography>
                                                <Typography variant="subtitle2" fontWeight="bold" color={inv.balance > 0 ? 'error.main' : 'text.primary'}>
                                                    {fmtCurrency(inv.balance)}
                                                </Typography>
                                            </Box>

                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                        {inv.invoiceNumber || inv.id.slice(-6).toUpperCase()}
                                                    </Typography>

                                                    {inv.status === 'partial' && (
                                                        <Chip size="small" label="PARTIAL" color="info" sx={{ height: 16, fontSize: '0.6rem' }} />
                                                    )}
                                                </Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    Due: {fmtDate(inv.dueDate)}
                                                </Typography>
                                            </Box>
                                        </ListItemButton>
                                    </ListItem>
                                    <Divider />
                                </React.Fragment>
                            ))}
                        </List>
                    )}
                </Box>
            </Drawer>

            {/* Reusable Detail Drawer for Viewing AND Paying */}
            <InvoiceDetailDrawer
                open={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                invoice={selectedInvoice}
                user={user}
                userRole={userRole}
                activeShiftId={activeShiftId}
                onPaymentSuccess={handlePaymentSuccess}
            />
        </>
    );
}
