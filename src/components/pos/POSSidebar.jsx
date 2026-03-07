// src/components/pos/POSSidebar.jsx
// Left-slide hamburger sidebar for POS staff self-service.

import React, { useState } from 'react';
import {
  Drawer, Box, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';

import MyScheduleDrawer from './MyScheduleDrawer';
import MyPaystubsDrawer from './MyPaystubsDrawer';
import MyAccountDrawer from './MyAccountDrawer';
import { useGlobalUI } from '../../contexts/GlobalUIContext';

export default function POSSidebar({
  open, onClose,
  user, onLogout,
  onOpenInvoices, // callback to open POSInvoiceLookupDrawer
}) {
  const { showSnackbar } = useGlobalUI();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [paystubsOpen, setPaystubsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const nav = (action) => {
    onClose();
    // Give sidebar time to close before opening sub-drawer
    setTimeout(action, 150);
  };

  const items = [
    {
      label: 'My Schedule',
      icon: <CalendarTodayIcon />,
      onClick: () => nav(() => setScheduleOpen(true)),
    },
    {
      label: 'My Paystubs',
      icon: <ReceiptLongIcon />,
      onClick: () => nav(() => setPaystubsOpen(true)),
    },
    {
      label: 'Invoices / Receivables',
      icon: <ReceiptIcon />,
      onClick: () => nav(() => onOpenInvoices?.()),
    },
    {
      label: 'My Account',
      icon: <AccountCircleIcon />,
      onClick: () => nav(() => setAccountOpen(true)),
    },
  ];

  return (
    <>
      {/* Main sidebar drawer */}
      <Drawer
        anchor="left"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: 260, display: 'flex', flexDirection: 'column' } }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{user?.displayName || user?.email}</Typography>
            <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider />

        {/* Nav items */}
        <List sx={{ flex: 1, py: 1 }}>
          {items.map(item => (
            <ListItemButton key={item.label} onClick={item.onClick} sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          ))}
        </List>

        <Divider />

        {/* Logout */}
        <List sx={{ py: 1 }}>
          <ListItemButton onClick={() => { onClose(); onLogout?.(); }} sx={{ borderRadius: 1, mx: 1 }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" primaryTypographyProps={{ variant: 'body2', color: 'error' }} />
          </ListItemButton>
        </List>
      </Drawer>

      {/* Sub-drawers */}
      <MyScheduleDrawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        userEmail={user?.email}
      />
      <MyPaystubsDrawer
        open={paystubsOpen}
        onClose={() => setPaystubsOpen(false)}
        userEmail={user?.email}
      />
      <MyAccountDrawer
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        user={user}
      />
    </>
  );
}
