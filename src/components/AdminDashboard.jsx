import React, { useState } from 'react';
import {
  AppBar, Toolbar, Box, Typography, Tabs, Tab, IconButton, Tooltip,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

import Reports from './Reports';
import ExpenseManagement from './ExpenseManagement';
import DebtReport from './DebtReport';
import ServiceManagement from './ServiceManagement';
import UserManagement from './UserManagement';
import AdminHome from './AdminHome'; // Charts & summaries

function TabPanel({ value, index, children }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: '100%', display: value === index ? 'flex' : 'none' }}
    >
      {value === index && (
        <Box sx={{ p: 2, width: '100%', height: '100%' }}>{children}</Box>
      )}
    </Box>
  );
}

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState(0);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Admin logout failed:', e);
      // Still try to sign out; most failures are harmless client state issues
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ alignItems: 'center', gap: 1 }}>
          {/* Logo (small) */}
          <Box
            component="img"
            src="/icon.ico"
            alt="logo"
            sx={{ width: 26, height: 26, borderRadius: '6px', mr: 1 }}
          />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Admin — {user?.email}
          </Typography>

          {/* Logout button (top-right) */}
          <Tooltip title="Logout">
            <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>

        {/* Top-anchored tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1 }}
        >
          <Tab label="Home" />
          <Tab label="Reports" />
          <Tab label="Expenses" />
          <Tab label="Debts" />
          <Tab label="Services" />
          <Tab label="Users" />
        </Tabs>
      </AppBar>

      {/* Full-height tab content */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TabPanel value={tab} index={0}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
            <AdminHome />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box sx={{ height: '100%', width: '100%' }}>
            <Reports />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Box sx={{ height: '100%', width: '100%' }}>
            <ExpenseManagement />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Box sx={{ height: '100%', width: '100%' }}>
            <DebtReport />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Box sx={{ height: '100%', width: '100%' }}>
            <ServiceManagement />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={5}>
          <Box sx={{ height: '100%', width: '100%' }}>
            <UserManagement />
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
}
