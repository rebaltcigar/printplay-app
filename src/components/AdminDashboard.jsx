import React, { useState } from 'react';
import {
  AppBar, Toolbar, Box, Typography, Button, Tabs, Tab,
} from '@mui/material';

import Reports from './Reports';
import ExpenseManagement from './ExpenseManagement';
import DebtReport from './DebtReport';
import ServiceManagement from './ServiceManagement';
import UserManagement from './UserManagement';
import AdminHome from './AdminHome'; // NEW

function TabPanel({ value, index, children }) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ height: '100%', display: value === index ? 'flex' : 'none' }}>
      {value === index && <Box sx={{ p: 2, width: '100%', height: '100%' }}>{children}</Box>}
    </Box>
  );
}

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ alignItems: 'center', gap: 1 }}>
          <Box component="img" src="/icon.ico" alt="logo" sx={{ width: 26, height: 26, borderRadius: '6px' }} />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Admin — {user?.email}
          </Typography>
          {/* Keep your admin logout button here if you had one */}
        </Toolbar>
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

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TabPanel value={tab} index={0}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <AdminHome />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <Box sx={{ height: '100%' }}>
            <Reports />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={2}>
          <Box sx={{ height: '100%' }}>
            <ExpenseManagement />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={3}>
          <Box sx={{ height: '100%' }}>
            <DebtReport />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={4}>
          <Box sx={{ height: '100%' }}>
            <ServiceManagement />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={5}>
          <Box sx={{ height: '100%' }}>
            <UserManagement />
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
}
