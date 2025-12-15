// src/components/SimpleReceipt.jsx
import React from 'react';
import { Box, Typography, Divider } from '@mui/material';

export const SimpleReceipt = ({ data, staffName }) => {
  if (!data) return null;

  return (
    <Box
      id="printable-receipt"
      sx={{
        display: 'none', // Hidden on screen
        '@media print': {
          display: 'block', // Visible when printing
          position: 'absolute',
          top: 0,
          left: 0,
          width: '80mm', // Standard thermal paper width
          padding: '10px',
          backgroundColor: 'white',
          color: 'black',
        },
      }}
    >
      {/* GLOBAL PRINT STYLES to hide the rest of the app */}
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-receipt, #printable-receipt * {
              visibility: visible;
            }
            #printable-receipt {
              position: absolute;
              left: 0;
              top: 0;
            }
          }
        `}
      </style>

      {/* HEADER */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 900, textTransform: 'uppercase' }}>
          PRINT + PLAY
        </Typography>
        <Typography variant="caption" display="block">
          Official Receipt
        </Typography>
      </Box>

      {/* DETAILS */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ fontSize: '12px' }}>
          <strong>Date:</strong> {new Date().toLocaleString()}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '12px' }}>
          <strong>Staff:</strong> {staffName}
        </Typography>
      </Box>

      <Divider sx={{ borderBottomStyle: 'dashed', mb: 1 }} />

      {/* ITEM */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {data.item}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          ₱{(data.total || 0).toFixed(2)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption">
          {data.quantity} x ₱{data.price}
        </Typography>
      </Box>

      {/* EXTRA INFO */}
      {(data.item === 'New Debt' || data.item === 'Paid Debt') && data.customerName && (
         <Typography variant="caption" display="block" sx={{ mb: 1 }}>
           Customer: {data.customerName}
         </Typography>
      )}

      {data.notes && (
        <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mb: 1 }}>
          Note: {data.notes}
        </Typography>
      )}

      <Divider sx={{ borderBottomStyle: 'dashed', mb: 1 }} />

      {/* TOTAL */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>
          TOTAL
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>
          ₱{(data.total || 0).toFixed(2)}
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="caption">Thank you!</Typography>
      </Box>
    </Box>
  );
};