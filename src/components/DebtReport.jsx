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
} from "@mui/material";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import AdminDebtLookupDialog from "../components/AdminDebtLookupDialog";

function toDateOnlyString(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
 *  - user: { email }
 */
export default function DebtManagement({ user }) {
  // Default: current month
  const [startDate, setStartDate] = useState(toDateOnlyString(monthStart(new Date())));
  const [endDate, setEndDate] = useState(toDateOnlyString(monthEnd(new Date())));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Debt dialog controls
  const [dlgOpen, setDlgOpen] = useState(false);
  const [presetCustomer, setPresetCustomer] = useState(null);
  const [selectToken, setSelectToken] = useState(0);

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
      where("item", "in", ["New Debt", "Paid Debt"]),
      where("timestamp", ">=", start),
      where("timestamp", "<=", end),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(
      qTx,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(data);
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
  const balances = useMemo(() => {
    const map = new Map(); // id => { name, newDebt, paid }
    rows.forEach((r) => {
      if (r.isDeleted) return; // don't include deleted in balances
      if (!r.customerId) return;
      const entry = map.get(r.customerId) || { name: r.customerName || "—", newDebt: 0, paid: 0 };
      if (r.item === "New Debt") entry.newDebt += Number(r.total || 0);
      if (r.item === "Paid Debt") entry.paid += Number(r.total || 0);
      map.set(r.customerId, entry);
    });
    return Array.from(map.entries()).map(([customerId, v]) => ({
      customerId,
      customerName: v.name,
      newDebt: v.newDebt,
      paid: v.paid,
      balance: v.newDebt - v.paid,
    }));
  }, [rows]);

  // Click: open dialog and preselect this customer
  const openCustomer = (row) => {
    if (!row.customerId) return;
    setPresetCustomer({ id: row.customerId, fullName: row.customerName || "" });
    setSelectToken((n) => n + 1); // force re-select inside dialog
    setDlgOpen(true);
  };

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
          <Button variant="contained" onClick={() => { setPresetCustomer(null); setDlgOpen(true); }}>
            Open Debt Manager
          </Button>
        </Stack>
      </Paper>

      {/* Content: two columns — Balances + Transactions */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 2fr" }, gap: 2, minHeight: 0 }}>
        {/* Balances */}
        <Card sx={{ p: 2, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Typography variant="subtitle1" fontWeight={600}>Balances (current selection)</Typography>
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
                {balances.length === 0 && (
                  <TableRow><TableCell colSpan={4}>No balances in range.</TableCell></TableRow>
                )}
                {balances.map((b) => (
                  <TableRow
                    key={b.customerId}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => openCustomer({ customerId: b.customerId, customerName: b.customerName })}
                  >
                    <TableCell>{b.customerName || "—"}</TableCell>
                    <TableCell align="right">₱{b.newDebt.toFixed(2)}</TableCell>
                    <TableCell align="right">₱{b.paid.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: b.balance > 0 ? "error.main" : "success.main" }}>
                      ₱{b.balance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
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
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={6}>No transactions in range.</TableCell></TableRow>
                )}
                {rows.map((r) => {
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
                      <TableCell align="right">₱{Number(r.total || 0).toFixed(2)}</TableCell>
                      <TableCell sx={{ maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {r.isDeleted && <Chip size="small" color="error" label="deleted" />}
                          {r.isEdited && <Chip size="small" variant="outlined" label="edited" />}
                          {r.addedByAdmin && <Chip size="small" variant="outlined" label="admin" />}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
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
      />
    </Box>
  );
}
