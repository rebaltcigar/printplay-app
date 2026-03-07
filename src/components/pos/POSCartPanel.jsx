import React from 'react';
import {
    Box, Typography, IconButton, Tabs, Tab, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Stack, Button, Tooltip
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';

const POSCartPanel = ({
    activeTab,
    setActiveTab,
    orders,
    closeOrderTab,
    addOrderTab,
    currentOrder,
    updateCurrentOrder,
    currentTotal,
    currency,
    openLineItemEdit,
    removeFromCart,
    setOpenCheckout,
    systemSettings,
    handlePrintExistingOrder,
    handlePrintExistingInvoice,
    setOpenCustomerSelection
}) => {
    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider">
                <ShoppingCartIcon sx={{ mr: 1, opacity: 0.6 }} />
                <Typography variant="subtitle2" fontWeight="bold">Current Order</Typography>
            </Box>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', display: 'flex', alignItems: 'center' }}>
                <Tabs
                    value={activeTab}
                    onChange={(e, v) => setActiveTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ minHeight: 40, flex: 1, '& .MuiTab-root': { minHeight: 40 } }}
                >
                    {orders.map((ord, idx) => (
                        <Tab
                            key={ord.id}
                            label={
                                <Box display="flex" alignItems="center" gap={1}>
                                    {ord.isExisting ? ord.orderNumber : `Order ${ord.id}`}
                                    {orders.length > 1 && (
                                        <CloseIcon
                                            fontSize="small"
                                            onClick={(e) => closeOrderTab(e, idx)}
                                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 }, ml: 0.5 }}
                                        />
                                    )}
                                </Box>
                            }
                        />
                    ))}
                </Tabs>
                <IconButton onClick={addOrderTab} size="small" sx={{ mx: 1 }}><AddIcon fontSize="small" /></IconButton>
            </Box>

            {/* Customer Selection */}
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Customer:
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                        {currentOrder?.customer ? currentOrder.customer.fullName : 'Walk-in'}
                    </Typography>
                </Box>

                <Tooltip title="Assign Customer">
                    <IconButton size="small" onClick={() => setOpenCustomerSelection(true)}>
                        <EditIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                {currentOrder?.customer && (
                    <Tooltip title="Remove Customer">
                        <IconButton size="small" color="error" onClick={() => updateCurrentOrder({ customer: null })}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Order Total */}
            <Box sx={{
                px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                bgcolor: 'background.paper', flexShrink: 0,
            }}>
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                    Order Total
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="primary">
                    {currency(currentTotal)}
                </Typography>
            </Box>

            {/* Cart Items Table */}
            <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: 'background.paper', width: '40%' }}>Product</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'background.paper', width: '15%' }}>Qty</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '15%' }}>Price</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '20%' }}>Total</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'background.paper', width: '10%' }}><CloseIcon fontSize="small" sx={{ opacity: 0.5 }} /></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {currentOrder.items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>Cart is empty</TableCell>
                            </TableRow>
                        ) : (
                            currentOrder.items.map((it, idx) => (
                                <TableRow
                                    key={idx}
                                    hover
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => openLineItemEdit(it, idx)}
                                >
                                    <TableCell sx={{ width: '40%' }}>
                                        <Typography variant="body2" fontWeight="bold">{it.serviceName}</Typography>
                                    </TableCell>
                                    <TableCell align="center" sx={{ width: '15%' }}>{it.quantity}</TableCell>
                                    <TableCell align="right" sx={{ width: '15%' }}>{currency(it.price)}</TableCell>
                                    <TableCell align="right" sx={{ width: '20%' }}>{currency(it.price * it.quantity)}</TableCell>
                                    <TableCell align="center" sx={{ width: '10%' }} onClick={(e) => e.stopPropagation()}>
                                        <IconButton size="small" color="error" onClick={() => removeFromCart(idx)}>
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Footer / Actions */}
            <Box p={2} borderTop={1} borderColor="divider" bgcolor="background.paper">
                {currentOrder.isExisting ? (
                    <Stack direction="row" spacing={1}>
                        <Button fullWidth variant="contained" size="large" onClick={() => setOpenCheckout(true)} disabled={currentOrder.items.length === 0}>
                            UPDATE
                        </Button>
                        <Button variant="outlined" size="large" startIcon={<PrintIcon />} onClick={() => handlePrintExistingOrder({ ...currentOrder, total: currentTotal })}>
                            RECEIPT
                        </Button>
                        <Button variant="outlined" size="large" onClick={() => handlePrintExistingInvoice({ ...currentOrder, total: currentTotal })}>
                            INVOICE
                        </Button>
                    </Stack>
                ) : (
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={() => setOpenCheckout(true)}
                        disabled={currentOrder.items.length === 0}
                    >
                        CHECKOUT
                        {systemSettings.checkoutHotkey?.display && (
                            <Box component="span" sx={{ ml: 0.75, fontSize: '0.55rem', opacity: 0.55, fontWeight: 'normal', letterSpacing: 0 }}>
                                [{systemSettings.checkoutHotkey.display}]
                            </Box>
                        )}
                    </Button>
                )}
            </Box>
        </Box>
    );
};

export default POSCartPanel;
