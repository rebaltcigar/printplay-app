// src/components/payroll/PayrollHistory.jsx
// Payroll History — card list of past runs with detail drawer.

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Stack,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Avatar,
  Divider,
  IconButton,
  Tooltip,
  useMediaQuery,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import ReceiptIcon from "@mui/icons-material/Receipt";
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PersonIcon from "@mui/icons-material/Person";
import PaidIcon from "@mui/icons-material/Paid";
import HistoryIcon from "@mui/icons-material/History";

import DetailDrawer from "../common/DetailDrawer";
import PageHeader from "../common/PageHeader";
import SummaryCards from "../common/SummaryCards";
import { fetchRuns, loadRun, voidRun, deleteRun } from "../../services/payrollService";
import { fmtCurrency } from "../../utils/formatters";
import { toLocaleDateStringPHT, toHours } from "../../utils/payrollHelpers";
import { useGlobalUI } from "../../contexts/GlobalUIContext";

const STATUS_COLORS = {
  draft: "default",
  reviewed: "info",
  approved: "warning",
  posted: "success",
  voided: "error",
};

const ALL_STATUSES = ["draft", "reviewed", "approved", "posted", "voided"];

export default function PayrollHistory() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showSnackbar, showConfirm } = useGlobalUI();

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedLines, setSelectedLines] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchRuns({
        status: statusFilter.length > 0 ? statusFilter : undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      });
      setRuns(data);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load payroll runs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, dateFrom, dateTo]);

  // ─── Detail Drawer ──────────────────────────────────────────────────────────

  const openDetail = async (run) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSelectedRun(run);
    setSelectedLines([]);
    try {
      const { run: fullRun, lines } = await loadRun(run.id);
      setSelectedRun(fullRun);
      setSelectedLines(lines);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load run details", "error");
    } finally {
      setDrawerLoading(false);
    }
  };

  // ─── Void / Delete ──────────────────────────────────────────────────────────

  const handleVoid = (run) => {
    showConfirm({
      title: "Void Payroll Run",
      message: `Are you sure you want to void the run for ${toLocaleDateStringPHT(run.period_start)} — ${toLocaleDateStringPHT(run.period_end)}? Associated pay stubs will be deleted.`,
      confirmLabel: "Void",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          await voidRun(run.id);
          showSnackbar("Run voided", "success");
          load();
          if (drawerOpen && selectedRun?.id === run.id) setDrawerOpen(false);
        } catch (err) { showSnackbar(err.message || "Failed to void run", "error"); }
      },
    });
  };

  const handleDelete = (run) => {
    showConfirm({
      title: "Delete Payroll Run",
      message: `Permanently delete this ${run.status} run? This cannot be undone.`,
      confirmLabel: "Delete",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          await deleteRun(run.id);
          showSnackbar("Run deleted", "success");
          load();
          if (drawerOpen && selectedRun?.id === run.id) setDrawerOpen(false);
        } catch (err) { showSnackbar(err.message || "Failed to delete run", "error"); }
      },
    });
  };

  const postedTotal = runs.filter(r => r.status === "posted").reduce((s, r) => s + Number(r.totals?.net || 0), 0);
  const draftCount = runs.filter(r => r.status === "draft").length;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Payroll History"
        subtitle="Review past payroll runs, manage drafts, and access pay slips."
        actions={
          <Button variant="contained" size="small" onClick={() => navigate("/admin/payroll/run")}>
            New Payroll Run
          </Button>
        }
      />

      {/* Filters */}
      <Box sx={{ mb: 3, p: 2, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "center" }}
          flexWrap="wrap"
          useFlexGap
        >
          <ToggleButtonGroup
            size="small"
            value={statusFilter}
            onChange={(_e, val) => setStatusFilter(val || [])}
            sx={{ flexWrap: "wrap" }}
          >
            {ALL_STATUSES.map((s) => (
              <ToggleButton key={s} value={s} sx={{ textTransform: "capitalize", px: 1.5 }}>
                {s}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <TextField label="From" type="date" size="small" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 140 }} />
          <TextField label="To" type="date" size="small" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 140 }} />
        </Stack>
      </Box>

      {/* Summary Cards */}
      <SummaryCards
        loading={loading}
        sx={{ mb: 3 }}
        cards={[
          { label: "Total Runs", value: String(runs.length), icon: <HistoryIcon fontSize="small" />, color: "primary.main" },
          { label: "Total Paid", value: fmtCurrency(postedTotal), icon: <PaidIcon fontSize="small" />, color: "success.main", highlight: true },
          { label: "Pending Drafts", value: String(draftCount), icon: <AccessTimeIcon fontSize="small" />, color: draftCount > 0 ? "warning.main" : "text.secondary" },
        ]}
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
              <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Staff</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Hours</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Net Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton variant="text" width={60} /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="rectangular" width={100} height={30} sx={{ ml: "auto", borderRadius: 1 }} /></TableCell>
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 10, textAlign: "center" }}>
                  <Typography variant="body2" color="text.secondary">No payroll runs found.</Typography>
                  <Button sx={{ mt: 1, textTransform: "none" }} onClick={() => navigate("/admin/payroll/run")}>Run your first payroll →</Button>
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow 
                  key={run.id} 
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => openDetail(run)}
                >
                  <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                    {run.display_id || run.id.slice(-6)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {toLocaleDateStringPHT(run.period_start)} — {toLocaleDateStringPHT(run.period_end)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small" 
                      label={run.status} 
                      color={STATUS_COLORS[run.status]} 
                      sx={{ fontSize: "0.7rem", height: 22, textTransform: "capitalize" }} 
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{run.totals?.staffCount || 0}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{toHours(run.totals?.totalMinutes || 0)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      {fmtCurrency(run.totals?.net || 0)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="View Details">
                        <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openDetail(run); }}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {run.status === "draft" && (
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/admin/payroll/run/${run.id}`); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {run.status === "posted" && (
                        <>
                          <Tooltip title="View Pay Slips">
                            <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); navigate(`/admin/payroll/payslips?run=${run.id}`); }}>
                              <ReceiptIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Void">
                            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleVoid(run); }}>
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {(run.status === "draft" || run.status === "voided") && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(run); }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ─── Run Detail Drawer ─────────────────────────────────────────────── */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedRun?.display_id || "Payroll Run"}
        subtitle={
          selectedRun
            ? `${toLocaleDateStringPHT(selectedRun.period_start)} — ${toLocaleDateStringPHT(selectedRun.period_end)}`
            : ""
        }
        loading={drawerLoading}
        width={600}
      >
        {drawerLoading ? (
          <Stack spacing={2}>
            {[1, 2, 3].map((i) => (
              <Box key={i}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
                <Skeleton width="80%" height={60} />
              </Box>
            ))}
          </Stack>
        ) : selectedRun ? (
          <Stack spacing={3}>
            {/* Run Summary */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Chip
                  size="small"
                  label={selectedRun.status}
                  color={STATUS_COLORS[selectedRun.status]}
                  sx={{ textTransform: "capitalize", fontWeight: 600 }}
                />
                {selectedRun.pay_date && (
                  <Typography variant="caption" color="text.secondary">
                    Pay Date: {toLocaleDateStringPHT(selectedRun.pay_date)}
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" spacing={3} sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Staff</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{selectedRun.totals?.staffCount || 0}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Hours</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{toHours(selectedRun.totals?.totalMinutes || 0)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Gross</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{fmtCurrency(selectedRun.totals?.gross || 0)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Net</Typography>
                  <Typography variant="subtitle2" fontWeight={700} color="success.main">{fmtCurrency(selectedRun.totals?.net || 0)}</Typography>
                </Box>
              </Stack>
              {selectedRun.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                  {selectedRun.notes}
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Per-Staff Lines */}
            <Typography variant="subtitle2" fontWeight={700} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PersonIcon fontSize="small" color="primary" /> Staff Breakdown
            </Typography>

            {selectedLines.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No line items found.</Typography>
            ) : (
              selectedLines.map((line) => (
                <Paper
                  key={line.id}
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 1.5 }}
                >
                  {/* Staff header */}
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {line.staff_name || "Unknown"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtCurrency(line.rate)}/hr · {toHours(line.total_minutes)} hrs
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" fontWeight={700} color="success.main">
                      {fmtCurrency(line.net)}
                    </Typography>
                  </Stack>

                  {/* Pay breakdown */}
                  <Table size="small" sx={{ "& td, & th": { py: 0.5, px: 1, fontSize: "0.75rem", border: 0 } }}>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ color: "text.secondary" }}>Gross</TableCell>
                        <TableCell align="right">{fmtCurrency(line.gross)}</TableCell>
                      </TableRow>
                      {Number(line.total_deductions) > 0 && (
                        <TableRow>
                          <TableCell sx={{ color: "text.secondary" }}>Deductions</TableCell>
                          <TableCell align="right" sx={{ color: "text.primary" }}>{fmtCurrency(line.total_deductions)}</TableCell>
                        </TableRow>
                      )}
                      {Number(line.total_additions) > 0 && (
                        <TableRow>
                          <TableCell sx={{ color: "text.secondary" }}>Additions</TableCell>
                          <TableCell align="right" sx={{ color: "text.primary" }}>{fmtCurrency(line.total_additions)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  {/* Deduction detail */}
                  {line.deductions?.length > 0 && (
                    <Box sx={{ mt: 1, pl: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Deduction Detail
                      </Typography>
                      {line.deductions.map((d, i) => (
                        <Stack key={i} direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {d.type.charAt(0).toUpperCase() + d.type.slice(1)} - {d.label}
                          </Typography>
                          <Typography variant="caption" color="text.primary">{fmtCurrency(d.amount)}</Typography>
                        </Stack>
                      ))}
                    </Box>
                  )}

                  {/* Addition detail */}
                  {line.additions?.length > 0 && (
                    <Box sx={{ mt: 1, pl: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Addition Detail
                      </Typography>
                      {line.additions.map((a, i) => (
                        <Stack key={i} direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {a.type.charAt(0).toUpperCase() + a.type.slice(1)} - {a.label}
                          </Typography>
                          <Typography variant="caption" color="text.primary">{fmtCurrency(a.amount)}</Typography>
                        </Stack>
                      ))}
                    </Box>
                  )}

                  {/* Shifts */}
                  {line.shifts?.length > 0 && (
                    <Box sx={{ mt: 1, pl: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
                        Shifts ({line.shifts.length})
                      </Typography>
                      {line.shifts.map((s, i) => (
                        <Stack key={i} direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: "65%" }}>
                            {toLocaleDateStringPHT(s.override_start || s.original_start)}
                            {s.excluded && <Chip size="small" label="Excluded" sx={{ ml: 0.5, height: 16, fontSize: "0.6rem" }} />}
                          </Typography>
                          <Typography variant="caption">{toHours(s.minutes_used)} hrs</Typography>
                        </Stack>
                      ))}
                    </Box>
                  )}
                </Paper>
              ))
            )}

            {/* Run Totals Footer */}
            {selectedLines.length > 0 && (
              <>
                <Divider />
                <Paper sx={{ p: 2, borderRadius: 1.5, bgcolor: alpha(theme.palette.success.main, 0.05), border: "1px solid", borderColor: alpha(theme.palette.success.main, 0.2) }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" fontWeight={700}>Total Net Pay</Typography>
                    <Typography variant="h6" fontWeight={700} color="success.main">
                      {fmtCurrency(selectedRun.totals?.net || 0)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Gross: {fmtCurrency(selectedRun.totals?.gross || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Deductions: {fmtCurrency(selectedRun.totals?.deductions || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Additions: {fmtCurrency(selectedRun.totals?.additions || 0)}
                    </Typography>
                  </Stack>
                </Paper>
              </>
            )}
          </Stack>
        ) : null}
      </DetailDrawer>
    </Box>
  );
}
