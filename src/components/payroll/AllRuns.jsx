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
import { db } from "../../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  cap,
  peso,
  toHours,
  toLocaleDateStringPHT,
} from "../../utils/payrollHelpers";
import ConfirmationReasonDialog from "../ConfirmationReasonDialog";
import DetailDrawer from "../common/DetailDrawer";
import PaystubDialog from "../Paystub";

export default function AllRuns({ showSnackbar }) {
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
    const unsub = onSnapshot(
      query(collection(db, "payrollRuns"), orderBy("periodStart", "desc")),
      (snap) => setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // filter in memory
  const filtered = useMemo(() => {
    return runs.filter((r) => {
      const d = r.periodStart?.seconds
        ? new Date(r.periodStart.seconds * 1000)
        : null;
      const okDate =
        (!fromDate && !toDate) ||
        (d &&
          (!fromDate || d >= new Date(fromDate)) &&
          (!toDate || d <= new Date(toDate + "T23:59:59")));
      const okStatus = !statusFilter.length || statusFilter.includes(r.status);
      return okDate && okStatus;
    });
  }, [runs, fromDate, toDate, statusFilter]);

  // open run in DetailDrawer and load its lines
  const openRunDrawer = async (run) => {
    setRunDrawer({ open: true, run, lines: null, loading: true });
    try {
      const linesSnap = await getDocs(collection(db, "payrollRuns", run.id, "lines"));
      const lines = linesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.staffName || "").localeCompare(b.staffName || ""));
      setRunDrawer((prev) => ({ ...prev, lines, loading: false }));
    } catch (err) {
      console.error(err);
      setRunDrawer((prev) => ({ ...prev, loading: false }));
      showSnackbar?.("Failed to load run details.", "error");
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
          const txSnap = await getDocs(
            query(
              collection(db, "transactions"),
              where("payrollRunId", "==", r.id),
              where("voided", "==", false)
            )
          );
          const batch = writeBatch(db);
          txSnap.docs.forEach((t) => batch.update(t.ref, { voided: true }));
          batch.update(doc(db, "payrollRuns", r.id), {
            status: "voided",
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
          showSnackbar?.("Run voided.", "success");
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
          const linesSnap = await getDocs(
            collection(db, "payrollRuns", r.id, "lines")
          );
          for (const l of linesSnap.docs) {
            const overSnap = await getDocs(
              collection(db, "payrollRuns", r.id, "lines", l.id, "shifts")
            );
            overSnap.forEach((o) => deleteDoc(o.ref));
            await deleteDoc(l.ref);
          }
          const stubsSnap = await getDocs(
            collection(db, "payrollRuns", r.id, "paystubs")
          );
          stubsSnap.forEach((s) => deleteDoc(s.ref));
          await deleteDoc(doc(db, "payrollRuns", r.id));
          showSnackbar?.("Run deleted.", "success");
          // close drawer if the deleted run was open
          if (runDrawer.run?.id === r.id) closeRunDrawer();
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

  return (
    <>
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
                    {toLocaleDateStringPHT(r.periodStart)} –{" "}
                    {toLocaleDateStringPHT(r.periodEnd)}
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
                    {peso(r.totals?.gross || 0)}
                  </TableCell>
                  <TableCell align="right">
                    {peso(r.totals?.advances || 0)}
                  </TableCell>
                  <TableCell align="right">
                    {peso(r.totals?.shortages || 0)}
                  </TableCell>
                  <TableCell align="right">
                    <b>{peso(r.totals?.net || 0)}</b>
                  </TableCell>
                  <TableCell align="right">
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

      {/* ── Run Detail Drawer ──────────────────────────────────────────────── */}
      <DetailDrawer
        open={runDrawer.open}
        onClose={closeRunDrawer}
        title="Payroll Run Details"
        subtitle={
          drawerRun
            ? `${toLocaleDateStringPHT(drawerRun.periodStart)} – ${toLocaleDateStringPHT(drawerRun.periodEnd)}`
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
                  onClick={() => {
                    setPaystubDrawerRunId(drawerRun.id);
                  }}
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
                  {toLocaleDateStringPHT(drawerRun.payDate)}
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

            {/* Totals summary */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Totals</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Chip label={`Staff: ${drawerRun.totals?.staffCount || 0}`} size="small" />
                <Chip label={`Hours: ${toHours(drawerRun.totals?.minutes || 0)}`} size="small" />
                <Chip label={`Gross: ${peso(drawerRun.totals?.gross || 0)}`} size="small" />
                {(drawerRun.totals?.additions || 0) > 0 && (
                  <Chip
                    label={`Adds: ${peso(drawerRun.totals?.additions || 0)}`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
                <Chip label={`Adv: ${peso(drawerRun.totals?.advances || 0)}`} size="small" />
                <Chip label={`Short: ${peso(drawerRun.totals?.shortages || 0)}`} size="small" />
                <Chip
                  label={`NET: ${peso(drawerRun.totals?.net || 0)}`}
                  size="small"
                  color="primary"
                  variant="filled"
                />
              </Stack>
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

                        // Calculate net from adjustments
                        const adjustments = Array.isArray(line.adjustments) ? line.adjustments : [];
                        const deductionsTotal = adjustments
                          .filter((a) => a.type === "manual-deduction" || a.type === "extra-advance")
                          .reduce((s, a) => s + Number(a.amount || 0), 0);
                        const additionsTotal = adjustments
                          .filter((a) => a.type === "manual-addition")
                          .reduce((s, a) => s + Number(a.amount || 0), 0);

                        // net is stored on line doc via totals or must be computed
                        // We compute a best-effort net here; exact net is in the run's totals
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
                            <TableCell align="right">{peso(rate)}</TableCell>
                            <TableCell align="right">{peso(gross)}</TableCell>
                            <TableCell align="right"><b>{peso(net)}</b></TableCell>
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
