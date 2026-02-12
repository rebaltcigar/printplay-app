// src/components/Shifts.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Box,
  Typography,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableFooter,
  TextField,
  Button,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Tooltip,
  Chip,
  Card,
  useMediaQuery,
  Checkbox, // <-- New Import
  ListItemText, // <-- New Import
  OutlinedInput, // <-- New Import
  FormGroup, // <-- New Import
  FormControlLabel, // <-- New Import
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow"; // Resume icon

import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn"; // Consolidation Icon
import LoadingScreen from "./common/LoadingScreen"; // NEW IMPORT
import ShiftDetailView from "./ShiftDetailView";
import ShiftConsolidationDialog from "./ShiftConsolidationDialog";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  where,
  Timestamp,
  onSnapshot,
  addDoc,
  doc,
  deleteDoc,
  getDocs,
  writeBatch,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { generateDisplayId } from "../utils/idGenerator";

// shared peso formatter (commas, no decimals; UI-only)
import { fmtPeso } from "../utils/analytics";

/* -------------------- helpers -------------------- */
const SHIFT_PERIODS = ["Morning", "Afternoon", "Evening"];

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const calculateOnHand = (denominations) => {
  if (!denominations || typeof denominations !== "object" || Object.keys(denominations).length === 0) {
    return null;
  }

  let total = 0;
  for (const key in denominations) {
    const valueStr = key.split("_")[1];
    if (valueStr) {
      const value = parseFloat(valueStr);
      const count = Number(denominations[key]);
      if (!isNaN(value) && !isNaN(count)) {
        total += value * count;
      }
    }
  }
  return total;
};

const thisMonthDefaults = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { startStr: ymd(start), endStr: ymd(end) };
};

const chunk = (arr, size = 400) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const toTimestamp = (val) => {
  if (!val) return null;
  let d = new Date(val);
  if (isNaN(d.getTime())) {
    const ms = Date.parse(val);
    if (!isNaN(ms)) d = new Date(ms);
  }
  if (isNaN(d.getTime())) throw new Error("Invalid date: " + val);
  return Timestamp.fromDate(d);
};

const toLocalInput = (tsOrDate) => {
  if (!tsOrDate) return "";
  let d;
  if (tsOrDate?.seconds != null) d = new Date(tsOrDate.seconds * 1000);
  else if (tsOrDate instanceof Date) d = tsOrDate;
  else return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const normalize = (s) => String(s ?? "").trim().toLowerCase();

/* -------------------- aggregation (spec-compliant) -------------------- */
const aggregateShiftTransactions = (txList, serviceMeta) => {
  const nameToCategory = {};
  for (const s of serviceMeta || []) {
    const n = normalize(s.name);
    if (!n) continue;
    nameToCategory[n] = s.category || "";
  }

  const serviceTotals = {};
  let sales = 0;
  let expenses = 0;

  // Breakdown
  let cashSales = 0;
  let gcashSales = 0;
  let arSales = 0; // Accounts Receivable (Charge)

  for (const tx of txList) {
    if (!tx || tx.isDeleted === true) continue;

    const itemName = normalize(tx.item);
    if (!itemName) continue;

    let cat = nameToCategory[itemName];

    // Fix: If category is unknown, check if it is "Expenses" specifically.
    // If not "Expenses", and not empty, default to "debit" (Sales) so we don't lose the record.
    if (!cat) {
      if (itemName === 'expenses') cat = 'credit';
      else cat = 'debit';
    }

    let amt = Number(tx.total);
    if (!Number.isFinite(amt)) {
      const price = Number(tx.price);
      const qty = Number(tx.quantity);
      amt = Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0;
    }
    if (!Number.isFinite(amt)) amt = 0;

    const displayName =
      serviceMeta.find((s) => normalize(s.name) === itemName)?.name ||
      tx.item ||
      "Unknown";
    serviceTotals[displayName] = (serviceTotals[displayName] || 0) + amt;

    if (normalize(cat) === "debit") {
      sales += amt;
      // Payment Method Breakdown
      if (tx.paymentMethod === 'GCash') gcashSales += amt;
      else if (tx.paymentMethod === 'Charge') arSales += amt;
      else cashSales += amt; // Default to cash if unknown/null + explicit Cash
    }
    else if (normalize(cat) === "credit") {
      expenses += amt;
    }
  }

  const systemTotal = sales - Number(expenses);

  return {
    serviceTotals,
    sales,
    expenses,
    systemTotal,
    cashSales,
    gcashSales,
    arSales
  };
};

/* -------------------- component -------------------- */
const Shifts = ({ showSnackbar }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true); // NEW STATE
  const [services, setServices] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [viewingShift, setViewingShift] = useState(null);

  const { startStr: defaultStart, endStr: defaultEnd } = thisMonthDefaults();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // --- UPDATED: Filter State ---
  const [filterStaff, setFilterStaff] = useState([]); // Array of emails
  const [filterShiftPeriod, setFilterShiftPeriod] = useState([]); // Array of shift periods
  const [filterShowShort, setFilterShowShort] = useState(true); // Show short by default
  const [filterShowOverage, setFilterShowOverage] = useState(true); // Show overage by default

  const [view, setView] = useState("summary");

  const [addOpen, setAddOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newShiftPeriod, setNewShiftPeriod] = useState(SHIFT_PERIODS[0]);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [editStaffEmail, setEditStaffEmail] = useState("");
  const [editShiftPeriod, setEditShiftPeriod] = useState(SHIFT_PERIODS[0]);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editPcRental, setEditPcRental] = useState("");
  const [editSystemTotal, setEditSystemTotal] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState(null);

  const [deleteMode, setDeleteMode] = useState("unlink");

  // Consolidation Dialog
  const [consolidationOpen, setConsolidationOpen] = useState(false);
  const [consolidationShift, setConsolidationShift] = useState(null);
  const [consolidationTx, setConsolidationTx] = useState([]);

  const [txAggByShift, setTxAggByShift] = useState({});
  const txUnsubsRef = useRef({});

  const [currentShift, setCurrentShift] = useState(null);
  const isAnyShiftActive = !!(currentShift && currentShift.activeShiftId);
  const activeShiftId = currentShift?.activeShiftId || null;

  useEffect(() => {
    const ref = doc(db, "app_status", "current_shift");
    const unsub = onSnapshot(
      ref,
      (snap) => setCurrentShift(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => console.warn("current_shift listener failed", e)
    );
    return () => unsub();
  }, []);

  // --- UPDATED: Memoized array for filtered shifts ---
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      // Staff Filter (if array has items, staff must be in the array)
      if (filterStaff.length > 0 && !filterStaff.includes(s.staffEmail)) {
        return false;
      }

      // Shift Period Filter (if array has items, shift period must be in the array)
      if (filterShiftPeriod.length > 0 && !filterShiftPeriod.includes(s.shiftPeriod)) {
        return false;
      }

      // Difference Filter (based on two checkboxes)
      const agg = txAggByShift[s.id] || {};
      const onHand = calculateOnHand(s.denominations);
      if (onHand === null) {
        // Hide shifts without denominations if either checkbox is unchecked
        if (!filterShowShort || !filterShowOverage) return false;
      } else {
        // New logic for calculating difference in fitler
        const pc = Number(s.pcRentalTotal || 0);
        const expenses = Number(agg.expenses || 0);
        let expectedCash = 0;
        if (s.breakdown) {
          expectedCash = (s.breakdown?.cash || 0) - expenses;
        } else {
          expectedCash = (Number(agg.cashSales || 0) + pc) - expenses;
        }
        const difference = onHand - expectedCash;
        const isShort = difference < 0;
        const isOverage = difference > 0;

        if (!filterShowShort && isShort) return false;
        if (!filterShowOverage && isOverage) return false;
        // If a shift has no difference (is 0), it should only be hidden if BOTH checkboxes are off
        if (!filterShowShort && !filterShowOverage && (isShort || isOverage)) return false;
      }

      return true;
    });
  }, [shifts, filterStaff, filterShiftPeriod, filterShowShort, filterShowOverage, txAggByShift]);

  const lastTwoShiftIds = useMemo(() => filteredShifts.slice(0, 2).map((s) => s.id), [filteredShifts]);

  const handleResumeShift = async (shift) => {
    try {
      if (isAnyShiftActive) return;
      await setDoc(
        doc(db, "app_status", "current_shift"),
        {
          activeShiftId: shift.id,
          staffEmail: shift.staffEmail,
          resumedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Resume shift failed:", e);
      showSnackbar?.(`Failed to resume shift: ${e.message || e.code || e}`, 'error');
    }
  };

  useEffect(() => {
    setLoading(true); // Start loading
    let qRef = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    if (startDate) qRef = query(qRef, where("startTime", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
      const eod = new Date(endDate);
      eod.setHours(23, 59, 59, 999);
      qRef = query(qRef, where("startTime", "<=", Timestamp.fromDate(eod)));
    }
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false); // Done loading
      },
      (err) => {
        console.error("Error fetching shifts:", err);
        setLoading(false); // Done (error)
        if (err.code === "failed-precondition") {
          showSnackbar?.("Firestore needs an index. Check console.", 'error');
        }
      }
    );
    return () => unsub();
  }, [startDate, endDate]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        const v = d.data();
        map[v.email] = v.fullName || v.name || v.email;
      });
      setUserMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const qRef = query(collection(db, "users"), where("role", "==", "staff"));
    const unsub = onSnapshot(qRef, (snap) => {
      const list = snap.docs
        .map((d) => {
          const v = d.data() || {};
          return { email: v.email || "", fullName: v.fullName || v.name || v.displayName || v.email || "Staff" };
        })
        .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "en", { sensitivity: "base" }));
      setStaffOptions(list);
      if (!newStaffEmail && list.length) setNewStaffEmail(list[0].email);
    });
    return () => unsub();
  }, [newStaffEmail]);

  useEffect(() => {
    const qRef = query(collection(db, "services"), orderBy("sortOrder"));
    const unsub = onSnapshot(qRef, (snap) => {
      const meta = snap.docs.map((d) => {
        const v = d.data() || {};
        return { name: v.serviceName || "", category: v.category || "" };
      });
      setServices(meta.filter((s) => s.name));
    });
    return () => unsub();
  }, []);

  const serviceNames = useMemo(() =>
    services
      .filter(s => normalize(s.category) !== 'credit')
      .map((s) => s.name),
    [services]);

  useEffect(() => {
    const desired = new Set(shifts.map((s) => s.id));
    for (const id of Object.keys(txUnsubsRef.current)) {
      if (!desired.has(id)) {
        try { txUnsubsRef.current[id](); } catch { }
        delete txUnsubsRef.current[id];
      }
    }

    shifts.forEach((s) => {
      if (txUnsubsRef.current[s.id]) return;

      const q1 = query(collection(db, "transactions"), where("shiftId", "==", s.id));
      const unsub = onSnapshot(
        q1,
        (snap) => {
          const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t && t.isDeleted !== true);
          const aggregated = aggregateShiftTransactions(txs, services);
          setTxAggByShift((prev) => ({
            ...prev,
            [s.id]: { ...aggregated, fullTransactions: txs } // Store full transactions for consolidation
          }));
        },
        (e) => console.warn("transactions listener failed for shift", s.id, e)
      );

      txUnsubsRef.current[s.id] = unsub;
    });

    return () => {
      for (const id of Object.keys(txUnsubsRef.current)) {
        try { txUnsubsRef.current[id](); } catch { }
      }
      txUnsubsRef.current = {};
    };
  }, [shifts, services]);

  const perServiceTotals = useMemo(() => {
    const totals = {};
    serviceNames.forEach((n) => (totals[n] = 0));
    for (const s of filteredShifts) {
      const agg = txAggByShift[s.id];
      if (!agg) continue;
      for (const [svc, amt] of Object.entries(agg.serviceTotals || {})) {
        totals[svc] = (totals[svc] || 0) + Number(amt || 0);
      }
    }
    return totals;
  }, [filteredShifts, serviceNames, txAggByShift]);

  const grand = useMemo(() => {
    let pcRental = 0;
    let sales = 0;
    let expenses = 0;
    let system = 0;
    let onHand = 0;
    let shiftsWithDenominations = 0;

    for (const s of filteredShifts) {
      const agg = txAggByShift[s.id];
      const pc = Number(s?.pcRentalTotal || 0);
      pcRental += pc;

      const currentOnHand = calculateOnHand(s.denominations);
      if (currentOnHand !== null) {
        onHand += currentOnHand;
        shiftsWithDenominations++;
      }

      if (agg) {
        const _expenses = Number(agg.expenses || 0);
        sales += Number(agg.sales || 0) + pc;
        expenses += _expenses;
        system += (Number(agg.sales || 0) + pc - _expenses);

        // Expected Cash Logic for Grand Total Difference
        let expectedCashForShift = 0;
        if (s.breakdown) {
          // New Logic: Use saved breakdown
          expectedCashForShift = (s.breakdown?.cash || 0) - _expenses;
        } else {
          // Old Logic: Services Cash + PC (assumed cash) - Expenses
          expectedCashForShift = (Number(agg.cashSales || 0) + pc) - _expenses;
        }

        // Difference for this shift
        if (currentOnHand !== null) {
          // We can accumulate difference strictly, or just do onHand - expectedCash
          // But grand.difference usually calculates (GrandOnHand - GrandExpectedSystem).
          // However, strictly speaking, `grand.system` is NET SALES.
          // If we want `grand.difference` to be meaningful for hybrid shifts, we can't use `grand.system` (which includes gcash/ar).
          // So we should verify what `grand.system` is being used for in difference calculation.
          // The old code did: `const difference = onHand - system;` 
          // This implies `system` was treated as `Expected Cash`.
          // We need to fix this.
        }
      }
    }

    // Since calculating grand difference is tricky with mixed expected cash definitions, 
    // let's just sum up individual differences? 
    // Valid "On Hand" is only present for `shiftsWithDenominations`.
    // Let's sum Expected Cash for those shifts only.
    let totalExpectedCash = 0;

    for (const s of filteredShifts) {
      const agg = txAggByShift[s.id];
      const onHandVal = calculateOnHand(s.denominations);
      if (onHandVal !== null && agg) {
        const pc = Number(s?.pcRentalTotal || 0);
        const _expenses = Number(agg.expenses || 0);

        if (s.breakdown) {
          totalExpectedCash += (s.breakdown?.cash || 0) - _expenses;
        } else {
          totalExpectedCash += (Number(agg.cashSales || 0) + pc) - _expenses;
        }
      }
    }

    // Recalculate difference based on (Total On Hand - Total Expected Cash)
    // Note: Use `system` variable above for "Total Net Sales" display

    const difference = onHand - totalExpectedCash;

    return { pcRental, sales, expenses, system, onHand, difference, shiftsWithDenominations };
  }, [filteredShifts, txAggByShift]);

  const handleExportToCSV = () => {
    let headers;
    let rows;

    if (view === "summary") {
      headers = ["Date", "Staff", "Shift", "Sales", "Expenses", "Total", "On Hand", "Difference"];
      rows = filteredShifts.map((s) => {
        const agg = txAggByShift[s.id] || {};
        const onHand = calculateOnHand(s.denominations);

        // Calculation Logic
        const pc = Number(s.pcRentalTotal || 0);
        const serviceSales = Number(agg.sales || 0);
        const expenses = Number(agg.expenses || 0);
        const totalSales = serviceSales + pc;
        const netTotal = totalSales - expenses;

        let expectedCash = 0;
        if (s.breakdown) {
          expectedCash = (s.breakdown?.cash || 0) - expenses;
        } else {
          expectedCash = (Number(agg.cashSales || 0) + pc) - expenses;
        }

        const difference = onHand !== null ? onHand - expectedCash : null;

        return [
          s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          totalSales.toFixed(2),
          expenses.toFixed(2),
          netTotal.toFixed(2),
          onHand !== null ? onHand.toFixed(2) : "N/A",
          difference !== null ? difference.toFixed(2) : "N/A",
        ].join(",");
      });
    } else {
      headers = [
        "Date",
        "Staff",
        "Shift",
        "PC Rental",
        ...serviceNames,
        "Sales",
        "Expenses",
        "Total",
      ];
      rows = filteredShifts.map((s) => {
        const agg = txAggByShift[s.id] || { serviceTotals: {} };
        const perSvc = serviceNames.map((n) => Number(agg.serviceTotals?.[n] || 0).toFixed(2));

        const pc = Number(s.pcRentalTotal || 0);
        const serviceSales = Number(agg.sales || 0);
        const expenses = Number(agg.expenses || 0);
        const totalSales = serviceSales + pc;
        const netTotal = totalSales - expenses;

        return [
          s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          pc.toFixed(2),
          ...perSvc,
          totalSales.toFixed(2), // Sales (Gross)
          expenses.toFixed(2),
          netTotal.toFixed(2),   // Total (Net)
        ].join(",");
      });
    }

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shifts_${view}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddShift = async () => {
    try {
      if (!newStaffEmail || !newStart) {
        showSnackbar?.("Please select a staff and provide a start time.", 'warning');
        return;
      }
      const displayId = await generateDisplayId("shifts", "SHIFT");
      const payload = {
        displayId,
        staffEmail: newStaffEmail.trim(),
        shiftPeriod: newShiftPeriod,
        startTime: toTimestamp(newStart),
        endTime: toTimestamp(newEnd),
        pcRentalTotal: 0,
        systemTotal: 0,
      };
      const docRef = await addDoc(collection(db, "shifts"), payload);
      const newShiftForView = { id: docRef.id, ...payload };
      setAddOpen(false);
      setNewStaffEmail(staffOptions[0]?.email || "");
      setNewStart("");
      setNewEnd("");
      setNewShiftPeriod(SHIFT_PERIODS[0]);
      setViewingShift(newShiftForView);
      setViewingShift(newShiftForView);
    } catch (e) {
      console.error("Add shift failed:", e);
      showSnackbar?.(`Failed to add shift: ${e.message || e.code || e}`, 'error');
    }
  };

  const openEdit = (shift) => {
    setEditShift(shift);
    setEditStaffEmail(shift.staffEmail || "");
    setEditShiftPeriod(shift.shiftPeriod || SHIFT_PERIODS[0]);
    setEditStart(toLocalInput(shift.startTime));
    setEditEnd(toLocalInput(shift.endTime));
    setEditPcRental(typeof shift.pcRentalTotal === "number" ? String(shift.pcRentalTotal) : "");
    setEditSystemTotal(typeof shift.systemTotal === "number" ? String(shift.systemTotal) : "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editShift) return;
    try {
      const payload = {
        staffEmail: editStaffEmail.trim(),
        shiftPeriod: editShiftPeriod,
        startTime: toTimestamp(editStart),
        endTime: toTimestamp(editEnd),
      };
      if (editPcRental !== "") payload.pcRentalTotal = Number(editPcRental);
      if (editSystemTotal !== "") payload.systemTotal = Number(editSystemTotal);
      await updateDoc(doc(db, "shifts", editShift.id), payload);
      setEditOpen(false);
      setEditShift(null);
      setEditShift(null);
    } catch (e) {
      console.error("Edit shift failed:", e);
      showSnackbar?.(`Failed to save changes: ${e.message || e.code || e}`, 'error');
    }
  };

  const openDelete = (shift) => {
    setShiftToDelete(shift);
    setDeleteMode("unlink");
    setDeleteOpen(true);
  };

  const handleDeleteShift = async () => {
    if (!shiftToDelete) return;
    try {
      const txSnap = await getDocs(query(collection(db, "transactions"), where("shiftId", "==", shiftToDelete.id)));
      const txDocs = txSnap.docs;
      const chunksArr = chunk(txDocs);

      if (deleteMode === "unlink") {
        for (const ck of chunksArr) {
          const batch = writeBatch(db);
          ck.forEach((d) => batch.update(d.ref, { shiftId: null, unlinkedFromShift: shiftToDelete.id }));
          await batch.commit();
        }
      } else if (deleteMode === "purge") {
        for (const ck of chunksArr) {
          const batch = writeBatch(db);
          ck.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, "shifts", shiftToDelete.id));
      setDeleteOpen(false);
      setShiftToDelete(null);
      setShiftToDelete(null);
    } catch (e) {
      console.error("Delete shift failed:", e);
      showSnackbar?.(`Failed to delete shift: ${e.message || e.code || e}`, 'error');
    }
  };

  const openConsolidation = (shift) => {
    const agg = txAggByShift[shift.id];
    if (!agg) {
      showSnackbar?.("Loading shift data...", "info");
      return;
    }
    setConsolidationShift(shift);
    setConsolidationTx(agg.fullTransactions || []);
    setConsolidationOpen(true);
  };

  if (viewingShift) {
    return <ShiftDetailView shift={viewingShift} userMap={userMap} onBack={() => setViewingShift(null)} showSnackbar={showSnackbar} />;
  }

  if (loading) {
    return <LoadingScreen message="Loading shifts..." />;
  }

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {!isMobile ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <ToggleButtonGroup value={view} exclusive onChange={(e, v) => v && setView(v)} size="small">
            <ToggleButton value="summary">Summary</ToggleButton>
            <ToggleButton value="detailed">Detailed</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            {/* --- UPDATED: Filter Controls --- */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Staff</InputLabel>
              <Select
                multiple
                value={filterStaff}
                onChange={(e) => {
                  const { target: { value } } = e;
                  setFilterStaff(typeof value === "string" ? value.split(",") : value);
                }}
                input={<OutlinedInput label="Staff" />}
                renderValue={(selected) => {
                  if (selected.length === 0) return <em>All Staff</em>;
                  if (selected.length === staffOptions.length) return <em>All Staff</em>;
                  if (selected.length > 2) return <em>{selected.length} selected</em>;
                  return selected.map(email => userMap[email]?.split(' ')[0] || email).join(', ');
                }}
              >
                {staffOptions.map((staff) => (
                  <MenuItem key={staff.email} value={staff.email}>
                    <Checkbox checked={filterStaff.includes(staff.email)} />
                    <ListItemText primary={staff.fullName} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Shift</InputLabel>
              <Select
                multiple
                value={filterShiftPeriod}
                onChange={(e) => {
                  const { target: { value } } = e;
                  setFilterShiftPeriod(typeof value === "string" ? value.split(",") : value);
                }}
                input={<OutlinedInput label="Shift" />}
                renderValue={(selected) => {
                  if (selected.length === 0) return <em>All Shifts</em>;
                  return selected.join(", ");
                }}
              >
                {SHIFT_PERIODS.map((p) => (
                  <MenuItem key={p} value={p}>
                    <Checkbox checked={filterShiftPeriod.includes(p)} />
                    <ListItemText primary={p} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormGroup row sx={{ pl: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={filterShowShort} onChange={(e) => setFilterShowShort(e.target.checked)} size="small" />}
                label={<Typography variant="body2">Short</Typography>}
              />
              <FormControlLabel
                control={<Checkbox checked={filterShowOverage} onChange={(e) => setFilterShowOverage(e.target.checked)} size="small" />}
                label={<Typography variant="body2">Overage</Typography>}
              />
            </FormGroup>
            {/* --- End of Updated Filters --- */}
            <TextField
              label="Start Date"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="outlined" onClick={handleExportToCSV} disabled={filteredShifts.length === 0}>
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add Shift
            </Button>
          </Stack>
        </Box>
      ) : (
        <Card elevation={0} sx={{ p: 2.25, mb: 1.5, border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 2 }}>
          <Stack spacing={1.75}>
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(e, v) => v && setView(v)}
              size="small"
              fullWidth
              sx={{ "& .MuiToggleButton-root": { py: 1.1, fontWeight: 600 } }}
            >
              <ToggleButton value="summary">Summary</ToggleButton>
              <ToggleButton value="detailed">Detailed</ToggleButton>
            </ToggleButtonGroup>
            {/* --- UPDATED: Mobile Filter Controls --- */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.75 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Staff</InputLabel>
                <Select
                  multiple
                  value={filterStaff}
                  onChange={(e) => {
                    const { target: { value } } = e;
                    setFilterStaff(typeof value === "string" ? value.split(",") : value);
                  }}
                  input={<OutlinedInput label="Staff" />}
                  renderValue={(selected) => selected.length === 0 ? "All" : `${selected.length} selected`}
                >
                  {staffOptions.map((staff) => (
                    <MenuItem key={staff.email} value={staff.email}>
                      <Checkbox checked={filterStaff.includes(staff.email)} />
                      <ListItemText primary={staff.fullName} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Shift</InputLabel>
                <Select
                  multiple
                  value={filterShiftPeriod}
                  onChange={(e) => {
                    const { target: { value } } = e;
                    setFilterShiftPeriod(typeof value === "string" ? value.split(",") : value);
                  }}
                  input={<OutlinedInput label="Shift" />}
                  renderValue={(selected) => selected.length === 0 ? "All" : selected.join(", ")}
                >
                  {SHIFT_PERIODS.map((p) => (
                    <MenuItem key={p} value={p}>
                      <Checkbox checked={filterShiftPeriod.includes(p)} />
                      <ListItemText primary={p} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <FormGroup row sx={{ justifyContent: "center" }}>
              <FormControlLabel control={<Checkbox checked={filterShowShort} onChange={(e) => setFilterShowShort(e.target.checked)} />} label="Short" />
              <FormControlLabel control={<Checkbox checked={filterShowOverage} onChange={(e) => setFilterShowOverage(e.target.checked)} />} label="Overage" />
            </FormGroup>
            {/* --- End of Mobile Filters --- */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.75 }}>
              <TextField label="Start" type="date" size="small" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField label="End" type="date" size="small" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.75 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} size="small" sx={{ py: 1.1 }}>
                Add
              </Button>
              <Button variant="outlined" onClick={handleExportToCSV} disabled={filteredShifts.length === 0} size="small" sx={{ py: 1.1 }}>
                Export
              </Button>
            </Box>
          </Stack>
        </Card>
      )}

      {view === "summary" && (
        <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, overflow: "auto", maxHeight: { xs: "66vh", md: "70vh" } }}>
          <Table size={isMobile ? "small" : "medium"} stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: "nowrap" }}>Date</TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Shift</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell align="right">Total Sales</TableCell>
                <TableCell align="right">Expenses</TableCell>
                <TableCell align="right">Net Total</TableCell>
                <TableCell align="right">On Hand</TableCell>
                <TableCell align="right">Difference</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredShifts.map((s) => {
                const agg = txAggByShift[s.id] || {};
                const isActiveRow = activeShiftId === s.id;
                const onHand = calculateOnHand(s.denominations);

                // Calculations
                const pc = Number(s.pcRentalTotal || 0);
                const serviceSales = Number(agg.sales || 0); // aggregated service sales (no pc)
                const expenses = Number(agg.expenses || 0);
                const totalSales = serviceSales + pc;
                const netTotal = totalSales - expenses;

                let expectedCash = 0;
                if (s.breakdown) {
                  expectedCash = (s.breakdown?.cash || 0) - expenses;
                } else {
                  expectedCash = (Number(agg.cashSales || 0) + pc) - expenses;
                }

                const difference = onHand === null ? null : onHand - expectedCash;

                return (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={(e) => {
                      if ((e.target.closest && e.target.closest("button")) || e.target.tagName === "BUTTON") return;
                      setViewingShift(s);
                    }}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {isActiveRow && (
                        <Tooltip title="Active shift">
                          <Box
                            component="span"
                            sx={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              bgcolor: "success.main",
                              mr: 1,
                              verticalAlign: "middle",
                            }}
                          />
                        </Tooltip>
                      )}
                      {s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A"}
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                        {s.displayId || s.id.slice(-6)}
                      </Typography>
                      <Box sx={{ display: { xs: "block", sm: "none" } }}>
                        <Chip size="small" label={s.shiftPeriod || "—"} sx={{ mt: 0.5, fontSize: 10 }} variant="outlined" />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>{s.shiftPeriod || "—"}</TableCell>
                    <TableCell sx={{ pr: 1 }}>
                      <Typography variant="body2" noWrap>
                        {userMap[s.staffEmail] || s.staffEmail}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{fmtPeso(totalSales)}</TableCell>
                    <TableCell align="right">{fmtPeso(expenses)}</TableCell>
                    <TableCell align="right">{fmtPeso(netTotal)}</TableCell>
                    <TableCell align="right">
                      {onHand === null ? "—" : fmtPeso(onHand)}
                    </TableCell>
                    <TableCell align="right">
                      {difference === null ? (
                        "—"
                      ) : (
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          sx={{
                            color:
                              difference === 0
                                ? "text.secondary"
                                : difference > 0
                                  ? "warning.main"
                                  : "error.main",
                          }}
                        >
                          {difference > 0 ? `+${fmtPeso(difference)}` : fmtPeso(difference)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit shift">
                        <IconButton size="small" onClick={() => openEdit(s)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Consolidate">
                        <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openConsolidation(s); }}>
                          <AssignmentTurnedInIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete shift">
                        <IconButton size="small" color="error" onClick={() => openDelete(s)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!isAnyShiftActive && lastTwoShiftIds.includes(s.id) && (
                        <Tooltip title="Resume this shift">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResumeShift(s);
                            }}
                          >
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ "& > *": { fontWeight: "bold" } }}>
                <TableCell colSpan={isMobile ? 2 : 3}>Totals</TableCell>
                <TableCell align="right">{fmtPeso(grand.sales)}</TableCell>
                <TableCell align="right">{fmtPeso(grand.expenses)}</TableCell>
                <TableCell align="right">{fmtPeso(grand.system)}</TableCell>
                <TableCell align="right">
                  {grand.shiftsWithDenominations > 0 ? fmtPeso(grand.onHand) : "—"}
                </TableCell>
                <TableCell align="right">
                  {grand.shiftsWithDenominations > 0 ? (
                    <Typography
                      variant="body2"
                      fontWeight="bold"
                      sx={{
                        color:
                          grand.difference === 0
                            ? "text.secondary"
                            : grand.difference > 0
                              ? "warning.main"
                              : "error.main",
                      }}
                    >
                      {grand.difference > 0 ? `+${fmtPeso(grand.difference)}` : fmtPeso(grand.difference)}
                    </Typography>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      {view === "detailed" && (
        <TableContainer
          component={Paper}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            maxHeight: { xs: "66vh", md: "70vh" },
            "& table": { minWidth: { xs: Math.max(900, 520 + serviceNames.length * 120), sm: "auto" } },
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell sx={{ pl: { xs: 1, sm: 2 } }}>Shift</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell align="right">PC</TableCell>
                {serviceNames.map((h) => (
                  <TableCell key={h} align="right">{h}</TableCell>
                ))}
                <TableCell align="right">Total Sales</TableCell>
                <TableCell align="right">Total Expenses</TableCell>
                <TableCell align="right">System Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredShifts.map((s) => {
                const agg = txAggByShift[s.id];
                const isActiveRow = activeShiftId === s.id;

                return (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={(e) => {
                      if ((e.target.closest && e.target.closest("button")) || e.target.tagName === "BUTTON") return;
                      setViewingShift(s);
                    }}
                  >
                    <TableCell>
                      {isActiveRow && (
                        <Tooltip title="Active shift">
                          <Box
                            component="span"
                            sx={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              bgcolor: "success.main",
                              mr: 1,
                              verticalAlign: "middle",
                            }}
                          />
                        </Tooltip>
                      )}
                      {s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A"}
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                        {s.displayId || s.id.slice(-6)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ pl: { xs: 1, sm: 2 }, whiteSpace: "nowrap" }}>{s.shiftPeriod}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}><Typography noWrap>{userMap[s.staffEmail] || s.staffEmail}</Typography></TableCell>
                    <TableCell align="right">{fmtPeso(s.pcRentalTotal || 0)}</TableCell>
                    {serviceNames.map((h) => (<TableCell key={h} align="right">{fmtPeso(agg?.serviceTotals?.[h] || 0)}</TableCell>))}
                    <TableCell align="right">{fmtPeso((agg?.sales || 0) + Number(s.pcRentalTotal || 0))}</TableCell>
                    <TableCell align="right">{fmtPeso(agg?.expenses || 0)}</TableCell>
                    <TableCell align="right">{fmtPeso(((agg?.sales || 0) + Number(s.pcRentalTotal || 0)) - (agg?.expenses || 0))}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit shift">
                        <IconButton size="small" onClick={() => openEdit(s)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete shift">
                        <IconButton size="small" color="error" onClick={() => openDelete(s)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      {!isAnyShiftActive && lastTwoShiftIds.includes(s.id) && (
                        <Tooltip title="Resume this shift">
                          <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); handleResumeShift(s); }}>
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={3}><strong>Totals</strong></TableCell>
                <TableCell align="right"><strong>{fmtPeso(grand.pcRental)}</strong></TableCell>
                {serviceNames.map((h) => (<TableCell key={h} align="right"><strong>{fmtPeso(perServiceTotals[h] || 0)}</strong></TableCell>))}
                <TableCell align="right"><strong>{fmtPeso(grand.sales || 0)}</strong></TableCell>
                <TableCell align="right"><strong>{fmtPeso(grand.expenses || 0)}</strong></TableCell>
                <TableCell align="right"><strong>{fmtPeso(grand.system || 0)}</strong></TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Historical Shift</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Staff</InputLabel>
              <Select label="Staff" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)}>
                {staffOptions.length === 0 ? (
                  <MenuItem value="" disabled>No staff available</MenuItem>
                ) : (
                  staffOptions.map((s) => (
                    <MenuItem key={s.email} value={s.email}>{s.fullName} — {s.email}</MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Shift</InputLabel>
              <Select label="Shift" value={newShiftPeriod} onChange={(e) => setNewShiftPeriod(e.target.value)}>
                {SHIFT_PERIODS.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
              </Select>
            </FormControl>
            <TextField label="Start" type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <TextField label="End (optional)" type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddShift}>Save Shift</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Shift</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Staff</InputLabel>
              <Select label="Staff" value={editStaffEmail} onChange={(e) => setEditStaffEmail(e.target.value)}>
                {staffOptions.length === 0 ? (
                  <MenuItem value="" disabled>No staff available</MenuItem>
                ) : (
                  staffOptions.map((s) => (
                    <MenuItem key={s.email} value={s.email}>{s.fullName} — {s.email}</MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Shift</InputLabel>
              <Select label="Shift" value={editShiftPeriod} onChange={(e) => setEditShiftPeriod(e.target.value)}>
                {SHIFT_PERIODS.map((p) => (<MenuItem key={p} value={p}>{p}</MenuItem>))}
              </Select>
            </FormControl>
            <TextField label="Start" type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <TextField label="End (optional)" type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="PC Rental Total (optional)" type="number" value={editPcRental} onChange={(e) => setEditPcRental(e.target.value)} fullWidth />
            <TextField label="Total (optional)" type="number" value={editSystemTotal} onChange={(e) => setEditSystemTotal(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Delete Shift</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>What should we do with the transactions linked to this shift?</Typography>
          <Stack spacing={2}>
            <Button variant={deleteMode === "unlink" ? "contained" : "outlined"} onClick={() => setDeleteMode("unlink")}>
              Keep transactions, but remove their association with this shift
            </Button>
            <Button color="error" variant={deleteMode === "purge" ? "contained" : "outlined"} onClick={() => setDeleteMode("purge")}>
              Delete all transactions for this shift
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteShift}>Confirm Delete</Button>
        </DialogActions>
      </Dialog>

      <ShiftConsolidationDialog
        open={consolidationOpen}
        onClose={() => setConsolidationOpen(false)}
        shift={consolidationShift}
        transactions={consolidationTx}
        showSnackbar={showSnackbar}
      />
    </Box>
  );
};
export default React.memo(Shifts);