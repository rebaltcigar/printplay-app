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
  Collapse,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";

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

const toDatetimeLocal = (d) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(
    x.getHours()
  )}:${pad(x.getMinutes())}`;
};
const fromDatetimeLocal = (s) => new Date(s);

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

/* ---------- component ---------- */
export default function Transactions() {
  // Filters
  const [start, setStart] = useState(toDateInput(startOfMonth()));
  const [end, setEnd] = useState(toDateInput(endOfMonth()));
  const [staffEmail, setStaffEmail] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [showDeleted, setShowDeleted] = useState(true);
  const [onlyDeleted, setOnlyDeleted] = useState(false);
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [servicesFilter, setServicesFilter] = useState([]);

  // Option lists
  const [staffOptions, setStaffOptions] = useState([]); // [{email, name, id}]
  const [shiftOptions, setShiftOptions] = useState([]); // [{id, label}]
  const [serviceItems, setServiceItems] = useState([]);
  const [expenseServiceItems, setExpenseServiceItems] = useState([]); // State for expense sub-services

  // Data
  const [tx, setTx] = useState([]);
  const [liveMode, setLiveMode] = useState("month");
  const unsubRef = useRef(null);

  // Row selection (bulk)
  const [selectedIds, setSelectedIds] = useState([]);

  // Edit dialog (single row)
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editItem, setEditItem] = useState("");
  const [editExpenseType, setEditExpenseType] = useState("");
  const [editExpenseStaffName, setEditExpenseStaffName] = useState("");
  const [editExpenseStaffId, setEditExpenseStaffId] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [staffSelectOptions, setStaffSelectOptions] = useState([]);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  // Bulk date dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDT, setBulkDT] = useState(toDatetimeLocal(new Date()));

  // --- Mobile state (collapsibles) ---
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [datesOpen, setDatesOpen] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const datesRef = useRef(null);

  /* ---- Load staff ---- */
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
      setStaffSelectOptions(arr);
    });
    return () => unsub();
  }, []);

  /* ---- Load shifts ---- */
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

  /* ---- Load services ---- */
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "services"), orderBy("sortOrder")),
      (snap) => {
        const allServices = snap.docs.map((d) => d.data());

        // Populate the main "Item" dropdown with services that have no parent
        const parentList = allServices
          .filter((s) => !s.parentServiceId)
          .map((s) => s.serviceName);

        // Include special items that are not managed as services
        const specials = ["New Debt", "Paid Debt"];
        const merged = Array.from(new Set([...parentList, ...specials]));
        setServiceItems(merged);

        // Populate the "Expense Type" dropdown with children of the "Expenses" service
        const expenseList = allServices
          .filter((s) => s.parentServiceId === "9JlYs3n6k3bsebkLq7A9")
          .map((s) => s.serviceName);
        setExpenseServiceItems(expenseList);
      }
    );
    return () => unsub();
  }, []);

  /* ---- Live transactions stream ---- */
  const attachStream = (mode = liveMode) => {
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch {}
      unsubRef.current = null;
    }

    let qRef;
    if (mode === "all") {
      qRef = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
    } else {
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
      (snap) => setTx(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Transactions stream error:", err);
        setTx([]);
      }
    );
    unsubRef.current = unsub;
  };

  useEffect(() => {
    attachStream("month");
    setLiveMode("month");
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (liveMode !== "month") return;
    attachStream("month");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  /* ---- Client-side filtered rows ---- */
  const rows = useMemo(() => {
    let rows = tx.slice();
    if (staffEmail) rows = rows.filter((r) => (r.staffEmail || "") === staffEmail);
    if (shiftId) rows = rows.filter((r) => (r.shiftId || "") === shiftId);
    if (!showDeleted) rows = rows.filter((r) => r.isDeleted !== true);
    if (onlyDeleted) rows = rows.filter((r) => r.isDeleted === true);
    if (onlyEdited) rows = rows.filter((r) => r.isEdited === true);
    if (servicesFilter.length > 0) {
      const set = new Set(servicesFilter);
      rows = rows.filter((r) => set.has(r.item));
    }
    return rows;
  }, [tx, staffEmail, shiftId, showDeleted, onlyDeleted, onlyEdited, servicesFilter]);

  /* ---- Totals (visible set) ---- */
  const totals = useMemo(() => {
    let sales = 0,
      expenses = 0;
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
    // scroll back to the top of controls on mobile
    setTimeout(() => datesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  /* ---- Delete (soft, single) ---- */
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
      setSelectedIds((prev) => prev.filter((id) => id !== row.id));
    } catch (e) {
      console.error(e);
      alert("Failed to delete transaction.");
    }
  };

  /* ---- HARD DELETE (single) ---- */
  const hardDelete = async (row) => {
    const ok = window.confirm(
      "PERMANENTLY delete this transaction? This cannot be undone."
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "transactions", row.id));
      setSelectedIds((prev) => prev.filter((id) => id !== row.id));
    } catch (e) {
      console.error(e);
      alert("Hard delete failed. (Do you have permission?)");
    }
  };

  /* ---- Selection helpers ---- */
  const toggleSelect = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const selectAllVisible = () => setSelectedIds(rows.map((r) => r.id));
  const clearSelection = () => setSelectedIds([]);

  /* ---- Bulk date edit ---- */
  const openBulkDateDialog = () => {
    if (selectedIds.length === 1) {
      const r = rows.find((x) => x.id === selectedIds[0]);
      const d =
        r?.timestamp?.seconds
          ? new Date(r.timestamp.seconds * 1000)
          : r?.timestamp instanceof Date
          ? r.timestamp
          : new Date();
      setBulkDT(toDatetimeLocal(d));
    } else {
      setBulkDT(toDatetimeLocal(new Date()));
    }
    setBulkOpen(true);
  };

  const saveBulkDate = async () => {
    if (!selectedIds.length) return;
    const reason =
      window.prompt(
        "Reason for changing the date/time for the selected entries?"
      ) || "(bulk date edit)";
    const when = fromDatetimeLocal(bulkDT);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.update(doc(db, "transactions", id), {
          timestamp: when,
          isEdited: true,
          editedBy: auth.currentUser?.email || "admin",
          editReason: reason,
          lastUpdatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setBulkOpen(false);
      clearSelection();
    } catch (e) {
      console.error(e);
      alert("Failed to update dates.");
    }
  };

  /* ---- Bulk SOFT delete ---- */
  async function bulkSoftDelete() {
    if (!selectedIds.length) return;
    const reason = window.prompt(
      `Reason for deleting ${selectedIds.length} transaction(s)?`
    );
    if (!reason) return;
    if (
      !window.confirm(
        `Soft delete ${selectedIds.length} selected transaction(s)?`
      )
    )
      return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.update(doc(db, "transactions", id), {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: auth.currentUser?.email || "admin",
          deleteReason: reason,
        });
      });
      await batch.commit();
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      alert("Failed to delete selected transactions.");
    }
  }

  /* ---- Bulk HARD delete ---- */
  async function bulkHardDelete() {
    if (!selectedIds.length) return;
    const ok = window.confirm(
      `PERMANENTLY delete ${selectedIds.length} transaction(s)? This cannot be undone.`
    );
    if (!ok) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, "transactions", id)));
      await batch.commit();
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      alert("Hard delete failed. (Do you have permission?)");
    }
  }

  /* ---- Edit dialog helpers (single row) ---- */
  function openEdit(row) {
    setEditing(row);
    setEditItem(row.item || "");
    setEditExpenseType(row.expenseType || "");
    setEditExpenseStaffName(row.expenseStaffName || "");
    setEditExpenseStaffId(row.expenseStaffId || "");
    setEditQuantity(String(row.quantity ?? ""));
    setEditPrice(String(row.price ?? ""));
    setEditNotes(row.notes || "");
    let dt = new Date();
    if (row.timestamp?.seconds) dt = new Date(row.timestamp.seconds * 1000);
    else if (row.timestamp instanceof Date) dt = row.timestamp;
    setEditDate(toDateInput(dt));
    setEditTime(toTimeInput(dt));
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    if (editItem === "Expenses") {
      if (!editExpenseType) {
        alert("Select an expense type.");
        return;
      }
      if (
        (editExpenseType === "Salary" || editExpenseType === "Salary Advance") &&
        !editExpenseStaffId &&
        !editExpenseStaffName
      ) {
        alert("Choose a staff for Salary or Salary Advance.");
        return;
      }
    }
    const qty = Number(editQuantity || 0);
    const price = Number(editPrice || 0);
    const total = qty * price;

    let newTimestamp = null;
    if (editDate && editTime) {
      const [yyyy, mm, dd] = editDate.split("-").map(Number);
      const [HH, MM] = editTime.split(":").map(Number);
      newTimestamp = new Date(yyyy, (mm || 1) - 1, dd || 1, HH || 0, MM || 0, 0, 0);
    } else {
      if (editing.timestamp?.seconds)
        newTimestamp = new Date(editing.timestamp.seconds * 1000);
      else if (editing.timestamp instanceof Date)
        newTimestamp = editing.timestamp;
      else newTimestamp = new Date();
    }

    const update = {
      item: editItem,
      quantity: qty,
      price,
      total,
      notes: editNotes || "",
      timestamp: newTimestamp,
      isEdited: true,
      editedBy: auth.currentUser?.email || "admin",
      editReason:
        window.prompt("Reason for this edit?") || "(edited in Transactions view)",
      lastUpdatedAt: serverTimestamp(),
    };

    if (editItem === "Expenses") {
      update.expenseType = editExpenseType || null;
      const chosen = staffSelectOptions.find((s) => s.id === editExpenseStaffId);
      if (chosen) {
        update.expenseStaffId = chosen.id;
        update.expenseStaffName = chosen.name;
        update.expenseStaffEmail = chosen.email;
      } else if (editExpenseStaffName) {
        update.expenseStaffName = editExpenseStaffName;
      }
    } else {
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
  }

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
      {/* LEFT: Filters / Controls (WEB) */}
      <Card
        sx={{
          width: 240,
          p: 2,
          display: { xs: "none", sm: "flex" }, // unchanged web layout
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          {liveMode === "all" ? "All Time" : "Current Month"}
        </Typography>
        <Divider />

        {/* Date range */}
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
                All Transactions
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

        {/* Services multi-select */}
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
          label="Show Deleted"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={onlyDeleted}
              onChange={(e) => setOnlyDeleted(e.target.checked)}
            />
          }
          label="Only Deleted"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={onlyEdited}
              onChange={(e) => setOnlyEdited(e.target.checked)}
            />
          }
          label="Only Edited"
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

        {/* quick totals */}
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

      {/* RIGHT: Table (WEB) */}
      <Paper
        sx={{
          flex: 1,
          minWidth: 0,
          display: { xs: "none", sm: "flex" }, // unchanged on web
          flexDirection: "column",
        }}
      >
        {/* Bulk toolbar */}
        <Box
          sx={{ p: 2, pt: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            All Transactions
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {selectedIds.length > 0 && (
            <>
              <Typography variant="body2">{selectedIds.length} selected</Typography>
              <Button size="small" variant="outlined" onClick={openBulkDateDialog}>
                Edit Dates
              </Button>
              <Button size="small" variant="outlined" color="warning" onClick={bulkSoftDelete}>
                Soft Delete Selected
              </Button>
              <Button size="small" variant="contained" color="error" onClick={bulkHardDelete}>
                Hard Delete Selected
              </Button>
              <Button size="small" onClick={clearSelection}>
                Clear Selection
              </Button>
            </>
          )}
          {selectedIds.length === 0 && rows.length > 0 && (
            <Button size="small" onClick={selectAllVisible}>
              Select All Visible
            </Button>
          )}
          <Typography variant="body2" sx={{ opacity: 0.7, ml: "auto" }}>
            {rows.length.toLocaleString()} rows
          </Typography>
        </Box>

        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
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
                  <TableCell colSpan={20}>No transactions for the current filters.</TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.55 : 1 }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </TableCell>
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
                      <Tooltip title="Soft delete">
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
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* --------- MOBILE LAYOUT --------- */}
      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          flexDirection: "column",
          gap: 1.25,
          height: "100%",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          pb: "calc(env(safe-area-inset-bottom, 0) + 8px)",
        }}
      >
        {/* GROUP 1: Dates & Range */}
        <Card
          ref={datesRef}
          sx={{
            p: 1,
            overflow: "visible",
            position: "relative",
            mb: datesOpen ? 1.25 : 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {liveMode === "all" ? "All Time" : "Date Range"}
            </Typography>
            <IconButton size="small" onClick={() => setDatesOpen((v) => !v)}>
              {datesOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={datesOpen} unmountOnExit={false} timeout={250} sx={{ overflow: "visible" }}>
            <Box sx={{ pt: 1 }}>
              <Stack spacing={1.25} sx={{ opacity: liveMode === "all" ? 0.6 : 1 }}>
                <TextField
                  label="Start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={liveMode === "all"}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="End"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={liveMode === "all"}
                  fullWidth
                  size="small"
                />
                <Stack direction="row" spacing={1}>
                  {liveMode === "all" ? (
                    <Button
                      startIcon={<RefreshIcon />}
                      variant="outlined"
                      onClick={backToMonth}
                      fullWidth
                      size="small"
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
                      size="small"
                    >
                      All Transactions
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>
          </Collapse>
        </Card>

        {/* GROUP 2: Staff / Shift / Services */}
        <Card
          sx={{
            p: 1,
            overflow: "visible",
            position: "relative",
            mb: peopleOpen ? 1.25 : 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Staff • Shift • Services
            </Typography>
            <IconButton size="small" onClick={() => setPeopleOpen((v) => !v)}>
              {peopleOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={peopleOpen} unmountOnExit={false} timeout={250} sx={{ overflow: "visible" }}>
            <Stack spacing={1.25} sx={{ pt: 1 }}>
              <FormControl fullWidth size="small">
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

              <FormControl fullWidth size="small">
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

              <FormControl fullWidth size="small">
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
            </Stack>
          </Collapse>
        </Card>

        {/* GROUP 3: Other Controls */}
        <Card
          sx={{
            p: 1,
            overflow: "visible",
            position: "relative",
            mb: otherOpen ? 1.25 : 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Other Controls
            </Typography>
            <IconButton size="small" onClick={() => setOtherOpen((v) => !v)}>
              {otherOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={otherOpen} unmountOnExit={false} timeout={250} sx={{ overflow: "visible" }}>
            <Stack spacing={1} sx={{ pt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                    size="small"
                  />
                }
                label="Show Deleted"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={onlyDeleted}
                    onChange={(e) => setOnlyDeleted(e.target.checked)}
                    size="small"
                  />
                }
                label="Only Deleted"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={onlyEdited}
                    onChange={(e) => setOnlyEdited(e.target.checked)}
                    size="small"
                  />
                }
                label="Only Edited"
              />

              {/* Bulk actions */}
              {selectedIds.length > 0 ? (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={openBulkDateDialog} fullWidth>
                    Edit Dates
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={bulkSoftDelete}
                    fullWidth
                  >
                    Soft Delete
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    onClick={bulkHardDelete}
                    fullWidth
                  >
                    Hard Delete
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={selectAllVisible} fullWidth>
                    Select All Visible
                  </Button>
                  <Button size="small" onClick={clearSelection} fullWidth>
                    Clear Selection
                  </Button>
                </Stack>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  startIcon={<DownloadIcon />}
                  variant="outlined"
                  size="small"
                  onClick={exportCSV}
                  fullWidth
                >
                  Export CSV
                </Button>
                <Button variant="text" size="small" onClick={resetFilters} fullWidth>
                  Reset
                </Button>
              </Stack>

              {/* Visible totals */}
              <Box sx={{ display: "grid", gap: 0.5, mt: 0.5 }}>
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
            </Stack>
          </Collapse>
        </Card>

        {/* TABLE (mobile compact) */}
        <Paper
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 0,
          }}
        >
          <Box sx={{ p: 1, pt: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Transactions
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {rows.length.toLocaleString()} rows
            </Typography>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                "& th, & td": {
                  py: 0.5,
                  px: 0.75,
                  borderBottomWidth: 0.5,
                },
                "& thead th": {
                  fontSize: "0.72rem",
                  whiteSpace: "nowrap",
                },
                "& tbody td": {
                  fontSize: "0.82rem",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Time</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">⋯</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>No transactions for the current filters.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.55 : 1 }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {fmtDateTime(r.timestamp).split(",")[0] || ""}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          {fmtDateTime(r.timestamp).split(",")[1]?.trim() || ""}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                          <Typography variant="body2" fontWeight={600}>
                            {r.item}
                          </Typography>
                          {/* Flags */}
                          {r.isEdited && (
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                              • Edited
                            </Typography>
                          )}
                          {r.isDeleted && (
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                              • Deleted
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
                          {identifierText(r)}
                        </Typography>
                        {r.notes && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              maxWidth: 260,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              opacity: 0.8,
                            }}
                            title={r.notes}
                          >
                            {r.notes}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{currency(r.total)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(r)}>
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Soft delete">
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
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* EDIT DIALOG (single) */}
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
                    {expenseServiceItems.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {(editExpenseType === "Salary" || editExpenseType === "Salary Advance") && (
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

            {/* Date & Time editors */}
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

      {/* BULK DATE DIALOG */}
      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Date/Time for {selectedIds.length} selected</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date & Time"
              type="datetime-local"
              value={bulkDT}
              onChange={(e) => setBulkDT(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              This will mark all selected rows as edited, with your reason captured.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveBulkDate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}