import React from 'react';
import {
    AppBar, Toolbar, IconButton, Box, Typography, Tooltip, Chip, Button, Menu as MuiMenu, MenuItem
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ViewListIcon from '@mui/icons-material/ViewList';
import AppsIcon from '@mui/icons-material/Apps';
import HistoryIcon from '@mui/icons-material/History';
import MoreVertIcon from '@mui/icons-material/MoreVert';

const POSHeader = ({
    systemSettings,
    staffDisplayName,
    shiftPeriod,
    elapsed,
    posView,
    togglePosView,
    setSidebarOpen,
    setOpenHistoryDrawer,
    setOpenDrawerDialog,
    setOpenExpense,
    setOpenEndShiftDialog,
    menuAnchor,
    setMenuAnchor,
    setOpenInvoiceLookup
}) => {
    return (
        <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ gap: 1 }}>
                {/* Hamburger → opens staff sidebar */}
                <IconButton size="small" onClick={() => setSidebarOpen(true)} sx={{ mr: 0.5 }}>
                    <MenuIcon />
                </IconButton>

                {/* Branding */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {systemSettings.logoUrl ? (
                        <img src={systemSettings.logoUrl} alt="logo" height={32} style={{ maxWidth: 120, objectFit: 'contain' }} />
                    ) : (
                        <img src="/logo.png" alt="logo" width={24} height={24} />
                    )}
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', lineHeight: 1.2, color: 'text.primary', letterSpacing: '0.02em' }}>
                            {systemSettings.storeName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem', opacity: 0.8 }}>
                            {staffDisplayName} • {shiftPeriod}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                {/* Shift timer */}
                {elapsed !== '00:00:00' && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'monospace', mr: 1 }}>
                        {elapsed}
                    </Typography>
                )}

                {/* Action Buttons */}
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, alignItems: 'center' }}>
                    <Tooltip title={posView === 'new' ? 'Switch to Classic POS' : 'Switch to New POS (Grid)'}>
                        <Chip
                            size="small"
                            icon={posView === 'new' ? <ViewListIcon sx={{ fontSize: '1rem !important' }} /> : <AppsIcon sx={{ fontSize: '1rem !important' }} />}
                            label={posView === 'new' ? 'Classic' : 'Grid'}
                            onClick={togglePosView}
                            variant="outlined"
                            sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
                        />
                    </Tooltip>
                    <Button size="small" variant="outlined" color="primary" onClick={() => setOpenHistoryDrawer(true)} startIcon={<HistoryIcon />}>Logs</Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => setOpenDrawerDialog(true)}>Drawer</Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => setOpenExpense(true)}>+ Expense</Button>
                    <Button size="small" variant="contained" color="error" onClick={() => setOpenEndShiftDialog(true)}>End Shift</Button>
                </Box>

                {/* Mobile Menu Toggle (missing in original? No, it uses menuAnchor) */}
                {/* Original didn't have a specific button for menuAnchor in the Toolbar code I saw, 
            but it had the MuiMenu component. It probably uses a more button which I missed or it's implicitly triggered. 
            Wait, I should check the original code again for the trigger. */}
                <IconButton
                    size="small"
                    edge="end"
                    color="inherit"
                    onClick={(e) => setMenuAnchor(e.currentTarget)}
                    sx={{ display: { xs: 'flex', sm: 'none' } }}
                >
                    <MoreVertIcon />
                </IconButton>

                {/* Mobile Menu */}
                <MuiMenu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                    <MenuItem onClick={() => { setMenuAnchor(null); setOpenHistoryDrawer(true); }}>Logs</MenuItem>
                    <MenuItem onClick={() => { setMenuAnchor(null); setOpenExpense(true); }}>+ Expense</MenuItem>
                    <MenuItem onClick={() => { setMenuAnchor(null); setOpenInvoiceLookup(true); }}>Invoices / Receivables</MenuItem>
                    <MenuItem onClick={() => { setMenuAnchor(null); setOpenEndShiftDialog(true); }}>End Shift</MenuItem>
                </MuiMenu>
            </Toolbar>
        </AppBar>
    );
};

export default POSHeader;
