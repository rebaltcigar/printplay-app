// src/components/reports/ReportsLayout.jsx
import React from 'react';
import { Box, Paper, Typography, List, ListItemButton, ListItemText, ListItemIcon, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PieChartIcon from '@mui/icons-material/PieChart';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'; // For Audit/Shifts
import { useNavigate, useLocation } from 'react-router-dom';

export default function ReportsLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { id: 'financial', path: '', label: 'Financials (P&L)', icon: <AttachMoneyIcon /> }, // default
        { id: 'sales', path: 'sales', label: 'Sales Analysis', icon: <PieChartIcon /> },
        { id: 'staff', path: 'staff', label: 'Staff Performance', icon: <PeopleIcon /> },
        { id: 'shifts', path: 'shifts', label: 'Shift Audit', icon: <ReceiptLongIcon /> },
    ];

    const isSelected = (itemPath) => {
        // Simple logic: if path is empty, check if we are exactly at /admin/reports or /admin/reports/
        // otherwise check if pathname ends with itemPath
        // A robust way:
        const currentPath = location.pathname.replace(/\/$/, ''); // remove trailing slash
        const basePath = '/admin/reports';

        if (itemPath === '') {
            return currentPath === basePath;
        }
        return currentPath === `${basePath}/${itemPath}`;
    };

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
                    {menuItems.map((item) => {
                        const active = isSelected(item.path);
                        return (
                            <ListItemButton
                                key={item.id}
                                selected={active}
                                onClick={() => navigate(item.path)}
                            >
                                <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'inherit' }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontWeight: active ? 600 : 400,
                                        color: active ? 'primary.main' : 'inherit'
                                    }}
                                />
                            </ListItemButton>
                        );
                    })}
                </List>
            </Paper>

            {/* CONTENT AREA */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {children}
            </Box>
        </Box>
    );
}
