// src/components/SimpleReceipt.jsx
import React from 'react';
import { Box, Typography, Divider, Table, TableBody, TableRow, TableCell } from '@mui/material';

// Helper for currency format
const currency = (num) => `₱${Number(num || 0).toFixed(2)}`;

export const SimpleReceipt = ({ order, staffName, settings }) => {
  if (!order) return null;

  // Safe accessors in case we are printing an old-style transaction object
  const items = order.items || (order.item ? [{
    name: order.item,
    quantity: order.quantity,
    price: order.price,
    subtotal: order.total
  }] : []);

  const orderId = order.orderNumber || order.id || "---";
  const dateStr = order.timestamp?.seconds
    ? new Date(order.timestamp.seconds * 1000).toLocaleString()
    : new Date().toLocaleString();

  // Use the passed staffName prop (live Dashboard state) or fallback to order data
  const cashierDisplay = staffName || order.staffName || 'Staff';

  // Default values if settings not loaded/provided
  const storeName = settings?.storeName || 'PrintPlay';
  const address = settings?.address || '6 Abra St. Bago Bantay, Quezon City';
  const phone = settings?.phone || '(02) 8651 2462';
  const email = settings?.email || 'printplay.net | printplay.ph@gmail.com';
  const footerMsg = settings?.receiptFooter || 'Salamat, Idol!';
  const logoUrl = settings?.logoUrl || null;

  return (
    <Box
      id="printable-receipt"
      sx={{
        display: 'none',
        '@media print': {
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '80mm', // standard thermal width
          padding: '10px 5px',
          backgroundColor: 'white',
          color: 'black',
          fontFamily: 'monospace', // Monospace aligns numbers better on receipts
        },
      }}
    >
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            #printable-receipt, #printable-receipt * { visibility: visible; color: black !important; }
            #printable-receipt { position: absolute; left: 0; top: 0; }
          }
        `}
      </style>

      {/* HEADER */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{ height: '40px', objectFit: 'contain', marginBottom: '5px', filter: 'grayscale(100%)' }}
          />
        )}
        <Typography variant="h6" sx={{ fontWeight: 900, fontSize: '16px', color: 'black' }}>
          {storeName}
        </Typography>
        {address && (
          <Typography variant="caption" display="block" sx={{ fontSize: '10px', color: 'black', whiteSpace: 'pre-line' }}>
            {address}
          </Typography>
        )}
        {phone && (
          <Typography variant="caption" display="block" sx={{ fontSize: '10px', color: 'black' }}>
            {phone}
          </Typography>
        )}
        {email && (
          <Typography variant="caption" display="block" sx={{ fontSize: '10px', color: 'black' }}>
            {email}
          </Typography>
        )}

        <Typography variant="caption" display="block" sx={{ fontSize: '10px', mt: 1, fontWeight: 'bold', color: 'black' }}>
          Acknowledgement Receipt
        </Typography>

        <Box sx={{ mt: 0.5, textAlign: 'left' }}>
          <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black', lineHeight: 1.2 }}>
            Order No: {orderId}
          </Typography>
          <Typography variant="caption" display="block" sx={{ fontSize: '9px', textTransform: 'capitalize', color: 'black', lineHeight: 1.2 }}>
            Cashier: {cashierDisplay}
          </Typography>
          <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black', lineHeight: 1.2 }}>
            {dateStr}
          </Typography>

          {/* Customer Details */}
          {order.customerName && order.customerName !== 'Walk-in Customer' && (
            <Box sx={{ mt: 1, borderTop: '1px dashed black', pt: 0.5 }}>
              <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black' }}>
                Name: {order.customerName}
              </Typography>
              {order.customerPhone && (
                <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black' }}>
                  Phone: {order.customerPhone}
                </Typography>
              )}
              {order.customerAddress && (
                <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black' }}>
                  Address: {order.customerAddress}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Divider sx={{ borderBottomStyle: 'dashed', mb: 1, borderColor: 'black' }} />

      {/* ITEMS */}
      <Table size="small" sx={{ '& td': { border: 'none', padding: '2px 0', fontSize: '11px', color: 'black' } }}>
        <TableBody>
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <TableRow>
                <TableCell colSpan={2} sx={{ fontWeight: 'bold', color: 'black' }}>
                  {item.name || item.serviceName || 'Unknown Item'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ pl: 1, color: 'black' }}>
                  {item.quantity} x {currency(item.price)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'black' }}>
                  {currency(item.subtotal)}
                </TableCell>
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      <Divider sx={{ borderBottomStyle: 'dashed', my: 1, borderColor: 'black' }} />

      {/* TOTALS */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '12px', color: 'black' }}>TOTAL</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '14px', color: 'black' }}>
          {currency(order.total)}
        </Typography>
      </Box>

      {/* Tax Breakdown (Optional) */}
      {settings?.showTaxBreakdown && settings?.taxRate > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>Vatable Sales</Typography>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              {currency(order.total / (1 + (settings.taxRate / 100)))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>VAT ({settings.taxRate}%)</Typography>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              {currency(order.total - (order.total / (1 + (settings.taxRate / 100))))}
            </Typography>
          </Box>
        </Box>
      )}

      {/* PAYMENT DETAILS */}
      <Box sx={{ mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>Payment Method:</Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 'bold', color: 'black' }}>
            {order.paymentMethod === 'Charge' ? 'Pay Later' : order.paymentMethod}
          </Typography>
        </Box>

        {order.paymentMethod === 'Cash' && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>Cash Tendered:</Typography>
              <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>{currency(order.amountTendered)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>Change:</Typography>
              <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>{currency(order.change)}</Typography>
            </Box>
          </>
        )}

        {order.paymentMethod === 'GCash' && order.paymentDetails && (
          <Box sx={{ mt: 1, textAlign: 'left' }}>
            <Typography variant="caption" display="block" sx={{ fontSize: '9px', fontWeight: 'bold', color: 'black' }}>
              GCASH DETAILS:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black' }}>
              Ref No: {order.paymentDetails.refNumber}
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontSize: '9px', color: 'black' }}>
              Mobile: {order.paymentDetails.phone}
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderBottomStyle: 'dashed', my: 2, borderColor: 'black' }} />

      {/* FOOTER */}
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" sx={{ fontSize: '10px', fontStyle: 'italic', fontWeight: 'bold', color: 'black', whiteSpace: 'pre-line' }}>
          {footerMsg}
        </Typography>
      </Box>
    </Box>
  );
};