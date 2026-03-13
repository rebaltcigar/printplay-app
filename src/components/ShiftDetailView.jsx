// src/components/ShiftDetailView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  IconButton,
  Tooltip,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Checkbox,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
  Divider,
} from "@mui/material";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";
import CommentIcon from "@mui/icons-material/Comment";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import BugReportIcon from "@mui/icons-material/BugReport";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";

import { db, auth } from "../firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  FieldValue,
} from "firebase/firestore";
import { generateDisplayId, updateOrderTimestamp } from "../services/orderService";
import { useGlobalUI } from "../contexts/GlobalUIContext";
import { fmtCurrency, toDatetimeLocal, fromDatetimeLocal, identifierText, downloadCSV, fmtDateTime, fmtDate, fmtTime } from "../utils/formatters";
import { computeShiftFinancials } from "../utils/shiftFinancials";
import { useStaffList } from "../hooks/useStaffList";
import { useServiceList } from "../hooks/useServiceList";

import CustomerDialog from "./CustomerDialog";
import ShiftConsolidationDialog from "./ShiftConsolidationDialog";
import ShiftAuditDebugger from "./ShiftAuditDebugger";
import DetailDrawer from "./common/DetailDrawer";
import SummaryCards from "./common/SummaryCards";

// Local alias for readability in this file:
const fmtPeso = fmtCurrency;

const normalize = (s) => String(s ?? "").trim().toLowerCase();

export default function ShiftDetailView({ shift, userMap, onBack }) {
  const { showSnackbar, showConfirm } = useGlobalUI();
  // ----- form state -----
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseStaffId, setExpenseStaffId] = useState("");
  const [expenseStaffName, setExpenseStaffName] = useState("");
  const [expenseStaffEmail, setExpenseStaffEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const itemInputRef = useRef(null);

  // Services and staff from shared hooks
  const { parentServices: serviceItems, expenseServiceNames: expenseServiceItems } = useServiceList();
  const { staffOptions } = useStaffList();
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  // dialogs
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);

  // ----- table state -----
  const [transactions, setTransactions] = useState([]);
  const [selectedTransactions, setSelectedTransactions] = useState([]);

  // Bulk date edit
  const [bulkOpen, setBulkOpen] = useState(false);
  const shiftStart =
    shift?.startTime?.seconds
      ? new Date(shift.startTime.seconds * 1000)
      : shift?.startTime instanceof Date
        ? shift.startTime
        : new Date();
  const [bulkDateTime, setBulkDateTime] = useState(toDatetimeLocal(shiftStart));

  const isDebtItem = item === "New Debt" || item === "Paid Debt";

  // Confirmation Dialog State


  // Consolidation Dialog State
  const [consolidationOpen, setConsolidationOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  // ----- NEW: Tab + Drawer + Orders state -----
  const [activeTab, setActiveTab] = useState(0);
  const [txDrawerOpen, setTxDrawerOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  // Transactions onSnapshot
  useEffect(() => {
    if (!shift?.id) return;
    const q = query(
      collection(db, "transactions"),
      where("shiftId", "==", shift.id),
      orderBy("timestamp", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .filter(d => d.isDeleted !== true);
      setTransactions(docs);
    });
    return () => unsubscribe();
  }, [shift]);

  // Orders onSnapshot
  useEffect(() => {
    if (!shift?.id) return;
    setOrdersLoading(true);
    const q = query(
      collection(db, "orders"),
      where("shiftId", "==", shift.id),
      orderBy("timestamp", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setOrdersLoading(false);
    });
    return () => unsub();
  }, [shift?.id]);

  useEffect(() => {
    if (
      (expenseType === "Salary" || expenseType === "Salary Advance") &&
      !expenseStaffId &&
      staffOptions.length
    ) {
      const s =
        staffOptions.find((o) => o.email === shift.staffEmail) ||
        staffOptions[0];
      if (s) {
        setExpenseStaffId(s.id);
        setExpenseStaffName(s.fullName);
        setExpenseStaffEmail(s.email);
      }
    }
  }, [expenseType, staffOptions, expenseStaffId, shift.staffEmail]);

  const handleItemChange = (e) => {
    const val = e.target.value;
    setItem(val);
    const svc = serviceItems.find((s) => s.serviceName === val);
    if (svc && typeof svc.price === "number") setPrice(svc.price);
    else setPrice("");

    if (val !== "New Debt" && val !== "Paid Debt") setSelectedCustomer(null);
    if (val !== "Expenses") {
      setExpenseType("");
      setExpenseStaffId("");
      setExpenseStaffName("");
      setExpenseStaffEmail("");
    }
  };

  const handleStaffSelect = (uid) => {
    setExpenseStaffId(uid);
    const found = staffOptions.find((s) => s.id === uid);
    setExpenseStaffName(found?.fullName || "");
    setExpenseStaffEmail(found?.email || "");
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setOpenCustomerDialog(false);
  };

  useEffect(() => {
    if (!currentlyEditing) return;
    const t = currentlyEditing;
    setItem(t.item || "");
    setExpenseType(t.expenseType || "");
    setExpenseStaffId(t.expenseStaffId || "");
    setExpenseStaffName(t.expenseStaffName || "");
    setExpenseStaffEmail(t.expenseStaffEmail || "");
    const rawQty = t.quantity;
    setQuantity(String((rawQty !== null && rawQty !== undefined && !isNaN(Number(rawQty))) ? Number(rawQty) : 1));
    setPrice(String(t.price ?? ""));
    setNotes(t.notes || "");
    if (t.customerId && t.customerName) {
      setSelectedCustomer({ id: t.customerId, fullName: t.customerName });
    } else {
      setSelectedCustomer(null);
    }
    setTimeout(() => itemInputRef.current?.focus(), 50);
  }, [currentlyEditing]);

  const clearForm = () => {
    setItem("");
    setExpenseType("");
    setExpenseStaffId("");
    setExpenseStaffName("");
    setExpenseStaffEmail("");
    setQuantity("");
    setPrice("");
    setNotes("");
    setSelectedCustomer(null);
    setCurrentlyEditing(null);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    if (!quantity || price === "") {
      showSnackbar("Please enter both a quantity and a price.", 'warning');
      return;
    }
    if (Number(quantity) <= 0) {
      showSnackbar("Quantity must be a positive number.", 'warning');
      return;
    }
    if (item === "Expenses") {
      if (!expenseType) {
        showSnackbar("Please select an expense type.", 'warning');
        return;
      }
      if (
        (expenseType === "Salary" || expenseType === "Salary Advance") &&
        !expenseStaffId
      ) {
        showSnackbar("Please select a staff for Salary or Salary Advance.", 'warning');
        return;
      }
    }
    if (
      (item === "New Debt" || item === "Paid Debt") &&
      !selectedCustomer &&
      !currentlyEditing
    ) {
      showSnackbar("Please select a customer for this transaction.", 'warning');
      return;
    }

    const data = {
      item,
      expenseType: item === "Expenses" ? expenseType : null,
      expenseStaffId: item === "Expenses" ? expenseStaffId || null : null,
      expenseStaffName: item === "Expenses" ? expenseStaffName || null : null,
      expenseStaffEmail: item === "Expenses" ? expenseStaffEmail || null : null,
      quantity: Number(quantity),
      price: Number(price),
      total: Number(quantity) * Number(price),
      notes,
      customerId: selectedCustomer ? selectedCustomer.id : null,
      customerName: selectedCustomer ? selectedCustomer.fullName : null,
    };

    try {
      if (currentlyEditing) {
        showConfirm({
          title: "Edit Transaction",
          message: "Please provide a reason for this edit.",
          requireReason: true,
          confirmLabel: "Save Changes",
          confirmColor: "primary",
          onConfirm: async (reason) => {
            try {
              await updateDoc(doc(db, "transactions", currentlyEditing.id), {
                ...data,
                isEdited: true,
                editedBy: auth.currentUser?.email || "admin",
                editReason: reason,
                lastUpdatedAt: serverTimestamp(),
              });
              showSnackbar("Transaction updated.", 'success');
              clearForm();
              setTxDrawerOpen(false);
            } catch (err) {
              console.error(err);
              showSnackbar("Failed to save transaction.", 'error');
            }
          }
        });
        return;
      } else {
        const tsDate =
          shift?.startTime?.seconds
            ? new Date(shift.startTime.seconds * 1000)
            : shift?.startTime instanceof Date
              ? shift.startTime
              : new Date();

        const displayId = item === "Expenses"
          ? await generateDisplayId("expenses", "EXP")
          : await generateDisplayId("transactions", "TX");

        await addDoc(collection(db, "transactions"), {
          ...data,
          displayId,
          shiftId: shift.id,
          staffEmail: shift.staffEmail,
          addedByAdmin: true,
          addedBy: auth.currentUser?.email || "",
          isDeleted: false,
          isEdited: false,
          timestamp: tsDate,
        });
        showSnackbar("Transaction added.", 'success');
      }
      clearForm();
      setTxDrawerOpen(false);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to save transaction.", 'error');
    }
  };

  const handleEnterSubmit = (e) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const handleRowDelete = async (tx) => {
    showConfirm({
      title: "Delete Entry",
      message: `Are you sure you want to delete this entry for ${fmtPeso(tx.total)}?`,
      requireReason: true,
      confirmLabel: "Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", tx.id), {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: auth.currentUser?.email || "admin",
            deleteReason: reason,
          });
          showSnackbar("Entry deleted.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to delete entry.", 'error');
        }
      }
    });
  };

  const handleUnlink = async (tx) => {
    showConfirm({
      title: "Unlink Transaction",
      message: "Are you sure? This will remove the transaction from this shift but keep the record in the database.",
      requireReason: true,
      confirmLabel: "Unlink",
      confirmColor: "warning",
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", tx.id), {
            shiftId: null,
            isEdited: true,
            editedBy: auth.currentUser?.email || "admin",
            editReason: `Unlinked from shift: ${reason}`,
            lastUpdatedAt: serverTimestamp(),
          });
          showSnackbar("Transaction unlinked.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to unlink transaction.", 'error');
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedTransactions.length) return;

    showConfirm({
      title: "Bulk Delete",
      message: `Are you sure you want to delete ${selectedTransactions.length} entries?`,
      requireReason: true,
      confirmLabel: "Delete All",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          const batch = writeBatch(db);
          selectedTransactions.forEach((id) => {
            batch.update(doc(db, "transactions", id), {
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: auth.currentUser?.email || "admin",
              deleteReason: reason,
            });
          });
          await batch.commit();
          setSelectedTransactions([]);
          showSnackbar(`${selectedTransactions.length} entries deleted.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to bulk delete.", 'error');
        }
      }
    });
  };

  const openBulkDateDialog = () => {
    if (selectedTransactions.length === 1) {
      const row = transactions.find((t) => t.id === selectedTransactions[0]);
      const d =
        row?.timestamp?.seconds
          ? new Date(row.timestamp.seconds * 1000)
          : row?.timestamp instanceof Date
            ? row.timestamp
            : shiftStart;
      setBulkDateTime(toDatetimeLocal(d));
    } else {
      setBulkDateTime(toDatetimeLocal(shiftStart));
    }
    setBulkOpen(true);
  };

  const saveBulkDate = async () => {
    if (!selectedTransactions.length) return;
    const when = fromDatetimeLocal(bulkDateTime);

    showConfirm({
      title: "Bulk Date Edit",
      message: `Are you sure you want to change the date/time for ${selectedTransactions.length} entries to ${fmtDateTime(when)}?`,
      requireReason: true,
      confirmLabel: "Update Dates",
      confirmColor: "primary",
      onConfirm: async (reason) => {
        try {
          const batch = writeBatch(db);
          selectedTransactions.forEach((id) => {
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
          setSelectedTransactions([]);
          showSnackbar(`${selectedTransactions.length} entries updated.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to update dates.", 'error');
        }
      }
    });
  };

  const quickSetShiftStart = async () => {
    if (!selectedTransactions.length) return;

    showConfirm({
      title: "Bulk Date Reset",
      message: `Set ${selectedTransactions.length} entries to shift start time (${fmtDateTime(shiftStart)})?`,
      requireReason: true,
      confirmLabel: "Reset Dates",
      confirmColor: "primary",
      onConfirm: async (reason) => {
        try {
          const when = shiftStart;
          const batch = writeBatch(db);
          selectedTransactions.forEach((id) => {
            batch.update(doc(db, "transactions", id), {
              timestamp: when,
              isEdited: true,
              editedBy: auth.currentUser?.email || "admin",
              editReason: reason,
              lastUpdatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
          setSelectedTransactions([]);
          showSnackbar(`${selectedTransactions.length} entries reset to shift start.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to set dates to shift start.", 'error');
        }
      }
    });
  };

  const handleEditOrderDate = (order) => {
    setEditingOrder(order);
    const d = order.timestamp?.seconds
      ? new Date(order.timestamp.seconds * 1000)
      : order.timestamp instanceof Date
        ? order.timestamp
        : new Date();
    setBulkDateTime(toDatetimeLocal(d));
    setBulkOpen(true);
  };

  const saveOrderDate = async () => {
    if (!editingOrder) return;
    const when = fromDatetimeLocal(bulkDateTime);

    showConfirm({
      title: "Edit Order Date",
      message: `Update order ${editingOrder.orderNumber} and its transactions to ${fmtDateTime(when)}?`,
      requireReason: true,
      confirmLabel: "Update Date",
      confirmColor: "primary",
      onConfirm: async (reason) => {
        try {
          await updateOrderTimestamp(
            editingOrder.id,
            editingOrder.orderNumber,
            when,
            auth.currentUser?.email || "admin",
            reason
          );
          setBulkOpen(false);
          setEditingOrder(null);
          showSnackbar("Order and transactions updated.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar("Failed to update order date.", 'error');
        }
      }
    });
  };

  const handleExportCSV = () => {
    if (!transactions.length) return;

    const headers = [
      "Date",
      "Time",
      "Item",
      "Type",
      "Quantity",
      "Price",
      "Total",
      "Details/Notes",
      "Staff/Customer",
      "Added By",
      "Edited By"
    ];

    const rows = transactions.map((tx) => {
      const date = tx.timestamp?.seconds
        ? fmtDate(tx.timestamp.seconds * 1000)
        : "";
      const time = tx.timestamp?.seconds
        ? fmtTime(tx.timestamp.seconds * 1000)
        : "";

      const type = tx.item === "Expenses" ? "Expense" : "Service";
      const txNotes = (tx.notes || "").replace(/"/g, '""');

      let identifier = "";
      if (tx.item === "Expenses") {
        identifier = `${tx.expenseType || ""} ${tx.expenseStaffName ? "(" + tx.expenseStaffName + ")" : ""}`;
      } else if (tx.customerName) {
        identifier = tx.customerName;
      }

      return [
        `"${date}"`,
        `"${time}"`,
        `"${tx.item || ""}"`,
        `"${type}"`,
        tx.quantity || 0,
        tx.price || 0,
        tx.total || 0,
        `"${txNotes}"`,
        `"${identifier}"`,
        `"${tx.addedBy || ""}"`,
        `"${tx.editedBy || ""}"`
      ].join(",");
    });

    downloadCSV(
      [headers.join(","), ...rows].join("\n"),
      `shift_${shift.id || "export"}_transactions.csv`
    );
  };

  // Single source of truth for all shift financial computations
  const financials = useMemo(
    () => computeShiftFinancials(transactions, shift.pcRentalTotal || 0),
    [transactions, shift.pcRentalTotal]
  );

  const {
    servicesTotal,
    expensesTotal,
    totalCash: cashSalesTotal,
    totalDigital: gcashSalesTotal,
    totalAr: arSalesTotal,
    systemTotal,
    salesBreakdown,
    expensesBreakdown,
    expectedCash,
  } = financials;

  useEffect(() => {
    let t;
    const write = async () => {
      try {
        await updateDoc(doc(db, "shifts", shift.id), {
          servicesTotal,
          expensesTotal,
          systemTotal,
        });
      } catch (e) {
        console.warn("Totals write skipped/failed:", e?.message || e);
      }
    };
    t = setTimeout(write, 500);
    return () => clearTimeout(t);
  }, [servicesTotal, expensesTotal, systemTotal, shift.id]);

  const formatTime = (ts) =>
    ts?.seconds
      ? fmtTime(ts.seconds * 1000)
      : ts instanceof Date
        ? fmtTime(ts)
        : "—";

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Header */}
      <Box sx={{ p: 2, pb: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          size="small"
          variant="outlined"
        >
          Back
        </Button>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" fontWeight={700}>
            {shift.displayId || 'Shift Detail'} — {shift.shiftPeriod || ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {userMap[shift.staffEmail] || shift.staffEmail} ·{' '}
            {shift.startTime?.seconds
              ? fmtDateTime(shift.startTime.seconds * 1000)
              : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            startIcon={<AssignmentTurnedInIcon />}
            onClick={() => setConsolidationOpen(true)}
            size="small"
          >
            Consolidate
          </Button>
          <Tooltip title="Debug Calculations">
            <IconButton size="small" color="warning" onClick={() => setDebugOpen(true)}>
              <BugReportIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export CSV">
            <IconButton size="small" onClick={handleExportCSV}>
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider', mt: 1 }}
      >
        <Tab label="Summary" />
        <Tab label={`Transactions (${transactions.length})`} />
        <Tab label={`Orders (${orders.length})`} />
      </Tabs>

      {/* Tab panels */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>

        {/* TAB 0: Summary */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SummaryCards cards={[
              { label: 'System Total', value: fmtPeso(systemTotal || 0), highlight: true, color: 'primary.main' },
              { label: 'Services', value: fmtPeso(servicesTotal || 0), color: 'success.main' },
              { label: 'Cash', value: fmtPeso(cashSalesTotal || 0), color: 'success.main' },
              { label: 'Digital', value: fmtPeso(gcashSalesTotal || 0), color: 'info.main' },
              { label: 'A/R', value: fmtPeso(arSalesTotal || 0), color: 'warning.main' },
              { label: 'Expenses', value: fmtPeso(expensesTotal || 0), color: 'error.main' },
              { label: 'Expected Cash', value: fmtPeso(expectedCash || 0), color: 'text.primary' },
            ]} />

            {/* Service breakdown */}
            {salesBreakdown && salesBreakdown.length > 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Sales Breakdown
                </Typography>
                {salesBreakdown.map(([name, total]) => (
                  <Box key={name} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography variant="body2">{name}</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtPeso(total)}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" fontWeight={700}>Services Total</Typography>
                  <Typography variant="body2" fontWeight={700}>{fmtPeso(servicesTotal)}</Typography>
                </Box>
              </Paper>
            )}

            {/* Expenses breakdown */}
            {expensesBreakdown && expensesBreakdown.length > 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Expenses Breakdown
                </Typography>
                {expensesBreakdown.map(([name, total]) => (
                  <Box key={name} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography variant="body2">{name}</Typography>
                    <Typography variant="body2" fontWeight={600} color="error.main">{fmtPeso(total)}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" fontWeight={700}>Expenses Total</Typography>
                  <Typography variant="body2" fontWeight={700} color="error.main">{fmtPeso(expensesTotal)}</Typography>
                </Box>
              </Paper>
            )}

            {/* PC Rental */}
            {(shift.pcRentalTotal > 0) && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  PC Rental
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">PC Rental Total (manual)</Typography>
                  <Typography variant="body2" fontWeight={600}>{fmtPeso(shift.pcRentalTotal || 0)}</Typography>
                </Box>
              </Paper>
            )}

            {/* Payment method summary */}
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Payment Methods
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2">Cash Sales</Typography>
                <Typography variant="body2" fontWeight={600}>{fmtPeso(cashSalesTotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2">Digital Sales</Typography>
                <Typography variant="body2" fontWeight={600}>{fmtPeso(gcashSalesTotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2">Receivables (A/R)</Typography>
                <Typography variant="body2" fontWeight={600}>{fmtPeso(arSalesTotal)}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight={700}>Expected Cash in Drawer</Typography>
                <Typography variant="body2" fontWeight={700} color="success.main">{fmtPeso(expectedCash)}</Typography>
              </Box>
            </Paper>
          </Box>
        )}

        {/* TAB 1: Transactions */}
        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => { clearForm(); setTxDrawerOpen(true); }}
              >
                Add Transaction
              </Button>
              {selectedTransactions.length > 0 && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={openBulkDateDialog}
                  >
                    Edit Dates ({selectedTransactions.length})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={quickSetShiftStart}
                  >
                    Set to Shift Start
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleBulkDelete}
                  >
                    Delete Selected ({selectedTransactions.length})
                  </Button>
                </>
              )}
            </Box>

            <TableContainer component={Paper}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        indeterminate={
                          selectedTransactions.length > 0 &&
                          selectedTransactions.length < transactions.length
                        }
                        checked={
                          transactions.length > 0 &&
                          selectedTransactions.length === transactions.length
                        }
                        onChange={() => {
                          if (selectedTransactions.length === transactions.length) {
                            setSelectedTransactions([]);
                          } else {
                            setSelectedTransactions(transactions.map((t) => t.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Method</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedTransactions.includes(tx.id)}
                          onChange={() =>
                            setSelectedTransactions((prev) =>
                              prev.includes(tx.id)
                                ? prev.filter((i) => i !== tx.id)
                                : [...prev, tx.id]
                            )
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(tx.timestamp)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600}>
                            {tx.item}
                          </Typography>
                          {tx.notes && (
                            <Tooltip title={tx.notes}>
                              <CommentIcon fontSize="inherit" />
                            </Tooltip>
                          )}
                          {tx.isEdited && (
                            <Tooltip title="Edited">
                              <HistoryIcon fontSize="inherit" />
                            </Tooltip>
                          )}
                          {tx.addedByAdmin && (
                            <Typography
                              variant="caption"
                              sx={{ border: '1px solid', px: 0.5, borderColor: 'divider' }}
                            >
                              admin
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.item === 'Expenses'
                          ? `${tx.expenseType || ''} · ${tx.expenseStaffName || ''}`
                          : identifierText(tx)}
                      </TableCell>
                      <TableCell>{tx.customerName || '—'}</TableCell>
                      <TableCell align="right">{tx.quantity}</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {fmtPeso(tx.price || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {fmtPeso(tx.total || 0)}
                      </TableCell>
                      <TableCell>{tx.paymentMethod || '—'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Unlink from Shift">
                          <IconButton size="small" onClick={() => handleUnlink(tx)} color="warning">
                            <LinkOffIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setCurrentlyEditing(tx);
                              setTxDrawerOpen(true);
                            }}
                          >
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleRowDelete(tx)}>
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* TAB 2: Orders */}
        {activeTab === 2 && (
          <Box>
            {ordersLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : orders.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No orders linked to this shift.
              </Typography>
            ) : (
              <TableContainer component={Paper}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Order #</TableCell>
                      <TableCell>Date/Time</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell>Items</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {o.orderNumber || o.id.slice(-6)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {o.timestamp ? fmtDateTime(o.timestamp) : ''}
                        </TableCell>
                        <TableCell>{o.customerName || 'Walk-in'}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          {(o.items || []).length} item(s)
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {fmtPeso(o.total || 0)}
                        </TableCell>
                        <TableCell>{o.paymentMethod || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label={o.status || 'completed'}
                            size="small"
                            color={o.status === 'pending' ? 'warning' : 'success'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit Date/Time">
                            <IconButton
                              size="small"
                              onClick={() => handleEditOrderDate(o)}
                            >
                              <EditIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Box>

      {/* Transaction Add/Edit Drawer */}
      <DetailDrawer
        open={txDrawerOpen}
        onClose={() => { setTxDrawerOpen(false); clearForm(); }}
        title={currentlyEditing ? 'Edit Transaction' : 'Add Transaction'}
        subtitle={
          currentlyEditing
            ? `Editing: ${currentlyEditing.item || ''}`
            : `Shift: ${shift.displayId || ''}`
        }
        actions={
          <>
            <Button onClick={() => { setTxDrawerOpen(false); clearForm(); }}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={isDebtItem && !selectedCustomer && !currentlyEditing}
            >
              {currentlyEditing ? 'Save Changes' : 'Add Transaction'}
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <FormControl fullWidth required>
            <InputLabel>Item</InputLabel>
            <Select
              value={item}
              label="Item"
              onChange={handleItemChange}
              inputRef={itemInputRef}
            >
              {serviceItems.map((s) => (
                <MenuItem key={s.id} value={s.serviceName}>
                  {s.serviceName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {item === "Expenses" && (
            <>
              <FormControl fullWidth required>
                <InputLabel>Expense Type</InputLabel>
                <Select
                  label="Expense Type"
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                >
                  {expenseServiceItems.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(expenseType === "Salary" || expenseType === "Salary Advance") && (
                <FormControl fullWidth required>
                  <InputLabel>Staff</InputLabel>
                  <Select
                    label="Staff"
                    value={expenseStaffId}
                    onChange={(e) => handleStaffSelect(e.target.value)}
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
            </>
          )}

          {(item === "New Debt" || item === "Paid Debt") && (
            <Box sx={{ p: 1, border: '1px dashed grey', borderRadius: 1 }}>
              <Typography variant="caption">Customer</Typography>
              {selectedCustomer ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                  <Typography>
                    <strong>{selectedCustomer.fullName}</strong>
                  </Typography>
                  <IconButton size="small" onClick={() => setSelectedCustomer(null)}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <Button
                  onClick={() => setOpenCustomerDialog(true)}
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 0.5 }}
                >
                  Select Customer
                </Button>
              )}
            </Box>
          )}

          <TextField
            type="number"
            label="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={handleEnterSubmit}
            required
            fullWidth
          />
          <TextField
            type="number"
            label="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={handleEnterSubmit}
            required
            fullWidth
          />
          <Typography variant="body2">
            Total: {fmtPeso(Number(quantity || 0) * Number(price || 0))}
          </Typography>
          <TextField
            label="Notes (Optional)"
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />
        </Stack>
      </DetailDrawer>

      {/* Bulk Date Dialog */}
      <Dialog 
        open={bulkOpen} 
        onClose={() => {
          setBulkOpen(false);
          setEditingOrder(null);
        }} 
        fullWidth 
        maxWidth="xs"
      >
        <DialogTitle>{editingOrder ? "Edit Order Date/Time" : "Edit Transaction Date/Time"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date & Time"
              type="datetime-local"
              value={bulkDateTime}
              onChange={(e) => setBulkDateTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {editingOrder 
                ? `Updating order ${editingOrder.orderNumber} and all linked transactions.` 
                : `Updating ${selectedTransactions.length} entr${selectedTransactions.length === 1 ? "y" : "ies"}.`
              }
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setBulkOpen(false);
            setEditingOrder(null);
          }}>Cancel</Button>
          <Button variant="contained" onClick={editingOrder ? saveOrderDate : saveBulkDate}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Customer Dialog */}
      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={{ email: shift.staffEmail }}
      />

      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelect={handleSelectCustomer}
      />

      {/* Consolidation Dialog */}
      {consolidationOpen && (
        <ShiftConsolidationDialog
          open={consolidationOpen}
          onClose={() => setConsolidationOpen(false)}
          shift={shift}
          transactions={transactions}
        />
      )}

      {/* Debugger Dialog */}
      <ShiftAuditDebugger
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        shift={shift}
        transactions={transactions}
        serviceItems={serviceItems}
      />
    </Box>
  );
}
