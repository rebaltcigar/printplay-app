// src/views/DebtManagement.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Card,
  Typography,
  TextField,
  Button,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Stack,
  Chip,
  Tooltip,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import AdminDebtLookupDialog from "../components/AdminDebtLookupDialog";
import ConfirmationReasonDialog from "../components/ConfirmationReasonDialog";

function toDateOnlyString(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPeso(n) {
  const val = Number(n || 0);
  return `₱${val.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function monthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function monthEnd(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Props:
 * - user: { email }
 */
export default function DebtManagement({ user, showSnackbar }) {
  // Default: current month
  const [startDate, setStartDate] = useState(toDateOnlyString(monthStart(new Date())));
  const [endDate, setEndDate] = useState(toDateOnlyString(monthEnd(new Date())));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Debt dialog controls
  const [dlgOpen, setDlgOpen] = useState(false);
  const [presetCustomer, setPresetCustomer] = useState(null);
  const [selectToken, setSelectToken] = useState(0);

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  // Stream all debt transactions in date range (include deleted to show status)
  useEffect(() => {
    if (!startDate || !endDate) return;
    setLoading(true);

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const qTx = query(
      collection(db, "transactions"),
      // where("item", "in", ["New Debt", "Paid Debt"]), // REMOVED to allow capturing new invoiceStatus
      where("timestamp", ">=", start),
      where("timestamp", "<=", end),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(
      qTx,
      (snap) => {
        const fullList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Client-side filter for Debt-relevant items
        const debtItems = fullList.filter(t => {
          // 1. Legacy
          if (t.item === 'New Debt' || t.item === 'Paid Debt') return true;
          // 2. New Accrual
          if (t.invoiceStatus === 'UNPAID') return true;
          // 3. Payments (Future proofing - if we add a 'Payment' category later)
          return false;
        });
        setRows(debtItems);
        setLoading(false);
      },
      (err) => {
        console.error("DebtManagement stream error:", err);
        setRows([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [startDate, endDate]);

  // Aggregated balance per customer (ignores isDeleted entries)
  // Only include rows with balance >= 1
  const balances = useMemo(() => {
    const map = new Map(); // id => { name, newDebt, paid }
    rows.forEach((r) => {
      if (r.isDeleted) return;
      if (!r.customerId) return;
      const entry = map.get(r.customerId) || { name: r.customerName || "—", newDebt: 0, paid: 0 };

      // Legacy
      if (r.item === "New Debt") entry.newDebt += Number(r.total || 0);
      else if (r.item === "Paid Debt") entry.paid += Number(r.total || 0);

      // New Accrual (Unpaid Invoice)
      else if (r.invoiceStatus === 'UNPAID') {
        entry.newDebt += Number(r.total || 0);
      }

      map.set(r.customerId, entry);
    });
    return Array.from(map.entries())
      .map(([customerId, v]) => ({
        customerId,
        customerName: v.name,
        newDebt: v.newDebt,
        paid: v.paid,
        balance: v.newDebt - v.paid,
      }))
      .filter((b) => b.balance >= 1);
  }, [rows]);

  // Open dialog and preselect this customer
  const openCustomer = (row) => {
    if (!row.customerId) return;
    setPresetCustomer({ id: row.customerId, fullName: row.customerName || "" });
    setSelectToken((n) => n + 1);
    setDlgOpen(true);
  };

  // --- Row actions: SOFT/HARD delete ---
  const softDelete = async (row) => {
    setConfirmDialog({
      open: true,
      title: "Delete Debt Transaction",
      message: `Soft delete debt for ${row.customerName || "unknown"} (₱${Number(row.total || 0).toLocaleString()})?`,
      requireReason: true,
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", row.id), {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: user?.email || "admin",
            deleteReason: reason,
          });
          if (showSnackbar) showSnackbar("Debt transaction deleted (soft).", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to soft delete debt.", 'error');
        }
      }
    });
  };

  const hardDelete = async (row) => {
    setConfirmDialog({
      open: true,
      title: "PERMANENT Delete",
      message: "PERMANENTLY delete this debt transaction? This cannot be undone.",
      requireReason: false,
      confirmColor: "error",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "transactions", row.id));
          if (showSnackbar) showSnackbar("Debt transaction permanently deleted.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Hard delete failed.", 'error');
        }
      }
    });
  };

  // Build tbody rows as a single array (prevents stray text/whitespace nodes)
  const tableRows = useMemo(() => {
    if (rows.length === 0) {
      return [
        <TableRow key="empty">
          <TableCell colSpan={7}>No transactions in range.</TableCell>
        </TableRow>,
      ];
    }
    return rows.map((r) => {
      const dt =
        r.timestamp?.seconds
          ? new Date(r.timestamp.seconds * 1000)
          : r.timestamp instanceof Date
            ? r.timestamp
            : null;
      return (
        <TableRow
          key={r.id}
          hover
          sx={{ cursor: r.customerId ? "pointer" : "default", opacity: r.isDeleted ? 0.5 : 1 }}
          onClick={() => r.customerId && openCustomer(r)}
        >
          <TableCell>{dt ? dt.toLocaleString() : "—"}</TableCell>
          <TableCell>{r.customerName || "—"}</TableCell>
          <TableCell>{r.item}</TableCell>
          <TableCell align="right">{formatPeso(r.total)}</TableCell>
          <TableCell
            sx={{
              maxWidth: 280,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.notes || "—"}
          </TableCell>
          <TableCell>
            <Stack direction="row" spacing={1} alignItems="center">
              {r.isDeleted && <Chip size="small" color="error" label="deleted" />}
              {r.isEdited && <Chip size="small" variant="outlined" label="edited" />}
              {r.addedByAdmin && <Chip size="small" variant="outlined" label="admin" />}
            </Stack>
          </TableCell>
          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
            <Tooltip title={r.isDeleted ? "Already deleted" : "Soft delete"}>
              <span>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => softDelete(r)}
                  disabled={r.isDeleted}
                >
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Hard delete (permanent)">
              <IconButton size="small" color="error" onClick={() => hardDelete(r)}>
                <DeleteForeverIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </TableCell>
        </TableRow>
      );
    });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header / Filters */}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Debts (Admin)
          </Typography>
          <TextField
            type="date"
            label="Start"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            type="date"
            label="End"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <Button
            variant="contained"
            onClick={() => {
              setPresetCustomer(null);
              setDlgOpen(true);
            }}
          >
            Open Debt Manager
          </Button>
        </Stack>
      </Paper>

      {/* Content: two columns — Balances + Transactions */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 2fr" },
          gap: 2,
          minHeight: 0,
        }}
      >
        {/* Balances */}
        <Card sx={{ p: 2, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Balances (current selection)
          </Typography>
          <Divider sx={{ my: 1 }} />
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">New Debt</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {balances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>No balances in range.</TableCell>
                  </TableRow>
                ) : (
                  balances.map((b) => (
                    <TableRow
                      key={b.customerId}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() =>
                        openCustomer({ customerId: b.customerId, customerName: b.customerName })
                      }
                    >
                      <TableCell>{b.customerName || "—"}</TableCell>
                      <TableCell align="right">{formatPeso(b.newDebt)}</TableCell>
                      <TableCell align="right">{formatPeso(b.paid)}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: b.balance > 0 ? "error.main" : "success.main" }}
                      >
                        {formatPeso(b.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {/* Transactions list */}
        <Card sx={{ p: 2, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Debt Transactions {loading ? "…" : `(${rows.length})`}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date & Time</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Controls</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>{tableRows}</TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      {/* Admin debt dialog (full controls) */}
      <AdminDebtLookupDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        presetCustomer={presetCustomer}
        selectToken={selectToken}
        user={user}
        showSnackbar={showSnackbar}
      />

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