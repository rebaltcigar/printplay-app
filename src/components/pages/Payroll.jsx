// src/components/pages/Payroll.jsx
// Payroll module entry point — nested router layout with sub-navigation.

import React from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Box, Tabs, Tab, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import DashboardIcon from "@mui/icons-material/Dashboard";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import HistoryIcon from "@mui/icons-material/History";
import PeopleIcon from "@mui/icons-material/People";
import ReceiptIcon from "@mui/icons-material/Receipt";

import PayrollDashboard from "../payroll/PayrollDashboard";
import PayrollHistory from "../payroll/PayrollHistory";
import StaffPay from "../payroll/StaffPay";
import PaySlips from "../payroll/PaySlips";
import NewPayrollRun from "../payroll/NewPayrollRun";

const NAV_ITEMS = [
  { label: "Dashboard", path: "", icon: <DashboardIcon fontSize="small" /> },
  { label: "Run Payroll", path: "run", icon: <PlayCircleIcon fontSize="small" /> },
  { label: "History", path: "history", icon: <HistoryIcon fontSize="small" /> },
  { label: "Staff Pay", path: "staff", icon: <PeopleIcon fontSize="small" /> },
  { label: "Pay Slips", path: "payslips", icon: <ReceiptIcon fontSize="small" /> },
];

export default function Payroll({ appSettings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Resolve current tab index from path
  const subPath = location.pathname.replace(/^\/admin\/payroll\/?/, "").split("/")[0] || "";
  const activeIdx = NAV_ITEMS.findIndex((n) => n.path === subPath);
  const currentTab = activeIdx >= 0 ? activeIdx : 0;

  const handleTabChange = (_e, newVal) => {
    const path = NAV_ITEMS[newVal].path;
    navigate(path ? `/admin/payroll/${path}` : "/admin/payroll");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Sub-navigation tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", px: { xs: 1, sm: 2 } }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
          sx={{
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.85rem",
              gap: 0.5,
            },
          }}
        >
          {NAV_ITEMS.map((item) => (
            <Tab
              key={item.path}
              icon={item.icon}
              iconPosition="start"
              label={item.label}
            />
          ))}
        </Tabs>
      </Box>

      {/* Route content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Routes>
          <Route index element={<PayrollDashboard appSettings={appSettings} />} />
          <Route path="run" element={<NewPayrollRun appSettings={appSettings} />} />
          <Route path="run/:runId" element={<NewPayrollRun appSettings={appSettings} />} />
          <Route path="history" element={<PayrollHistory appSettings={appSettings} />} />
          <Route path="staff" element={<StaffPay appSettings={appSettings} />} />
          <Route path="payslips" element={<PaySlips appSettings={appSettings} />} />
          <Route path="*" element={<Navigate to="/admin/payroll" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}


