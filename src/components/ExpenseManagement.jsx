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
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
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

  // ----- mobile-only helpers -----
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const fieldSize = isMobile ? "small" : "medium";
  const [controlsOpen, setControlsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // New state for mobile filters
  const controlsRef = useRef(null);

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

    // Mobile: auto-expand controls and scroll to them
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

  /* ---------- shared form content ---------- */
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
      {/* Body (two-panel on web, mobile optimized below) */}
      {/* --- WEB / DESKTOP (unchanged) --- */}
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
        {/* LEFT: Add/Edit Expense */}
        <Card sx={{ width: 360, p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {currentlyEditing ? "Edit Expense" : "Add Expense (Admin)"}
          </Typography>
          <Divider />
          {FormContent}
        </Card>

        {/* RIGHT: Filters + Table */}
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

      {/* --- MOBILE LAYOUT --- */}
      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          flexDirection: "column",
          gap: 1.25,                              // FIX #3 support spacing
          p: 2,
          pt: 1.25,
          minHeight: 0,
          flex: 1,
          overflowY: "auto",                      // FIX #1 allow page to scroll
          WebkitOverflowScrolling: "touch",
          pb: "calc(env(safe-area-inset-bottom, 0) + 8px)", // FIX #1 safe area
        }}
      >
        {/* Controls on top (collapsible) */}
        <Card
          ref={controlsRef}
          sx={{
            p: 1.0,
            overflow: "visible",                  // FIX #2 prevent clipping
            position: "relative",                 // FIX #2 stacking context
            mb: controlsOpen ? 1.25 : 1.0,        // FIX #3 extra space when open
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {currentlyEditing ? "Edit Expense" : "Add Expense"}
            </Typography>
            <IconButton size="small" onClick={() => setControlsOpen((v) => !v)}>
              {controlsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse
            in={controlsOpen}
            unmountOnExit={false}                  // FIX #2 keep mounted for measurement
            timeout={250}
            sx={{ overflow: "visible" }}          // FIX #2 allow children overflow
          >
            <Box sx={{ pt: 2, pb: 1 }}>{FormContent}</Box>
          </Collapse>
        </Card>

        {/* Filters (collapsible) */}
        <Card
          sx={{
            p: 1.0,
            overflow: "visible",                  // FIX #2
            position: "relative",                 // FIX #2
            mb: filtersOpen ? 1.25 : 1.0,         // FIX #3
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Date Filters & Export
            </Typography>
            <IconButton size="small" onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse
            in={filtersOpen}
            unmountOnExit={false}                  // FIX #2
            timeout={250}
            sx={{ overflow: "visible" }}          // FIX #2
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, // FIX #3 1-col on phones
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

        {/* Table area, flexible height */}
        <Paper
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 0,                            // FIX #4 ensure below cards if stacked
          }}
        >
          <Box sx={{ p: 1.0, pt: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Expenses
            </Typography>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">₱</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Staff</TableCell>
                  <TableCell align="right">⋯</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7}>Loading…</TableCell>
                  </TableRow>
                ) : tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>No expenses for the selected dates.</TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r._dateOnly}</TableCell>
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
                        </Box>
                      </TableCell>
                      <TableCell align="right">{r.qty}</TableCell>
                      <TableCell align="right">{Number(r.price || 0).toFixed(0)}</TableCell>
                      <TableCell align="right">{Number(r.total || 0).toFixed(0)}</TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 160,
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
