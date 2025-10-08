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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";

import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
import ItemManagement from "./ItemManagement"; // <-- 1. MODIFIED IMPORT
import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome"; // Charts & summaries
import Transactions from "./Transactions";

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
    { label: "Items", index: 5 }, // <-- 2. MODIFIED LABEL
    { label: "Users", index: 6 },
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
    const really = window.confirm(
      "⚠️ This will DELETE all docs in 'shifts' and 'transactions' and then generate historical data from Mar 1, 2025 to yesterday.\n\nAre you absolutely sure?"
    );
    if (!really) return;

    try {
      setSeeding(true);
      await generateFakeHistory({
        db,
        startISO: "2025-03-01",
        doPurgeFirst: true,
      });
      alert("Seeding complete! 🎉 (You can remove this button now.)");
    } catch (err) {
      console.error(err);
      alert("Seeding failed. Check the console for details.");
    } finally {
      setSeeding(false);
    }
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
            <Tooltip title="Logout">
              <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
                <LogoutIcon />
              </IconButton>
            </Tooltip>
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
            <AdminHome />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <Shifts />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <Transactions />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <ExpenseManagement />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <DebtReport />
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={5}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <ItemManagement /> {/* <-- 3. MODIFIED COMPONENT */}
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={6}>
          <Box sx={{ height: "100%", width: "100%" }}>
            <UserManagement />
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
}