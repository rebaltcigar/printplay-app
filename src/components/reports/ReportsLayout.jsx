// src/components/reports/ReportsLayout.jsx
import React from 'react';
import { Box, Paper, Typography, List, ListItemButton, ListItemText, ListItemIcon, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PieChartIcon from '@mui/icons-material/PieChart';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'; // For Audit/Shifts

export default function ReportsLayout({ currentView, onViewChange, children }) {
    const menuItems = [
        { id: 'financial', label: 'Financials (P&L)', icon: <AttachMoneyIcon /> },
        { id: 'sales', label: 'Sales Analysis', icon: <PieChartIcon /> },
        { id: 'staff', label: 'Staff Performance', icon: <PeopleIcon /> },
        { id: 'shifts', label: 'Shift Audit', icon: <ReceiptLongIcon /> },
    ];

    return (
        <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', bgcolor: 'background.default' }}>
            {/* SIDEBAR */}
            <Paper
                elevation={0}
                sx={{
                    width: 240,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 0
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" fontWeight="bold">Reports</Typography>
                    <Typography variant="caption" color="text.secondary">Select a report</Typography>
                </Box>
                <Divider />
                <List sx={{ pt: 0 }}>
                    {menuItems.map((item) => (
                        <ListItemButton
                            key={item.id}
                            selected={currentView === item.id}
                            onClick={() => onViewChange(item.id)}
                        >
                            <ListItemIcon sx={{ minWidth: 40, color: currentView === item.id ? 'primary.main' : 'inherit' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{
                                    fontWeight: currentView === item.id ? 600 : 400,
                                    color: currentView === item.id ? 'primary.main' : 'inherit'
                                }}
                            />
                        </ListItemButton>
                    ))}
                </List>
            </Paper>

            {/* CONTENT AREA */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {children}
            </Box>
        </Box>
    );
}
