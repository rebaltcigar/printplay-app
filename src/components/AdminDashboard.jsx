// src/views/AdminDashboard.jsx
import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
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
  Collapse
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SettingsIcon from "@mui/icons-material/Settings";
import HomeIcon from "@mui/icons-material/Home";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ReceiptIcon from "@mui/icons-material/Receipt";
import MoneyOffIcon from "@mui/icons-material/MoneyOff";
import CategoryIcon from "@mui/icons-material/Category";
import InventoryIcon from "@mui/icons-material/Inventory";
import PeopleIcon from "@mui/icons-material/People";
import BadgeIcon from "@mui/icons-material/Badge";
import StoreIcon from "@mui/icons-material/Store";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import ComputerIcon from "@mui/icons-material/Computer";
import DescriptionIcon from "@mui/icons-material/Description";
import LockIcon from "@mui/icons-material/Lock";
import StorageIcon from "@mui/icons-material/Storage";
import ListAltIcon from "@mui/icons-material/ListAlt";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListSubheader from "@mui/material/ListSubheader";
import StoreSettings from "./admin/StoreSettings";
import DataAggregator from "./admin/DataAggregator";
import ExpenseSettings from "./admin/ExpenseSettings";
import Settings from "./admin/Settings";
import HistoryGeneratorDialog from "./HistoryGeneratorDialog";
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'; // Icon
import DrawerDialog from "./DrawerDialog"; // RESTORED
import { openDrawer } from "../utils/drawerService"; // Direct Service Access

import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { doc, updateDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"; // Added imports


import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
import ServiceCatalog from "./admin/ServiceCatalog"; // New
import InventoryManagement from "./admin/InventoryManagement"; // New

import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome";
import Transactions from "./Transactions";
import Payroll from "./Payroll";
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
  const [sidebarOpen, setSidebarOpen] = useState(true); // Toggle for desktop sidebar
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false); // Drawer for mobile
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false); // RESTORED

  const [showHistoryDialog, setShowHistoryDialog] = useState(false); // ADDED
  const [storeSettings, setStoreSettings] = useState({ storeName: 'PrintPlay', logoUrl: '/icon.ico' });

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const docRef = doc(db, 'settings', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStoreSettings({
            storeName: data.storeName || 'PrintPlay',
            logoUrl: data.logoUrl || '/icon.ico'
          });
        }
      } catch (e) {
        console.error("Error fetching branding:", e);
      }
    };
    fetchBranding();
  }, []);

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

  const handleOpenDrawer = async () => {
    try {
      const success = await openDrawer(user, 'manual');
      if (success) showSnackbar("Drawer opened successfully.");
    } catch (e) {
      console.error(e);
      showSnackbar(e.message || "Failed to open drawer.", "error");
    }
  };

  const tabs = [
    { label: "Home", index: 0, icon: <HomeIcon /> },
    { label: "Reports", index: 1, icon: <AssessmentIcon /> },
    { label: "Shifts", index: 2, icon: <AccessTimeIcon /> },
    { label: "Transactions", index: 3, icon: <ReceiptLongIcon /> },
    { label: "Expense Log", index: 4, icon: <ReceiptIcon /> },
    { label: "Debts", index: 5, icon: <MoneyOffIcon /> },
    { label: "Catalog", index: 6, icon: <CategoryIcon /> },
    { label: "Inventory", index: 7, icon: <InventoryIcon /> },
    { label: "Users", index: 8, icon: <PeopleIcon /> },
    { label: "Payroll", index: 9, icon: <BadgeIcon /> },
    { label: "Settings", index: 10, icon: <SettingsIcon /> },
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
    setMobileDrawerOpen(false);
  };

  const sidebarWidth = sidebarOpen ? 240 : 64;

  const NavList = ({ isMobileSidebar = false }) => {
    return (
      <>
        <Box sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minHeight: 64,
          justifyContent: (sidebarOpen || isMobileSidebar) ? 'initial' : 'center'
        }}>
          <IconButton
            color="inherit"
            onClick={() => isMobile ? setMobileDrawerOpen(true) : setSidebarOpen(!sidebarOpen)}
            size="small"
            sx={{ color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <List sx={{ py: 1 }}>
            {tabs.map((t) => (
              <Tooltip key={t.index} title={!sidebarOpen && !isMobileSidebar ? t.label : ""} placement="right">
                <ListItemButton
                  selected={tab === t.index}
                  onClick={() => handleSelectTab(t.index)}
                  sx={{
                    minHeight: 48,
                    justifyContent: (sidebarOpen || isMobileSidebar) ? 'initial' : 'center',
                    px: 2.5,
                    mx: 1,
                    borderRadius: 2,
                    mb: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '& .MuiListItemIcon-root': { color: 'white' }
                    }
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: (sidebarOpen || isMobileSidebar) ? 2 : 'auto',
                      justifyContent: 'center',
                      color: tab === t.index ? 'inherit' : 'text.secondary'
                    }}
                  >
                    {t.icon}
                  </ListItemIcon>
                  {(sidebarOpen || isMobileSidebar) && <ListItemText primary={t.label} primaryTypographyProps={{ variant: 'body2', fontWeight: tab === t.index ? 600 : 400 }} />}
                </ListItemButton>
              </Tooltip>
            ))}
          </List>
        </Box>
        <Divider />
        <List sx={{ py: 1 }}>
          <Tooltip title={!sidebarOpen && !isMobileSidebar ? "Logout" : ""} placement="right">
            <ListItemButton
              onClick={handleLogout}
              sx={{
                minHeight: 48,
                justifyContent: (sidebarOpen || isMobileSidebar) ? 'initial' : 'center',
                px: 2.5,
                mx: 1,
                borderRadius: 2,
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: (sidebarOpen || isMobileSidebar) ? 2 : 'auto', justifyContent: 'center', color: 'error.main' }}>
                <LogoutIcon />
              </ListItemIcon>
              {(sidebarOpen || isMobileSidebar) && <ListItemText primary="Logout" sx={{ color: 'error.main' }} />}
            </ListItemButton>
          </Tooltip>
        </List>
      </>
    );
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100%", bgcolor: 'background.default' }}>
      {/* Sidebar for Desktop */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: sidebarWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
              borderRight: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column'
            },
          }}
        >
          <NavList />
        </Drawer>
      )}

      {/* Drawer for Mobile */}
      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        PaperProps={{ sx: { width: 280 } }}
      >
        <NavList isMobileSidebar />
      </Drawer>

      {/* DASHBOARD CONTENT */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
            zIndex: 1100,
          }}
        >
          <Toolbar sx={{ alignItems: "center", gap: 1, minHeight: { xs: 56, sm: 64 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1, ml: isMobile ? 0 : 1 }}>
              <Box
                component="img"
                src={storeSettings.logoUrl}
                alt="logo"
                sx={{ width: 32, height: 32, borderRadius: "6px" }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff' }}>
                {storeSettings.storeName}
              </Typography>
            </Box>

            {devMode && (
              <Tooltip title="DEV: Seed historical fake data">
                <span>
                  <Button
                    onClick={() => setShowHistoryDialog(true)}
                    variant="outlined"
                    color="primary"
                    size="small"
                    startIcon={<AutoFixHighIcon />}
                    sx={{ textTransform: "none", mr: 1 }}
                  >
                    Fake History
                  </Button>
                </span>
              </Tooltip>
            )}

            <Button
              variant="contained"
              color="primary"
              startIcon={<MeetingRoomIcon />}
              onClick={() => setCashDrawerOpen(true)}
              sx={{ mr: 1, textTransform: "none", borderRadius: 2 }}
            >
              Open Drawer
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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

          {/* SETTINGS PANELS */}
          <TabPanel value={tab} index={10}>
            {visitedTabs.has(10) && (
              <Box sx={{ p: 0, width: "100%", height: "100%", overflow: 'hidden' }}>
                <Settings user={user} showSnackbar={showSnackbar} isActive={tab === 10} />
              </Box>
            )}
          </TabPanel>

        </Box>
      </Box>


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
      <DrawerDialog
        open={cashDrawerOpen}
        onClose={() => setCashDrawerOpen(false)}
        user={user}
        showSnackbar={showSnackbar}
      />
    </Box>

  );
}
