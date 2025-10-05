// src/components/Transactions.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Card,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Button,
  Stack,
  Divider,
  Checkbox,
  FormControlLabel,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ---------- helpers ---------- */
const startOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const toDateInput = (d) => {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toTimeInput = (d) => {
  const x = new Date(d);
  const HH = String(x.getHours()).padStart(2, "0");
  const MM = String(x.getMinutes()).padStart(2, "0");
  return `${HH}:${MM}`;
};

const fmtDateTime = (ts) => {
  if (!ts) return "";
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  if (ts instanceof Date) return ts.toLocaleString();
  return "";
};

const identifierText = (tx) => {
  if (tx.item === "Expenses") {
    const staffChunk = tx.expenseStaffName ? ` · ${tx.expenseStaffName}` : "";
    return `${tx.expenseType || ""}${staffChunk}`;
  }
  if (tx.customerName) return tx.customerName;
  return "—";
};

const currency = (n) => `₱${Number(n || 0).toFixed(2)}`;

/* Expense type policy for admin edit */
const EXPENSE_TYPES_ALL = [
  "Supplies",
  "Maintenance",
  "Utilities",
  "Rent",
  "Internet",
  "Salary",
  "Salary Advance",
  "Misc",
];

/* ---------- component ---------- */
export default function Transactions() {
  // Filters
  const [start, setStart] = useState(toDateInput(startOfMonth()));
  const [end, setEnd] = useState(toDateInput(endOfMonth()));
  const [staffEmail, setStaffEmail] = useState(""); // "" = all
  const [shiftId, setShiftId] = useState(""); // "" = all
  const [showDeleted, setShowDeleted] = useState(true);
  const [onlyDeleted, setOnlyDeleted] = useState(false);
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [servicesFilter, setServicesFilter] = useState([]); // multi-select

  // Option lists
  const [staffOptions, setStaffOptions] = useState([]); // [{email, name, id}]
  const [shiftOptions, setShiftOptions] = useState([]); // [{id, label}]
  const [serviceItems, setServiceItems] = useState([]); // services for filter and editor

  // Data
  const [tx, setTx] = useState([]);
  const [liveMode, setLiveMode] = useState("month"); // "month" | "all"
  const unsubRef = useRef(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editItem, setEditItem] = useState("");
  const [editExpenseType, setEditExpenseType] = useState("");
  const [editExpenseStaffName, setEditExpenseStaffName] = useState(""); // display only
  const [editExpenseStaffId, setEditExpenseStaffId] = useState(""); // if you want to change it
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [staffSelectOptions, setStaffSelectOptions] = useState([]); // for salary edits
  const [editDate, setEditDate] = useState(""); // NEW
  const [editTime, setEditTime] = useState(""); // NEW

  /* ---- Load staff for filter ---- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const arr = snap.docs
        .map((d) => {
          const v = d.data() || {};
          return {
            email: v.email || "",
            name: v.fullName || v.name || v.displayName || v.email || "",
            id: d.id,
          };
        })
        .filter((u) => u.email);
      arr.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "en", { sensitivity: "base" })
      );
      setStaffOptions(arr);
      setStaffSelectOptions(arr); // reuse for editor salary field
    });
    return () => unsub();
  }, []);

  /* ---- Load shifts for filter (recent first) ---- */
  useEffect(() => {
    const qRef = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const arr = snap.docs.map((d) => {
        const v = d.data() || {};
        const label = [
          v.shiftPeriod || "",
          v.staffEmail || "",
          v.startTime?.seconds
            ? new Date(v.startTime.seconds * 1000).toLocaleDateString()
            : "",
        ]
          .filter(Boolean)
          .join(" • ");
        return { id: d.id, label };
      });
      setShiftOptions(arr);
    });
    return () => unsub();
  }, []);

  /* ---- services list for filters & editor ---- */
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "services"), orderBy("sortOrder")),
      (snap) => {
        const list = snap.docs.map((d) => d.data().serviceName);
        // Also ensure special items exist if you use them
        const specials = ["Expenses", "New Debt", "Paid Debt"];
        const merged = Array.from(new Set([...list, ...specials]));
        setServiceItems(merged);
      }
    );
    return () => unsub();
  }, []);

  /* ---- Live transactions stream (current month by default) ---- */
  const attachStream = (mode = liveMode) => {
    // Clean previous
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch (_) {}
      unsubRef.current = null;
    }

    let qRef;
    if (mode === "all") {
      // All transactions ever (caution: large collections)
      qRef = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
    } else {
      // Month/default (date range only to keep indexes simple)
      const s = new Date(start);
      s.setHours(0, 0, 0, 0);
      const e = new Date(end);
      e.setHours(23, 59, 59, 999);

      qRef = query(
        collection(db, "transactions"),
        where("timestamp", ">=", s),
        where("timestamp", "<=", e),
        orderBy("timestamp", "desc")
      );
    }

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setTx(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Transactions stream error:", err);
        setTx([]);
      }
    );
    unsubRef.current = unsub;
  };

  // initial stream + when switching modes
  useEffect(() => {
    attachStream("month");
    setLiveMode("month");
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-attach when date range changes in month mode
  useEffect(() => {
    if (liveMode !== "month") return;
    attachStream("month");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  /* ---- Client-side filtered rows ---- */
  const rows = useMemo(() => {
    let rows = tx.slice();

    if (staffEmail) {
      rows = rows.filter((r) => (r.staffEmail || "") === staffEmail);
    }
    if (shiftId) {
      rows = rows.filter((r) => (r.shiftId || "") === shiftId);
    }
    if (!showDeleted) {
      rows = rows.filter((r) => r.isDeleted !== true);
    }
    if (onlyDeleted) {
      rows = rows.filter((r) => r.isDeleted === true);
    }
    if (onlyEdited) {
      rows = rows.filter((r) => r.isEdited === true);
    }
    if (servicesFilter.length > 0) {
      const set = new Set(servicesFilter);
      rows = rows.filter((r) => set.has(r.item));
    }

    return rows;
  }, [tx, staffEmail, shiftId, showDeleted, onlyDeleted, onlyEdited, servicesFilter]);

  /* ---- Totals (visible set) ---- */
  const totals = useMemo(() => {
    let sales = 0;
    let expenses = 0;
    rows.forEach((r) => {
      const amt = Number(r.total || 0);
      if (r.item === "Expenses" || r.item === "New Debt") expenses += amt;
      else sales += amt;
    });
    return { sales, expenses, net: sales - expenses };
  }, [rows]);

  /* ---- Actions ---- */
  const exportCSV = () => {
    const headers = [
      "Timestamp",
      "Item",
      "Qty",
      "Price",
      "Total",
      "Identifier",
      "Notes",
      "Staff Email",
      "Shift ID",
      "Added By Admin",
      "Source",
      "Is Deleted",
      "Deleted By",
      "Delete Reason",
      "Edited",
      "Edited By",
      "Edit Reason",
      "Last Updated At",
    ];
    const lines = [headers.join(",")];

    rows.forEach((r) => {
      const line = [
        `"${fmtDateTime(r.timestamp).replace(/"/g, '""')}"`,
        `"${String(r.item || "").replace(/"/g, '""')}"`,
        r.quantity ?? "",
        r.price ?? "",
        r.total ?? "",
        `"${String(identifierText(r)).replace(/"/g, '""')}"`,
        `"${String(r.notes || "").replace(/"/g, '""')}"`,
        r.staffEmail || "",
        r.shiftId || "",
        r.addedByAdmin ? "true" : "false",
        r.source || "",
        r.isDeleted ? "true" : "false",
        r.deletedBy || "",
        `"${String(r.deleteReason || "").replace(/"/g, '""')}"`,
        r.isEdited ? "true" : "false",
        r.editedBy || "",
        `"${String(r.editReason || "").replace(/"/g, '""')}"`,
        `"${fmtDateTime(r.lastUpdatedAt).replace(/"/g, '""')}"`,
      ];
      lines.push(line.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${liveMode === "all" ? "ALL" : `${start}_to_${end}`}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadAll = () => {
    setLiveMode("all");
    attachStream("all");
  };

  const backToMonth = () => {
    setLiveMode("month");
    attachStream("month");
  };

  const resetFilters = () => {
    setStart(toDateInput(startOfMonth()));
    setEnd(toDateInput(endOfMonth()));
    setStaffEmail("");
    setShiftId("");
    setShowDeleted(true);
    setOnlyDeleted(false);
    setOnlyEdited(false);
    setServicesFilter([]);
    if (liveMode !== "month") {
      setLiveMode("month");
      attachStream("month");
    }
  };

  /* ---- Delete (soft) ---- */
  const softDelete = async (row) => {
    const reason = window.prompt("Reason for deleting this transaction?");
    if (!reason) return;
    try {
      await updateDoc(doc(db, "transactions", row.id), {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: auth.currentUser?.email || "admin",
        deleteReason: reason,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to delete transaction.");
    }
  };

  /* ---- Edit dialog helpers ---- */
  const openEdit = (row) => {
    setEditing(row);
    setEditItem(row.item || "");
    setEditExpenseType(row.expenseType || "");
    setEditExpenseStaffName(row.expenseStaffName || "");
    setEditExpenseStaffId(row.expenseStaffId || "");
    setEditQuantity(String(row.quantity ?? ""));
    setEditPrice(String(row.price ?? ""));
    setEditNotes(row.notes || "");

    // Populate date/time from timestamp
    let dt = new Date();
    if (row.timestamp?.seconds) dt = new Date(row.timestamp.seconds * 1000);
    else if (row.timestamp instanceof Date) dt = row.timestamp;
    setEditDate(toDateInput(dt));
    setEditTime(toTimeInput(dt));

    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;

    // If editing an expense, ensure type; if Salary/Advance ensure staff
    if (editItem === "Expenses") {
      if (!editExpenseType) return alert("Select an expense type.");
      if (
        (editExpenseType === "Salary" || editExpenseType === "Salary Advance") &&
        !editExpenseStaffId &&
        !editExpenseStaffName
      ) {
        return alert("Choose a staff for Salary or Salary Advance.");
      }
    }

    const qty = Number(editQuantity || 0);
    const price = Number(editPrice || 0);
    const total = qty * price;

    // Build new timestamp from editDate + editTime (local time)
    let newTimestamp = null;
    if (editDate && editTime) {
      const [yyyy, mm, dd] = editDate.split("-").map(Number);
      const [HH, MM] = editTime.split(":").map(Number);
      newTimestamp = new Date(yyyy, (mm || 1) - 1, dd || 1, HH || 0, MM || 0, 0, 0);
    } else {
      // fallback to previous timestamp if either field is missing
      if (editing.timestamp?.seconds) newTimestamp = new Date(editing.timestamp.seconds * 1000);
      else if (editing.timestamp instanceof Date) newTimestamp = editing.timestamp;
      else newTimestamp = new Date();
    }

    const update = {
      item: editItem,
      quantity: qty,
      price: price,
      total,
      notes: editNotes || "",
      timestamp: newTimestamp, // <-- UPDATED DATE/TIME
      isEdited: true,
      editedBy: auth.currentUser?.email || "admin",
      editReason: window.prompt("Reason for this edit?") || "(edited in Transactions view)",
      lastUpdatedAt: serverTimestamp(),
    };

    if (editItem === "Expenses") {
      update.expenseType = editExpenseType || null;
      // If a staff was chosen from dropdown, store id/name/email; otherwise keep prior
      const chosen = staffSelectOptions.find((s) => s.id === editExpenseStaffId);
      if (chosen) {
        update.expenseStaffId = chosen.id;
        update.expenseStaffName = chosen.name;
        update.expenseStaffEmail = chosen.email;
      } else if (editExpenseStaffName) {
        // preserve name if provided but no id change
        update.expenseStaffName = editExpenseStaffName;
      }
    } else {
      // clear expense fields if not an expense
      update.expenseType = null;
      update.expenseStaffId = null;
      update.expenseStaffName = null;
      update.expenseStaffEmail = null;
    }

    try {
      await updateDoc(doc(db, "transactions", editing.id), update);
      closeEdit();
    } catch (e) {
      console.error(e);
      alert("Failed to save edit.");
    }
  };

  /* ---- VIEW ---- */
  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        p: 2,
        gap: 2,
        alignItems: "stretch",
      }}
    >
      {/* LEFT: Filters / Controls */}
      <Card sx={{ width: 360, p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Transactions — {liveMode === "all" ? "All Time" : "Current Month"}
        </Typography>
        <Divider />

        {/* Date range (active in month mode) */}
        <Stack spacing={1.5} sx={{ opacity: liveMode === "all" ? 0.5 : 1 }}>
          <TextField
            label="Start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={liveMode === "all"}
            fullWidth
          />
          <TextField
            label="End"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={liveMode === "all"}
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            {liveMode === "all" ? (
              <Button
                startIcon={<RefreshIcon />}
                variant="outlined"
                onClick={backToMonth}
                fullWidth
              >
                Back to Month
              </Button>
            ) : (
              <Button
                startIcon={<ClearAllIcon />}
                variant="outlined"
                color="warning"
                onClick={loadAll}
                fullWidth
              >
                All transactions (EVER)
              </Button>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {/* Staff filter */}
        <FormControl fullWidth>
          <InputLabel>Staff</InputLabel>
          <Select
            label="Staff"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
          >
            <MenuItem value="">All staff</MenuItem>
            {staffOptions.map((s) => (
              <MenuItem key={s.email} value={s.email}>
                {s.name} — {s.email}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Shift filter */}
        <FormControl fullWidth>
          <InputLabel>Shift</InputLabel>
          <Select
            label="Shift"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
          >
            <MenuItem value="">All shifts</MenuItem>
            {shiftOptions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Services multi-select (checkbox) */}
        <FormControl fullWidth>
          <InputLabel>Services</InputLabel>
          <Select
            multiple
            label="Services"
            value={servicesFilter}
            onChange={(e) => setServicesFilter(e.target.value)}
            renderValue={(selected) => selected.join(", ")}
          >
            {serviceItems.map((svc) => (
              <MenuItem key={svc} value={svc}>
                <Checkbox checked={servicesFilter.indexOf(svc) > -1} />
                {svc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Checkbox
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
          }
          label="Show deleted transactions"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={onlyDeleted}
              onChange={(e) => setOnlyDeleted(e.target.checked)}
            />
          }
          label="Only show deleted"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={onlyEdited}
              onChange={(e) => setOnlyEdited(e.target.checked)}
            />
          }
          label="Only show edited"
        />

        <Divider sx={{ my: 1 }} />

        <Stack spacing={1}>
          <Tooltip title="Export the visible list (after filters)">
            <Button startIcon={<DownloadIcon />} variant="outlined" onClick={exportCSV}>
              Export CSV
            </Button>
          </Tooltip>
          <Button variant="text" onClick={resetFilters}>
            Reset filters
          </Button>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* quick totals of visible rows */}
        <Box sx={{ display: "grid", gap: 0.5 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            Visible Totals
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography>Sales</Typography>
            <Typography>{currency(totals.sales)}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography>Expenses</Typography>
            <Typography>{currency(totals.expenses)}</Typography>
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="subtitle2">Net</Typography>
            <Typography variant="subtitle2">{currency(totals.net)}</Typography>
          </Box>
        </Box>
      </Card>

      {/* RIGHT: Table */}
      <Paper sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 2, pb: 1, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>All Transactions</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            {rows.length.toLocaleString()} rows
          </Typography>
        </Box>

        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Identifier (Type / Staff / Customer)</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>Staff Email</TableCell>
                <TableCell>Shift ID</TableCell>
                <TableCell align="center">Deleted</TableCell>
                <TableCell>Deleted By</TableCell>
                <TableCell>Delete Reason</TableCell>
                <TableCell align="center">Edited</TableCell>
                <TableCell>Edited By</TableCell>
                <TableCell>Edit Reason</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="center">Admin Added</TableCell>
                <TableCell align="right">Controls</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={19}>No transactions for the current filters.</TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.55 : 1 }}>
                    <TableCell>{fmtDateTime(r.timestamp)}</TableCell>
                    <TableCell>{r.item}</TableCell>
                    <TableCell align="right">{r.quantity}</TableCell>
                    <TableCell align="right">{currency(r.price)}</TableCell>
                    <TableCell align="right">{currency(r.total)}</TableCell>
                    <TableCell>{identifierText(r)}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 320,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.notes || ""}
                    </TableCell>
                    <TableCell>{r.staffEmail || ""}</TableCell>
                    <TableCell>{r.shiftId || ""}</TableCell>
                    <TableCell align="center">{r.isDeleted ? "Yes" : "No"}</TableCell>
                    <TableCell>{r.deletedBy || ""}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 220,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.deleteReason || ""}
                    </TableCell>
                    <TableCell align="center">{r.isEdited ? "Yes" : "No"}</TableCell>
                    <TableCell>{r.editedBy || ""}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 220,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.editReason || ""}
                    </TableCell>
                    <TableCell>{fmtDateTime(r.lastUpdatedAt)}</TableCell>
                    <TableCell>{r.source || ""}</TableCell>
                    <TableCell align="center">{r.addedByAdmin ? "Yes" : "No"}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(r)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete (soft)">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => softDelete(r)}
                          disabled={r.isDeleted}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="sm">
        <DialogTitle>Edit Transaction</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Item</InputLabel>
              <Select
                label="Item"
                value={editItem}
                onChange={(e) => setEditItem(e.target.value)}
              >
                {serviceItems.map((svc) => (
                  <MenuItem key={svc} value={svc}>
                    {svc}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {editItem === "Expenses" && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Expense Type</InputLabel>
                  <Select
                    label="Expense Type"
                    value={editExpenseType}
                    onChange={(e) => setEditExpenseType(e.target.value)}
                  >
                    {EXPENSE_TYPES_ALL.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {(editExpenseType === "Salary" ||
                  editExpenseType === "Salary Advance") && (
                  <FormControl fullWidth>
                    <InputLabel>Staff</InputLabel>
                    <Select
                      label="Staff"
                      value={editExpenseStaffId}
                      onChange={(e) => setEditExpenseStaffId(e.target.value)}
                    >
                      {staffSelectOptions.length === 0 ? (
                        <MenuItem value="" disabled>
                          No staff available
                        </MenuItem>
                      ) : (
                        staffSelectOptions.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.name} — {s.email}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                )}
              </>
            )}

            {/* NEW: Date & Time editors */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Time"
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            <TextField
              label="Quantity"
              type="number"
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
              fullWidth
            />
            <TextField
              label="Price"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              fullWidth
            />
            <TextField
              label="Notes"
              multiline
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
