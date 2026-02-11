// src/components/SimpleReceipt.jsx
import React from 'react';
import ReactDOM from 'react-dom'; // ADDED for Portal
import { Box, Typography, Divider, Table, TableBody, TableRow, TableCell } from '@mui/material';

// Helper for currency format
const currency = (num) => `₱${Number(num || 0).toFixed(2)}`;

export const SimpleReceipt = ({ order, shiftData, staffName, settings }) => {
  if (!order && !shiftData) return null;

  // Default values if settings not loaded/provided
  const storeName = settings?.storeName || 'PrintPlay';
  const address = settings?.address || '6 Abra St. Bago Bantay, Quezon City';
  const phone = settings?.phone || '(02) 8651 2462';
  const email = settings?.email || 'printplay.net | printplay.ph@gmail.com';
  const footerMsg = settings?.receiptFooter || 'Salamat, Idol!';
  const logoUrl = settings?.logoUrl || null;

  // --- SHIFT SUMMARY MODE ---
  if (shiftData) {
    const dateStr = new Date().toLocaleString();
    const period = shiftData.shiftPeriod || "---";
    const user = staffName || shiftData.staffEmail || "Staff";

    const { breakdown, expenses, systemTotal, cashOnHand, difference } = shiftData;

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
            width: '80mm',
            padding: '10px 5px',
            backgroundColor: 'white',
            color: 'black',
            fontFamily: 'monospace',
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

        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, fontSize: '16px', color: 'black' }}>
            {storeName} - Shift Report
          </Typography>
          <Typography variant="caption" display="block" sx={{ fontSize: '10px', color: 'black' }}>
            {dateStr}
          </Typography>
          <Typography variant="caption" display="block" sx={{ fontSize: '10px', color: 'black' }}>
            Shift: {period} | Staff: {user}
          </Typography>
        </Box>

        <Table size="small" sx={{ mb: 1 }}>
          <TableBody>
            <TableRow>
              <TableCell sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px', fontWeight: 'bold' }}>Total Sales</TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px', fontWeight: 'bold' }}>{currency((breakdown?.cash || 0) + (breakdown?.gcash || 0) + (breakdown?.receivables || 0))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ borderBottom: 'none', py: 0.5, pl: 2, fontSize: '9px' }}>Cash</TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '9px' }}>{currency(breakdown?.cash)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ borderBottom: 'none', py: 0.5, pl: 2, fontSize: '9px' }}>GCash</TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '9px' }}>{currency(breakdown?.gcash)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ borderBottom: 'none', py: 0.5, pl: 2, fontSize: '9px' }}>Receivables</TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '9px' }}>{currency(breakdown?.receivables)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ borderBottom: '1px dashed black', py: 0.5, fontSize: '10px' }}>Expenses</TableCell>
              <TableCell align="right" sx={{ borderBottom: '1px dashed black', py: 0.5, fontSize: '10px' }}>-{currency(expenses)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ borderBottom: 'none', py: 0.5, fontSize: '12px', fontWeight: 'bold' }}>System Total</TableCell>
              <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '12px', fontWeight: 'bold' }}>{currency(systemTotal)}</TableCell>
            </TableRow>
            {cashOnHand !== undefined && (
              <TableRow>
                <TableCell sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px' }}>Cash Count</TableCell>
                <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px' }}>{currency(cashOnHand)}</TableCell>
              </TableRow>
            )}
            {difference !== undefined && (
              <TableRow>
                <TableCell sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px' }}>Difference</TableCell>
                <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5, fontSize: '10px', fontWeight: 'bold', color: difference < 0 ? 'black' : 'black' }}>
                  {difference > 0 ? '+' : ''}{currency(difference)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
        <Typography variant="caption" display="block" align="center" sx={{ fontSize: '9px', mt: 2 }}>
          -- End of Shift --
        </Typography>
      </Box>
    );
  }

  // --- ORDER RECEIPT MODE (Existing Logic) ---
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

  // Normalize Customer Data (Handle both flat fields and nested customer object)
  const custName = order.customerName || order.customer?.fullName || '';
  const custPhone = order.customerPhone || order.customer?.phone || '';
  const custAddress = order.customerAddress || order.customer?.address || '';
  const custTin = order.customerTin || order.customer?.tin || '';

  // Determine if Walk-in (Show info if valid name exists and is not 'Walk-in')
  // We remove the check for !order.customerId because manual entries might not have an ID but have a name.
  const isWalkIn = !custName || custName === 'Walk-in Customer' || custName === 'Walk-in' || order.customerId === 'walk-in';
  const showCustomerInfo = !isWalkIn;

  const paymentLabel = order.paymentMethod === 'Charge' ? 'Unpaid (Charge)' : order.paymentMethod;
  const mountNode = document.body;

  // Use Portal to render outside of root, allowing us to hide root completely
  return ReactDOM.createPortal(
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
          zIndex: 99999,
        },
      }}
    >
      <style>
        {`
          @media print {
            /* Hide EVERYTHING inside body */
            body > * {
              display: none !important;
            }

            /* Explicitly show the receipt container wrapper */
            body > #printable-receipt {
              display: block !important;
              visibility: visible !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              background-color: white !important;
              z-index: 99999 !important;
            }

            /* HIDE the style tags explicitly just in case */
            #printable-receipt style {
              display: none !important;
            }

            /* Target the specific wrapper for visibility */
            #receipt-content-wrapper {
              display: block !important;
              visibility: visible !important;
            }
            
            #receipt-content-wrapper * {
               visibility: visible !important;
               color: black !important;
            }

            /* Reset body properties */
            body, html {
              margin: 0 !important;
              padding: 0 !important;
              height: 100% !important;
              overflow: visible !important;
              background-color: white !important;
            }
          }
        `}
      </style>

      <div id="receipt-content-wrapper">
        {/* HEADER */}
        <Box sx={{ textAlign: 'center', mb: 1 }}>
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
              Date: {dateStr}
            </Typography>
          </Box>

          {showCustomerInfo && (
            <Box sx={{ mt: 0.5, textAlign: 'left', borderTop: '1px dashed black', pt: 0.5 }}>
              <Typography variant="caption" display="block" sx={{ fontSize: '9px', fontWeight: 'bold', lineHeight: 1.2 }}>
                Customer: {custName}
              </Typography>
              {custPhone && (
                <Typography variant="caption" display="block" sx={{ fontSize: '9px', lineHeight: 1.2 }}>
                  Phone: {custPhone}
                </Typography>
              )}
              {custAddress && (
                <Typography variant="caption" display="block" sx={{ fontSize: '9px', lineHeight: 1.2 }}>
                  Addr: {custAddress}
                </Typography>
              )}
              {custTin && (
                <Typography variant="caption" display="block" sx={{ fontSize: '9px', lineHeight: 1.2 }}>
                  TIN: {custTin}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <Divider sx={{ borderBottomWidth: '1px', borderColor: 'black', mb: 1 }} />

        {/* ITEMS */}
        <Table size="small" sx={{ mb: 0.5 }}>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index} sx={{ '& td': { border: 0, padding: '2px 0' } }}>
                <TableCell sx={{ fontSize: '10px', color: 'black', width: '60%', verticalAlign: 'top' }}>
                  <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 'bold' }}>
                    {item.name}
                  </Typography>
                  <br />
                  {item.quantity} x {currency(item.price)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '10px', color: 'black', verticalAlign: 'top' }}>
                  {currency(item.subtotal || item.total || (item.price * item.quantity))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Divider sx={{ borderBottomWidth: '1px', borderColor: 'black', mb: 1 }} />

        {/* TOTALS */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontSize: '12px', fontWeight: 'bold', color: 'black' }}>
            TOTAL AMOUNT
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '12px', fontWeight: 'bold', color: 'black' }}>
            {currency(order.total)}
          </Typography>
        </Box>

        {order.paymentMethod && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              Paid via {paymentLabel}
            </Typography>
          </Box>
        )}

        {order.amountTendered > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              Cash Tendered
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              {currency(order.amountTendered)}
            </Typography>
          </Box>
        )}

        {order.change > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              Change
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '10px', color: 'black' }}>
              {currency(order.change)}
            </Typography>
          </Box>
        )}


        <Divider sx={{ borderBottomWidth: '1px', borderColor: 'black', my: 2 }} />

        {/* FOOTER */}
        <Typography variant="caption" display="block" align="center" sx={{ fontSize: '10px', color: 'black', fontStyle: 'italic' }}>
          {footerMsg}
        </Typography>
        <Typography variant="caption" display="block" align="center" sx={{ fontSize: '10px', color: 'black', mt: 1 }}>
          This is not an official receipt.
        </Typography>
      </div>
    </Box>,
    mountNode
  );
};