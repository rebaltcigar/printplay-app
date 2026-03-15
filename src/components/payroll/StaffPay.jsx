// src/components/payroll/StaffPay.jsx
// Staff pay management — profile cards, rate history timeline, pay history, set new rate.

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Stack,
  Chip,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Divider,
  IconButton,
  Tooltip,
  Collapse,
  CircularProgress,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PersonIcon from "@mui/icons-material/Person";
import PaymentsIcon from "@mui/icons-material/Payments";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ReceiptIcon from "@mui/icons-material/Receipt";

import { supabase } from "../../supabase";
import { fmtCurrency, fmtDate } from "../../utils/formatters";
import { resolveHourlyRate, toLocaleDateStringPHT, todayYMD_PHT, toHours } from "../../utils/payrollHelpers";
import { fetchStaffPayHistory, fetchStubs } from "../../services/payrollService";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import DetailDrawer from "../common/DetailDrawer";
import PageHeader from "../common/PageHeader";
import PaySlipViewer from "./PaySlipViewer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";

const STATUS_COLORS = {
  draft: "default",
  reviewed: "info",
  approved: "warning",
  posted: "success",
  voided: "error",
};

export default function StaffPay({ appSettings }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showSnackbar } = useGlobalUI();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  // Pay history cache per staff
  const [payHistory, setPayHistory] = useState({}); // { [staffId]: { totalEarned, runCount, runs } }
  const [payHistoryLoading, setPayHistoryLoading] = useState({});

  // Rate dialog
  const [rateDialog, setRateDialog] = useState(null); // { profile, newRate, effectiveDate }
  const [selectedStub, setSelectedStub] = useState(null);
  const [stubLoading, setStubLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "staff")
        .order("full_name", { ascending: true });

      if (error) throw error;
      setStaff(data || []);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load staff", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load pay history when a card is expanded
  const handleToggle = async (profileId) => {
    if (expandedId === profileId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(profileId);

    // Fetch pay history if not already cached
    if (!payHistory[profileId]) {
      setPayHistoryLoading((prev) => ({ ...prev, [profileId]: true }));
      try {
        const data = await fetchStaffPayHistory(profileId);
        setPayHistory((prev) => ({ ...prev, [profileId]: data }));
      } catch (err) {
        console.error(err);
        showSnackbar("Failed to load pay history", "error");
      } finally {
        setPayHistoryLoading((prev) => ({ ...prev, [profileId]: false }));
      }
    }
  };

  const openSetRate = (profile) => {
    const currentRate = resolveHourlyRate(profile.payroll_config, new Date());
    setRateDialog({
      profile,
      newRate: String(currentRate || ""),
      effectiveDate: todayYMD_PHT(),
    });
  };

  const handleSaveRate = async () => {
    if (!rateDialog) return;
    const { profile, newRate, effectiveDate } = rateDialog;
    const rate = Number(newRate);
    if (isNaN(rate) || rate <= 0) {
      showSnackbar("Please enter a valid rate", "warning");
      return;
    }

    try {
      const existing = profile.payroll_config || {};
      const history = Array.isArray(existing.rate_history) ? [...existing.rate_history] : [];
      history.push({
        rate,
        effective_from: new Date(`${effectiveDate}T00:00:00+08:00`).toISOString(),
      });

      const updatedConfig = { ...existing, rate_history: history };

      const { error } = await supabase
        .from("profiles")
        .update({ payroll_config: updatedConfig })
        .eq("id", profile.id);

      if (error) throw error;
      showSnackbar(`Rate updated to ${fmtCurrency(rate)}/hr`, "success");
      setRateDialog(null);
      load();
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to update rate", "error");
    }
  };

  const handleViewSlip = async (runId, staffId) => {
    setStubLoading(true);
    try {
      const stubs = await fetchStubs({ runId, staffId });
      if (stubs && stubs.length > 0) {
        setSelectedStub(stubs[0]);
      } else {
        showSnackbar("Pay slip not found", "warning");
      }
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load pay slip", "error");
    } finally {
      setStubLoading(false);
    }
  };

  const getRateHistory = (profile) => {
    const config = profile.payroll_config;
    if (!config) return [];
    const history = Array.isArray(config.rate_history)
      ? config.rate_history
      : Array.isArray(config.rateHistory)
        ? config.rateHistory
        : [];
    return history
      .map((r) => ({
        rate: Number(r.rate),
        effectiveFrom: r.effective_from || r.effectiveFrom || "",
      }))
      .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Staff Pay"
        subtitle="Manage hourly rates and view pay history for each staff member."
      />

      {/* Table Area */}
      <TableContainer 
        component={Paper} 
        sx={{ 
          flex: 1, 
          minHeight: 0, 
          overflow: "auto",
          maxHeight: { xs: "66vh", md: "70vh" }
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ fontWeight: 700 }}>Staff Member</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Hourly Rate</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Effective Since</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell />
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={80} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="rectangular" width={40} height={30} sx={{ ml: "auto", borderRadius: 1 }} /></TableCell>
                </TableRow>
              ))
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 10, textAlign: "center" }}>
                  <Typography variant="body2" color="text.secondary">No staff members found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              staff.map((profile) => {
                const currentRate = resolveHourlyRate(profile.payroll_config, new Date());
                const rateHistory = getRateHistory(profile);
                const isExpanded = expandedId === profile.id;
                const staffPayData = payHistory[profile.id];
                const isPayLoading = payHistoryLoading[profile.id];

                return (
                  <React.Fragment key={profile.id}>
                    <TableRow 
                      hover 
                      sx={{ cursor: "pointer", "& > *": { borderBottom: isExpanded ? "none" : undefined } }}
                      onClick={() => handleToggle(profile.id)}
                    >
                      <TableCell>
                        <IconButton size="small">
                          {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar sx={{ width: 28, height: 28, fontSize: "0.75rem", bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}>
                            {getInitials(profile.full_name)}
                          </Avatar>
                          <Typography variant="body2" fontWeight={600}>{profile.full_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{profile.email}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color={currentRate > 0 ? "success.main" : "text.secondary"}>
                          {currentRate > 0 ? `${fmtCurrency(currentRate)}/hr` : "None"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {rateHistory[0]?.effectiveFrom ? toLocaleDateStringPHT(rateHistory[0].effectiveFrom) : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Set New Rate">
                          <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openSetRate(profile); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Content */}
                    <TableRow>
                      <TableCell sx={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 3, px: 2, bgcolor: alpha(theme.palette.primary.main, 0.02), borderBottom: "1px solid", borderColor: "divider" }}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
                              {/* Rate History Column */}
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 0.5, textTransform: "uppercase" }}>
                                  <HistoryIcon sx={{ fontSize: 14 }} /> Rate History
                                </Typography>
                                {rateHistory.length === 0 ? (
                                  <Typography variant="body2" color="text.secondary">No history found.</Typography>
                                ) : (
                                  <Stack spacing={1}>
                                    {rateHistory.map((entry, idx) => (
                                      <Stack key={idx} direction="row" alignItems="center" spacing={2} sx={{ py: 0.5 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: idx === 0 ? "success.main" : "grey.400" }} />
                                        <Typography variant="body2" fontWeight={idx === 0 ? 700 : 400}>
                                          {fmtCurrency(entry.rate)}/hr
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          from {toLocaleDateStringPHT(entry.effectiveFrom)}
                                        </Typography>
                                        {idx === 0 && <Chip size="small" label="Current" color="success" variant="outlined" sx={{ fontSize: "0.6rem", height: 18 }} />}
                                      </Stack>
                                    ))}
                                  </Stack>
                                )}
                              </Box>

                              {/* Pay History Column */}
                              <Box sx={{ flex: 2 }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 0.5, textTransform: "uppercase" }}>
                                  <PaymentsIcon sx={{ fontSize: 14 }} /> Recent Pay History
                                </Typography>
                                {isPayLoading ? (
                                  <CircularProgress size={24} />
                                ) : !staffPayData || staffPayData.runs.length === 0 ? (
                                  <Typography variant="body2" color="text.secondary">No payroll history found.</Typography>
                                ) : (
                                  <Box>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell sx={{ fontSize: "0.7rem", fontWeight: 700 }}>Period</TableCell>
                                          <TableCell align="right" sx={{ fontSize: "0.7rem", fontWeight: 700 }}>Hours</TableCell>
                                          <TableCell align="right" sx={{ fontSize: "0.7rem", fontWeight: 700 }}>Net Pay</TableCell>
                                          <TableCell align="right" sx={{ fontSize: "0.7rem", fontWeight: 700 }}>Slip</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {staffPayData.runs.slice(0, 5).map((r) => (
                                          <TableRow key={r.runId}>
                                            <TableCell sx={{ py: 0.75 }}>
                                              <Typography variant="caption" fontWeight={600}>
                                                {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                                              </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ py: 0.75 }}>{Number(r.hours || 0).toFixed(2)}</TableCell>
                                            <TableCell align="right" sx={{ py: 0.75, fontWeight: 700, color: "success.main" }}>{fmtCurrency(r.net)}</TableCell>
                                            <TableCell align="right" sx={{ py: 0.5 }}>
                                              <IconButton size="small" color="primary" onClick={() => handleViewSlip(r.runId, profile.id)}>
                                                <ReceiptIcon sx={{ fontSize: 16 }} />
                                              </IconButton>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                )}
                              </Box>
                            </Stack>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Set Rate Dialog */}
      <Dialog open={!!rateDialog} onClose={() => setRateDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set Hourly Rate</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {rateDialog?.profile?.full_name}
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Hourly Rate (₱)"
              type="number"
              value={rateDialog?.newRate || ""}
              onChange={(e) => setRateDialog((p) => ({ ...p, newRate: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              label="Effective From"
              type="date"
              value={rateDialog?.effectiveDate || ""}
              onChange={(e) => setRateDialog((p) => ({ ...p, effectiveDate: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRateDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveRate}>Save Rate</Button>
        </DialogActions>
      </Dialog>

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!selectedStub}
        onClose={() => setSelectedStub(null)}
        title="Pay Slip"
        width={isMobile ? "100%" : 820}
      >
        {selectedStub && <PaySlipViewer stub={selectedStub} appSettings={appSettings} />}
      </DetailDrawer>
    </Box>
  );
}
