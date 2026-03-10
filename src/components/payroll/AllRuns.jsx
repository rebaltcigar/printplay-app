// src/components/payroll/AllRuns.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PeopleIcon from "@mui/icons-material/People";
import ScheduleIcon from "@mui/icons-material/Schedule";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { supabase } from "../../supabase";
import {
  toHours,
} from "../../utils/payrollHelpers";
import { fmtDate, fmtCurrency } from "../../utils/formatters";
import ConfirmationReasonDialog from "../ConfirmationReasonDialog";
import DetailDrawer from "../common/DetailDrawer";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import PaystubDialog from "../Paystub";

export default function AllRuns({ onEditRun }) {
  const { showSnackbar } = useGlobalUI();
  const [runs, setRuns] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState([
    "draft",
    "approved",
    "posted",
    "voided",
  ]);

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  // DetailDrawer state for run view
  const [runDrawer, setRunDrawer] = useState({ open: false, run: null, lines: null, loading: false });

  // Paystub drawer state
  const [paystubDrawerRunId, setPaystubDrawerRunId] = useState(null);

  // load runs
  useEffect(() => {
    const fetchRuns = async () => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .order('period_start', { ascending: false });

      if (data) {
        setRuns(data.map(r => ({
          ...r,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          payDate: r.pay_date,
          expenseMode: r.expense_mode,
          updatedAt: r.updated_at
        })));
      }
      if (error) console.error("Error fetching payroll runs:", error);
    };

    fetchRuns();

    const channel = supabase.channel('public:payroll_runs:AllRuns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_runs' }, fetchRuns)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // filter in memory
  const filtered = useMemo(() => {
    return runs.filter((r) => {
      const d = r.periodStart ? new Date(r.periodStart) : null;
      const okDate =
        (!fromDate && !toDate) ||
        (d &&
          (!fromDate || d >= new Date(fromDate)) &&
          (!toDate || d <= new Date(toDate + "T23:59:59")));
      const okStatus = !statusFilter.length || statusFilter.includes(r.status);
      return okDate && okStatus;
    });
  }, [runs, fromDate, toDate, statusFilter]);

  // summary card data computed from filtered runs
  const summaryCards = useMemo(() => {
    const totalNet = filtered
      .filter((r) => r.status === "posted")
      .reduce((s, r) => s + Number(r.totals?.net || 0), 0);
    const posted = filtered.filter((r) => r.status === "posted").length;
    const pending = filtered.filter((r) => r.status === "draft" || r.status === "approved").length;
    return [
      {
        label: "Total Runs",
        value: String(filtered.length),
        sub: "in current filter",
        icon: <ScheduleIcon fontSize="small" />,
        color: "info.main",
      },
      {
        label: "Posted",
        value: String(posted),
        color: "success.main",
        icon: <CheckCircleOutlineIcon fontSize="small" />,
        highlight: true,
      },
      {
        label: "Draft / Approved",
        value: String(pending),
        color: pending > 0 ? "warning.main" : "text.secondary",
        icon: <PeopleIcon fontSize="small" />,
      },
      {
        label: "Total Net Paid",
        value: fmtCurrency(totalNet),
        sub: "posted runs only",
        color: "primary.main",
        icon: <AttachMoneyIcon fontSize="small" />,
        highlight: true,
      },
    ];

  }, [filtered]);

  // open run in DetailDrawer and load its lines
  const openRunDrawer = async (run) => {
    setRunDrawer({ open: true, run, lines: null, loading: true });
    try {
      const { data, error } = await supabase
        .from('payroll_lines')
        .select('*')
        .eq('run_id', run.id);

      if (data) {
        const lines = data
          .map((d) => ({
            ...d,
            staffName: d.staff_name,
            staffEmail: d.staff_email,
            staffUid: d.staff_uid
          }))
          .sort((a, b) => (a.staffName || "").localeCompare(b.staffName || ""));
        setRunDrawer((prev) => ({ ...prev, lines, loading: false }));
      }
      if (error) throw error;
    } catch (err) {
      console.error(err);
      setRunDrawer((prev) => ({ ...prev, loading: false }));
      showSnackbar("Failed to load run details.", "error");
    }
  };

  const closeRunDrawer = () => {
    setRunDrawer({ open: false, run: null, lines: null, loading: false });
  };

  // delete / void
  const onDelete = async (r) => {
    if (r.status === "posted") {
      setConfirmDialog({
        open: true,
        title: "Void Payroll Run",
        message: "This run is posted. Voiding will mark salary transactions voided and the run as voided. Continue?",
        requireReason: false,
        confirmColor: "primary",
        onConfirm: async () => {
          try {
            // Unlink transactions from this run instead of just marking "voided" in the old schema
            // If they are strictly Salary Advance expenses, we might want to soft-delete them or keep them.
            // For now, mirroring the "voided = true" logic in Supabase `expenses` table.
            const { data: txs, error: fetchErr } = await supabase
              .from('expenses')
              .select('id')
              .eq('payroll_run_id', r.id)
              .eq('voided', false);

            if (fetchErr) throw fetchErr;

            if (txs && txs.length > 0) {
              const { error: batchErr } = await supabase
                .from('expenses')
                .update({ voided: true })
                .in('id', txs.map(t => t.id));
              if (batchErr) throw batchErr;
            }

            const { error: updateErr } = await supabase
              .from('payroll_runs')
              .update({
                status: "voided",
                updated_at: new Date().toISOString()
              })
              .eq('id', r.id);

            if (updateErr) throw updateErr;

            showSnackbar("Run voided.", "success");
          } catch (e) {
            console.error(e);
            showSnackbar("Error voiding run.", "error");
          }
        },
      });
    } else {
      setConfirmDialog({
        open: true,
        title: "Delete Payroll Run",
        message: "Delete this run? This will remove the run and its lines/overrides/paystubs.",
        requireReason: false,
        confirmColor: "error",
        onConfirm: async () => {
          try {
            // Delete run (cascading deletes for lines, shifts, stubs handled by DB or explicit here)
            // Assuming DB has ON DELETE CASCADE or we do it manually.
            // Since our schema might rely on application-level integrity for some things, we'll do manual clean for safety.

            await Promise.all([
              supabase.from('payroll_lines').delete().eq('run_id', r.id),
              supabase.from('payroll_line_shifts').delete().eq('run_id', r.id),
              supabase.from('payroll_stubs').delete().eq('run_id', r.id),
              supabase.from('payroll_runs').delete().eq('id', r.id)
            ]);

            showSnackbar("Run deleted.", "success");
            if (runDrawer.run?.id === r.id) closeRunDrawer();
          } catch (e) {
            console.error(e);
            showSnackbar("Error deleting run.", "error");
          }
        },
      });
    }
  };

  const STATUSES = ["draft", "approved", "posted", "voided"];

  const statusColor = (s) => {
    if (s === "posted") return "success";
    if (s === "voided") return "error";
    if (s === "approved") return "info";
    return "default";
  };

  const drawerRun = runDrawer.run;

  // SummaryCards for the DetailDrawer totals section
  const drawerSummaryCards = useMemo(() => {
    if (!drawerRun) return [];
    const t = drawerRun.totals || {};
    return [
      { label: "Staff", value: String(t.staffCount || 0) },
      { label: "Hours", value: toHours(t.minutes || 0) },
      { label: "Gross", value: fmtCurrency(t.gross || 0) },
      ...(Number(t.additions || 0) > 0
        ? [{ label: "Additions", value: fmtCurrency(t.additions || 0), color: "success.main" }]
        : []),
      { label: "Advances", value: fmtCurrency(t.advances || 0) },
      { label: "Shortages", value: fmtCurrency(t.shortages || 0) },
      { label: "NET", value: fmtCurrency(t.net || 0), color: "primary.main", highlight: true },
    ];
  }, [drawerRun]);

  return (
    <>
      <Stack spacing={2}>
        {/* Summary cards */}
        <SummaryCards cards={summaryCards} loading={!runs.length && runs.length === 0 && filtered.length === 0} />

        <Card>
          {/* filters */}
          <Box
            sx={{
              p: 2,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(200px, 1fr))",
              gap: 2,
            }}
          >
            <TextField
              type="date"
              label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl>
              <InputLabel>Statuses</InputLabel>
              <Select
                multiple
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                input={<OutlinedInput label="Statuses" />}
                renderValue={(selected) => selected.map(cap).join(", ")}
              >
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    <Checkbox checked={statusFilter.includes(s)} />
                    <ListItemText primary={cap(s)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* table */}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Period</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Staff</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell align="right">Adv</TableCell>
                  <TableCell align="right">Short</TableCell>
                  <TableCell align="right">NET</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {fmtDate(r.periodStart)} –{" "}
                      {fmtDate(r.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cap(r.status)}
                        size="small"
                        color={statusColor(r.status)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {r.totals?.staffCount || 0}
                    </TableCell>
                    <TableCell align="right">
                      {toHours(r.totals?.minutes || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {fmtCurrency(r.totals?.gross || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {fmtCurrency(r.totals?.advances || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {fmtCurrency(r.totals?.shortages || 0)}
                    </TableCell>
                    <TableCell align="right">
                      <b>{fmtCurrency(r.totals?.net || 0)}</b>
                    </TableCell>
                    <TableCell align="right">
                      {(r.status === "draft" || r.status === "approved") && onEditRun && (
                        <Tooltip title="Edit Run">
                          <IconButton color="primary" onClick={() => onEditRun(r.id)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="View Run Details">
                        <IconButton onClick={() => openRunDrawer(r)}>
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Paystubs">
                        <IconButton onClick={() => setPaystubDrawerRunId(r.id)}>
                          <ReceiptLongIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={r.status === "posted" ? "Void" : "Delete"}>
                        <IconButton onClick={() => onDelete(r)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      align="center"
                      sx={{ py: 4, color: "text.secondary" }}
                    >
                      No runs match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <ConfirmationReasonDialog
            open={confirmDialog.open}
            onClose={() => setConfirmDialog((p) => ({ ...p, open: false }))}
            title={confirmDialog.title}
            message={confirmDialog.message}
            requireReason={confirmDialog.requireReason}
            onConfirm={confirmDialog.onConfirm}
            confirmText={confirmDialog.confirmText}
            confirmColor={confirmDialog.confirmColor}
          />
        </Card>
      </Stack>

      {/* ── Run Detail Drawer ──────────────────────────────────────────────── */}
      <DetailDrawer
        open={runDrawer.open}
        onClose={closeRunDrawer}
        title="Payroll Run Details"
        subtitle={
          drawerRun
            ? `${fmtDate(drawerRun.periodStart)} – ${fmtDate(drawerRun.periodEnd)}`
            : ""
        }
        width={600}
        loading={runDrawer.loading}
        actions={
          drawerRun ? (
            <>
              {drawerRun.status === "posted" && (
                <Button
                  variant="outlined"
                  startIcon={<ReceiptLongIcon />}
                  onClick={() => setPaystubDrawerRunId(drawerRun.id)}
                >
                  View Paystubs
                </Button>
              )}
              <Button
                variant="outlined"
                color={drawerRun.status === "posted" ? "warning" : "error"}
                startIcon={<DeleteIcon />}
                onClick={() => {
                  closeRunDrawer();
                  onDelete(drawerRun);
                }}
              >
                {drawerRun.status === "posted" ? "Void Run" : "Delete Run"}
              </Button>
            </>
          ) : null
        }
      >
        {drawerRun && (
          <Stack spacing={2}>
            {/* Run meta info */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="body2" color="text.secondary">Status:</Typography>
                <Chip
                  label={cap(drawerRun.status)}
                  size="small"
                  color={statusColor(drawerRun.status)}
                  variant="outlined"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Pay Date:{" "}
                <Typography component="span" variant="body2" color="text.primary">
                  {fmtDate(drawerRun.payDate)}
                </Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Expense Mode:{" "}
                <Typography component="span" variant="body2" color="text.primary">
                  {cap(drawerRun.expenseMode || "per-staff")}
                </Typography>
              </Typography>
            </Box>

            <Divider />

            {/* Totals as SummaryCards */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Totals</Typography>
              <SummaryCards cards={drawerSummaryCards} sx={{ gap: 1 }} />
            </Box>

            <Divider />

            {/* Staff lines */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Staff Breakdown</Typography>
              {runDrawer.loading ? (
                <Typography variant="body2" color="text.secondary">Loading lines...</Typography>
              ) : runDrawer.lines && runDrawer.lines.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Staff</TableCell>
                        <TableCell align="right">Hours</TableCell>
                        <TableCell align="right">Rate</TableCell>
                        <TableCell align="right">Gross</TableCell>
                        <TableCell align="right">NET</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {runDrawer.lines.map((line) => {
                        const minutes = Number(line.minutes || 0);
                        const rate = Number(line.rate || 0);
                        const gross = Number(line.gross || 0);
                        const adjustments = Array.isArray(line.adjustments) ? line.adjustments : [];
                        const deductionsTotal = adjustments
                          .filter((a) => a.type === "manual-deduction" || a.type === "extra-advance")
                          .reduce((s, a) => s + Number(a.amount || 0), 0);
                        const additionsTotal = adjustments
                          .filter((a) => a.type === "manual-addition")
                          .reduce((s, a) => s + Number(a.amount || 0), 0);
                        const net = Number(line.net != null ? line.net : (gross + additionsTotal - deductionsTotal).toFixed(2));

                        return (
                          <TableRow key={line.id}>
                            <TableCell>
                              <Typography variant="body2">{line.staffName}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {line.staffEmail}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{toHours(minutes)}</TableCell>
                            <TableCell align="right">{fmtCurrency(rate)}</TableCell>
                            <TableCell align="right">{fmtCurrency(gross)}</TableCell>
                            <TableCell align="right"><b>{fmtCurrency(net)}</b></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">No staff lines found for this run.</Typography>
              )}
            </Box>
          </Stack>
        )}
      </DetailDrawer>

      {/* ── Paystub Drawer ────────────────────────────────────────────────── */}
      <PaystubDialog
        open={!!paystubDrawerRunId}
        onClose={() => setPaystubDrawerRunId(null)}
        runId={paystubDrawerRunId}
      />
    </>
  );
}
