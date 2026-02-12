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
import TagIcon from "@mui/icons-material/Tag";
import { useNavigate, useLocation } from 'react-router-dom';

export default function SettingsLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { id: 'store', path: '', label: 'Store Profile', icon: <StoreIcon /> },
        { id: 'pos', path: 'pos', label: 'POS Config', icon: <PointOfSaleIcon /> },
        { id: 'receipt', path: 'receipt', label: 'Receipt Settings', icon: <DescriptionIcon /> },
        { id: 'security', path: 'security', label: 'Security & Biometrics', icon: <LockIcon /> },
        { id: 'hardware', path: 'hardware', label: 'Hardware & Hotkeys', icon: <ComputerIcon /> },
        { id: 'expensetypes', path: 'expensetypes', label: 'Expense Types', icon: <ListAltIcon /> },
        { id: 'ids', path: 'ids', label: 'ID System', icon: <TagIcon /> },
        { id: 'datacore', path: 'datacore', label: 'Data Core', icon: <StorageIcon /> },
    ];

    const isSelected = (itemPath) => {
        const currentPath = location.pathname.replace(/\/$/, '');
        const basePath = '/admin/settings';

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
                    <Typography variant="h6" fontWeight="bold">Settings</Typography>
                    <Typography variant="caption" color="text.secondary">Configure your system</Typography>
                </Box>
                <Divider />
                <List sx={{ pt: 0, overflowY: 'auto', flex: 1 }}>
                    {menuItems.map((item) => {
                        const active = isSelected(item.path);
                        return (
                            <ListItemButton
                                key={item.id}
                                selected={active}
                                onClick={() => navigate(`/admin/settings/${item.path}`)}
                            >
                                <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'inherit' }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontWeight: active ? 600 : 400,
                                        fontSize: '0.875rem',
                                        color: active ? 'primary.main' : 'inherit'
                                    }}
                                />
                            </ListItemButton>
                        );
                    })}
                </List>
            </Paper>

            {/* CONTENT AREA */}
            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {children}
            </Box>
        </Box>
    );
}
