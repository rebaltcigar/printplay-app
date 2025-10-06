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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";

import { auth } from "../firebase";
import { signOut } from "firebase/auth";

import Shifts from "./Shifts";
import ExpenseManagement from "./ExpenseManagement";
import DebtReport from "./DebtReport";
import ServiceManagement from "./ServiceManagement";
import UserManagement from "./UserManagement";
import AdminHome from "./AdminHome"; // Charts & summaries
import Transactions from "./Transactions";

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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const tabs = [
    { label: "Home", index: 0 },
    { label: "Shifts", index: 1 },
    { label: "Transactions", index: 2 },
    { label: "Expenses", index: 3 },
    { label: "Debts", index: 4 },
    { label: "Services", index: 5 },
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ alignItems: "center", gap: 1, minHeight: { xs: 56, sm: 64 } }}>
          {/* Mobile: Hamburger */}
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

          {/* Logo */}
          <Box
            component="img"
            src="/icon.ico"
            alt="logo"
            sx={{ width: 26, height: 26, borderRadius: "6px", mr: 1 }}
          />

          {/* Title */}
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

          {/* Desktop: Logout button (unchanged) */}
          {!isMobile && (
            <Tooltip title="Logout">
              <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>

        {/* Desktop/Web: Top-anchored tabs (unchanged); hidden on mobile */}
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

      {/* Mobile Drawer: navigation + logout */}
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

      {/* Full-height tab content */}
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
            <ServiceManagement />
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
