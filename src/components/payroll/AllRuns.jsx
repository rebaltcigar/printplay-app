// src/components/payroll/AllRuns.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Checkbox,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Select, // 👈 this was missing
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

export default function AllRuns({ onOpenRunInModal, onOpenPaystubs, showSnackbar }) {
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
          showSnackbar?.("Run voided.", 'success');
        }
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
          showSnackbar?.("Run deleted.", 'success');
        }
      });
    }
  };

  const STATUSES = ["draft", "approved", "posted", "voided"];

  return (
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
                <TableCell>{cap(r.status)}</TableCell>
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
                  <Tooltip title="Open Run Modal">
                    <IconButton
                      onClick={() => onOpenRunInModal && onOpenRunInModal(r.id)}
                    >
                      <VisibilityIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Paystubs">
                    <IconButton
                      onClick={() => onOpenPaystubs && onOpenPaystubs(r.id)}
                    >
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
        onClose={() => setConfirmDialog(p => ({ ...p, open: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        onConfirm={confirmDialog.onConfirm}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Card>
  );
}
