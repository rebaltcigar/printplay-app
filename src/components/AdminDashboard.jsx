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
  Snackbar,
  Alert,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom"; // ADDED

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
import ListItemIcon from "@mui/material/ListItemIcon";

import StoreSettings from "./admin/StoreSettings"; // Used in Settings wrapper? No, replaced by Settings.jsx
import Settings from "./admin/Settings";
import HistoryGeneratorDialog from "./HistoryGeneratorDialog";
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import DrawerDialog from "./DrawerDialog";
import { openDrawer } from "../utils/drawerService";

import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
import ServiceCatalog from "./admin/ServiceCatalog";
import InventoryManagement from "./admin/InventoryManagement";
import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome";
import Transactions from "./Transactions";
import Payroll from "./Payroll";
import Reports from "./Reports";

export default function AdminDashboard({ user, onLogout }) {
  // Router hooks
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false);

  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
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

  // Tabs mapping to Routes
  const tabs = [
    { label: "Home", path: "", icon: <HomeIcon /> }, // Index route
    { label: "Reports", path: "reports", icon: <AssessmentIcon /> },
    { label: "Shifts", path: "shifts", icon: <AccessTimeIcon /> },
    { label: "Transactions", path: "transactions", icon: <ReceiptLongIcon /> },
    { label: "Expense Log", path: "expenses", icon: <ReceiptIcon /> },
    { label: "Debts", path: "debts", icon: <MoneyOffIcon /> },
    { label: "Catalog", path: "catalog", icon: <CategoryIcon /> },
    { label: "Inventory", path: "inventory", icon: <InventoryIcon /> },
    { label: "Users", path: "users", icon: <PeopleIcon /> },
    { label: "Payroll", path: "payroll", icon: <BadgeIcon /> },
    { label: "Settings", path: "settings", icon: <SettingsIcon /> },
  ];

  // Helper to determine active tab based on path
  const currentPath = location.pathname.replace("/admin", "").replace("/", ""); // Simple check
  // Better: check if location.pathname starts with /admin/path
  const isTabActive = (t) => {
    if (t.path === "") return location.pathname === "/admin" || location.pathname === "/admin/";
    return location.pathname.startsWith(`/admin/${t.path}`);
  };


  const handleLogout = async () => {
    try {
      if (onLogout) await onLogout();
      else await signOut(auth);
    } catch (e) {
      console.error("Admin logout failed:", e);
    }
  };

  const handleNavigate = (path) => {
    // Always use absolute paths to avoid relative navigation ambiguity
    const target = path ? `/admin/${path}` : '/admin';
    navigate(target);
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
            {tabs.map((t) => {
              const active = isTabActive(t);
              return (
                <Tooltip key={t.path} title={!sidebarOpen && !isMobileSidebar ? t.label : ""} placement="right">
                  <ListItemButton
                    selected={active}
                    onClick={() => handleNavigate(t.path)}
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
                        color: active ? 'inherit' : 'text.secondary'
                      }}
                    >
                      {t.icon}
                    </ListItemIcon>
                    {(sidebarOpen || isMobileSidebar) && <ListItemText primary={t.label} primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400 }} />}
                  </ListItemButton>
                </Tooltip>
              );
            })}
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

        {/* --- MAIN CONTENT AREA WITH ROUTING --- */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Routes>
            <Route index element={<AdminHome user={user} showSnackbar={showSnackbar} />} />
            <Route path="reports" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <Reports isActive={true} />
              </Box>
            } />
            <Route path="shifts" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <Shifts showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="transactions" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <Transactions showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="expenses" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <ExpenseManagement showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="debts" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <DebtReport showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="catalog" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <ServiceCatalog showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="inventory" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <InventoryManagement showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="users" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <UserManagement showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="payroll" element={
              <Box sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
                <Payroll showSnackbar={showSnackbar} />
              </Box>
            } />
            <Route path="settings" element={
              <Box sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
                <Settings user={user} showSnackbar={showSnackbar} isActive={true} />
              </Box>
            } />
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Box>
      </Box>

      {/* DIALOGS */}
      <HistoryGeneratorDialog
        open={showHistoryDialog}
        onClose={() => setShowHistoryDialog(false)}
        showSnackbar={showSnackbar}
      />

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
