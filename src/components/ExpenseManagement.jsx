import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  Grid,
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
} from "@mui/material";
import { collection, addDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

/** Allowed expense types (admin can add *everything*) */
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
  // ---------- Add Expense form ----------
  const [formDate, setFormDate] = useState(toDateOnlyString(new Date()));
  const [formType, setFormType] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [staffOptions, setStaffOptions] = useState([]); // {id, fullName, email}

  // ---------- Table / filter state ----------
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStart, setFilterStart] = useState(toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 7))));
  const [filterEnd, setFilterEnd] = useState(toDateOnlyString(new Date()));

  // ---------- Load staff for salary-related entries ----------
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const qUsers = query(collection(db, "users"), where("role", "==", "staff"));
        const snap = await getDocs(qUsers);
        const opts = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            fullName: data.fullName || data.name || data.displayName || data.email || "Staff",
            email: data.email || "",
          };
        });
        opts.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "en", { sensitivity: "base" }));
        setStaffOptions(opts);
      } catch (e) {
        console.warn("Failed to load staff for expenses", e);
      }
    };
    loadStaff();
  }, []);

  // ---------- Load expenses (by date range) ----------
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // We store all expenses in "transactions" with item = 'Expenses'.
      // We'll query by date range on "timestamp". For admin-added expenses,
      // we save timestamp to the chosen date (midnight local) so the same query works.
      try {
        const start = new Date(filterStart);
        const end = new Date(filterEnd);
        // set end to end-of-day
        end.setHours(23, 59, 59, 999);

        // NOTE: we avoid adding extra where(isDeleted==false) to keep indexes simple.
        // We'll filter client-side.
        const qTx = query(
          collection(db, "transactions"),
          where("item", "==", "Expenses"),
          where("timestamp", ">=", start),
          where("timestamp", "<=", end),
          orderBy("timestamp", "desc")
        );

        const snap = await getDocs(qTx);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isDeleted); // client-side soft-delete filter

        setExpenses(rows);
      } catch (e) {
        console.error("Failed to load expenses", e);
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filterStart, filterEnd]);

  // ---------- Derived table rows ----------
  const tableRows = useMemo(() => {
    return expenses.map((e) => {
      const date =
        e.timestamp?.seconds
          ? toDateOnlyString(new Date(e.timestamp.seconds * 1000))
          : e.timestamp
          ? toDateOnlyString(e.timestamp)
          : "";
      return {
        id: e.id,
        date,
        item: "Expenses",
        qty: Number(e.quantity || 0),
        price: Number(e.price || 0),
        total: Number(e.total || (Number(e.quantity || 0) * Number(e.price || 0))),
        notes: e.notes || "",
        type: e.expenseType || "",
        staff: e.expenseStaffName || "",
      };
    });
  }, [expenses]);

  // ---------- CSV export ----------
  const handleExportCSV = () => {
    const headers = ["Date", "Item", "Qty", "Price", "Total", "Type", "Staff", "Notes"];
    const lines = [headers.join(",")];

    tableRows.forEach((r) => {
      const row = [
        r.date,
        r.item,
        r.qty,
        r.price,
        r.total,
        r.type,
        // escape commas/quotes in staff & notes
        `"${String(r.staff || "").replace(/"/g, '""')}"`,
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

  // ---------- Add Expense ----------
  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formType) {
      alert("Please select an expense type.");
      return;
    }
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      alert("Please select a staff for Salary or Salary Advance.");
      return;
    }

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    // Set the timestamp to the chosen date at local midnight
    const ts = new Date(formDate);
    ts.setHours(0, 0, 0, 0);

    const selectedStaff = staffOptions.find((s) => s.id === formStaffId);
    const expenseDoc = {
      item: "Expenses",
      expenseType: formType,
      expenseStaffId: selectedStaff ? selectedStaff.id : null,
      expenseStaffName: selectedStaff ? selectedStaff.fullName : null,
      expenseStaffEmail: selectedStaff ? selectedStaff.email : null,

      quantity: qty,
      price: price,
      total: total,

      notes: formNotes || "",
      // key: not tied to any shift
      shiftId: null,
      source: "admin_manual",

      timestamp: ts, // the date admin selected
      staffEmail: user?.email || "admin",
      isDeleted: false,
      isEdited: false,
    };

    try {
      await addDoc(collection(db, "transactions"), expenseDoc);
      // reset the form but keep the same date
      setFormType("");
      setFormStaffId("");
      setFormQuantity("");
      setFormPrice("");
      setFormNotes("");
      alert("Expense added.");
    } catch (err) {
      console.error("Failed to add expense", err);
      alert("Failed to add expense.");
    }
  };

  return (
    <Box sx={{ p: 2, pb: 4 }}>
      <Typography variant="h5" gutterBottom>Expense Management</Typography>

      <Grid container spacing={2}>
        {/* Add expense */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6">Add Expense (Admin)</Typography>
            <Divider sx={{ my: 2 }} />
            <Box component="form" onSubmit={handleAddExpense}>
              <Stack spacing={2}>
                <TextField
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
                      <MenuItem key={t} value={t}>{t}</MenuItem>
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
                        <MenuItem value="" disabled>No staff available</MenuItem>
                      ) : (
                        staffOptions.map((s) => (
                          <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>
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

                <Button type="submit" variant="contained">Add Expense</Button>
              </Stack>
            </Box>
          </Card>
        </Grid>

        {/* Filters + table */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography variant="h6">Expenses</Typography>
            <Divider sx={{ my: 2 }} />

            {/* Filters */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  type="date"
                  label="Start"
                  value={filterStart}
                  onChange={(e) => setFilterStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  type="date"
                  label="End"
                  value={filterEnd}
                  onChange={(e) => setFilterEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={4} sx={{ display: "flex", justifyContent: { xs: "stretch", md: "flex-end" } }}>
                <Button onClick={handleExportCSV} variant="outlined">Export CSV</Button>
              </Grid>
            </Grid>

            {/* Table */}
            <TableContainer component={Paper} sx={{ flexGrow: 1, overflowY: "auto" }}>
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8}>Loading…</TableCell></TableRow>
                  ) : tableRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8}>No expenses for the selected dates.</TableCell></TableRow>
                  ) : (
                    tableRows.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.item}</TableCell>
                        <TableCell align="right">{r.qty}</TableCell>
                        <TableCell align="right">{toCurrency(r.price)}</TableCell>
                        <TableCell align="right">{toCurrency(r.total)}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell>{r.staff}</TableCell>
                        <TableCell sx={{ maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.notes}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
