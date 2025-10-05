import React, { useState } from 'react';
import { Box, Typography, Button, AppBar, Toolbar, Tabs, Tab } from '@mui/material';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import UserManagement from './UserManagement';
import ServiceManagement from './ServiceManagement';
import Reports from './Reports';
import ExpenseManagement from './ExpenseManagement'; // Ensure this path and filename is correct

function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Super Admin Dashboard
          </Typography>
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(event, newValue) => setActiveTab(newValue)} centered>
          <Tab label="Reports" />
          <Tab label="Services Management" />
          <Tab label="User Management" />
          <Tab label="Expenses" />
        </Tabs>
      </Box>

      <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto' }}>
        {activeTab === 0 && <Reports />}
        {activeTab === 1 && <ServiceManagement />}
        {activeTab === 2 && <UserManagement />}
        {activeTab === 3 && <ExpenseManagement />}
      </Box>
    </Box>
  );
}

export default AdminDashboard;