// src/components/ExpenseManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
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
  IconButton,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
  CircularProgress,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import AddIcon from "@mui/icons-material/Add";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { supabase } from "../supabase";
import { useGlobalUI } from "../contexts/GlobalUIContext";
import LoadingScreen from "./common/LoadingScreen";
import PageHeader from "./common/PageHeader";
import DetailDrawer from "./common/DetailDrawer";
import SummaryCards from "./common/SummaryCards";
import { fmtCurrency, toDateInput, downloadCSV, fmtDateTime } from "../utils/formatters";
import { useStaffList } from "../hooks/useStaffList";
import { generateDisplayId } from "../services/orderService";

const EXPENSE_TYPES_ALL = [
  "Supplies",
  "Maintenance",
  "Utilities",
  "Rent",
  "Salary",
  "Salary Advance",
  "Misc",
];

// toDateOnlyString is now toDateInput from formatters.js
const toDateOnlyString = toDateInput;

function toDateTimeString(d) {
  return fmtDateTime(d);
}

// toCurrency is now fmtCurrency from formatters.js
const toCurrency = fmtCurrency;

export default function ExpenseManagement({ user }) {
  const { showSnackbar, showConfirm } = useGlobalUI();
  /** ===================== FORM STATE ===================== */
  const [formDate, setFormDate] = useState(toDateOnlyString(new Date()));
  const [formType, setFormType] = useState("");
  const [financialCategory, setFinancialCategory] = useState("OPEX"); // NEW: OPEX, COGS, CAPEX
  const [formStaffId, setFormStaffId] = useState("");
  const [formStaffName, setFormStaffName] = useState("");
  const [formStaffEmail, setFormStaffEmail] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  // Staff list from shared hook (replaces manual getDocs block below)
  const { staffOptions } = useStaffList();
  const [creditServices, setCreditServices] = useState([]);
  const dateInputRef = useRef(null);

  /** ===================== TABLE / FILTER STATE ===================== */
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

  /** ===================== DRAWER STATE ===================== */
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);

  /** ===================== APP DIALOGS / LOADER ===================== */
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");



  /** ===================== LOAD EXPENSE SERVICES ===================== */
  useEffect(() => {
    const fetchExpenseServices = async () => {
      try {
        const { data, error } = await supabase
          .from("services")
          .select("service_name, price")
          .eq("category", "Expense");

        if (data) {
          const servicesData = data.map((d) => ({
            serviceName: d.service_name,
            price: d.price || 0,
          }));
          setCreditServices(servicesData);
        }
      } catch (e) {
        console.warn("Failed to load expense services for expenses dropdown.", e);
      }
    };
    fetchExpenseServices();
  }, []);

  const expenseTypes = useMemo(() => {
    const serviceNames = creditServices.map((s) => s.serviceName);
    const combined = [...new Set([...EXPENSE_TYPES_ALL, ...serviceNames])];
    combined.sort((a, b) => a.localeCompare(b));
    return combined;
  }, [creditServices]);

  /* Staff loading is handled by useStaffList() hook above */

  /** ===================== LOAD EXPENSES (PAGINATION) ===================== */
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isArchiveMode, setIsArchiveMode] = useState(false);
  const unsubRef = useRef(null);

  const startBusy = (msg = "Working...") => {
    setBusy(true);
    setBusyMsg(msg);
  };
  const stopBusy = () => {
    setBusy(false);
    setBusyMsg("");
  };

  const isWideRange = useMemo(() => {
    const duration = new Date(filterEnd) - new Date(filterStart);
    return duration > 45 * 24 * 60 * 60 * 1000; // > 45 days
  }, [filterStart, filterEnd]);

  // Fetch Page (Archive Mode)
  const fetchNextPage = async (isReset = false) => {
    setLoadingMore(true);
    try {
      const start = new Date(filterStart); start.setHours(0, 0, 0, 0);
      const end = new Date(filterEnd); end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("timestamp", start.toISOString())
        .lte("timestamp", end.toISOString())
        .order("timestamp", { ascending: false });

      if (error) throw error;

      const newRows = (data || []).map((d) => ({
        ...d,
        id: d.id,
        expenseType: d.expense_type,
        expenseStaffId: d.expense_staff_id,
        expenseStaffName: d.staff_name,
        expenseStaffEmail: d.staff_email,
        financialCategory: d.financial_category,
        isDeleted: d.is_deleted,
        isEdited: d.is_edited,
        editedBy: d.edited_by,
        qty: d.quantity,
      }));

      if (isReset) {
        setExpenses(newRows);
      } else {
        setExpenses(prev => [...prev, ...newRows]);
      }

      setLastDoc(null);
      setHasMore(false);

    } catch (err) {
      console.error("Pagination error", err);
      showSnackbar("Failed to load more expenses.", "error");
    } finally {
      setLoadingMore(false);
      setLoading(false);
    }
  };

  const attachStream = async () => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setLastDoc(null);
    setHasMore(true);
    setLoading(true);

    if (isWideRange) {
      setIsArchiveMode(true);
      setExpenses([]);
      await fetchNextPage(true);
    } else {
      setIsArchiveMode(false);
      const start = new Date(filterStart); start.setHours(0, 0, 0, 0);
      const end = new Date(filterEnd); end.setHours(23, 59, 59, 999);

      const fetchExpenses = async () => {
        try {
          const { data, error } = await supabase
            .from("expenses")
            .select("*")
            .gte("timestamp", start.toISOString())
            .lte("timestamp", end.toISOString())
            .order("timestamp", { ascending: false });

          if (data) {
            const rows = data.map((d) => ({
              ...d,
              id: d.id,
              expenseType: d.expense_type,
              expenseStaffId: d.expense_staff_id,
              expenseStaffName: d.staff_name,
              expenseStaffEmail: d.staff_email,
              financialCategory: d.financial_category,
              isDeleted: d.is_deleted,
              isEdited: d.is_edited,
              editedBy: d.edited_by,
              qty: d.quantity,
            }));
            setExpenses(rows);
          }
        } catch (err) {
          console.error("Stream error", err);
        } finally {
          setLoading(false);
        }
      };
      fetchExpenses();
    }
  };

  useEffect(() => {
    attachStream();
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [filterStart, filterEnd]);

  /* ---- Fetch ALL rows without limits ---- */
  const fetchAllExpenses = async (forceAllTime = false) => {
    setLoadingMore(true);
    setLoading(true);

    // Cleanup any existing real-time listener
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    try {
      let q = supabase.from("expenses").select("*").order("timestamp", { ascending: false });

      if (!forceAllTime) {
        const s = new Date(filterStart); s.setHours(0, 0, 0, 0);
        const e = new Date(filterEnd); e.setHours(23, 59, 59, 999);
        q = q.gte("timestamp", s.toISOString()).lte("timestamp", e.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;

      const newRows = (data || []).map((d) => ({
        ...d,
        id: d.id,
        expenseType: d.expense_type,
        expenseStaffId: d.expense_staff_id,
        expenseStaffName: d.staff_name,
        expenseStaffEmail: d.staff_email,
        financialCategory: d.financial_category,
        isDeleted: d.is_deleted,
        isEdited: d.is_edited,
        editedBy: d.edited_by,
        qty: d.quantity,
      }));

      setExpenses(newRows);
      setLastDoc(null);
      setHasMore(false);
      setIsArchiveMode(forceAllTime ? true : false);

      showSnackbar(`Loaded ${newRows.length} expenses.`, 'success');
    } catch (err) {
      console.error("Fetch All error", err);
      showSnackbar("Failed to load all expenses.", "error");
    } finally {
      setLoadingMore(false);
      setLoading(false);
    }
  };

  /** ===================== DERIVED ROWS + FILTERS ===================== */
  const tableRows = useMemo(() => {
    return expenses.map((e) => {
      const tsDate = new Date(e.timestamp);
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

  /** ===================== SUMMARY CARDS DATA ===================== */
  const expenseSummary = useMemo(() => {
    const active = filteredRows.filter(r => !r.isDeleted);
    const total = active.reduce((s, r) => s + r.total, 0);
    const opex = active.filter(r => r.financialCategory === 'OPEX').reduce((s, r) => s + r.total, 0);
    const cogs = active.filter(r => r.financialCategory === 'COGS').reduce((s, r) => s + r.total, 0);
    const capex = active.filter(r => r.financialCategory === 'CAPEX').reduce((s, r) => s + r.total, 0);
    return { total, opex, cogs, capex, count: active.length };
  }, [filteredRows]);

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

    // Auto-suggest Financial Category
    const t = selectedType.toLowerCase();
    if (t.includes('salary') || t.includes('rent') || t.includes('utilities') || t.includes('maintenance')) {
      setFinancialCategory('OPEX');
    } else if (t.includes('asset') || t.includes('equipment') || t.includes('renovation')) {
      setFinancialCategory('CAPEX');
    } else if (t.includes('stock') || t.includes('inventory')) {
      setFinancialCategory('COGS');
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

    downloadCSV(lines.join("\n"), `expenses_${filterStart}_to_${filterEnd}.csv`);
  };

  /** ===================== CRUD: ADD ===================== */
  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formType) {
      showSnackbar?.("Please select an expense type.", "warning");
      return;
    }
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      showSnackbar?.("Please select a staff for Salary or Salary Advance.", "warning");
      return;
    }

    const qty = Number(formQuantity || 0);
    const price = Number(formPrice || 0);
    const total = qty * price;

    const transactionDate = new Date(formDate);
    const now = new Date();
    transactionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const selectedStaff = staffOptions.find((s) => s.id === formStaffId) || null;

    // 1. Create the base document
    const expenseDoc = {
      expense_type: formType,
      expense_staff_id: selectedStaff ? selectedStaff.id : null,
      staff_name: selectedStaff ? selectedStaff.fullName : null,
      staff_email: selectedStaff ? selectedStaff.email : null,
      quantity: qty,
      amount: price,
      total,
      notes: formNotes || "",
      shift_id: null, // Default for admin-added expenses
      source: "admin_manual",
      financial_category: financialCategory || "OPEX", // NEW FIELD
      timestamp: transactionDate.toISOString(),
      is_deleted: false,
      is_edited: false,
    };

    try {
      startBusy("Adding expense...");
      // 3. Add the complete document
      await supabase.from("expenses").insert(expenseDoc);

      setFormType("");
      setFinancialCategory("OPEX");
      setFormStaffId("");
      setFormStaffName("");
      setFormStaffEmail("");
      setFormQuantity("");
      setFormPrice("");
      setFormNotes("");
      setFormDrawerOpen(false);
      showSnackbar?.("Expense has been added.", 'success');
    } catch (err) {
      console.error("Failed to add expense", err);
      showSnackbar(`Failed to add expense: ${err.message}`, 'error');
    } finally {
      stopBusy();
    }
  };

  /** ===================== CRUD: EDIT (OPEN FORM) ===================== */
  const startEdit = (row) => {
    setCurrentlyEditing(row);
    setFormDate(row._dateOnly);
    setFormType(row.expenseType || "");
    setFinancialCategory(row.financialCategory || "OPEX");
    setFormStaffId(row.expenseStaffId || "");
    setFormStaffName(row.expenseStaffName || "");
    setFormStaffEmail(row.expenseStaffEmail || "");
    setFormQuantity(String(row.quantity ?? row.qty ?? ""));
    setFormPrice(String(row.price ?? ""));
    setFormNotes(row.notes || "");
    setTimeout(() => dateInputRef.current?.focus(), 60);
    setFormDrawerOpen(true);
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
    setFormDrawerOpen(false);
  };

  /** ===================== CRUD: EDIT (SAVE) ===================== */
  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    const row = currentlyEditing;
    if (!row) return;

    if (!formType) {
      showSnackbar("Please select an expense type.", "warning");
      return;
    }
    if ((formType === "Salary" || formType === "Salary Advance") && !formStaffId) {
      showSnackbar("Please select a staff for Salary or Salary Advance.", "warning");
      return;
    }

    showConfirm({
      title: "Confirm Edit",
      message: "Please provide a reason for this edit.",
      requireReason: true,
      confirmLabel: "Update Expense",
      confirmColor: "primary",
      onConfirm: async (reason) => {
        try {
          startBusy("Updating expense...");
          const qty = Number(formQuantity || 0);
          const price = Number(formPrice || 0);
          const total = qty * price;

          const transactionDate = new Date(formDate);
          const now = new Date();
          transactionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

          const selectedStaff = staffOptions.find((s) => s.id === formStaffId) || null;

          const updateData = {
            expense_type: formType,
            financial_category: financialCategory,
            expense_staff_id: selectedStaff ? selectedStaff.id : null,
            staff_name: selectedStaff ? selectedStaff.fullName : null,
            staff_email: selectedStaff ? selectedStaff.email : null,
            quantity: qty,
            amount: price,
            total,
            notes: formNotes || "",
            timestamp: transactionDate.toISOString(),
            is_edited: true,
            edited_by: user?.email || "admin",
            edit_reason: reason,
            last_updated_at: new Date().toISOString(),
          };

          await supabase.from("expenses").update(updateData).eq("id", row.id);
          showSnackbar("Expense has been updated.", 'success');
          cancelEdit();
          setFormDrawerOpen(false);
          // Auto-refresh the list
          attachStream();
        } catch (err) {
          console.error("Failed to update expense", err);
          showSnackbar(`Failed to update expense: ${err.message}`, 'error');
        } finally {
          stopBusy();
        }
      }
    });
  };

  /** ===================== CRUD: SOFT DELETE ===================== */
  const handleSoftDelete = (row) => {
    showConfirm({
      title: "Delete Expense?",
      message: `Soft delete expense: ${row.expenseType} (${toCurrency(row.total)})?`,
      requireReason: true,
      confirmLabel: "Delete",
      confirmColor: "warning",
      onConfirm: async (reason) => {
        try {
          startBusy("Deleting (soft)...");
          await supabase.from("expenses").update({
            is_deleted: true,
            delete_reason: reason,
            deleted_by: user?.email || "admin",
            deleted_at: new Date().toISOString(),
          }).eq("id", row.id);
          showSnackbar("Expense has been marked as deleted.", 'success');
          attachStream();
        } catch (err) {
          console.error("Failed to soft delete expense:", err);
          showSnackbar("Failed to delete expense.", 'error');
        } finally {
          stopBusy();
        }
      }
    });
  };

  /** ===================== CRUD: PERMANENT DELETE ===================== */
  const handlePermanentDelete = (row) => {
    showConfirm({
      title: "PERMANENTLY Delete?",
      message: `This will permanently remove the expense: ${row.expenseType} (${toCurrency(row.total)}). This action cannot be undone.`,
      requireReason: false,
      confirmLabel: "Permanently Delete",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          startBusy("Permanently deleting...");
          await supabase.from("expenses").delete().eq("id", row.id);
          showSnackbar("Expense has been permanently deleted.", 'success');
          attachStream();
        } catch (err) {
          console.error("Failed to permanently delete expense:", err);
          showSnackbar("Failed to permanently delete expense.", 'error');
        } finally {
          stopBusy();
        }
      }
    });
  };

  /** ===================== FORM CONTENT ===================== */
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
        size="medium"
      />

      <FormControl fullWidth required size="medium">
        <InputLabel>Expense Type</InputLabel>
        <Select label="Expense Type" value={formType} onChange={handleTypeChange}>
          {expenseTypes.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth required size="medium">
        <InputLabel>Financial Category</InputLabel>
        <Select label="Financial Category" value={financialCategory} onChange={(e) => setFinancialCategory(e.target.value)}>
          <MenuItem value="OPEX">OPEX (Operating Expense)</MenuItem>
          <MenuItem value="COGS">COGS (Cost of Goods)</MenuItem>
          <MenuItem value="CAPEX">CAPEX (Capital Asset/Equipment)</MenuItem>
        </Select>
      </FormControl>

      {
        (formType === "Salary" || formType === "Salary Advance") && (
          <FormControl fullWidth required size="medium">
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
        )
      }

      <TextField
        type="number"
        label="Quantity"
        value={formQuantity}
        onChange={(e) => setFormQuantity(e.target.value)}
        required
        fullWidth
        size="medium"
      />
      <TextField
        type="number"
        label="Price"
        value={formPrice}
        onChange={(e) => setFormPrice(e.target.value)}
        required
        fullWidth
        size="medium"
      />

      <TextField
        label="Notes (Optional)"
        multiline
        rows={3}
        value={formNotes}
        onChange={(e) => setFormNotes(e.target.value)}
        fullWidth
        size="medium"
      />

      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button type="submit" variant="contained" fullWidth size="medium">
          {currentlyEditing ? "Save Changes" : "Add Expense"}
        </Button>
        {currentlyEditing && (
          <Button
            variant="outlined"
            color="inherit"
            onClick={cancelEdit}
            fullWidth
            size="medium"
          >
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );

  /** ===================== RENDER ===================== */
  if (loading) {
    return <LoadingScreen message="Loading expenses..." />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      <PageHeader
        title="Expense Log"
        subtitle="Track and manage business expenditures."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { cancelEdit(); setFormDrawerOpen(true); }}
          >
            Add Expense
          </Button>
        }
      />

      {/* Summary Cards */}
      <SummaryCards cards={[
        { label: 'Total Expenses', value: toCurrency(expenseSummary.total), sub: expenseSummary.count + ' entries', color: 'error.main', highlight: true },
        { label: 'OPEX', value: toCurrency(expenseSummary.opex), color: 'warning.main' },
        { label: 'COGS', value: toCurrency(expenseSummary.cogs), color: 'info.main' },
        { label: 'CAPEX', value: toCurrency(expenseSummary.capex), color: 'secondary.main' },
      ]} />

      {/* Filter bar */}
      <Paper sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
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
            <Select label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <MenuItem value=""><em>All Types</em></MenuItem>
              {expenseTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Staff</InputLabel>
            <Select label="Staff" value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}>
              <MenuItem value=""><em>All Staff</em></MenuItem>
              {staffOptions.map(s => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={filterDeleted} onChange={(e) => setFilterDeleted(e.target.value)}>
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
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" size="small" onClick={handleExportCSV}>Export CSV</Button>
          <Button variant="outlined" size="small" color="warning" onClick={() => fetchAllExpenses(false)}>Load All</Button>
        </Stack>
      </Paper>

      {/* Table */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Qty × Price</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    No expenses for the selected filters.
                  </TableCell>
                </TableRow>
              ) : filteredRows.map(r => (
                <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.55 : 1 }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{r._dateTime}</TableCell>
                  <TableCell>
                    <Chip label={r.expenseType || 'Unknown'} size="small" variant="outlined" color="warning" />
                  </TableCell>
                  <TableCell>
                    <Chip label={r.financialCategory || 'OPEX'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{r.expenseStaffName || '—'}</TableCell>
                  <TableCell
                    sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={r.notes}
                  >
                    {r.notes || '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.8rem' }}>
                    {r.qty} × {toCurrency(r.price)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{toCurrency(r.total)}</TableCell>
                  <TableCell>
                    {r.isDeleted && <Chip label="Deleted" size="small" color="error" />}
                    {!r.isDeleted && r.isEdited && <Chip label="Edited" size="small" color="info" />}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => startEdit(r)}>
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="warning" onClick={() => handleSoftDelete(r)} disabled={r.isDeleted}>
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Permanently Delete">
                      <IconButton size="small" color="error" onClick={() => handlePermanentDelete(r)}>
                        <DeleteForeverIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {hasMore && isArchiveMode && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <Button variant="outlined" size="small" onClick={() => fetchNextPage(false)} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </Box>
        )}
      </Paper>

      {/* Add/Edit Expense Drawer */}
      <DetailDrawer
        open={formDrawerOpen}
        onClose={() => { setFormDrawerOpen(false); cancelEdit(); }}
        title={currentlyEditing ? 'Edit Expense' : 'Add Expense'}
        subtitle={currentlyEditing ? `Editing: ${currentlyEditing.expenseType || ''}` : 'Record a new business expense'}
        loading={busy}
      >
        {FormContent}
      </DetailDrawer>

      {/* Global loader */}
      {busy && <LoadingScreen overlay={true} message={busyMsg || "Working..."} />}

    </Box>
  );
}
