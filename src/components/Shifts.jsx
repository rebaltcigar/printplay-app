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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SellIcon from "@mui/icons-material/Sell";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";

import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn"; // Consolidation Icon
import BuildIcon from "@mui/icons-material/Build"; // Fix Icon
import LoadingScreen from "./common/LoadingScreen"; // NEW IMPORT
import ShiftDetailView from "./ShiftDetailView";
import ShiftConsolidationDialog from "./ShiftConsolidationDialog";
import PageHeader from "./common/PageHeader";
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
import SummaryCards from "./common/SummaryCards";
import {
  calculateOnHand,
  resumeShift,
  createShift,
  updateShift,
  deleteShift,
  toLocalInput
} from "../services/shiftService";
import { useShiftFilters } from "../hooks/useShiftFilters";
import { generateDisplayId } from "../services/orderService";
import { useGlobalUI } from "../contexts/GlobalUIContext";

// shared helpers
import { fmtDate } from "../utils/formatters";
import { fmtPeso, normalize } from "../services/analyticsService";
import { aggregateShiftTransactions, computeExpectedCash } from "../utils/shiftFinancials";
import { useStaffList } from "../hooks/useStaffList";
import { useServiceList } from "../hooks/useServiceList";

// Shift period options
const SHIFT_PERIODS = ["Morning", "Afternoon", "Evening"];


/* -------------------- component -------------------- */
const Shifts = ({ isActive = true }) => {
  const { showSnackbar, showConfirm } = useGlobalUI();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingShift, setViewingShift] = useState(null);

  // Staff and services from shared hooks
  const { staffOptions, userMap } = useStaffList();
  const { serviceMeta } = useServiceList();

  const [view, setView] = useState("summary");
  const [addOpen, setAddOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newShiftPeriod, setNewShiftPeriod] = useState(SHIFT_PERIODS[0]);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

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

  const [consolidationOpen, setConsolidationOpen] = useState(false);
  const [consolidationShift, setConsolidationShift] = useState(null);
  const [consolidationTx, setConsolidationTx] = useState([]);

  const [txAggByShift, setTxAggByShift] = useState({});
  const txUnsubsRef = useRef({});

  const [currentShift, setCurrentShift] = useState(null);
  const isAnyShiftActive = !!(currentShift && currentShift.activeShiftId);
  const activeShiftId = currentShift?.activeShiftId || null;

  const {
    startDate, setStartDate,
    endDate, setEndDate,
    filterStaff, setFilterStaff,
    filterShiftPeriod, setFilterShiftPeriod,
    filterShowShort, setFilterShowShort,
    filterShowOverage, setFilterShowOverage,
    filteredShifts,
    grand,
    perServiceTotals,
    serviceNames
  } = useShiftFilters(shifts, txAggByShift, serviceMeta);


  useEffect(() => {
    const ref = doc(db, "app_status", "current_shift");
    const unsub = onSnapshot(ref,
      (snap) => setCurrentShift(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (e) => console.warn("current_shift listener failed", e)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoading(true);
    let qRef = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    if (startDate) qRef = query(qRef, where("startTime", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
      const eod = new Date(endDate);
      eod.setHours(23, 59, 59, 999);
      qRef = query(qRef, where("startTime", "<=", Timestamp.fromDate(eod)));
    }
    const unsub = onSnapshot(qRef,
      (snap) => {
        setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching shifts:", err);
        setLoading(false);
        if (err.code === "failed-precondition") showSnackbar("Firestore needs an index.", 'error');
      }
    );
    return () => unsub();
  }, [startDate, endDate]);

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
      const unsub = onSnapshot(q1,
        (snap) => {
          const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t && t.isDeleted !== true);
          const aggregated = aggregateShiftTransactions(txs, serviceMeta);
          setTxAggByShift((prev) => ({
            ...prev,
            [s.id]: { ...aggregated, fullTransactions: txs }
          }));
        },
        (e) => console.warn("transactions listener failed for shift", s.id, e)
      );
      txUnsubsRef.current[s.id] = unsub;
    });

    return () => {
      for (const id of Object.keys(txUnsubsRef.current)) try { txUnsubsRef.current[id](); } catch { }
      txUnsubsRef.current = {};
    };
  }, [shifts, serviceMeta]);

  const lastTwoShiftIds = useMemo(() => filteredShifts.slice(0, 2).map((s) => s.id), [filteredShifts]);

  const handleResumeShift = async (shift) => {
    try {
      if (isAnyShiftActive) return;
      await resumeShift(shift.id, shift.staffEmail);
    } catch (e) {
      showSnackbar(`Failed to resume: ${e.message}`, 'error');
    }
  };

  const handleExportToCSV = () => {
    let headers, rows;
    if (view === "summary") {
      headers = ["Date", "Staff", "Shift", "Sales", "Expenses", "Total", "On Hand", "Difference"];
      rows = filteredShifts.map((s) => {
        const agg = txAggByShift[s.id] || {};
        const onHand = calculateOnHand(s.denominations);
        const pc = Number(s.pcRentalTotal || 0);
        const totalSales = Number(agg.sales || 0) + pc;
        const netTotal = totalSales - Number(agg.expenses || 0);
        const difference = onHand !== null ? onHand - (totalSales - Number(agg.expenses || 0)) : null;

        return [
          s.startTime ? fmtDate(s.startTime) : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          totalSales.toFixed(2),
          Number(agg.expenses || 0).toFixed(2),
          netTotal.toFixed(2),
          onHand !== null ? onHand.toFixed(2) : "N/A",
          difference !== null ? difference.toFixed(2) : "N/A",
        ].join(",");
      });
    } else {
      headers = ["Date", "Staff", "Shift", "PC Rental", ...serviceNames, "Sales", "Expenses", "Total"];
      rows = filteredShifts.map((s) => {
        const agg = txAggByShift[s.id] || { serviceTotals: {} };
        const perSvc = serviceNames.map((n) => Number(agg.serviceTotals?.[n] || 0).toFixed(2));
        const pc = Number(s.pcRentalTotal || 0);
        const totalSales = Number(agg.sales || 0) + pc;
        const netTotal = totalSales - Number(agg.expenses || 0);
        return [
          s.startTime ? fmtDate(s.startTime) : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          pc.toFixed(2),
          ...perSvc,
          totalSales.toFixed(2),
          Number(agg.expenses || 0).toFixed(2),
          netTotal.toFixed(2),
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
        showSnackbar("Staff and Start Time are required.", 'warning');
        return;
      }
      const newShift = await createShift({
        staffEmail: newStaffEmail.trim(),
        shiftPeriod: newShiftPeriod,
        startTime: newStart,
        endTime: newEnd,
      });
      setAddOpen(false);
      setNewStart("");
      setNewEnd("");
      setViewingShift(newShift);
    } catch (e) {
      showSnackbar(`Failed to add shift: ${e.message}`, 'error');
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
      await updateShift(editShift.id, {
        staffEmail: editStaffEmail.trim(),
        shiftPeriod: editShiftPeriod,
        startTime: editStart,
        endTime: editEnd,
        pcRentalTotal: editPcRental !== "" ? Number(editPcRental) : undefined,
        systemTotal: editSystemTotal !== "" ? Number(editSystemTotal) : undefined,
      });
      setEditOpen(false);
      setEditShift(null);
    } catch (e) {
      showSnackbar(`Failed to save: ${e.message}`, 'error');
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
      await deleteShift(shiftToDelete.id, deleteMode);
      setDeleteOpen(false);
      setShiftToDelete(null);
    } catch (e) {
      showSnackbar(`Failed to delete: ${e.message}`, 'error');
    }
  };

  const openConsolidation = (shift) => {
    const agg = txAggByShift[shift.id];
    if (!agg) {
      showSnackbar("Loading shift data...", "info");
      return;
    }
    setConsolidationShift(shift);
    setConsolidationTx(agg.fullTransactions || []);
    setConsolidationOpen(true);
  };

  if (viewingShift) {
    return <ShiftDetailView shift={viewingShift} userMap={userMap} onBack={() => setViewingShift(null)} showSnackbar={showSnackbar} />;
  }

  if (loading) return <LoadingScreen message="Loading shifts..." />;


  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", p: 3 }}>
      <PageHeader
        title="Shifts"
        subtitle="Monitor and manage staff shifts and cash reconciliation."
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {!isMobile && (
              <ToggleButtonGroup value={view} exclusive onChange={(e, v) => v && setView(v)} size="small">
                <ToggleButton value="summary">Summary</ToggleButton>
                <ToggleButton value="detailed">Detailed</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} size="small">
              Add Shift
            </Button>
            <Button variant="outlined" onClick={handleExportToCSV} disabled={filteredShifts.length === 0} size="small">
              Export CSV
            </Button>
          </Stack>
        }
      />

      {!isMobile ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3, flexWrap: "wrap", p: 2, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" sx={{ width: "100%" }}>
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
            <FormGroup row>
              <FormControlLabel
                control={<Checkbox checked={filterShowShort} onChange={(e) => setFilterShowShort(e.target.checked)} size="small" />}
                label={<Typography variant="body2">Short</Typography>}
              />
              <FormControlLabel
                control={<Checkbox checked={filterShowOverage} onChange={(e) => setFilterShowOverage(e.target.checked)} size="small" />}
                label={<Typography variant="body2">Overage</Typography>}
              />
            </FormGroup>
            <Box sx={{ flexGrow: 1 }} />
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
          </Stack>
        </Box>
      ) : (
        <Card elevation={0} sx={{ p: 2.25, mb: 1.5, border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 2 }}>
          <Stack spacing={1.75}>
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
          </Stack>
        </Card>
      )}

      {/* KPI Summary Cards */}
      <SummaryCards
        loading={loading}
        sx={{ mb: 3 }}
        cards={[
          { label: "Total Sales", value: fmtPeso(grand.sales), icon: <SellIcon fontSize="small" />, color: "primary.main" },
          { label: "Total Expenses", value: fmtPeso(grand.expenses), icon: <ReceiptIcon fontSize="small" />, color: "error.main" },
          { label: "Net Total", value: fmtPeso(grand.system), icon: <AccountBalanceIcon fontSize="small" />, color: "success.main", highlight: true },
          {
            label: "Cash Difference",
            value: grand.difference > 0 ? `+${fmtPeso(grand.difference)}` : fmtPeso(grand.difference),
            sub: `${grand.shiftsWithDenominations} counted shifts`,
            icon: <CompareArrowsIcon fontSize="small" />,
            color: grand.difference === 0 ? "info.main" : grand.difference > 0 ? "warning.main" : "error.main"
          }
        ]}
      />


      {view === "summary" && (
        <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, overflow: "auto", maxHeight: { xs: "66vh", md: "70vh" } }}>
          <Table size={isMobile ? "small" : "medium"} stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: "nowrap" }}>ID</TableCell>
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

                const expectedCash = computeExpectedCash(s, agg);
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
                    <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
                      {s.displayId || s.id.slice(-6)}
                    </TableCell>
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
                      {s.startTime ? fmtDate(s.startTime) : "N/A"}
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
                <TableCell colSpan={isMobile ? 3 : 4}>Totals</TableCell>
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
                <TableCell>ID</TableCell>
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
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {s.displayId || s.id.slice(-6)}
                    </TableCell>
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
                      {s.startTime ? fmtDate(s.startTime) : "N/A"}
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
                <TableCell colSpan={4}><strong>Totals</strong></TableCell>
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
export default Shifts;