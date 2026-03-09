import React from 'react';
import {
    TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Typography, IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const POSCartTable = ({
    items,
    currency,
    openLineItemEdit,
    removeFromCart
}) => {
    return (
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
                    {items.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 6, opacity: 0.5 }}>Cart is empty</TableCell>
                        </TableRow>
                    ) : (
                        items.map((it, idx) => (
                            <TableRow
                                key={idx}
                                hover
                                sx={{ cursor: 'pointer' }}
                                onClick={() => openLineItemEdit(it, idx)}
                            >
                                <TableCell sx={{ width: '40%' }}>
                                    <Typography variant="body2" fontWeight="bold">{it.serviceName || it.name}</Typography>
                                    {it.note && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontStyle: 'italic', mt: 0.4 }}>
                                            {it.note}
                                        </Typography>
                                    )}
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
    );
};

export default POSCartTable;
