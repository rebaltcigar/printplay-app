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
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
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
} from "firebase/firestore";
import { db } from "../firebase";

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

function toDateOnlyString(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toCurrency(n) {
  const val = Number(n || 0);
  return `₱${val.toFixed(2)}`;
}

export default function ExpenseManagement({ user }) {
  // -------- Left form (add/edit) --------
  const [formDate, setFormDate] = useState(toDateOnlyString(new Date()));
  const [formType, setFormType] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [formStaffName, setFormStaffName] = useState("");
  const [formStaffEmail, setFormStaffEmail] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  const [staffOptions, setStaffOptions] = useState([]); // {id, fullName, email}
  const dateInputRef = useRef(null);

  // -------- Right table / filters --------
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStart, setFilterStart] = useState(
    toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 7)))
  );
  const [filterEnd, setFilterEnd] = useState(toDateOnlyString(new Date()));

  // Load staff (for Salary / Salary Advance)
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

  // REALTIME: load expenses by date range
  useEffect(() => {
    setLoading(true);
    const start = new Date(filterStart);
    const end = new Date(filterEnd);
    end.setHours(23, 59, 59, 999);

    // Range + orderBy on 'timestamp'
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
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isDeleted);
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

  const tableRows = useMemo(() => {
    return expenses.map((e) => {
      const date =
        e.timestamp?.seconds
          ? toDateOnlyString(new Date(e.timestamp.seconds * 1000))
          : e.timestamp
          ? toDateOnlyString(e.timestamp)
          : "";
      return {
        ...e,
        _dateOnly: date,
        qty: Number(e.quantity || 0),
        price: Number(e.price || 0),
        total: Number(e.total || (Number(e.quantity || 0) * Number(e.price || 0))),
      };
    });
  }, [expenses]);

  // CSV export
  const handleExportCSV = () => {
    const headers = ["Date", "Item", "Qty", "Price", "Total", "Type", "Staff", "Notes"];
    const lines = [headers.join(",")];

    tableRows.forEach((r) => {
      const row = [
        r._dateOnly,
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

  // Add expense
  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formType) return alert("Please select an expense type.");
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      return alert("Please select a staff for Salary or Salary Advance.");
    }

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    const ts = new Date(formDate);
    ts.setHours(0, 0, 0, 0);

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

      shiftId: null, // admin-created expense is independent by default
      source: "admin_manual",

      timestamp: ts, // chosen date (midnight)
      staffEmail: user?.email || "admin",
      isDeleted: false,
      isEdited: false,
    };

    try {
      await addDoc(collection(db, "transactions"), expenseDoc);
      // reset except date
      setFormType("");
      setFormStaffId("");
      setFormStaffName("");
      setFormStaffEmail("");
      setFormQuantity("");
      setFormPrice("");
      setFormNotes("");
    } catch (err) {
      console.error("Failed to add expense", err);
      alert("Failed to add expense.");
    }
  };

  // Begin edit (populate left panel)
  const startEdit = (row) => {
    setCurrentlyEditing(row);
    setFormDate(row._dateOnly || toDateOnlyString(new Date()));
    setFormType(row.expenseType || "");
    setFormStaffId(row.expenseStaffId || "");
    setFormStaffName(row.expenseStaffName || "");
    setFormStaffEmail(row.expenseStaffEmail || "");
    setFormQuantity(String(row.quantity ?? row.qty ?? ""));
    setFormPrice(String(row.price ?? ""));
    setFormNotes(row.notes || "");
    setTimeout(() => dateInputRef.current?.focus(), 60);
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

  // Save edit (preserve any existing shift/staff association, just note admin edit)
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!currentlyEditing) return;

    if (!formType) return alert("Please select an expense type.");
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      return alert("Please select a staff for Salary or Salary Advance.");
    }

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    const ts = new Date(formDate);
    ts.setHours(0, 0, 0, 0);

    const selectedStaff = staffOptions.find((s) => s.id === formStaffId) || null;
    const reason = window.prompt("Reason for this edit?");
    if (!reason) return alert("Update cancelled. Reason is required.");

    try {
      await updateDoc(doc(db, "transactions", currentlyEditing.id), {
        item: "Expenses",
        expenseType: formType,
        expenseStaffId: selectedStaff ? selectedStaff.id : null,
        expenseStaffName: selectedStaff ? selectedStaff.fullName : null,
        expenseStaffEmail: selectedStaff ? selectedStaff.email : null,
        quantity: qty,
        price,
        total,
        notes: formNotes || "",
        timestamp: ts,

        // audit/admin
        isEdited: true,
        adminEdited: true,
        editedBy: user?.email || "admin",
        editReason: reason,
        lastUpdatedAt: serverTimestamp(),
      });

      cancelEdit();
    } catch (err) {
      console.error("Failed to update expense", err);
      alert("Failed to update expense.");
    }
  };

  return (
    <Box
      sx={{
        // IMPORTANT: not fixed. Fills the parent's content area under the admin header.
        display: "flex",
        flexDirection: "column",
        height: "100%",     // rely on parent (admin container) to give this area room
        width: "100%",
        minHeight: 0,
      }}
    >
      {/* Body (two-panel), keeps under header without overlap */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          gap: 2,
          p: 2,
          width: "100%",
          alignItems: "stretch",
        }}
      >
        {/* LEFT: Add/Edit Expense */}
        <Card sx={{ width: 360, p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {currentlyEditing ? "Edit Expense" : "Add Expense (Admin)"}
          </Typography>
          <Divider />

          <Box
            component="form"
            onSubmit={currentlyEditing ? handleSaveEdit : handleAddExpense}
            sx={{ display: "grid", gap: 2 }}
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
            />

            <FormControl fullWidth required>
              <InputLabel>Expense Type</InputLabel>
              <Select
                label="Expense Type"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                {EXPENSE_TYPES_ALL.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {(formType === "Salary" || formType === "Salary Advance") && (
              <FormControl fullWidth required>
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
            />
            <TextField
              type="number"
              label="Price"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              required
              fullWidth
            />

            <TextField
              label="Notes (Optional)"
              multiline
              rows={3}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              fullWidth
            />

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button type="submit" variant="contained" fullWidth>
                {currentlyEditing ? "Save Changes" : "Add Expense"}
              </Button>
              {currentlyEditing && (
                <Button variant="outlined" color="inherit" onClick={cancelEdit} fullWidth>
                  Cancel
                </Button>
              )}
            </Stack>
          </Box>
        </Card>

        {/* RIGHT: Filters + Table (fills remaining width, below header, full height) */}
        <Paper sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Filter/header row stays visible; table scrolls under it */}
          <Box sx={{ p: 2, pt: 1, display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Expenses
            </Typography>
            <Box sx={{ display: "flex", gap: 1, ml: "auto", flexWrap: "wrap" }}>
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
              <Button onClick={handleExportCSV} variant="outlined" size="small">
                Export CSV
              </Button>
            </Box>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
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
                ) : tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>No expenses for the selected dates.</TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r._dateOnly}</TableCell>
                      <TableCell>
                        Expenses{" "}
                        {r.isEdited && (
                          <HistoryIcon
                            fontSize="inherit"
                            style={{ marginLeft: 4, opacity: 0.7 }}
                            titleAccess="Edited"
                          />
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
}
