// src/components/common/DetailDrawer.jsx
// Universal right-side slide panel used across Transactions, Expenses, Shifts, and Payroll.
// Replaces per-page Dialog patterns to avoid code duplication.

import React from 'react';
import {
  Drawer,
  Box,
  IconButton,
  Typography,
  Stack,
  Divider,
  LinearProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * @param {boolean}   open          - Controls drawer visibility
 * @param {function}  onClose       - Called when drawer should close
 * @param {string}    title         - Drawer header title
 * @param {string}    [subtitle]    - Optional subtitle below title
 * @param {node}      children      - Main scrollable content
 * @param {node}      [actions]     - Footer action buttons (JSX, usually a Stack of Buttons)
 * @param {number}    [width=520]   - Drawer width in px (desktop); full-width on mobile
 * @param {boolean}   [loading]     - Shows a linear progress bar below the header
 * @param {boolean}   [disableClose]- Prevents closing (for in-progress saves)
 * @param {object}    [sx]          - Extra sx overrides on the Paper
 */
export default function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  width = 520,
  loading = false,
  disableClose = false,
  sx = {},
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={disableClose ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: width },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          ...sx,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {!disableClose && (
          <IconButton onClick={onClose} size="small" sx={{ ml: 1, mt: -0.25 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {loading ? <LinearProgress /> : <Divider />}

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {children}
      </Box>

      {/* Footer Actions */}
      {actions && (
        <>
          <Divider />
          <Box sx={{ px: 3, py: 2, flexShrink: 0 }}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {actions}
            </Stack>
          </Box>
        </>
      )}
    </Drawer>
  );
}
