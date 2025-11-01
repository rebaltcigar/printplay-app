// src/components/ExpenseManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Paper,
  Stack,
  Divider,
  IconButton,
  Tooltip,
  Collapse,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
  CircularProgress,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const EXPENSE_TYPES_ALL = [
  "Supplies",
  "Maintenance",
  "Utilities",
  "Rent",
  "Salary",
  "Salary Advance",
  "Misc",
];

function toDateOnlyString(d) {
  if (!d) return "";
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDateTimeString(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toCurrency(n) {
  const val = Number(n || 0);
  return `₱${val.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export default function ExpenseManagement({ user }) {
  /** ===================== FORM STATE (LEFT) ===================== */
  const [formDate, setFormDate] = useState(toDateOnlyString(new Date()));
  const [formType, setFormType] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [formStaffName, setFormStaffName] = useState("");
  const [formStaffEmail, setFormStaffEmail] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  const [staffOptions, setStaffOptions] = useState([]);
  const [creditServices, setCreditServices] = useState([]);
  const dateInputRef = useRef(null);

  /** ===================== TABLE / FILTER STATE (RIGHT) ===================== */
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // base date filters (already had)
  const [filterStart, setFilterStart] = useState(
    toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 7)))
  );
  const [filterEnd, setFilterEnd] = useState(toDateOnlyString(new Date()));

  // NEW filters
  const [filterType, setFilterType] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterDeleted, setFilterDeleted] = useState("active"); // active | deleted | all

  /** ===================== MOBILE HELPERS ===================== */
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const fieldSize = isMobile ? "small" : "medium";
  const [controlsOpen, setControlsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const controlsRef = useRef(null);

  /** ===================== APP DIALOGS / LOADER ===================== */
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");

  const startBusy = (msg = "Working...") => {
    setBusy(true);
    setBusyMsg(msg);
  };
  const stopBusy = () => {
    setBusy(false);
    setBusyMsg("");
  };

  // info dialog (replaces alert)
  const [infoDialog, setInfoDialog] = useState({
    open: false,
    title: "",
    message: "",
  });
  const showInfo = (title, message) => setInfoDialog({ open: true, title, message });
  const closeInfo = () => setInfoDialog((p) => ({ ...p, open: false }));

  // reason dialogs
  const [editReasonDialog, setEditReasonDialog] = useState({
    open: false,
    reason: "",
    row: null,
  });
  const [deleteReasonDialog, setDeleteReasonDialog] = useState({
    open: false,
    reason: "",
    row: null,
  });
  const [permDeleteDialog, setPermDeleteDialog] = useState({
    open: false,
    row: null,
  });

  /** ===================== LOAD CREDIT SERVICES ===================== */
  useEffect(() => {
    const fetchCreditServices = async () => {
      try {
        const qServices = query(
          collection(db, "services"),
          where("category", "==", "Credit")
        );
        const snap = await getDocs(qServices);
        const servicesData = snap.docs.map((d) => {
          const data = d.data();
          return {
            serviceName: data.serviceName,
            price: data.price || 0,
          };
        });
        setCreditServices(servicesData);
      } catch (e) {
        console.warn("Failed to load credit services for expenses dropdown.", e);
      }
    };
    fetchCreditServices();
  }, []);

  const expenseTypes = useMemo(() => {
    const serviceNames = creditServices.map((s) => s.serviceName);
    const combined = [...new Set([...EXPENSE_TYPES_ALL, ...serviceNames])];
    combined.sort((a, b) => a.localeCompare(b));
    return combined;
  }, [creditServices]);

  /** ===================== LOAD STAFF OPTIONS ===================== */
  useEffect(() => {
    (async () => {
      try {
        const qUsers = query(collection(db, "users"), where("role", "==", "staff"));
        const snap = await getDocs(qUsers);
        const opts = snap.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              fullName:
                data.fullName || data.name || data.displayName || data.email || "Staff",
              email: data.email || "",
            };
          })
          .sort((a, b) =>
            (a.fullName || "").localeCompare(b.fullName || "", "en", {
              sensitivity: "base",
            })
          );
        setStaffOptions(opts);
      } catch (e) {
        console.warn("Failed to load staff for expenses", e);
      }
    })();
  }, []);

  /** ===================== LOAD EXPENSES (LISTENER) ===================== */
  useEffect(() => {
    setLoading(true);
    const start = new Date(filterStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filterEnd);
    end.setHours(23, 59, 59, 999);

    // keep ALL, don't filter deleted here — we want filterDeleted to control it
    let qTx = query(
      collection(db, "transactions"),
      where("item", "==", "Expenses"),
      where("timestamp", ">=", start),
      where("timestamp", "<=", end),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(
      qTx,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExpenses(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to listen expenses", err);
        setExpenses([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [filterStart, filterEnd]);

  /** ===================== DERIVED ROWS + FILTERS ===================== */
  const tableRows = useMemo(() => {
    return expenses.map((e) => {
      const tsDate = e.timestamp?.seconds
        ? new Date(e.timestamp.seconds * 1000)
        : new Date(e.timestamp);
      return {
        ...e,
        _dateOnly: toDateOnlyString(tsDate),
        _dateTime: toDateTimeString(tsDate),
        qty: Number(e.quantity || 0),
        price: Number(e.price || 0),
        total: Number(e.total || Number(e.quantity || 0) * Number(e.price || 0)),
      };
    });
  }, [expenses]);

  const filteredRows = useMemo(() => {
    let rows = tableRows;

    if (filterDeleted === "active") {
      rows = rows.filter((r) => !r.isDeleted);
    } else if (filterDeleted === "deleted") {
      rows = rows.filter((r) => r.isDeleted);
    }

    if (filterType) {
      rows = rows.filter((r) => (r.expenseType || "") === filterType);
    }

    if (filterStaff) {
      rows = rows.filter((r) => (r.expenseStaffId || "") === filterStaff);
    }

    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      rows = rows.filter((r) => {
        return (
          (r.notes || "").toLowerCase().includes(q) ||
          (r.expenseStaffName || "").toLowerCase().includes(q) ||
          (r.expenseType || "").toLowerCase().includes(q)
        );
      });
    }

    return rows;
  }, [tableRows, filterDeleted, filterType, filterStaff, filterText]);

  /** ===================== FORM HELPERS ===================== */
  const handleTypeChange = (event) => {
    const selectedType = event.target.value;
    setFormType(selectedType);

    const selectedService = creditServices.find(
      (s) => s.serviceName === selectedType
    );

    if (selectedService && selectedService.price > 0) {
      setFormPrice(String(selectedService.price));
      setFormQuantity("1");
    } else {
      setFormPrice("");
      setFormQuantity("");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Date", "Item", "Qty", "Price", "Total", "Type", "Staff", "Notes"];
    const lines = [headers.join(",")];

    filteredRows.forEach((r) => {
      const row = [
        r._dateTime,
        "Expenses",
        r.qty,
        r.price,
        r.total,
        r.expenseType || "",
        `"${String(r.expenseStaffName || "").replace(/"/g, '""')}"`,
        `"${String(r.notes || "").replace(/"/g, '""')}"`,
      ];
      lines.push(row.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${filterStart}_to_${filterEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** ===================== CRUD: ADD ===================== */
  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formType) {
      showInfo("Missing type", "Please select an expense type.");
      return;
    }
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      showInfo("Missing staff", "Please select a staff for Salary or Salary Advance.");
      return;
    }

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    const transactionDate = new Date(formDate);
    const now = new Date();
    transactionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const selectedStaff = staffOptions.find((s) => s.id === formStaffId) || null;

    const expenseDoc = {
      item: "Expenses",
      expenseType: formType,
      expenseStaffId: selectedStaff ? selectedStaff.id : null,
      expenseStaffName: selectedStaff ? selectedStaff.fullName : null,
      expenseStaffEmail: selectedStaff ? selectedStaff.email : null,
      quantity: qty,
      price,
      total,
      notes: formNotes || "",
      shiftId: null,
      source: "admin_manual",
      timestamp: transactionDate,
      staffEmail: user?.email || "admin",
      isDeleted: false,
      isEdited: false,
    };

    try {
      startBusy("Adding expense...");
      await addDoc(collection(db, "transactions"), expenseDoc);
      setFormType("");
      setFormStaffId("");
      setFormStaffName("");
      setFormStaffEmail("");
      setFormQuantity("");
      setFormPrice("");
      setFormNotes("");
      showInfo("Saved", "Expense has been added.");
    } catch (err) {
      console.error("Failed to add expense", err);
      showInfo("Error", "Failed to add expense.");
    } finally {
      stopBusy();
    }
  };

  /** ===================== CRUD: EDIT (OPEN FORM) ===================== */
  const startEdit = (row) => {
    setCurrentlyEditing(row);
    setFormDate(row._dateOnly);
    setFormType(row.expenseType || "");
    setFormStaffId(row.expenseStaffId || "");
    setFormStaffName(row.expenseStaffName || "");
    setFormStaffEmail(row.expenseStaffEmail || "");
    setFormQuantity(String(row.quantity ?? row.qty ?? ""));
    setFormPrice(String(row.price ?? ""));
    setFormNotes(row.notes || "");
    setTimeout(() => dateInputRef.current?.focus(), 60);

    if (isMobile) {
      if (!controlsOpen) setControlsOpen(true);
      setTimeout(() => {
        controlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  };

  const cancelEdit = () => {
    setCurrentlyEditing(null);
    setFormType("");
    setFormStaffId("");
    setFormStaffName("");
    setFormStaffEmail("");
    setFormQuantity("");
    setFormPrice("");
    setFormNotes("");
  };

  /** ===================== CRUD: EDIT (SAVE) ===================== */
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!currentlyEditing) return;

    if (!formType) {
      showInfo("Missing type", "Please select an expense type.");
      return;
    }
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      showInfo("Missing staff", "Please select a staff for Salary or Salary Advance.");
      return;
    }

    // open dialog to get reason
    setEditReasonDialog({
      open: true,
      reason: "",
      row: {
        ...currentlyEditing,
        _formData: {
          formDate,
          formType,
          formStaffId,
          formQuantity,
          formPrice,
          formNotes,
        },
      },
    });
  };

  const actuallySaveEdit = async () => {
    const dlg = editReasonDialog;
    const row = dlg.row;
    const reason = dlg.reason?.trim();
    if (!row || !reason) {
      showInfo("Reason required", "Please enter a reason for this edit.");
      return;
    }

    const { formDate, formType, formStaffId, formQuantity, formPrice, formNotes } =
      row._formData;

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    const transactionDate = new Date(formDate);
    const now = new Date();
    transactionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const selectedStaff = staffOptions.find((s) => s.id === formStaffId) || null;

    try {
      startBusy("Saving changes...");
      await updateDoc(doc(db, "transactions", row.id), {
        item: "Expenses",
        expenseType: formType,
        expenseStaffId: selectedStaff ? selectedStaff.id : null,
        expenseStaffName: selectedStaff ? selectedStaff.fullName : null,
        expenseStaffEmail: selectedStaff ? selectedStaff.email : null,
        quantity: qty,
        price,
        total,
        notes: formNotes || "",
        timestamp: transactionDate,
        isEdited: true,
        adminEdited: true,
        editedBy: user?.email || "admin",
        editReason: reason,
        lastUpdatedAt: serverTimestamp(),
      });

      setEditReasonDialog({ open: false, reason: "", row: null });
      cancelEdit();
      showInfo("Updated", "Expense has been updated.");
    } catch (err) {
      console.error("Failed to update expense", err);
      showInfo("Error", "Failed to update expense.");
    } finally {
      stopBusy();
    }
  };

  /** ===================== CRUD: SOFT DELETE ===================== */
  const handleSoftDelete = (row) => {
    setDeleteReasonDialog({
      open: true,
      reason: "",
      row,
    });
  };

  const actuallySoftDelete = async () => {
    const dlg = deleteReasonDialog;
    const row = dlg.row;
    const reason = dlg.reason?.trim();
    if (!row || !reason) {
      showInfo("Reason required", "Please enter a reason for deleting this expense.");
      return;
    }

    try {
      startBusy("Deleting (soft)...");
      await updateDoc(doc(db, "transactions", row.id), {
        isDeleted: true,
        deletedReason: reason,
        deletedBy: user?.email || "admin",
        deletedAt: serverTimestamp(),
      });
      setDeleteReasonDialog({ open: false, reason: "", row: null });
      showInfo("Deleted", "Expense has been marked as deleted.");
    } catch (err) {
      console.error("Failed to soft delete expense:", err);
      showInfo("Error", "Failed to delete expense. Please try again.");
    } finally {
      stopBusy();
    }
  };

  /** ===================== CRUD: PERMANENT DELETE ===================== */
  const handlePermanentDelete = (row) => {
    setPermDeleteDialog({ open: true, row });
  };

  const actuallyPermanentDelete = async () => {
    const row = permDeleteDialog.row;
    if (!row) {
      setPermDeleteDialog({ open: false, row: null });
      return;
    }
    try {
      startBusy("Permanently deleting...");
      await deleteDoc(doc(db, "transactions", row.id));
      setPermDeleteDialog({ open: false, row: null });
      showInfo("Deleted", "Expense has been permanently deleted.");
    } catch (err) {
      console.error("Failed to permanently delete expense:", err);
      showInfo("Error", "Failed to permanently delete expense. Please try again.");
    } finally {
      stopBusy();
    }
  };

  /** ===================== FORM CONTENT (REUSED) ===================== */
  const FormContent = (
    <Stack
      component="form"
      onSubmit={currentlyEditing ? handleSaveEdit : handleAddExpense}
      spacing={2}
    >
      <TextField
        inputRef={dateInputRef}
        type="date"
        label="Date"
        value={formDate}
        onChange={(e) => setFormDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        required
        fullWidth
        size={fieldSize}
      />

      <FormControl fullWidth required size={fieldSize}>
        <InputLabel>Expense Type</InputLabel>
        <Select label="Expense Type" value={formType} onChange={handleTypeChange}>
          {expenseTypes.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {(formType === "Salary" || formType === "Salary Advance") && (
        <FormControl fullWidth required size={fieldSize}>
          <InputLabel>Staff</InputLabel>
          <Select
            label="Staff"
            value={formStaffId}
            onChange={(e) => setFormStaffId(e.target.value)}
          >
            {staffOptions.length === 0 ? (
              <MenuItem value="" disabled>
                No staff available
              </MenuItem>
            ) : (
              staffOptions.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.fullName}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
      )}

      <TextField
        type="number"
        label="Quantity"
        value={formQuantity}
        onChange={(e) => setFormQuantity(e.target.value)}
        required
        fullWidth
        size={fieldSize}
      />
      <TextField
        type="number"
        label="Price"
        value={formPrice}
        onChange={(e) => setFormPrice(e.target.value)}
        required
        fullWidth
        size={fieldSize}
      />

      <TextField
        label="Notes (Optional)"
        multiline
        rows={3}
        value={formNotes}
        onChange={(e) => setFormNotes(e.target.value)}
        fullWidth
        size={fieldSize}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button type="submit" variant="contained" fullWidth size={fieldSize}>
          {currentlyEditing ? "Save Changes" : "Add Expense"}
        </Button>
        {currentlyEditing && (
          <Button
            variant="outlined"
            color="inherit"
            onClick={cancelEdit}
            fullWidth
            size={fieldSize}
          >
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );

  /** ===================== RENDER ===================== */
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        minHeight: 0,
      }}
    >
      {/* --- DESKTOP / WEB --- */}
      <Box
        sx={{
          display: { xs: "none", sm: "flex" },
          flex: 1,
          minHeight: 0,
          gap: 2,
          p: 2,
          width: "100%",
          alignItems: "stretch",
        }}
      >
        {/* LEFT CARD */}
        <Card
          sx={{ width: 360, p: 2, display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            {currentlyEditing ? "Edit Expense" : "Add Expense (Admin)"}
          </Typography>
          <Divider />
          {FormContent}
        </Card>

        {/* RIGHT PANEL */}
        <Paper
          sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          {/* Filters bar */}
          <Box
            sx={{
              p: 2,
              pt: 1,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Expenses
            </Typography>

            <TextField
              type="date"
              label="Start"
              size="small"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              label="End"
              size="small"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {expenseTypes.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Staff</InputLabel>
              <Select
                label="Staff"
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
              >
                <MenuItem value="">
                  <em>All</em>
                </MenuItem>
                {staffOptions.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.fullName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={filterDeleted}
                onChange={(e) => setFilterDeleted(e.target.value)}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="deleted">Deleted</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              sx={{ minWidth: 180 }}
            />

            <Button
              onClick={handleExportCSV}
              variant="outlined"
              size="small"
              sx={{ marginLeft: "auto" }}
            >
              Export CSV
            </Button>
          </Box>

          {/* Table */}
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date / Time</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Staff</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Controls</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9}>Loading…</TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      No expenses for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => (
                    <TableRow key={r.id} hover selected={!!r.isDeleted}>
                      <TableCell>{r._dateTime}</TableCell>
                      <TableCell>
                        Expenses{" "}
                        {r.isEdited && (
                          <HistoryIcon
                            fontSize="inherit"
                            style={{ marginLeft: 4, opacity: 0.7 }}
                            titleAccess="Edited"
                          />
                        )}
                        {r.isDeleted && (
                          <Typography
                            component="span"
                            sx={{
                              ml: 1,
                              fontSize: 11,
                              color: "error.main",
                              fontWeight: 500,
                            }}
                          >
                            (deleted)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{r.qty}</TableCell>
                      <TableCell align="right">{toCurrency(r.price)}</TableCell>
                      <TableCell align="right">{toCurrency(r.total)}</TableCell>
                      <TableCell>{r.expenseType || ""}</TableCell>
                      <TableCell>{r.expenseStaffName || ""}</TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 320,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.notes || ""}
                      >
                        {r.notes || ""}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(r)}>
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Delete (Soft)">
                          <IconButton
                            size="small"
                            onClick={() => handleSoftDelete(r)}
                            color="warning"
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Delete Permanently">
                          <IconButton
                            size="small"
                            onClick={() => handlePermanentDelete(r)}
                            color="error"
                          >
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

      {/* --- MOBILE LAYOUT --- */}
      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          flexDirection: "column",
          gap: 1.25,
          p: 2,
          pt: 1.25,
          minHeight: 0,
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          pb: "calc(env(safe-area-inset-bottom, 0) + 8px)",
        }}
      >
        {/* Add / Edit form card */}
        <Card
          ref={controlsRef}
          sx={{ p: 1.0, overflow: "visible", position: "relative" }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {currentlyEditing ? "Edit Expense" : "Add Expense"}
            </Typography>
            <IconButton size="small" onClick={() => setControlsOpen((v) => !v)}>
              {controlsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={controlsOpen} timeout={250} sx={{ overflow: "visible" }}>
            <Box sx={{ pt: 2, pb: 1 }}>{FormContent}</Box>
          </Collapse>
        </Card>

        {/* Filters card (mobile) */}
        <Card sx={{ p: 1.0, overflow: "visible", position: "relative" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Filters & Export
            </Typography>
            <IconButton size="small" onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={filtersOpen} timeout={250} sx={{ overflow: "visible" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1,
                mt: 1.25,
                alignItems: "center",
              }}
            >
              <TextField
                type="date"
                label="Start"
                size="small"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date"
                label="End"
                size="small"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  {expenseTypes.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Staff</InputLabel>
                <Select
                  label="Staff"
                  value={filterStaff}
                  onChange={(e) => setFilterStaff(e.target.value)}
                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  {staffOptions.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.fullName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={filterDeleted}
                  onChange={(e) => setFilterDeleted(e.target.value)}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="deleted">Deleted</MenuItem>
                  <MenuItem value="all">All</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Search"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                fullWidth
              />
              <Button
                onClick={handleExportCSV}
                variant="outlined"
                size="small"
                sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}
              >
                Export CSV
              </Button>
            </Box>
          </Collapse>
        </Card>

        {/* Mobile table */}
        <Paper
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ p: 1.0, pt: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Expenses
            </Typography>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date / Time</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Staff</TableCell>
                  <TableCell align="right">⋯</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5}>Loading…</TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      No expenses for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => (
                    <TableRow key={r.id} hover selected={!!r.isDeleted}>
                      <TableCell>{r._dateTime}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {r.expenseType || "—"}
                          </Typography>
                          {r.isEdited && (
                            <HistoryIcon
                              fontSize="inherit"
                              style={{ opacity: 0.7 }}
                              titleAccess="Edited"
                            />
                          )}
                          {r.isDeleted && (
                            <Typography
                              component="span"
                              sx={{
                                fontSize: 10,
                                color: "error.main",
                                fontWeight: 500,
                              }}
                            >
                              del
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{toCurrency(r.total)}</TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 120,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.expenseStaffName || ""}
                      >
                        {r.expenseStaffName || ""}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => startEdit(r)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleSoftDelete(r)}
                          color="warning"
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* ================== DIALOGS ================== */}

      {/* info dialog */}
      <Dialog open={infoDialog.open} onClose={closeInfo} maxWidth="xs" fullWidth>
        <DialogTitle>{infoDialog.title || "Notice"}</DialogTitle>
        <DialogContent>
          <Typography>{infoDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInfo}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* edit reason dialog */}
      <Dialog
        open={editReasonDialog.open}
        onClose={() => setEditReasonDialog({ open: false, reason: "", row: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reason for this edit</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Please describe why this expense was updated.
          </Typography>
          <TextField
            autoFocus
            multiline
            minRows={2}
            fullWidth
            value={editReasonDialog.reason}
            onChange={(e) =>
              setEditReasonDialog((p) => ({ ...p, reason: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditReasonDialog({ open: false, reason: "", row: null })}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={actuallySaveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* soft delete reason dialog */}
      <Dialog
        open={deleteReasonDialog.open}
        onClose={() => setDeleteReasonDialog({ open: false, reason: "", row: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete this expense?</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This will mark the expense as deleted, but you can still see it if you switch
            to &quot;Deleted&quot; filter. Add a reason:
          </Typography>
          <TextField
            autoFocus
            multiline
            minRows={2}
            fullWidth
            value={deleteReasonDialog.reason}
            onChange={(e) =>
              setDeleteReasonDialog((p) => ({ ...p, reason: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setDeleteReasonDialog({ open: false, reason: "", row: null })
            }
          >
            Cancel
          </Button>
          <Button variant="contained" color="warning" onClick={actuallySoftDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* permanent delete confirm */}
      <Dialog
        open={permDeleteDialog.open}
        onClose={() => setPermDeleteDialog({ open: false, row: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete permanently?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently remove the expense and cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermDeleteDialog({ open: false, row: null })}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={actuallyPermanentDelete}>
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================== GLOBAL LOADER ================== */}
      <Backdrop
        open={busy}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 20,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <CircularProgress />
        <Typography sx={{ color: "#fff" }}>
          {busyMsg || "Working... please wait"}
        </Typography>
      </Backdrop>
    </Box>
  );
}
