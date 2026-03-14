import React, { useState } from 'react';
import {
    Box, Typography, IconButton, Stack, Table, TableHead, TableBody,
    TableRow, TableCell, TableContainer, Select, MenuItem, Checkbox, Switch, Tooltip, Avatar, Button, Tabs, Tab
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import DetailDrawer from '../common/DetailDrawer';
import { fmtCurrency } from '../../utils/formatters';

const currency = fmtCurrency;

export default function POSHistoryDrawer({
    open,
    onClose,
    transactions,
    shiftOrders,
    selectedTransactions,
    setSelectedTransactions,
    selectedOrders,
    setSelectedOrders,
    handleOpenEditTx,
    handleDeleteLogs,
    handleDeleteOrders,
    handleOpenOrderAsTab
}) {
    const [activeTab, setActiveTab] = useState(0);
    const [txSelectionMode, setTxSelectionMode] = useState(false);
    const [orderSelectionMode, setOrderSelectionMode] = useState(false);

    return (
        <DetailDrawer
            open={open}
            onClose={onClose}
            title="Activity History"
            width={600}
        >
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)}>
                    <Tab label="Transaction Log" icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
                    <Tab label="Order History" icon={<PointOfSaleIcon fontSize="small" />} iconPosition="start" />
                </Tabs>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {activeTab === 0 && (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider" sx={{ minHeight: 49 }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1 }}>Recent Transactions</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Tooltip title="Toggle Selection Mode">
                                    <Switch size="small" checked={txSelectionMode} onChange={(e) => setTxSelectionMode(e.target.checked)} />
                                </Tooltip>
                                {txSelectionMode && selectedTransactions.length === 1 && (
                                    <Button size="small" variant="outlined" onClick={() => {
                                        const tx = transactions.find(t => t.id === selectedTransactions[0]);
                                        if (tx) handleOpenEditTx(tx);
                                    }}>Edit</Button>
                                )}
                                {txSelectionMode && selectedTransactions.length > 0 && (
                                    <Button size="small" color="error" onClick={handleDeleteLogs}>Delete</Button>
                                )}
                            </Stack>
                        </Box>
                        <TableContainer sx={{ flex: 1 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        {txSelectionMode ? (
                                            <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', width: '10%' }} />
                                        ) : (
                                            <TableCell sx={{ bgcolor: 'background.paper', width: '8%' }} />
                                        )}
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '15%' }}>Time</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Product</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Details</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '17%' }}>Total</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {transactions.map((tx) => (
                                        <TableRow key={tx.id} hover selected={selectedTransactions.includes(tx.id)}>
                                            {txSelectionMode ? (
                                                <TableCell padding="checkbox">
                                                    <Checkbox size="small" checked={selectedTransactions.includes(tx.id)} onChange={() => setSelectedTransactions(p => p.includes(tx.id) ? p.filter(x => x !== tx.id) : [...p, tx.id])} />
                                                </TableCell>
                                            ) : (
                                                <TableCell sx={{ opacity: 0.3 }}><Checkbox size="small" disabled checked={false} /></TableCell>
                                            )}
                                            <TableCell>{tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</TableCell>
                                            <TableCell>
                                                {tx.item === 'Expenses' ? (
                                                    <Box display="flex" alignItems="center" gap={0.5}>
                                                        <Avatar sx={{ width: 16, height: 16, bgcolor: 'error.main', fontSize: 10 }}>E</Avatar>
                                                        <Typography variant="body2">{tx.expenseType}</Typography>
                                                    </Box>
                                                ) : (
                                                    <Typography variant="body2" fontWeight="bold">{tx.item}</Typography>
                                                )}

                                            </TableCell>
                                            <TableCell>
                                                {tx.quantity > 0 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {tx.quantity} x {currency(tx.price)}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell align="right">{currency(tx.total)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {transactions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center" sx={{ py: 4, opacity: 0.6 }}>No transactions yet</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}

                {activeTab === 1 && (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Box p={1} bgcolor="background.default" display="flex" alignItems="center" borderBottom={1} borderColor="divider" sx={{ minHeight: 49 }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1 }}>Recent Orders</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Tooltip title="Toggle Selection Mode">
                                    <Switch size="small" checked={orderSelectionMode} onChange={(e) => setOrderSelectionMode(e.target.checked)} />
                                </Tooltip>
                                {orderSelectionMode && selectedOrders.length > 0 && (
                                    <Button size="small" color="error" onClick={handleDeleteOrders}>Delete</Button>
                                )}
                            </Stack>
                        </Box>
                        <TableContainer sx={{ flex: 1 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        {orderSelectionMode ? (
                                            <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper', width: '10%' }} />
                                        ) : (
                                            <TableCell sx={{ bgcolor: 'background.paper', width: '8%' }} />
                                        )}
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '15%' }}>Time</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Order No</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', width: '30%' }}>Customer Name</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: 'background.paper', width: '17%' }}>Total</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {shiftOrders.map((o) => (
                                        <TableRow key={o.id} hover sx={{ cursor: 'pointer' }} onClick={() => {
                                            handleOpenOrderAsTab(o);
                                            onClose(); // Close drawer when opening order
                                        }} selected={selectedOrders.includes(o.id)}>
                                            {orderSelectionMode ? (
                                                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox size="small" checked={selectedOrders.includes(o.id)} onChange={() => setSelectedOrders(p => p.includes(o.id) ? p.filter(x => x !== o.id) : [...p, o.id])} />
                                                </TableCell>
                                            ) : (
                                                <TableCell sx={{ opacity: 0.3 }}>
                                                    <Checkbox size="small" disabled checked={false} />
                                                </TableCell>
                                            )}
                                            <TableCell>{o.timestamp ? new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</TableCell>
                                            <TableCell>#{o.orderNumber}</TableCell>
                                            <TableCell>{o.customerName || 'Walk-in'}</TableCell>
                                            <TableCell align="right">{currency(o.totalDue)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {shiftOrders.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center" sx={{ py: 4, opacity: 0.6 }}>No orders yet</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
            </Box>
        </DetailDrawer>
    );
}
