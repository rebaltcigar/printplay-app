// src/components/ShiftDetailView.jsx
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
  IconButton,
  Tooltip,
  Divider,
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
  Collapse,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";
import CommentIcon from "@mui/icons-material/Comment";

import { db, auth } from "../firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  // --- NEW: Import FieldValue for atomic operations ---
  FieldValue,
  deleteField,
} from "firebase/firestore";


import CustomerDialog from "./CustomerDialog";
import logo from "/icon.ico";

// UI-only peso formatter (commas, 2 decimals). Does NOT touch what we store.
const fmtPeso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const BILL_DENOMS = [1000, 500, 200, 100, 50, 20];
const COIN_DENOMS = [20, 10, 5, 1];

/* helpers for datetime-local */
const toDatetimeLocal = (d) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = x.getFullYear();
  const mm = pad(x.getMonth() + 1);
  const dd = pad(x.getDate());
  const hh = pad(x.getHours());
  const mi = pad(x.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};
const fromDatetimeLocal = (s) => new Date(s);

export default function ShiftDetailView({ shift, userMap, onBack }) {
  // ----- form state (left) -----
  const [item, setItem] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseStaffId, setExpenseStaffId] = useState("");
  const [expenseStaffName, setExpenseStaffName] = useState("");
  const [expenseStaffEmail, setExpenseStaffEmail] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const itemInputRef = useRef(null);

  const [serviceItems, setServiceItems] = useState([]);
  const [expenseServiceItems, setExpenseServiceItems] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
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

  // ----- reconciliation -----
  const [pcRental, setPcRental] = useState(
    typeof shift.pcRentalTotal === "number" ? String(shift.pcRentalTotal) : ""
  );
  const [recon, setRecon] = useState({});

  const isDebtItem = item === "New Debt" || item === "Paid Debt";

  // --- responsive (mobile tweaks only) ---
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const fieldSize = isMobile ? "small" : "medium";

  // Mobile collapses
  const [txControlsOpen, setTxControlsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);

  // Refs to scroll to
  const txControlsRef = useRef(null);

  // ----- load services, staff, recon -----
  useEffect(() => {
    const qServices = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubServices = onSnapshot(qServices, (snap) => {
      const allServices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const parentServices = allServices.filter((s) => !s.parentServiceId);
      setServiceItems(parentServices);

      const expensesParent = allServices.find(
        (s) => s.serviceName === "Expenses"
      );
      const expensesParentId = expensesParent ? expensesParent.id : null;

      let expenseSubServices = [];
      if (expensesParentId) {
        expenseSubServices = allServices
          .filter((s) => s.parentServiceId === expensesParentId)
          .map((s) => s.serviceName);
      }
      setExpenseServiceItems(expenseSubServices);
    });

    (async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "staff"));
        const snap = await getDocs(q);
        const opts = snap.docs.map((d) => {
          const v = d.data() || {};
          return {
            id: d.id,
            fullName: v.fullName || v.name || v.displayName || v.email || "Staff",
            email: v.email || "",
          };
        });
        opts.sort((a, b) =>
          (a.fullName || "").localeCompare(b.fullName || "", "en", {
            sensitivity: "base",
          })
        );
        setStaffOptions(opts);
      } catch {
        setStaffOptions([]);
      }
    })();

    (async () => {
      const s = await getDoc(doc(db, "shifts", shift.id));
      const d = s.data() || {};
      setRecon(d.denominations || {});
      if (typeof d.pcRentalTotal === "number") {
        setPcRental(String(d.pcRentalTotal));
      }
    })();

    return () => unsubServices();
  }, [shift.id]);

  useEffect(() => {
    if (!shift?.id) return;
    const qTx = query(
      collection(db, "transactions"),
      where("shiftId", "==", shift.id),
      where("isDeleted", "==", false),
      orderBy("timestamp", "desc")
    );
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubTx();
  }, [shift]);

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

  const identifierText = (tx) => {
    if (tx.item === "Expenses") {
      const staffChunk = tx.expenseStaffName ? ` · ${tx.expenseStaffName}` : "";
      return `${tx.expenseType || ""}${staffChunk}`;
    }
    if (tx.customerName) return tx.customerName;
    return "—";
  };

  useEffect(() => {
    if (!currentlyEditing) return;
    const t = currentlyEditing;
    setItem(t.item || "");
    setExpenseType(t.expenseType || "");
    setExpenseStaffId(t.expenseStaffId || "");
    setExpenseStaffName(t.expenseStaffName || "");
    setExpenseStaffEmail(t.expenseStaffEmail || "");
    setQuantity(String(t.quantity ?? ""));
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
      return alert("Please enter both a quantity and a price.");
    }
    if (Number(quantity) <= 0) {
      return alert("Quantity must be a positive number.");
    }
    if (item === "Expenses") {
      if (!expenseType) return alert("Please select an expense type.");
      if (
        (expenseType === "Salary" || expenseType === "Salary Advance") &&
        !expenseStaffId
      ) {
        return alert("Please select a staff for Salary or Salary Advance.");
      }
    }
    if (
      (item === "New Debt" || item === "Paid Debt") &&
      !selectedCustomer &&
      !currentlyEditing
    ) {
      return alert("Please select a customer for this transaction.");
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
        const reason = window.prompt("Reason for this edit?");
        if (!reason) return alert("Update cancelled. Reason is required.");
        await updateDoc(doc(db, "transactions", currentlyEditing.id), {
          ...data,
          isEdited: true,
          editedBy: auth.currentUser?.email || "admin",
          editReason: reason,
          lastUpdatedAt: serverTimestamp(),
        });
      } else {
        const tsDate =
          shift?.startTime?.seconds
            ? new Date(shift.startTime.seconds * 1000)
            : shift?.startTime instanceof Date
            ? shift.startTime
            : new Date();

        await addDoc(collection(db, "transactions"), {
          ...data,
          shiftId: shift.id,
          staffEmail: shift.staffEmail,
          addedByAdmin: true,
          addedBy: auth.currentUser?.email || "",
          isDeleted: false,
          isEdited: false,
          timestamp: tsDate,
        });
      }
      clearForm();
    } catch (err) {
      console.error(err);
      alert("Failed to save transaction.");
    }
  };

  const handleEnterSubmit = (e) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const handleRowDelete = async (tx) => {
    const reason = window.prompt("Reason for deleting this entry?");
    if (!reason) return alert("Deletion cancelled. Reason is required.");
    if (!window.confirm("Delete this entry?")) return;
    try {
      await updateDoc(doc(db, "transactions", tx.id), {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: auth.currentUser?.email || "admin",
        deleteReason: reason,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to delete entry.");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedTransactions.length) return;
    const reason = window.prompt(
      "Reason for deleting selected entries?"
    );
    if (!reason) return alert("Deletion cancelled. Reason is required.");
    if (!window.confirm(`Delete ${selectedTransactions.length} entries?`))
      return;

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
    } catch (e) {
      console.error(e);
      alert("Failed to bulk delete.");
    }
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
    const reason =
      window.prompt(
        "Reason for changing the date/time for the selected entries?"
      ) || "(bulk date edit)";
    const when = fromDatetimeLocal(bulkDateTime);
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
    } catch (e) {
      console.error(e);
      alert("Failed to update dates.");
    }
  };

  const quickSetShiftStart = async () => {
    if (!selectedTransactions.length) return;
    const reason =
      window.prompt(
        "Reason for setting selected entries to shift start time?"
      ) || "(bulk date set to shift start)";
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
    } catch (e) {
      console.error(e);
      alert("Failed to set dates to shift start.");
    }
  };

  const handleReconChange = (denKey, val) =>
    setRecon((p) => ({ ...p, [denKey]: val }));

  const cashOnHand = useMemo(
    () =>
      Object.entries(recon).reduce((sum, [key, count]) => {
        const denominationValue = Number(key.split("_")[1]);
        if (!isNaN(denominationValue)) {
          return sum + denominationValue * Number(count || 0);
        }
        return sum;
      }, 0),
    [recon]
  );

  const servicesTotal = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        if (tx.item !== "Expenses" && tx.item !== "New Debt")
          return sum + (tx.total || 0);
        return sum;
      }, 0),
    [transactions]
  );

  const expensesTotal = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        if (tx.item === "Expenses" || tx.item === "New Debt")
          return sum + (tx.total || 0);
        return sum;
      }, 0),
    [transactions]
  );

  const systemTotal = useMemo(
    () => servicesTotal - expensesTotal + Number(pcRental || 0),
    [servicesTotal, expensesTotal, pcRental]
  );

  useEffect(() => {
    let t;
    const write = async () => {
      try {
        await updateDoc(doc(db, "shifts", shift.id), {
          servicesTotal,
          expensesTotal,
          pcRentalTotal: Number(pcRental || 0),
          systemTotal,
        });
      } catch (e) {
        console.warn("Totals write skipped/failed:", e?.message || e);
      }
    };
    t = setTimeout(write, 500);
    return () => clearTimeout(t);
  }, [servicesTotal, expensesTotal, pcRental, systemTotal, shift.id]);

  const saveRecon = async () => {
    try {
      const payload = {
        denominations: deleteField(),
      };
      payload.denominations = recon;
      payload.pcRentalTotal = Number(pcRental || 0);
      payload.systemTotal = systemTotal;
      await updateDoc(doc(db, "shifts", shift.id), payload);
      alert("Reconciliation saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save reconciliation.");
    }
  };

  const handleReconEnter = (e) => {
    if (e.key === "Enter") {
      saveRecon();
    }
  };

  const formatTime = (ts) =>
    ts?.seconds
      ? new Date(ts.seconds * 1000).toLocaleTimeString()
      : ts instanceof Date
      ? ts.toLocaleTimeString()
      : "—";

  const FormContent = (
    <>
      <Typography variant="subtitle1" fontWeight={600}>
        Log Entry
      </Typography>
      <FormControl fullWidth required>
        <InputLabel>Item</InputLabel>
        <Select
          value={item}
          label="Item"
          onChange={handleItemChange}
          inputRef={itemInputRef}
          size={fieldSize}
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
              size={fieldSize}
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
                size={fieldSize}
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
        <Box sx={{ mt: 0.5, p: 1, border: "1px dashed grey", borderRadius: 1 }}>
          <Typography variant="caption">Customer</Typography>
          {selectedCustomer ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography>
                <strong>{selectedCustomer.fullName}</strong>
              </Typography>
              <IconButton
                size="small"
                onClick={() => setSelectedCustomer(null)}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Button
              onClick={() => setOpenCustomerDialog(true)}
              fullWidth
              variant="outlined"
              size={fieldSize}
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
        size={fieldSize}
      />
      <TextField
        type="number"
        label="Price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={handleEnterSubmit}
        required
        size={fieldSize}
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
        size={fieldSize}
      />
    </>
  );

  const ReconContent = () => {
    // --- CORRECTED: Use Cash on Hand - System Total for over/short logic ---
    const difference = cashOnHand - systemTotal;
    const hasReconData = Object.keys(recon).length > 0;

    return (
      <>
        <Typography variant="subtitle1" fontWeight={600}>
          Admin Cash Reconciliation
        </Typography>
        <TextField
          label="PC Rental Total"
          type="number"
          value={pcRental}
          onChange={(e) => setPcRental(e.target.value)}
          onKeyDown={handleReconEnter}
          fullWidth
          size={fieldSize}
        />
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Bills
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {BILL_DENOMS.map((d) => (
            <TextField
              key={`bill-${d}`}
              type="number"
              size="small"
              label={`₱${d} x`}
              value={recon[`b_${d}`] || ""}
              onChange={(e) => handleReconChange(`b_${d}`, e.target.value)}
              sx={{ width: 110 }}
            />
          ))}
        </Box>
        <Typography variant="subtitle2">Coins</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {COIN_DENOMS.map((d) => (
            <TextField
              key={`coin-${d}`}
              type="number"
              size="small"
              label={`₱${d} x`}
              value={recon[`c_${d}`] || ""}
              onChange={(e) => handleReconChange(`c_${d}`, e.target.value)}
              sx={{ width: 110 }}
            />
          ))}
        </Box>
        <Divider />
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography>System Total</Typography>
          <Typography>{fmtPeso(systemTotal)}</Typography>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography>Cash on Hand</Typography>
          <Typography>{hasReconData ? fmtPeso(cashOnHand) : "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="subtitle1">Difference</Typography>
          {hasReconData ? (
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              sx={{
                color:
                  difference === 0
                    ? "success.main"
                    : difference > 0
                    ? "warning.main"
                    : "error.main",
              }}
            >
              {difference > 0 ? `+${fmtPeso(difference)}` : fmtPeso(difference)}
            </Typography>
          ) : (
            <Typography variant="subtitle1">—</Typography>
          )}
        </Box>
      </>
    );
  };


  const startEdit = (tx) => {
    setCurrentlyEditing(tx);
    if (isMobile) {
      if (!txControlsOpen) setTxControlsOpen(true);
      setTimeout(() => {
        txControlsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minHeight: "100%",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <img src={logo} width={18} height={18} alt="" />
        <Button onClick={onBack} size="small" sx={{ ml: 0.5 }}>
          &larr; Back to All Shifts
        </Button>
      </Box>

      <Typography variant="h5">
        Shift Detail — {userMap[shift.staffEmail] || shift.staffEmail} —{" "}
        {shift.shiftPeriod} —{" "}
        {shift.startTime?.seconds
          ? new Date(shift.startTime.seconds * 1000).toLocaleDateString()
          : ""}
      </Typography>

      <Box
        sx={{
          display: { xs: "none", sm: "flex" },
          gap: 2,
          alignItems: "stretch",
          minHeight: 0,
        }}
      >
        <Box
          sx={{ width: 360, display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {FormContent}
            <Button
              onClick={handleSubmit}
              variant="contained"
              fullWidth
              disabled={isDebtItem && !selectedCustomer && !currentlyEditing}
            >
              {currentlyEditing ? "Update Entry" : "Add Entry"}
            </Button>
            {currentlyEditing && (
              <Button variant="outlined" onClick={clearForm} fullWidth>
                Cancel
              </Button>
            )}
            <Divider sx={{ my: 1 }} />
            <ReconContent />
            <Stack direction="row" spacing={1} sx={{ mt: "auto" }}></Stack>
            <Button onClick={saveRecon} variant="contained">
              Save Reconciliation
            </Button>
          </Card>
        </Box>

        <Paper
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{ p: 2, pt: 1, display: "flex", alignItems: "center", gap: 2 }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Transactions
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="Edit Date/Time for Selected">
              <Box component="span">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={openBulkDateDialog}
                  disabled={selectedTransactions.length === 0}
                >
                  Edit Dates
                </Button>
              </Box>
            </Tooltip>
            <Tooltip title="Set selected to Shift Start time">
              <Box component="span">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={quickSetShiftStart}
                  disabled={selectedTransactions.length === 0}
                >
                  Set to Shift Start
                </Button>
              </Box>
            </Tooltip>
            <Tooltip title="Delete Selected">
              <Box component="span">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={handleBulkDelete}
                  disabled={selectedTransactions.length === 0}
                >
                  Delete Selected
                </Button>
              </Box>
            </Tooltip>
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
                  <TableCell>Identifier</TableCell>
                  <TableCell align="right">Controls</TableCell>
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
                    <TableCell>{formatTime(tx.timestamp)}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
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
                            sx={{
                              border: "1px solid",
                              px: 0.5,
                              borderColor: "divider",
                            }}
                          >
                            admin
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{tx.quantity}</TableCell>
                    <TableCell align="right">{fmtPeso(tx.price || 0)}</TableCell>
                    <TableCell align="right">{fmtPeso(tx.total || 0)}</TableCell>
                    <TableCell>{identifierText(tx)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => startEdit(tx)}>
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleRowDelete(tx)}
                      >
                        <DeleteIcon fontSize="inherit" color="error" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ mx: 2, my: 1 }} />
          <Box sx={{ p: 2, pt: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Services Total</Typography>
              <Typography>{fmtPeso(servicesTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Expenses Total</Typography>
              <Typography>{fmtPeso(expensesTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="subtitle1">System Total</Typography>
              <Typography variant="subtitle1">
                {fmtPeso(systemTotal)}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>

      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          flexDirection: "column",
          gap: 1.25,
          minHeight: "70vh",
          flex: 1,
        }}
      >
        <Card ref={txControlsRef} sx={{ p: 1.25 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Transaction Controls
            </Typography>
            <IconButton
              size="small"
              onClick={() => setTxControlsOpen((v) => !v)}
            >
              {txControlsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={txControlsOpen} unmountOnExit>
            <Stack spacing={1.25} sx={{ mt: 1 }}>
              {FormContent}
              <Stack spacing={1} direction="column">
                <Button
                  variant="contained"
                  fullWidth
                  size="small"
                  onClick={handleSubmit}
                  disabled={isDebtItem && !selectedCustomer && !currentlyEditing}
                >
                  {currentlyEditing ? "Update Entry" : "Add Entry"}
                </Button>
                {currentlyEditing && (
                  <Button
                    variant="outlined"
                    fullWidth
                    size="small"
                    onClick={clearForm}
                  >
                    Cancel
                  </Button>
                )}
              </Stack>
            </Stack>
          </Collapse>
        </Card>

        <Card sx={{ p: 1.0 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Actions
            </Typography>
            <IconButton size="small" onClick={() => setActionsOpen((v) => !v)}>
              {actionsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={actionsOpen} unmountOnExit>
            <Stack spacing={1} sx={{ mt: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={openBulkDateDialog}
                disabled={selectedTransactions.length === 0}
                fullWidth
              >
                Edit Dates (Selected)
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={quickSetShiftStart}
                disabled={selectedTransactions.length === 0}
                fullWidth
              >
                Set to Shift Start
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={handleBulkDelete}
                disabled={selectedTransactions.length === 0}
                fullWidth
              >
                Delete Selected
              </Button>
            </Stack>
          </Collapse>
        </Card>

        <Paper
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            height: "66vh",
          }}
        >
          <Box
            sx={{ p: 1.0, pt: 1, display: "flex", alignItems: "center", gap: 1 }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Transactions
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
                  <TableCell align="right">₱</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Id</TableCell>
                  <TableCell align="right">⋯</TableCell>
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
                    <TableCell>{formatTime(tx.timestamp)}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          flexWrap: "wrap",
                        }}
                      >
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
                      </Box>
                    </TableCell>
                    <TableCell align="right">{tx.quantity}</TableCell>
                    <TableCell align="right">{fmtPeso(tx.price || 0)}</TableCell>
                    <TableCell align="right">{fmtPeso(tx.total || 0)}</TableCell>
                    <TableCell>{identifierText(tx)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => startEdit(tx)}>
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleRowDelete(tx)}
                      >
                        <DeleteIcon fontSize="inherit" color="error" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ mx: 1, my: 1 }} />
          <Box sx={{ px: 1, pb: 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Services</Typography>
              <Typography>{fmtPeso(servicesTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Expenses</Typography>
              <Typography>{fmtPeso(expensesTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography fontWeight={600}>System Total</Typography>
              <Typography fontWeight={600}>{fmtPeso(systemTotal)}</Typography>
            </Box>
          </Box>
        </Paper>

        <Card sx={{ p: 1.25 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Reconciliation
            </Typography>
            <IconButton size="small" onClick={() => setReconOpen((v) => !v)}>
              {reconOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={reconOpen} unmountOnExit>
            <Stack spacing={1.25} sx={{ mt: 1 }}>
              <ReconContent />
              <Button onClick={saveRecon} variant="contained" size="small">
                Save Reconciliation
              </Button>
            </Stack>
          </Collapse>
        </Card>
      </Box>

      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Date/Time</DialogTitle>
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
              Updating {selectedTransactions.length} entr{selectedTransactions.length === 1 ? "y" : "ies"}.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveBulkDate}>Save</Button>
        </DialogActions>
      </Dialog>

      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={{ email: shift.staffEmail }}
      />
    </Box>
  );
}