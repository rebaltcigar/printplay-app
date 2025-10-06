// src/components/Shifts.jsx
import React, { useEffect, useMemo, useState } from "react";
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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ShiftDetailView from "./ShiftDetailView";
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
} from "firebase/firestore";

/* -------------------- helpers -------------------- */
const SHIFT_PERIODS = ["Morning", "Afternoon", "Evening"];

// Firestore batch limit is 500 — keep headroom
const chunk = (arr, size = 400) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Robust string/date -> Firestore Timestamp
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

// Firestore Timestamp/Date -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
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

// Display mapping for service names
const displayServiceName = (name = "") => {
  const n = String(name).toLowerCase();
  if (n === "paid debt") return "Paid";
  if (n === "new debt") return "Debt";
  return name;
};

// Insert a special marker for PC Rental before "Print" (if present)
const buildServiceColumnOrder = (services) => {
  const idxPrint = services.findIndex((s) => String(s).toLowerCase() === "print");
  if (idxPrint >= 0) {
    return [...services.slice(0, idxPrint), "__PC_RENTAL__", services[idxPrint], ...services.slice(idxPrint + 1)];
  }
  return [...services, "__PC_RENTAL__"];
};

// Totals per shift per new rule:
// total = (sum of all debit/sales + pcRental) - (credits: New Debt + Expenses)
const computeShiftTotal = (shift) => {
  const salesSum = Object.values(shift?.salesBreakdown || {}).reduce((a, v) => a + Number(v || 0), 0);
  const credits = shift?.creditsBreakdown || {};
  const creditDebt = Number(credits["New Debt"] || 0);
  const creditExpenses = Number(credits["Expenses"] || 0);
  const pc = Number(shift?.pcRentalTotal || 0);
  return {
    salesSum,
    creditDebt,
    creditExpenses,
    pc,
    total: salesSum + pc - (creditDebt + creditExpenses),
  };
};

/* -------------------- component -------------------- */
export default function Shifts() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [shifts, setShifts] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [viewingShift, setViewingShift] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [view, setView] = useState("summary"); // summary | detailed

  // Add shift dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newShiftPeriod, setNewShiftPeriod] = useState(SHIFT_PERIODS[0]);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);

  // Edit shift dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [editStaffEmail, setEditStaffEmail] = useState("");
  const [editShiftPeriod, setEditShiftPeriod] = useState(SHIFT_PERIODS[0]);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editPcRental, setEditPcRental] = useState("");
  const [editSystemTotal, setEditSystemTotal] = useState("");

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState(null);
  const [deleteMode, setDeleteMode] = useState("unlink"); // unlink | purge

  /* --------- Shifts (with date filters) --------- */
  useEffect(() => {
    let qRef = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    if (startDate) qRef = query(qRef, where("startTime", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
      const eod = new Date(endDate);
      eod.setHours(23, 59, 59, 999);
      qRef = query(qRef, where("startTime", "<=", Timestamp.fromDate(eod)));
    }
    const unsub = onSnapshot(
      qRef,
      (snap) => setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("Error fetching shifts:", err);
        if (err.code === "failed-precondition") {
          alert("Firestore needs an index for this query. Check the dev console for an auto-generated link.");
        }
      }
    );
    return () => unsub();
  }, [startDate, endDate]);

  /* --------- Users map (email -> fullName) --------- */
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

  /* --------- Staff list for Add/Edit dropdowns --------- */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------- Services (for detailed headers) --------- */
  useEffect(() => {
    const qRef = query(collection(db, "services"), orderBy("sortOrder"));
    const unsub = onSnapshot(qRef, (snap) => {
      setAllServices(snap.docs.map((d) => d.data().serviceName));
    });
    return () => unsub();
  }, []);

  const serviceColumns = useMemo(() => buildServiceColumnOrder(allServices), [allServices]);

  /* ---------- Aggregations ---------- */
  const perServiceTotals = useMemo(() => {
    // sum (sales+credits) per service for totals row
    const totals = Object.fromEntries(allServices.map((n) => [n, 0]));
    shifts.forEach((s) => {
      allServices.forEach((name) => {
        totals[name] += Number(s.salesBreakdown?.[name] || 0) + Number(s.creditsBreakdown?.[name] || 0);
      });
    });
    return totals;
  }, [shifts, allServices]);

  const grand = useMemo(() => {
    let pcRental = 0;
    let total = 0;
    shifts.forEach((s) => {
      const c = computeShiftTotal(s);
      pcRental += c.pc;
      total += c.total;
    });
    return { pcRental, total };
  }, [shifts]);

  /* -------------------- CSV Export -------------------- */
  const handleExportToCSV = () => {
    let headers;
    let rows;

    if (view === "summary") {
      headers = ["Date", "Staff", "Shift", "PC Rental", "Total"];
      rows = shifts.map((s) => {
        const c = computeShiftTotal(s);
        return [
          s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          c.pc.toFixed(2),
          c.total.toFixed(2),
        ].join(",");
      });
    } else {
      // detailed: service columns (with PC Rental before Print), then Total
      headers = ["Date", "Staff", "Shift", ...serviceColumns.map((n) => (n === "__PC_RENTAL__" ? "PC Rental" : displayServiceName(n))), "Total"];
      rows = shifts.map((s) => {
        const cells = serviceColumns.map((n) => {
          if (n === "__PC_RENTAL__") return Number(s.pcRentalTotal || 0).toFixed(2);
          const val =
            Number(s.salesBreakdown?.[n] || 0) +
            Number(s.creditsBreakdown?.[n] || 0);
          return val.toFixed(2);
        });
        const c = computeShiftTotal(s);
        return [
          s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A",
          userMap[s.staffEmail] || s.staffEmail,
          s.shiftPeriod || "",
          ...cells,
          c.total.toFixed(2),
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
  };

  /* -------------------- Add/Edit/Delete handlers (unchanged logic) -------------------- */
  const handleAddShift = async () => {
    try {
      if (!newStaffEmail || !newStart) {
        alert("Please select a staff and provide a start time.");
        return;
      }
      const payload = {
        staffEmail: newStaffEmail.trim(),
        shiftPeriod: newShiftPeriod,
        startTime: toTimestamp(newStart),
        endTime: toTimestamp(newEnd),
        pcRentalTotal: 0,
        systemTotal: 0,
      };
      await addDoc(collection(db, "shifts"), payload);
      setAddOpen(false);
      setNewStaffEmail(staffOptions[0]?.email || "");
      setNewStart("");
      setNewEnd("");
      setNewShiftPeriod(SHIFT_PERIODS[0]);
    } catch (e) {
      console.error("Add shift failed:", e);
      alert(`Failed to add shift: ${e.message || e.code || e}`);
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
    } catch (e) {
      console.error("Edit shift failed:", e);
      alert(`Failed to save changes: ${e.message || e.code || e}`);
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
      const chunks = chunk(txDocs);

      if (deleteMode === "unlink") {
        for (const ck of chunks) {
          const batch = writeBatch(db);
          ck.forEach((d) =>
            batch.update(d.ref, {
              shiftId: null,
              unlinkedFromShift: shiftToDelete.id,
            })
          );
          await batch.commit();
        }
      } else if (deleteMode === "purge") {
        for (const ck of chunks) {
          const batch = writeBatch(db);
          ck.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, "shifts", shiftToDelete.id));
      setDeleteOpen(false);
      setShiftToDelete(null);
    } catch (e) {
      console.error("Delete shift failed:", e);
      alert(`Failed to delete shift: ${e.message || e.code || e}`);
    }
  };

  /* -------------------- Detail View -------------------- */
  if (viewingShift) {
    return <ShiftDetailView shift={viewingShift} userMap={userMap} onBack={() => setViewingShift(null)} />;
  }

  /* -------------------- List View -------------------- */
  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* CONTROLS */}
      {!isMobile ? (
        // Web: unchanged layout, just new labels apply elsewhere
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <ToggleButtonGroup value={view} exclusive onChange={(e, v) => v && setView(v)}>
            <ToggleButton value="summary">Summary</ToggleButton>
            <ToggleButton value="detailed">Detailed</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={1}>
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
            <Button variant="outlined" onClick={handleExportToCSV} disabled={shifts.length === 0}>
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add Shift
            </Button>
          </Stack>
        </Box>
      ) : (
        // Mobile: more breathing room (INJECTED)
        <Card
          elevation={0}
          sx={{
            p: 2.25,
            mb: 1.5,
            border: (t) => `1px solid ${t.palette.divider}`,
            borderRadius: 2,
          }}
        >
          <Stack spacing={1.75}>
            {/* Summary | Detailed */}
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(e, v) => v && setView(v)}
              size="small"
              fullWidth
              sx={{
                "& .MuiToggleButton-root": { py: 1.1, fontWeight: 600 },
              }}
            >
              <ToggleButton value="summary">Summary</ToggleButton>
              <ToggleButton value="detailed">Detailed</ToggleButton>
            </ToggleButtonGroup>

            {/* Date filters */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.75,
              }}
            >
              <TextField
                label="Start"
                type="date"
                size="small"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End"
                type="date"
                size="small"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            {/* Action buttons */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.75,
              }}
            >
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddOpen(true)}
                size="small"
                sx={{ py: 1.1 }}
              >
                Add
              </Button>
              <Button
                variant="outlined"
                onClick={handleExportToCSV}
                disabled={shifts.length === 0}
                size="small"
                sx={{ py: 1.1 }}
              >
                Export
              </Button>
            </Box>
          </Stack>
        </Card>
      )}

      {/* TABLES */}
      {view === "summary" && (
        <TableContainer
          component={Paper}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            maxHeight: { xs: "66vh", md: "70vh" },
          }}
        >
          <Table size={isMobile ? "small" : "medium"} stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: "nowrap" }}>Date</TableCell>
                <TableCell>Staff</TableCell>
                {/* Hide separate shift column on mobile; show a mini chip under Date */}
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Shift</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((s) => {
                const dateStr = s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A";
                const staff = userMap[s.staffEmail] || s.staffEmail;
                const shiftPeriod = s.shiftPeriod || "—";
                const c = computeShiftTotal(s);

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
                      {dateStr}
                      <Box sx={{ display: { xs: "block", sm: "none" } }}>
                        <Chip size="small" label={shiftPeriod} sx={{ mt: 0.5, fontSize: 10 }} variant="outlined" />
                      </Box>
                    </TableCell>

                    <TableCell sx={{ pr: 1 }}>
                      <Typography variant="body2" noWrap>
                        {staff}
                      </Typography>
                    </TableCell>

                    {/* Desktop/tablet: normal "Shift" column */}
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>{shiftPeriod}</TableCell>

                    <TableCell align="right" sx={{ pl: 1, whiteSpace: "nowrap" }}>
                      ₱{c.total.toFixed(2)}
                    </TableCell>

                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit shift">
                        <IconButton size="small" onClick={() => openEdit(s)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete shift">
                        <IconButton size="small" color="error" onClick={() => openDelete(s)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
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
            // Horizontal scroll only if needed on mobile
            "& table": { minWidth: { xs: Math.max(680, 280 + serviceColumns.length * 120), sm: "auto" } },
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell sx={{ pl: { xs: 1, sm: 2 } }}>Shift</TableCell>
                {serviceColumns.map((h) =>
                  h === "__PC_RENTAL__" ? (
                    <TableCell key="__PC_RENTAL__" align="right">
                      PC Rental
                    </TableCell>
                  ) : (
                    <TableCell key={h} align="right">
                      {displayServiceName(h)}
                    </TableCell>
                  )
                )}
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((s) => {
                const c = computeShiftTotal(s);
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
                      {s.startTime ? new Date(s.startTime.seconds * 1000).toLocaleDateString() : "N/A"}
                    </TableCell>

                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography noWrap>{userMap[s.staffEmail] || s.staffEmail}</Typography>
                    </TableCell>

                    {/* tighter space between staff and shift */}
                    <TableCell sx={{ pl: { xs: 1, sm: 2 }, whiteSpace: "nowrap" }}>
                      {s.shiftPeriod}
                    </TableCell>

                    {serviceColumns.map((h) =>
                      h === "__PC_RENTAL__" ? (
                        <TableCell key="__PC_RENTAL__" align="right">
                          ₱{Number(s.pcRentalTotal || 0).toFixed(2)}
                        </TableCell>
                      ) : (
                        <TableCell key={h} align="right">
                          ₱{(
                            Number(s.salesBreakdown?.[h] || 0) +
                            Number(s.creditsBreakdown?.[h] || 0)
                          ).toFixed(2)}
                        </TableCell>
                      )
                    )}

                    <TableCell align="right">₱{c.total.toFixed(2)}</TableCell>

                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit shift">
                        <IconButton size="small" onClick={() => openEdit(s)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete shift">
                        <IconButton size="small" color="error" onClick={() => openDelete(s)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow>
                <TableCell colSpan={3}>
                  <strong>Totals</strong>
                </TableCell>

                {serviceColumns.map((h) =>
                  h === "__PC_RENTAL__" ? (
                    <TableCell key="__PC_RENTAL__" align="right">
                      <strong>₱{grand.pcRental.toFixed(2)}</strong>
                    </TableCell>
                  ) : (
                    <TableCell key={h} align="right">
                      <strong>₱{Number(perServiceTotals[h] || 0).toFixed(2)}</strong>
                    </TableCell>
                  )
                )}

                <TableCell align="right">
                  <strong>₱{grand.total.toFixed(2)}</strong>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Shift dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Historical Shift</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Staff</InputLabel>
              <Select label="Staff" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)}>
                {staffOptions.length === 0 ? (
                  <MenuItem value="" disabled>
                    No staff available
                  </MenuItem>
                ) : (
                  staffOptions.map((s) => (
                    <MenuItem key={s.email} value={s.email}>
                      {s.fullName} — {s.email}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Shift</InputLabel>
              <Select label="Shift" value={newShiftPeriod} onChange={(e) => setNewShiftPeriod(e.target.value)}>
                {SHIFT_PERIODS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Start"
              type="datetime-local"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
              fullWidth
            />
            <TextField
              label="End (optional)"
              type="datetime-local"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={handleAddShift} variant="contained">
            Save Shift
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Shift dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Shift</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Staff</InputLabel>
              <Select label="Staff" value={editStaffEmail} onChange={(e) => setEditStaffEmail(e.target.value)}>
                {staffOptions.length === 0 ? (
                  <MenuItem value="" disabled>
                    No staff available
                  </MenuItem>
                ) : (
                  staffOptions.map((s) => (
                    <MenuItem key={s.email} value={s.email}>
                      {s.fullName} — {s.email}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Shift</InputLabel>
              <Select label="Shift" value={editShiftPeriod} onChange={(e) => setEditShiftPeriod(e.target.value)}>
                {SHIFT_PERIODS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Start"
              type="datetime-local"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
              fullWidth
            />
            <TextField
              label="End (optional)"
              type="datetime-local"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="PC Rental Total (optional)"
              type="number"
              value={editPcRental}
              onChange={(e) => setEditPcRental(e.target.value)}
              fullWidth
            />
            <TextField
              label="System Total (optional)"
              type="number"
              value={editSystemTotal}
              onChange={(e) => setEditSystemTotal(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete shift dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Delete Shift</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>What should we do with the transactions linked to this shift?</Typography>
          <Stack spacing={2}>
            <Button variant={deleteMode === "unlink" ? "contained" : "outlined"} onClick={() => setDeleteMode("unlink")}>
              Keep transactions, but remove their association with this shift
            </Button>
            <Button
              color="error"
              variant={deleteMode === "purge" ? "contained" : "outlined"}
              onClick={() => setDeleteMode("purge")}
            >
              Delete all transactions for this shift
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteShift}>
            Confirm Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
