// src/components/admin/SettingsLayout.jsx
import React from 'react';
import { Box, Paper, Typography, List, ListItemButton, ListItemText, ListItemIcon, Divider } from '@mui/material';
import StoreIcon from "@mui/icons-material/Store";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import ComputerIcon from "@mui/icons-material/Computer";
import DescriptionIcon from "@mui/icons-material/Description";
import LockIcon from "@mui/icons-material/Lock";
import StorageIcon from "@mui/icons-material/Storage";
import ListAltIcon from "@mui/icons-material/ListAlt";

export default function SettingsLayout({ currentView, onViewChange, children }) {
    const menuItems = [
        { id: 'store', label: 'Store Profile', icon: <StoreIcon /> },
        { id: 'pos', label: 'POS Config', icon: <PointOfSaleIcon /> },
        { id: 'receipt', label: 'Receipt Settings', icon: <DescriptionIcon /> },
        { id: 'security', label: 'Security & Biometrics', icon: <LockIcon /> },
        { id: 'hardware', label: 'Hardware & Hotkeys', icon: <ComputerIcon /> },
        { id: 'expensetypes', label: 'Expense Types', icon: <ListAltIcon /> },
        { id: 'datacore', label: 'Data Core', icon: <StorageIcon /> },
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
                    <Typography variant="h6" fontWeight="bold">Settings</Typography>
                    <Typography variant="caption" color="text.secondary">Configure your system</Typography>
                </Box>
                <Divider />
                <List sx={{ pt: 0, overflowY: 'auto', flex: 1 }}>
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
                                    fontSize: '0.875rem',
                                    color: currentView === item.id ? 'primary.main' : 'inherit'
                                }}
                            />
                        </ListItemButton>
                    ))}
                </List>
            </Paper>

            {/* CONTENT AREA */}
            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {children}
            </Box>
        </Box>
    );
}
