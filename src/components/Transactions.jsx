// src/components/Transactions.jsx
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
  Button,
  Stack,
  Divider,
  Checkbox,
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
  Chip,
  LinearProgress,
  CircularProgress,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PrintIcon from "@mui/icons-material/Print";
import VisibilityIcon from "@mui/icons-material/Visibility";
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
  getDoc,
  limit,
  startAfter,
  getDocs,
} from "firebase/firestore";
import { generateDisplayId, generateBatchIds } from "../utils/idGenerator";
import { db, auth } from "../firebase";
import { SimpleReceipt } from "./SimpleReceipt";
import { ServiceInvoice } from "./ServiceInvoice";
import { normalizeReceiptData, normalizeInvoiceData, safePrint, safePrintInvoice } from "../utils/printHelper";
import LoadingScreen from './common/LoadingScreen';
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import PageHeader from "./common/PageHeader";
import DetailDrawer from "./common/DetailDrawer";
import SummaryCards from "./common/SummaryCards";
import { useStaffList } from "../hooks/useStaffList";
import { useServiceList } from "../hooks/useServiceList";
import { useShiftOptions } from "../hooks/useShiftOptions";
import {
  fmtCurrency,
  toDateInput,
  toDatetimeLocal,
  fromDatetimeLocal,
  fmtDateTime,
  identifierText,
  startOfMonth,
  endOfMonth,
  downloadCSV,
} from "../utils/formatters";

// toTimeInput is not in formatters.js — kept here
const toTimeInput = (d) => {
  const x = new Date(d);
  const HH = String(x.getHours()).padStart(2, '0');
  const MM = String(x.getMinutes()).padStart(2, '0');
  return `${HH}:${MM}`;
};

// currency alias for local usage
const currency = fmtCurrency;

/* ---------- component ---------- */
const Transactions = ({ showSnackbar }) => {
  // Filters
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(toDateInput(startOfMonth()));
  const [end, setEnd] = useState(toDateInput(endOfMonth()));
  const [staffEmail, setStaffEmail] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [showDeleted, setShowDeleted] = useState(true);
  const [onlyDeleted, setOnlyDeleted] = useState(false);
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [servicesFilter, setServicesFilter] = useState([]);

  // Unified status filter that drives showDeleted / onlyDeleted / onlyEdited
  const [filterStatus, setFilterStatus] = useState("all");

  // Option lists from shared hooks
  const { staffOptions, userMap } = useStaffList();
  const { parentServiceNames: serviceItems, expenseServiceNames: expenseServiceItems } = useServiceList();

  // Shift options via hook (replaces manual useEffect + useState)
  const { shiftOptions } = useShiftOptions({ startDate: start, endDate: end, emailToName: userMap });

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
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  // Bulk date dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDT, setBulkDT] = useState(toDatetimeLocal(new Date()));

  // Settings for Receipt
  const [systemSettings, setSystemSettings] = useState({});

  useEffect(() => {
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) setSystemSettings(snap.data());
    });
  }, []);

  // Printing State
  const [reprintOrder, setReprintOrder] = useState(null);
  const [printInvoiceData, setPrintInvoiceData] = useState(null);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    requireReason: true,
    onConfirm: () => { },
    confirmText: 'Confirm',
    confirmColor: 'error'
  });

  // Detail Drawer state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);

  const openDetail = (row) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  /* ---- Pagination State ---- */
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  /* ---- Wide range detection ---- */
  const isWideRange = useMemo(() => {
    const duration = new Date(end) - new Date(start);
    return duration > 45 * 24 * 60 * 60 * 1000; // > 45 days
  }, [start, end]);

  const attachStream = async (mode = "month") => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    setInitLoading(true);
    setLastDoc(null);
    setHasMore(true);

    if (mode === "all" || isWideRange) {
      setLiveMode(mode === "all" ? "all" : "archive");
      setTx([]);
      await fetchNextPage(true, mode === "all");
      setInitLoading(false);
    } else {
      setLiveMode("month");
      const s = new Date(start); s.setHours(0, 0, 0, 0);
      const e = new Date(end); e.setHours(23, 59, 59, 999);

      const qRef = query(
        collection(db, "transactions"),
        where("timestamp", ">=", s),
        where("timestamp", "<=", e),
        orderBy("timestamp", "desc"),
        limit(200)
      );

      const unsub = onSnapshot(qRef, (snap) => {
        setTx(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setInitLoading(false);
      }, (err) => {
        console.error("Stream error", err);
        setInitLoading(false);
      });
      unsubRef.current = unsub;
    }
  };

  const fetchNextPage = async (isReset = false, forceAll = false) => {
    setLoadingMore(true);
    try {
      let constraints = [
        orderBy("timestamp", "desc"),
        limit(50)
      ];

      if (!forceAll && liveMode !== "all" && liveMode !== "archive_all") {
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        const e = new Date(end); e.setHours(23, 59, 59, 999);
        constraints.push(where("timestamp", ">=", s));
        constraints.push(where("timestamp", "<=", e));
      }

      if (!isReset && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(collection(db, "transactions"), ...constraints);
      const snap = await getDocs(q);

      const newRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (isReset) {
        setTx(newRows);
      } else {
        setTx(prev => [...prev, ...newRows]);
      }

      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 50);

    } catch (err) {
      console.error("Pagination error", err);
      showSnackbar?.("Failed to load more.", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  /* ---- Fetch ALL rows without limits ---- */
  const fetchAllTransactions = async (forceAllTime = false) => {
    setLoadingMore(true);
    setInitLoading(true);
    setLiveMode("archive_all");

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    try {
      let constraints = [orderBy("timestamp", "desc")];

      if (!forceAllTime) {
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        const e = new Date(end); e.setHours(23, 59, 59, 999);
        constraints.push(where("timestamp", ">=", s));
        constraints.push(where("timestamp", "<=", e));
      }

      const q = query(collection(db, "transactions"), ...constraints);
      const snap = await getDocs(q);

      const newRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      setTx(newRows);
      setLastDoc(null);
      setHasMore(false);

      showSnackbar?.(`Loaded ${newRows.length} transactions.`, 'success');
    } catch (err) {
      console.error("Fetch All error", err);
      showSnackbar?.("Failed to load all transactions.", "error");
    } finally {
      setLoadingMore(false);
      setInitLoading(false);
    }
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
    let sales = 0, expenses = 0;
    rows.forEach((r) => {
      const amt = Number(r.total || 0);
      if (r.item === "Expenses" || r.item === "New Debt") expenses += amt;
      else sales += amt;
    });
    return { sales, expenses, net: sales - expenses };
  }, [rows]);

  /* ---- Handle filterStatus changes (unified status select) ---- */
  const handleFilterStatus = (val) => {
    setFilterStatus(val);
    if (val === "all") {
      setShowDeleted(true);
      setOnlyDeleted(false);
      setOnlyEdited(false);
    } else if (val === "active") {
      setShowDeleted(false);
      setOnlyDeleted(false);
      setOnlyEdited(false);
    } else if (val === "deleted") {
      setShowDeleted(true);
      setOnlyDeleted(true);
      setOnlyEdited(false);
    } else if (val === "edited") {
      setShowDeleted(true);
      setOnlyDeleted(false);
      setOnlyEdited(true);
    }
  };

  /* ---- Actions ---- */
  const exportCSV = () => {
    const headers = [
      "Timestamp", "Item", "Qty", "Price", "Total", "Identifier",
      "Notes", "Staff Email", "Shift ID", "Added By Admin", "Source",
      "Is Deleted", "Deleted By", "Delete Reason", "Edited", "Edited By",
      "Edit Reason", "Last Updated At",
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
    downloadCSV(
      lines.join("\n"),
      `transactions_${liveMode === "all" ? "ALL" : `${start}_to_${end}`}.csv`
    );
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
    setFilterStatus("all");
    attachStream("month");
  };

  /* ---- Reprint Handler ---- */
  const handleReprint = async (row) => {
    try {
      let rawOrder;
      if (row.orderId) {
        const orderRef = doc(db, 'orders', row.orderId);
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
          rawOrder = { id: snap.id, ...snap.data() };
        } else {
          showSnackbar?.("Order record not found (deleted?).", 'error');
          return;
        }
      } else {
        rawOrder = {
          id: row.id,
          orderNumber: row.orderNumber || "ADHOC",
          timestamp: row.timestamp,
          staffName: row.staffEmail || 'Staff',
          customerName: row.customerName || 'Walk-in',
          items: [{
            name: row.item,
            quantity: row.quantity,
            price: row.price,
            total: row.total,
            subtotal: row.total
          }],
          total: row.total,
          subtotal: row.total,
          amountTendered: row.total,
          change: 0,
          paymentMethod: "Manual"
        };
      }

      const printData = normalizeReceiptData(rawOrder, {
        staffName: rawOrder.staffName || 'Staff',
        isReprint: true
      });
      setReprintOrder(printData);

    } catch (e) {
      console.error("Reprint error:", e);
      showSnackbar?.("Failed to load order for printing.", 'error');
    }
  };

  const isPrintingReprint = useRef(false);
  useEffect(() => {
    let timer;
    if (reprintOrder && !isPrintingReprint.current) {
      isPrintingReprint.current = true;
      timer = setTimeout(() => {
        safePrint(() => {
          setReprintOrder(null);
          isPrintingReprint.current = false;
        }, "Transactions");
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [reprintOrder]);

  /* ---- Print Invoice Handler ---- */
  const handlePrintInvoice = async (row) => {
    try {
      let rawOrder;
      if (row.orderId) {
        const orderRef = doc(db, 'orders', row.orderId);
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
          rawOrder = { id: snap.id, ...snap.data() };
        } else {
          showSnackbar?.("Order record not found.", 'error');
          return;
        }
      } else {
        rawOrder = {
          id: row.id,
          orderNumber: row.orderNumber || "ADHOC",
          timestamp: row.timestamp,
          staffName: row.staffEmail || 'Staff',
          customerName: row.customerName || 'Walk-in',
          items: [{
            name: row.item,
            quantity: row.quantity,
            price: row.price,
            total: row.total,
            subtotal: row.total
          }],
          total: row.total,
          subtotal: row.total,
          amountTendered: row.total,
          change: 0,
          paymentMethod: "Manual"
        };
      }

      const invData = normalizeInvoiceData(rawOrder, {
        staffName: rawOrder.staffName || 'Staff',
        isReprint: true
      });
      setPrintInvoiceData(invData);

    } catch (e) {
      console.error("Invoice Print error:", e);
      showSnackbar?.("Failed to load invoice data.", 'error');
    }
  };

  const isPrintingInvoice = useRef(false);
  useEffect(() => {
    let timer;
    if (printInvoiceData && !isPrintingInvoice.current) {
      isPrintingInvoice.current = true;
      timer = setTimeout(() => {
        safePrintInvoice(() => {
          setPrintInvoiceData(null);
          isPrintingInvoice.current = false;
        }, "Transactions-Invoice");
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [printInvoiceData]);

  /* ---- Delete (soft, single) ---- */
  const softDelete = (row) => {
    setConfirmDialog({
      open: true,
      title: "Delete Transaction",
      message: `Are you sure you want to delete this transaction for ${currency(row.total)}?`,
      requireReason: true,
      confirmText: "Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", row.id), {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: auth.currentUser?.email || "admin",
            deleteReason: reason,
          });
          setSelectedIds((prev) => prev.filter((id) => id !== row.id));
          showSnackbar?.("Transaction deleted.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to delete transaction.", 'error');
        }
      }
    });
  };

  /* ---- HARD DELETE (single) ---- */
  const hardDelete = (row) => {
    setConfirmDialog({
      open: true,
      title: "PERMANENT Delete",
      message: "This will PERMANENTLY delete this transaction from the database. This cannot be undone.",
      requireReason: false,
      confirmText: "Permanently Delete",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "transactions", row.id));
          setSelectedIds((prev) => prev.filter((id) => id !== row.id));
          showSnackbar?.("Transaction permanently deleted.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Hard delete failed. Permission issue?", 'error');
        }
      }
    });
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

    setConfirmDialog({
      open: true,
      title: "Bulk Date Edit",
      message: `Change date/time for ${selectedIds.length} transaction(s) to ${fmtDateTime(fromDatetimeLocal(bulkDT))}?`,
      requireReason: true,
      confirmText: "Update Dates",
      confirmColor: "primary",
      onConfirm: async (reason) => {
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
          showSnackbar?.(`${selectedIds.length} transaction(s) updated.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to update dates.", 'error');
        }
      }
    });
  };

  /* ---- Bulk SOFT delete ---- */
  function bulkSoftDelete() {
    if (!selectedIds.length) return;

    setConfirmDialog({
      open: true,
      title: "Bulk Delete",
      message: `Are you sure you want to delete ${selectedIds.length} transaction(s)?`,
      requireReason: true,
      confirmText: "Delete Transactions",
      confirmColor: "error",
      onConfirm: async (reason) => {
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
          showSnackbar?.(`${selectedIds.length} transaction(s) deleted.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to delete selected transactions.", 'error');
        }
      }
    });
  }

  /* ---- Bulk HARD delete ---- */
  function bulkHardDelete() {
    if (!selectedIds.length) return;

    setConfirmDialog({
      open: true,
      title: "PERMANENT Bulk Delete",
      message: `PERMANENTLY delete ${selectedIds.length} transaction(s)? This action IS IRREVERSIBLE.`,
      requireReason: false,
      confirmText: "Permanently Delete All",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          selectedIds.forEach((id) => batch.delete(doc(db, "transactions", id)));
          await batch.commit();
          setSelectedIds([]);
          showSnackbar?.(`${selectedIds.length} transaction(s) permanently deleted.`, 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Hard delete failed. Permission issue?", 'error');
        }
      }
    });
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
        showSnackbar?.("Select an expense type.", 'warning');
        return;
      }
      if (
        (editExpenseType === "Salary" || editExpenseType === "Salary Advance") &&
        !editExpenseStaffId &&
        !editExpenseStaffName
      ) {
        showSnackbar?.("Choose a staff for Salary or Salary Advance.", 'warning');
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
    };
    try {
      setConfirmDialog({
        open: true,
        title: "Edit Transaction",
        message: "Please provide a reason for this edit.",
        requireReason: true,
        confirmText: "Save Changes",
        confirmColor: "primary",
        onConfirm: async (reason) => {
          update.editReason = reason;
          try {
            await updateDoc(doc(db, "transactions", editing.id), update);
            closeEdit();
            showSnackbar?.("Transaction updated.", 'success');
          } catch (e) {
            console.error(e);
            showSnackbar?.("Failed to save edit.", 'error');
          }
        }
      });
    } catch (e) {
      console.error(e);
      showSnackbar?.("Failed to initiate edit.", 'error');
    }
  }

  /* ---- VIEW ---- */
  if (initLoading || loading) {
    return <LoadingScreen message={loading ? "Processing..." : "Loading transactions..."} />;
  }

  const isArchiveMode = liveMode === "archive" || liveMode === "all" || liveMode === "archive_all";

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      {/* Hidden printers */}
      <SimpleReceipt order={reprintOrder} settings={systemSettings} />
      <ServiceInvoice order={printInvoiceData} settings={systemSettings} />

      {/* Page Header */}
      <PageHeader
        title="Transaction Log"
        subtitle="Audit trail of all recorded sales and expenses."
        actions={
          selectedIds.length > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ opacity: 0.8 }}>{selectedIds.length} selected</Typography>
              <Button size="small" variant="outlined" onClick={openBulkDateDialog}>Edit Dates</Button>
              <Button size="small" variant="outlined" color="warning" onClick={bulkSoftDelete}>Soft Delete</Button>
              <Button size="small" variant="contained" color="error" onClick={bulkHardDelete}>Hard Delete</Button>
              <Button size="small" onClick={clearSelection}>Clear</Button>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                {rows.length.toLocaleString()} rows
              </Typography>
              {rows.length > 0 && (
                <Button size="small" onClick={selectAllVisible}>Select All</Button>
              )}
            </Stack>
          )
        }
      />

      {/* Summary Cards */}
      <SummaryCards cards={[
        { label: 'Total Sales', value: fmtCurrency(totals.sales), color: 'success.main', highlight: true },
        { label: 'Expenses', value: fmtCurrency(totals.expenses), color: 'error.main', highlight: true },
        { label: 'Net', value: fmtCurrency(totals.net), highlight: true },
        { label: 'Rows', value: rows.length.toLocaleString(), sub: liveMode === 'month' ? 'Live' : 'Archive' },
      ]} />

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" useFlexGap>
          {/* Date range */}
          <TextField
            label="Start"
            type="date"
            size="small"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={liveMode === "all" || liveMode === "archive_all"}
            sx={{ minWidth: 140 }}
          />
          <TextField
            label="End"
            type="date"
            size="small"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={liveMode === "all" || liveMode === "archive_all"}
            sx={{ minWidth: 140 }}
          />

          {/* Staff */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Staff</InputLabel>
            <Select
              label="Staff"
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
            >
              <MenuItem value="">All staff</MenuItem>
              {staffOptions.map((s) => (
                <MenuItem key={s.email} value={s.email}>
                  {s.fullName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Shift */}
          <FormControl size="small" sx={{ minWidth: 220 }}>
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

          {/* Type / Services */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select
              multiple
              label="Type"
              value={servicesFilter}
              onChange={(e) => setServicesFilter(e.target.value)}
              renderValue={(selected) => selected.length === 1 ? selected[0] : `${selected.length} types`}
            >
              {serviceItems.map((svc) => (
                <MenuItem key={svc} value={svc}>
                  <Checkbox checked={servicesFilter.indexOf(svc) > -1} size="small" />
                  {svc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={filterStatus}
              onChange={(e) => handleFilterStatus(e.target.value)}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="deleted">Deleted</MenuItem>
              <MenuItem value="edited">Edited</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />

          {/* Archive mode buttons */}
          {isArchiveMode ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => attachStream("month")}
            >
              Back to Live
            </Button>
          ) : (
            <>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => attachStream("all")}
              >
                Load Archive
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={() => fetchAllTransactions(false)}
              >
                Load All Filtered
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => fetchAllTransactions(true)}
              >
                Load ALL
              </Button>
            </>
          )}

          <Tooltip title="Reset filters">
            <IconButton size="small" onClick={resetFilters}>
              <ClearAllIcon />
            </IconButton>
          </Tooltip>

          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportCSV}
          >
            CSV
          </Button>
        </Stack>
      </Paper>

      {/* Table */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loadingMore && <LinearProgress />}
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={rows.length > 0 && selectedIds.length === rows.length}
                    indeterminate={selectedIds.length > 0 && selectedIds.length < rows.length}
                    onChange={() => selectedIds.length === rows.length ? clearSelection() : selectAllVisible()}
                  />
                </TableCell>
                <TableCell>Date / Time</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell>Order #</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                    No transactions for the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.5 : 1 }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(r.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          r.item === 'Expenses' ? 'Expense'
                          : r.item === 'New Debt' ? 'Debt'
                          : r.item === 'Paid Debt' ? 'Paid Debt'
                          : 'Sale'
                        }
                        size="small"
                        color={
                          r.item === 'Expenses' ? 'warning'
                          : r.item?.includes('Debt') ? 'secondary'
                          : 'success'
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.item === 'Expenses'
                        ? `${r.expenseType || ''}${r.expenseStaffName ? ' · ' + r.expenseStaffName : ''}`
                        : `${r.item}${r.customerName ? ' · ' + r.customerName : ''}${r.quantity > 1 ? ' (×' + r.quantity + ')' : ''}`
                      }
                    </TableCell>
                    <TableCell>
                      {userMap[r.staffEmail] || r.staffEmail || '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {shiftOptions.find(s => s.id === r.shiftId)?.displayId || (r.shiftId ? r.shiftId.slice(-8).toUpperCase() : '—')}
                    </TableCell>
                    <TableCell>
                      {r.orderNumber
                        ? <Chip label={r.orderNumber} size="small" variant="outlined" />
                        : '—'
                      }
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {currency(r.total)}
                    </TableCell>
                    <TableCell>{r.paymentMethod || '—'}</TableCell>
                    <TableCell>
                      {r.isDeleted && <Chip label="Deleted" size="small" color="error" />}
                      {!r.isDeleted && r.isEdited && <Chip label="Edited" size="small" color="info" />}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => openDetail(r)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(r)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Print Receipt">
                        <IconButton size="small" onClick={() => handleReprint(r)}>
                          <PrintIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Soft Delete">
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
                      <Tooltip title="Hard Delete">
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

        {/* Load More */}
        {hasMore && liveMode !== 'month' && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => fetchNextPage(false, liveMode === 'all')}
              disabled={loadingMore}
              startIcon={loadingMore ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </Box>
        )}
      </Paper>

      {/* Detail Drawer */}
      <DetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailRow?.orderNumber || detailRow?.displayId || 'Transaction Detail'}
        subtitle={detailRow ? fmtDateTime(detailRow.timestamp) : ''}
        actions={
          <>
            <Button size="small" onClick={() => { setDetailOpen(false); openEdit(detailRow); }}>Edit</Button>
            <Button size="small" onClick={() => handleReprint(detailRow)}>Print Receipt</Button>
            <Button size="small" onClick={() => handlePrintInvoice(detailRow)}>Print Invoice</Button>
          </>
        }
      >
        {detailRow && (
          <Stack spacing={2.5}>
            {/* Type + Status chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip label={detailRow.item} size="small" />
              {detailRow.paymentMethod && <Chip label={detailRow.paymentMethod} size="small" variant="outlined" />}
              {detailRow.isDeleted && <Chip label="Deleted" size="small" color="error" />}
              {detailRow.isEdited && <Chip label="Edited" size="small" color="info" />}
            </Stack>

            {/* Financials */}
            <Box>
              <Typography variant="caption" color="text.secondary">FINANCIALS</Typography>
              <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Qty</Typography>
                  <Typography fontWeight={600}>{detailRow.quantity}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Price</Typography>
                  <Typography fontWeight={600}>{currency(detailRow.price)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">{currency(detailRow.total)}</Typography>
                </Box>
              </Box>
            </Box>

            <Divider />

            {/* References */}
            <Box>
              <Typography variant="caption" color="text.secondary">REFERENCES</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Order #</Typography>
                  <Typography variant="body2">{detailRow.orderNumber || '—'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Shift</Typography>
                  <Typography variant="body2">
                    {shiftOptions.find(s => s.id === detailRow.shiftId)?.displayId || (detailRow.shiftId ? detailRow.shiftId.slice(-8).toUpperCase() : '—')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Staff</Typography>
                  <Typography variant="body2">{userMap[detailRow.staffEmail] || detailRow.staffEmail || '—'}</Typography>
                </Box>
              </Stack>
            </Box>

            {/* Expense details */}
            {detailRow.item === 'Expenses' && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">EXPENSE DETAILS</Typography>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Type</Typography>
                      <Typography variant="body2">{detailRow.expenseType || '—'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">For Staff</Typography>
                      <Typography variant="body2">{detailRow.expenseStaffName || '—'}</Typography>
                    </Box>
                    {detailRow.financialCategory && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Category</Typography>
                        <Typography variant="body2">{detailRow.financialCategory}</Typography>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </>
            )}

            {/* Customer */}
            {detailRow.customerName && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">CUSTOMER</Typography>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">{detailRow.customerName}</Typography>
                    {detailRow.customerPhone && (
                      <Typography variant="body2" color="text.secondary">{detailRow.customerPhone}</Typography>
                    )}
                  </Stack>
                </Box>
              </>
            )}

            {/* Notes */}
            {detailRow.notes && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">NOTES</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{detailRow.notes}</Typography>
                </Box>
              </>
            )}

            {/* Audit Trail */}
            <Divider />
            <Box>
              <Typography variant="caption" color="text.secondary">AUDIT TRAIL</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Created</Typography>
                  <Typography variant="body2">{fmtDateTime(detailRow.timestamp)}</Typography>
                </Box>
                {detailRow.isEdited && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Edited by</Typography>
                      <Typography variant="body2">{userMap[detailRow.editedBy] || detailRow.editedBy || '—'}</Typography>
                    </Box>
                    {detailRow.editReason && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Edit reason</Typography>
                        <Typography variant="body2">{detailRow.editReason}</Typography>
                      </Box>
                    )}
                  </>
                )}
                {detailRow.isDeleted && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Deleted by</Typography>
                      <Typography variant="body2">{userMap[detailRow.deletedBy] || detailRow.deletedBy || '—'}</Typography>
                    </Box>
                    {detailRow.deleteReason && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Delete reason</Typography>
                        <Typography variant="body2">{detailRow.deleteReason}</Typography>
                      </Box>
                    )}
                  </>
                )}
                {detailRow.source && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Source</Typography>
                    <Typography variant="body2">{detailRow.source}</Typography>
                  </Box>
                )}
              </Stack>
            </Box>

            {/* Danger zone actions */}
            <Divider />
            <Stack spacing={1}>
              {!detailRow.isDeleted && (
                <Button
                  fullWidth
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => { setDetailOpen(false); softDelete(detailRow); }}
                >
                  Delete (Soft)
                </Button>
              )}
              <Button
                fullWidth
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteForeverIcon />}
                onClick={() => { setDetailOpen(false); hardDelete(detailRow); }}
              >
                Permanently Delete
              </Button>
            </Stack>
          </Stack>
        )}
      </DetailDrawer>

      {/* EDIT DIALOG (single row) */}
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
                  <MenuItem key={svc} value={svc}>{svc}</MenuItem>
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
                      <MenuItem key={t} value={t}>{t}</MenuItem>
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
                      {staffOptions.length === 0 ? (
                        <MenuItem value="" disabled>No staff available</MenuItem>
                      ) : (
                        staffOptions.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.fullName} — {s.email}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                )}
              </>
            )}

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
          <Button variant="contained" onClick={saveEdit}>Save</Button>
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
          <Button variant="contained" onClick={saveBulkDate}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation / Reason Dialog */}
      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Box>
  );
};

export default React.memo(Transactions);
