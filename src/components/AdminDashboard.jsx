// src/views/AdminDashboard.jsx
import React, { useState } from "react";
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SettingsIcon from "@mui/icons-material/Settings";
import SettingsDialog from './SettingsDialog';
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import HistoryGeneratorDialog from "./HistoryGeneratorDialog"; // ADDED

import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";

import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
// import ItemManagement from "./ItemManagement"; // Removed/Moved
import ServiceCatalog from "./admin/ServiceCatalog"; // New
import InventoryManagement from "./admin/InventoryManagement"; // New
import ExpenseSettings from "./admin/ExpenseSettings"; // New
import UnifiedMigration from "./admin/UnifiedMigration"; // New
import DataAggregator from "./admin/DataAggregator"; // New Optimization Tool

import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome";
import Transactions from "./Transactions";
import Payroll from "./Payroll";
import DataMigration from "./admin/DataMigration";
import Reports from "./Reports"; // ADDED

function TabPanel({ value, index, children }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: "100%", display: value === index ? "flex" : "none" }}
    >
      {children}
    </Box>
  );
}

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState(new Set([0])); // Track visited tabs
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false); // ADDED
  const [systemTab, setSystemTab] = useState(0); // Sub-tab for System

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  // --- SNACKBAR STATE ---
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleCloseSnackbar = React.useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  const showSnackbar = React.useCallback((msg, sev = 'success') => {
    setSnackbar({ open: true, message: msg, severity: sev });
  }, []);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const devMode =
    import.meta.env.MODE === "development" ||
    import.meta.env.VITE_ENABLE_SEED_BUTTON === "true";

  const tabs = [
    { label: "Home", index: 0 },
    { label: "Reports", index: 1 }, // ADDED
    { label: "Shifts", index: 2 },
    { label: "Transactions", index: 3 },
    { label: "Expense Log", index: 4 },
    { label: "Debts", index: 5 },
    { label: "Catalog", index: 6 }, // Was Items
    { label: "Inventory", index: 7 }, // New
    { label: "Users", index: 8 },
    { label: "Payroll", index: 9 },
    { label: "System", index: 10 },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Admin logout failed:", e);
    }
  };

  const handleSelectTab = (idx) => {
    setTab(idx);
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setDrawerOpen(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ alignItems: "center", gap: 1, minHeight: { xs: 56, sm: 64 } }}>
          {isMobile && (
            <IconButton
              color="inherit"
              onClick={() => setDrawerOpen(true)}
              aria-label="open navigation menu"
              edge="start"
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Box
            component="img"
            src="/icon.ico"
            alt="logo"
            sx={{ width: 26, height: 26, borderRadius: "6px", mr: 1 }}
          />

          <Typography
            variant="subtitle2"
            sx={{
              flexGrow: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Admin — {user?.email}
          </Typography>

          {devMode && (
            <Tooltip title="DEV: Seed historical fake data">
              <span>
                <Button
                  onClick={() => setShowHistoryDialog(true)}
                  variant="outlined"
                  color="inherit"
                  size="small"
                  startIcon={<AutoFixHighIcon />}
                  sx={{ textTransform: "none", mr: 1 }}
                >
                  Fake History Tool
                </Button>
              </span>
            </Tooltip>
          )}

          {!isMobile && (
            <>
              <Tooltip title="Settings">
                <IconButton color="inherit" onClick={() => setOpenSettings(true)} aria-label="settings">
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Logout">
                <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Toolbar>

        {!isMobile && (
          <Tabs
            value={tab}
            onChange={(_, v) => handleSelectTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 1 }}
          >
            {tabs.map((t) => (
              <Tab key={t.index} label={t.label} />
            ))}
          </Tabs>
        )}
      </AppBar>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 280 } }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            component="img"
            src="/icon.ico"
            alt="logo"
            sx={{ width: 24, height: 24, borderRadius: "6px" }}
          />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Admin Menu
          </Typography>
        </Box>
        <Divider />
        <List sx={{ py: 0 }}>
          {tabs.map((t) => (
            <ListItemButton
              key={t.index}
              selected={tab === t.index}
              onClick={() => handleSelectTab(t.index)}
            >
              <ListItemText primary={t.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <List sx={{ py: 0 }}>
          <ListItemButton onClick={handleLogout}>
            <LogoutIcon fontSize="small" style={{ marginRight: 12 }} />
            <ListItemText primary="Logout" />
          </ListItemButton>
        </List>
      </Drawer>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TabPanel value={tab} index={0}>
          {visitedTabs.has(0) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", display: "flex", flexDirection: "column", width: "100%" }}>
                <AdminHome user={user} showSnackbar={showSnackbar} isActive={tab === 0} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={1}>
          {visitedTabs.has(1) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <Reports isActive={tab === 1} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={2}>
          {visitedTabs.has(2) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <Shifts showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={3}>
          {visitedTabs.has(3) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <Transactions showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={4}>
          {visitedTabs.has(4) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <ExpenseManagement showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={5}>
          {visitedTabs.has(5) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <DebtReport showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={6}>
          {visitedTabs.has(6) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <ServiceCatalog showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={7}>
          {visitedTabs.has(7) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <InventoryManagement showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={8}>
          {visitedTabs.has(8) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <UserManagement showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>
        <TabPanel value={tab} index={9}>
          {visitedTabs.has(9) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%" }}>
                <Payroll showSnackbar={showSnackbar} />
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={tab} index={10}>
          {visitedTabs.has(10) && (
            <Box sx={{ p: 2, width: "100%", height: "100%" }}>
              <Box sx={{ height: "100%", width: "100%", overflow: "hidden", display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: 'background.paper' }}>
                  <Tabs value={systemTab} onChange={(e, v) => setSystemTab(v)}>
                    <Tab label="Settings" />
                    <Tab label="Utilities & Migration" />
                  </Tabs>
                </Box>

                {/* SETTINGS SUB-TAB */}
                {systemTab === 0 && (
                  <Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
                    <ExpenseSettings showSnackbar={showSnackbar} />
                  </Box>
                )}

                {/* UTILITIES SUB-TAB */}
                {systemTab === 1 && (
                  <Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
                    <UnifiedMigration showSnackbar={showSnackbar} />
                    <Box sx={{ my: 4 }} />
                    <DataAggregator showSnackbar={showSnackbar} />
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </TabPanel>
      </Box>

      <SettingsDialog
        open={openSettings}
        onClose={() => setOpenSettings(false)}
        onSettingsUpdated={() => { }}
        showSnackbar={showSnackbar}
      />

      <HistoryGeneratorDialog
        open={showHistoryDialog}
        onClose={() => setShowHistoryDialog(false)}
        showSnackbar={showSnackbar}
      />

      {/* GLOBAL SNACKBAR */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>

      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(p => ({ ...p, open: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        onConfirm={confirmDialog.onConfirm}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Box>
  );
}
