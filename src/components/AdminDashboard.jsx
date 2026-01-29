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
  Snackbar, // ADDED
  Alert,    // ADDED
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SettingsIcon from "@mui/icons-material/Settings"; // ADDED
import SettingsDialog from './SettingsDialog'; // ADDED
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";

import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";

import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
import ItemManagement from "./ItemManagement"; // <-- 1. MODIFIED IMPORT
import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome"; // Charts & summaries
import Transactions from "./Transactions";
import Payroll from "./Payroll";

import { generateFakeHistory } from "../utils/seedHistoricalData";

function TabPanel({ value, index, children }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: "100%", display: value === index ? "flex" : "none" }}
    >
      {value === index && (
        <Box sx={{ p: 2, width: "100%", height: "100%" }}>{children}</Box>
      )}
    </Box>
  );
}

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  // --- SNACKBAR STATE ---
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const handleCloseSnackbar = () => setSnackbar(prev => ({ ...prev, open: false }));
  const showSnackbar = (msg, sev = 'success') => setSnackbar({ open: true, message: msg, severity: sev });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const devMode =
    import.meta.env.MODE === "development" ||
    import.meta.env.VITE_ENABLE_SEED_BUTTON === "true";

  const tabs = [
    { label: "Home", index: 0 },
    { label: "Shifts", index: 1 },
    { label: "Transactions", index: 2 },
    { label: "Expenses", index: 3 },
    { label: "Debts", index: 4 },
    { label: "Items", index: 5 },
    { label: "Users", index: 6 },
    { label: "Payroll", index: 7 },
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
    setDrawerOpen(false);
  };

  const handleSeed = async () => {
    setConfirmDialog({
      open: true,
      title: "⚠️ Dangerous Action: SEED DATA",
      message: "This will DELETE all docs in 'shifts' and 'transactions' and generate historical data from Mar 1, 2025 to yesterday. Are you absolutely sure?",
      requireReason: false,
      confirmText: "WIPE & SEED",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          setSeeding(true);
          await generateFakeHistory({
            db,
            startISO: "2025-03-01",
            doPurgeFirst: true,
          });
          showSnackbar("Seeding complete! 🎉", 'success');
        } catch (err) {
          console.error(err);
          showSnackbar("Seeding failed. Check the console.", 'error');
        } finally {
          setSeeding(false);
        }
      }
    });
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
                  onClick={handleSeed}
                  disabled={seeding}
                  variant="outlined"
                  color="inherit"
                  size="small"
                  startIcon={!seeding ? <AutoFixHighIcon /> : null}
                  sx={{ textTransform: "none", mr: 1 }}
                >
                  {seeding ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={16} color="inherit" />
                      Seeding…
                    </Box>
                  ) : (
                    "Generate Fake History"
                  )}
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
            onChange={(_, v) => setTab(v)}
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
          <Box sx={{ height: "100%", display: "flex", flexDirection: "column", width: "100%" }}>
            <AdminHome user={user} showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <Shifts showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <Transactions showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <ExpenseManagement showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <DebtReport showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={5}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <ItemManagement showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={6}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <UserManagement showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>
        <TabPanel value={tab} index={7}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <Payroll showSnackbar={showSnackbar} />
          </Box>
        </TabPanel>
      </Box>
      <SettingsDialog
        open={openSettings}
        onClose={() => setOpenSettings(false)}
        onSettingsUpdated={() => { }}
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
