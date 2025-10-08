// src/views/AdminHome.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Card,
  Typography,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useMediaQuery,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  TextField,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { useTheme } from "@mui/material/styles";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  Timestamp,
  limit,
} from "firebase/firestore";

// NEW: analytics helpers & chart
import TrendChart from "../components/TrendChart";
import {
  ZONE,
  getRange,
  buildServiceMap,
  classifyTx,
  txAmount,
  buildTrendSeries,
  normalize as norm,
  fmtPeso,
  saleMatchesService,
} from "../utils/analytics";

/* ----------------- small helpers kept from your file ----------------- */
const LiveDot = ({ color = "success.main", size = 10 }) => (
  <FiberManualRecordIcon sx={{ color, fontSize: size }} />
);
// UPDATED: use shared peso formatter (commas, no decimals)
const currency = (n) => fmtPeso(n);

/** Clear the global shift lock if it points to the given shiftId */
async function clearShiftLockIfMatches(shiftId, endedByEmail) {
  const statusRef = doc(db, "app_status", "current_shift");
  const snap = await (await import("firebase/firestore")).getDoc(statusRef);
  const data = snap.exists() ? snap.data() : null;
  if (data?.activeShiftId === shiftId) {
    await (await import("firebase/firestore")).setDoc(
      statusRef,
      {
        activeShiftId: null,
        endedBy: endedByEmail || "admin",
        endedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

/* ----------------- component ----------------- */
export default function AdminHome() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  /*** NEW: Global controls ***/
  const [preset, setPreset] = useState("thisMonth"); // past7|thisMonth|thisYear|allTime|monthYear
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [serviceFilter, setServiceFilter] = useState("All services");
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [allTimeMode, setAllTimeMode] = useState("monthly"); // monthly | yearly (only relevant for allTime)

  // NEW: earliest shift start to anchor ALL TIME
  const [earliestShiftStart, setEarliestShiftStart] = useState(null);

  const r = useMemo(
    () => getRange(preset, monthYear, earliestShiftStart),
    [preset, monthYear, earliestShiftStart]
  );

  // Auto-switch to yearly for allTime when >36 months
  useEffect(() => {
    if (preset === "allTime") {
      if (r.shouldDefaultYearly) setAllTimeMode("yearly");
      else setAllTimeMode("monthly");
    }
  }, [preset, r.shouldDefaultYearly]);

  // streams
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  const [debtTxAll, setDebtTxAll] = useState([]);
  const [debtLoading, setDebtLoading] = useState(true);

  // shifts in RANGE (for PC Rental in KPI + chart + breakdowns/leaderboard)
  const [shiftsScope, setShiftsScope] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  // shifts TODAY (for Active Shift section only)
  const [shiftsToday, setShiftsToday] = useState([]);

  // services (active only, for Debit/Credit classification + dropdown)
  const [services, setServices] = useState([]); // [{serviceName, category, active, sortOrder}]
  const serviceMap = useMemo(() => buildServiceMap(services), [services]);
  const [serviceOptions, setServiceOptions] = useState(["All services", "Unknown"]); // replaced after services stream

  const logoUrl = "/logo.png";

  /* --------- earliest shift for ALL TIME anchor --------- */
  useEffect(() => {
    const qRef = query(collection(db, "shifts"), orderBy("startTime", "asc"), limit(1));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const first = snap.docs[0]?.data();
        if (first?.startTime?.seconds) {
          setEarliestShiftStart(new Date(first.startTime.seconds * 1000));
        }
      },
      (err) => console.error("earliest shift stream error", err)
    );
    return () => unsub();
  }, []);

  /* --------- scoped transactions (live by range) --------- */
  useEffect(() => {
    setTxLoading(true);
    const qRef = query(
      collection(db, "transactions"),
      where("timestamp", ">=", r.startUtc),
      where("timestamp", "<=", r.endUtc),
      orderBy("timestamp", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTxLoading(false);
      },
      (err) => {
        console.error("transactions stream error", err);
        setTxLoading(false);
      }
    );
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* --------- services (active only, sort by sortOrder) --------- */
  useEffect(() => {
    const qRef = query(collection(db, "services"), orderBy("sortOrder"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() || {})
          .filter((v) => v.active === true && (v.serviceName || v.name))
          .map((v) => ({
            serviceName: v.serviceName || v.name,
            category: v.category || "",
            active: !!v.active,
            sortOrder: v.sortOrder ?? 0,
          }));
        setServices(list);
        const opts = ["All services", ...list.map((x) => x.serviceName), "Unknown"];
        setServiceOptions(opts);
        // Keep selection if still present, else reset to All
        setServiceFilter((prev) => (opts.includes(prev) ? prev : "All services"));
      },
      (err) => console.error("services stream error", err)
    );
    return () => unsub();
  }, []);

  /* --------- shifts IN RANGE (for PC Rental KPI & chart & other sections) --------- */
  useEffect(() => {
    setShiftsLoading(true);
    const qRef = query(
      collection(db, "shifts"),
      where("startTime", ">=", Timestamp.fromDate(r.startUtc)),
      where("startTime", "<=", Timestamp.fromDate(r.endUtc)),
      orderBy("startTime", "asc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setShiftsScope(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setShiftsLoading(false);
      },
      (err) => {
        console.error("shifts (range) stream error", err);
        setShiftsLoading(false);
      }
    );
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* --------- today shifts (for Active section) --------- */
  useEffect(() => {
    // Build today's bounds in local browser (close enough for the "Active" panel)
    const today = new Date();
    const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    const startLocal = new Date(y, m, d, 0, 0, 0, 0);
    const endLocal = new Date(y, m, d, 23, 59, 59, 999);
    const qRef = query(
      collection(db, "shifts"),
      where("startTime", ">=", Timestamp.fromDate(startLocal)),
      where("startTime", "<=", Timestamp.fromDate(endLocal)),
      orderBy("startTime", "asc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => setShiftsToday(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("shifts (today) stream error", err)
    );
    return () => unsub();
  }, []);

  /* --------- all-time debt tx (for outstanding KPI) --------- */
  useEffect(() => {
    setDebtLoading(true);
    const qRef = query(
      collection(db, "transactions"),
      where("item", "in", ["New Debt", "Paid Debt"])
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setDebtTxAll(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setDebtLoading(false);
      },
      (err) => {
        console.error("debt stream error", err);
        setDebtLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* --------- derived --------- */
  const visibleTx = useMemo(
    () => transactions.filter((t) => t.isDeleted !== true),
    [transactions]
  );

  // SALES / EXPENSES / NET (range) using service categories + PC Rental + service filter
  const kpi = useMemo(() => {
    let sales = 0;
    let expenses = 0;

    for (const t of visibleTx) {
      const cls = classifyTx(t, serviceMap);
      if (!cls) continue;

      const amt = txAmount(t);
      if (cls === "expense") {
        expenses += amt; // Expenses ignore service filter
      } else {
        if (saleMatchesService(t, serviceFilter, serviceMap)) {
          sales += amt;
        }
      }
    }

    // add PC Rental from shifts in RANGE (respects service filter)
    const includePCRental =
      !serviceFilter ||
      serviceFilter === "All services" ||
      norm(serviceFilter) === "pc rental";

    if (includePCRental) {
      sales += (shiftsScope || []).reduce(
        (sum, s) => sum + Number(s?.pcRentalTotal || 0),
        0
      );
    }

    return { sales, expenses, net: sales - expenses };
  }, [visibleTx, serviceMap, serviceFilter, shiftsScope]);

  // Outstanding Debt (all time): sum customer balances (New Debt - Paid Debt) >= 1
  const outstandingDebt = useMemo(() => {
    const per = new Map();
    debtTxAll.forEach((t) => {
      if (t.isDeleted) return;
      const id = t.customerId || "__unknown__";
      const amt = Number(t.total || 0);
      const prev = per.get(id) || 0;
      const bal =
        t.item === "New Debt"
          ? prev + amt
          : t.item === "Paid Debt"
          ? prev - amt
          : prev;
      per.set(id, bal);
    });
    return Array.from(per.values())
      .filter((v) => v >= 1)
      .reduce((a, b) => a + b, 0);
  }, [debtTxAll]);

  // Trend series (Sales vs Expenses), respecting labels rules
  const trendSeries = useMemo(() => {
    const gran =
      preset === "thisYear"
        ? "month"
        : preset === "allTime" && allTimeMode === "yearly"
        ? "year"
        : preset === "allTime" && allTimeMode === "monthly"
        ? "month"
        : "day";

    const axis =
      preset === "past7" ? "date" :
      preset === "thisMonth" || preset === "monthYear" ? "number" :
      gran === "month" ? "month" :
      "year";

    return buildTrendSeries({
      transactions: visibleTx,
      shifts: shiftsScope,
      startLocal: r.startLocal,
      endLocal: r.endLocal,
      granularity: gran,
      axis,
      serviceFilter,
      serviceMap,
    });
  }, [visibleTx, shiftsScope, r.startLocal, r.endLocal, preset, allTimeMode, serviceFilter, serviceMap]);

  // Active shifts (today)
  const activeShifts = useMemo(() => {
    const now = new Date();
    return shiftsToday.filter((s) => {
      const st = s.startTime?.seconds ? new Date(s.startTime.seconds * 1000) : null;
      const en = s.endTime?.seconds ? new Date(s.endTime.seconds * 1000) : null;
      return st && st <= now && (!en || en >= now);
    });
  }, [shiftsToday]);

  // Active shift transactions (derived from current stream)
  const activeShiftIds = activeShifts.map((s) => s.id);
  const activeShiftTx = useMemo(() => {
    if (activeShiftIds.length === 0) return [];
    return transactions
      .filter((t) => t.isDeleted !== true && activeShiftIds.includes(t.shiftId || ""))
      .sort((a, b) => {
        const ta = a.timestamp?.seconds || 0;
        const tb = b.timestamp?.seconds || 0;
        return tb - ta;
      })
      .slice(0, 100);
  }, [transactions, activeShiftIds]);

  /* -------- actions -------- */
  const forceEndShift = async (shift) => {
    if (!shift?.id) return;
    if (!window.confirm("Force end this shift now?")) return;
    try {
      const endedBy = auth.currentUser?.email || "admin";
      await updateDoc(doc(db, "shifts", shift.id), {
        endTime: Timestamp.fromDate(new Date()),
        endedBy,
        status: "ended",
      });
      await clearShiftLockIfMatches(shift.id, endedBy);
    } catch (e) {
      console.error(e);
      alert("Failed to end shift.");
    }
  };

  const softDeleteTx = async (row) => {
    const reason = window.prompt("Reason for deleting this transaction?");
    if (!reason) return;
    try {
      await updateDoc(doc(db, "transactions", row.id), {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: auth.currentUser?.email || "admin",
        deleteReason: reason,
        lastUpdatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("Failed to delete transaction.");
    }
  };

  const hardDeleteTx = async (row) => {
    if (!window.confirm("PERMANENTLY delete this transaction? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "transactions", row.id));
    } catch (e) {
      console.error(e);
      alert("Hard delete failed.");
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 1.5, md: 2.5 },
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
        <img src={logoUrl} alt="logo" style={{ height: 36 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: 16, sm: 20 } }}>
          Admin Home
        </Typography>
        {/* (Removed Live/System Health UI) */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Preset */}
        <FormControl size="small" sx={{ minWidth: { xs: 160, sm: 180 } }}>
          <InputLabel>Time Range</InputLabel>
          <Select label="Time Range" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <MenuItem value="past7">Past 7 Days</MenuItem>
            <MenuItem value="thisMonth">This Month</MenuItem>
            <MenuItem value="monthYear">Month–Year</MenuItem>
            <MenuItem value="thisYear">This Year</MenuItem>
            <MenuItem value="allTime">All Time</MenuItem>
          </Select>
        </FormControl>

        {/* Month–Year selector */}
        {preset === "monthYear" && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>Month</InputLabel>
              <Select
                label="Month"
                value={monthYear.getMonth()}
                onChange={(e) => setMonthYear(new Date(monthYear.getFullYear(), Number(e.target.value), 1))}
              >
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <MenuItem key={m} value={i}>{m}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Year"
              type="number"
              value={monthYear.getFullYear()}
              onChange={(e) => {
                const y = Number(e.target.value) || new Date().getFullYear();
                setMonthYear(new Date(y, monthYear.getMonth(), 1));
              }}
              sx={{ width: 100 }}
            />
          </Stack>
        )}

        {/* Service filter (includes Unknown at the bottom) */}
        <FormControl size="small" sx={{ minWidth: { xs: 160, sm: 200 } }}>
          <InputLabel>Service</InputLabel>
          <Select label="Service" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            {serviceOptions
              .filter((v, idx, arr) => arr.indexOf(v) === idx)
              .map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        {/* Chart line toggles (chart-only) */}
        <FormControlLabel
          control={<Checkbox size="small" checked={showSales} onChange={(e) => setShowSales(e.target.checked)} />}
          label="Sales"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={showExpenses} onChange={(e) => setShowExpenses(e.target.checked)} />}
          label="Expenses"
        />
      </Box>

      {/* KPIs */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: { xs: 1.5, md: 2 },
          width: "100%",
        }}
      >
        <KpiCard title="Sales" loading={txLoading || shiftsLoading} value={currency(kpi.sales)} />
        <KpiCard title="Expenses" loading={txLoading} value={currency(kpi.expenses)} />
        <KpiCard
          title="Net"
          loading={txLoading || shiftsLoading}
          value={currency(kpi.net)}
          emphasize={kpi.net >= 0 ? "good" : "bad"}
        />
        <KpiCard title="Outstanding Debt (All Time)" loading={debtLoading} value={currency(outstandingDebt)} />
      </Box>

      {/* Trend card */}
      <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <SectionHeader title="Trend" compact />
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            {preset === "past7" && "Daily (MM/DD)"}
            {(preset === "thisMonth" || preset === "monthYear") && "Daily (1–31)"}
            {preset === "thisYear" && "Monthly (Jan–Dec)"}
            {preset === "allTime" && (allTimeMode === "monthly" ? "Monthly" : "Yearly")}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {preset === "allTime" && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>View</InputLabel>
              <Select label="View" value={allTimeMode} onChange={(e) => setAllTimeMode(e.target.value)}>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="yearly">Yearly</MenuItem>
              </Select>
            </FormControl>
          )}
        </Box>

        {txLoading ? (
          <LinearProgress sx={{ mt: 1 }} />
        ) : (
          <TrendChart data={trendSeries} showSales={showSales} showExpenses={showExpenses} currencyPrefix="₱" />
        )}
      </Card>

      {/* CONTENT (rest of your original sections; System Health removed) */}
      {isMobile ? (
        <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
          <MobileSection title="Active shift's transactions" defaultExpanded>
            <ActiveShiftBody
              shiftsLoading={shiftsLoading}
              activeShifts={activeShifts}
              activeShiftTx={activeShiftTx}
              currency={currency}
              forceEndShift={forceEndShift}
              softDeleteTx={softDeleteTx}
              hardDeleteTx={hardDeleteTx}
            />
          </MobileSection>

          {/* UPDATED: titles & props respect global controls */}
          <MobileSection title="Staff Leaderboard" defaultExpanded>
            <StaffLeaderboard
              transactions={visibleTx}
              serviceFilter={serviceFilter}
              serviceMap={serviceMap}
              shiftsInRange={shiftsScope}
            />
          </MobileSection>

          <MobileSection title="Sales Breakdown" defaultExpanded>
            <SalesBreakdownBody
              transactions={visibleTx}
              serviceFilter={serviceFilter}
              serviceMap={serviceMap}
              shiftsInRange={shiftsScope}
            />
          </MobileSection>

          <MobileSection title="Expense Breakdown">
            <ExpenseBreakdownBody transactions={visibleTx} serviceMap={serviceMap} />
          </MobileSection>
        </Stack>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { lg: "1fr 1fr" },
            gap: 2,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* LEFT */}
          <Box sx={{ display: "grid", gridAutoRows: "minmax(180px, auto)", gap: 2, minHeight: 0 }}>
            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, minHeight: 240 }}>
              <SectionHeader title="Active shift's transactions" />
              <ActiveShiftBody
                shiftsLoading={shiftsLoading}
                activeShifts={activeShifts}
                activeShiftTx={activeShiftTx}
                currency={currency}
                forceEndShift={forceEndShift}
                softDeleteTx={softDeleteTx}
                hardDeleteTx={hardDeleteTx}
              />
            </Card>
          </Box>

          {/* RIGHT */}
          <Box sx={{ display: "grid", gridAutoRows: "minmax(180px, auto)", gap: 2, minHeight: 0 }}>
            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, minHeight: 240 }}>
              <SectionHeader title="Staff Leaderboard" />
              <StaffLeaderboard
                transactions={visibleTx}
                serviceFilter={serviceFilter}
                serviceMap={serviceMap}
                shiftsInRange={shiftsScope}
              />
            </Card>
          </Box>

          {/* FULL-WIDTH */}
          <Box
            sx={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
              minHeight: 0,
            }}
          >
            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, height: "100%" }}>
              <SectionHeader title="Sales Breakdown" />
              <SalesBreakdownBody
                transactions={visibleTx}
                serviceFilter={serviceFilter}
                serviceMap={serviceMap}
                shiftsInRange={shiftsScope}
              />
            </Card>

            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, height: "100%" }}>
              <SectionHeader title="Expense Breakdown" />
              <ExpenseBreakdownBody transactions={visibleTx} serviceMap={serviceMap} />
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ---------------- subcomponents (adapted to props so we reuse) ---------------- */

function SectionHeader({ title, compact = false }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography
        variant={compact ? "subtitle1" : "h6"}
        sx={{ fontWeight: 600, fontSize: { xs: 14, sm: compact ? 16 : 20 } }}
      >
        {title}
      </Typography>
    </Box>
  );
}

function KpiCard({ title, value, loading, emphasize }) {
  return (
    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: "100%" }}>
      <Typography variant="caption" sx={{ opacity: 0.7, fontSize: { xs: 11, sm: 12 } }}>
        {title}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          mt: 0.5,
          fontSize: { xs: 18, sm: 20 },
          color:
            emphasize === "good"
              ? "success.main"
              : emphasize === "bad"
              ? "error.main"
              : "inherit",
          fontWeight: 700,
        }}
      >
        {value}
      </Typography>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
    </Card>
  );
}

function ActiveShiftBody({
  shiftsLoading,
  activeShifts,
  activeShiftTx,
  currency,
  forceEndShift,
  softDeleteTx,
  hardDeleteTx,
}) {
  return (
    <>
      {shiftsLoading && <LinearProgress sx={{ mt: 0.5 }} />}
      {activeShifts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, textAlign: "center" }}>
          No active shift.
        </Paper>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: { xs: 1, sm: 1 }, mb: 0.5 }}>
            {activeShifts.map((s) => {
              const st = s.startTime?.seconds ? new Date(s.startTime.seconds * 1000) : null;
              return (
                <Paper
                  key={s.id}
                  variant="outlined"
                  sx={{ px: 1, py: 0.75, display: "flex", alignItems: "center", gap: 1, borderRadius: 1.5 }}
                >
                  <LiveDot color="error.main" />
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    {s.shiftPeriod || "Shift"} — {s.staffEmail} • Start {st ? st.toLocaleTimeString() : "—"}
                  </Typography>
                  <Tooltip title="Force End Shift (sets end time = now)">
                    <IconButton size="small" color="error" onClick={() => forceEndShift(s)}>
                      <StopCircleIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Paper>
              );
            })}
          </Stack>

          <TableContainer
            sx={{
              flex: 1,
              minHeight: 0,
              maxHeight: { xs: 260, sm: 300 },
              overflowX: "auto",
              borderRadius: 1.5,
              "& table": { minWidth: 520 },
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                    Qty
                  </TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Notes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeShiftTx.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No transactions yet.</TableCell>
                  </TableRow>
                ) : (
                  activeShiftTx.map((r) => {
                    const dt = r.timestamp?.seconds ? new Date(r.timestamp.seconds * 1000) : null;
                    return (
                      <TableRow key={r.id} hover sx={{ opacity: r.isDeleted ? 0.55 : 1 }}>
                        <TableCell>{dt ? dt.toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{r.item}</TableCell>
                        <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                          {r.quantity ?? ""}
                        </TableCell>
                        <TableCell align="right">{currency(r.total)}</TableCell>
                        <TableCell
                          sx={{
                            display: { xs: "none", sm: "table-cell" },
                            maxWidth: 240,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.notes || ""}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Soft delete">
                            <span>
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => softDeleteTx(r)}
                                disabled={r.isDeleted}
                              >
                                <DeleteIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Hard delete (permanent)">
                            <IconButton size="small" color="error" onClick={() => hardDeleteTx(r)}>
                              <DeleteForeverIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  );
}

/** UPDATED:
 * SalesBreakdownBody now respects:
 * - the global date range (via the parent transaction stream already scoped)
 * - the Service filter (including "Unknown")
 * - PC Rental inclusion only when service == All services or PC Rental
 */
function SalesBreakdownBody({ transactions, serviceFilter, serviceMap, shiftsInRange }) {
  const monthSales = useMemo(() => {
    const map = new Map();

    // Fold transactions in current scoped stream
    (transactions || []).forEach((t) => {
      const cls = classifyTx(t, serviceMap); // 'sale' | 'expense' | 'unknownSale' | null
      if (!cls || cls === "expense") return;

      if (!saleMatchesService(t, serviceFilter, serviceMap)) return;

      const item = String(t.item || "");
      map.set(item, (map.get(item) || 0) + txAmount(t));
    });

    // PC Rental line (when allowed by service filter)
    const includePCRental =
      !serviceFilter ||
      serviceFilter === "All services" ||
      norm(serviceFilter) === "pc rental";

    if (includePCRental) {
      const pc = (shiftsInRange || []).reduce((a, sh) => a + Number(sh.pcRentalTotal || 0), 0);
      if (pc) map.set("PC Rental", (map.get("PC Rental") || 0) + pc);
    }

    const list = Array.from(map.entries())
      .map(([item, amount]) => ({ item, amount }))
      .sort((a, b) => b.amount - a.amount);

    const total = list.reduce((a, b) => a + b.amount, 0);
    return { list, total };
  }, [transactions, serviceFilter, serviceMap, shiftsInRange]);

  return (
    <>
      {monthSales.list.length === 0 ? (
        <Typography variant="body2">No sales in the selected range.</Typography>
      ) : (
        <Stack spacing={1} sx={{ flex: 1 }}>
          {monthSales.list.map((row) => {
            const pct = monthSales.total > 0 ? (row.amount / monthSales.total) * 100 : 0;
            return (
              <Stack key={row.item} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: { xs: 120, sm: 160 } }}>
                  <Typography variant="body2" noWrap>
                    {row.item}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, pct)}
                  sx={{ flex: 1, height: 8, borderRadius: 999 }}
                />
                <Box sx={{ width: { xs: 120, sm: 160 }, textAlign: "right" }}>
                  <Typography variant="body2">
                    {currency(row.amount)} ({pct.toFixed(1)}%)
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </>
  );
}

/** UPDATED:
 * ExpenseBreakdownBody now respects the global date range
 * (the stream is already scoped), and groups expenses by type.
 * Service filter is intentionally IGNORED for expenses, mirroring KPIs/Trend.
 */
function ExpenseBreakdownBody({ transactions, serviceMap }) {
  const monthExpenses = useMemo(() => {
    const map = new Map();
    (transactions || []).forEach((t) => {
      const cls = classifyTx(t, serviceMap);
      if (cls !== "expense") return;
      const type = t.expenseType || "Misc";
      map.set(type, (map.get(type) || 0) + txAmount(t));
    });

    const list = Array.from(map.entries())
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);

    const total = list.reduce((a, b) => a + b.amount, 0);
    return { list, total };
  }, [transactions, serviceMap]);

  return (
    <>
      {monthExpenses.list.length === 0 ? (
        <Typography variant="body2">No expenses in the selected range.</Typography>
      ) : (
        <Stack spacing={1} sx={{ flex: 1 }}>
          {monthExpenses.list.map((row) => {
            const pct = monthExpenses.total > 0 ? (row.amount / monthExpenses.total) * 100 : 0;
            return (
              <Stack key={row.type} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: { xs: 120, sm: 160 } }}>
                  <Typography variant="body2" noWrap>
                    {row.type}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, pct)}
                  sx={{ flex: 1, height: 8, borderRadius: 999 }}
                />
                <Box sx={{ width: { xs: 120, sm: 160 }, textAlign: "right" }}>
                  <Typography variant="body2">
                    {currency(row.amount)} ({pct.toFixed(1)}%)
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </>
  );
}

/** UPDATED:
 * StaffLeaderboard now respects:
 * - global date range (using already-scoped transaction stream)
 * - Service filter (incl. "Unknown")
 * - PC Rental inclusion rules
 */
function StaffLeaderboard({ transactions, serviceFilter, serviceMap, shiftsInRange }) {
  const rows = useMemo(() => {
    const salesByStaff = new Map(); // staffEmail -> amount

    // debit + unknown sales in current scoped stream
    (transactions || []).forEach((t) => {
      const cls = classifyTx(t, serviceMap);
      if (!cls || cls === "expense") return;
      if (!saleMatchesService(t, serviceFilter, serviceMap)) return;

      const staff = t.staffEmail || "—";
      salesByStaff.set(staff, (salesByStaff.get(staff) || 0) + txAmount(t));
    });

    // add PC Rental from the range’s shifts (assigned to shift staff) when allowed
    const includePCRental =
      !serviceFilter ||
      serviceFilter === "All services" ||
      norm(serviceFilter) === "pc rental";

    if (includePCRental) {
      (shiftsInRange || []).forEach((sh) => {
        const staff = sh.staffEmail || "—";
        salesByStaff.set(staff, (salesByStaff.get(staff) || 0) + Number(sh.pcRentalTotal || 0));
      });
    }

    const list = Array.from(salesByStaff.entries())
      .map(([staff, sales]) => ({ staff, sales }))
      .sort((a, b) => b.sales - a.sales);

    return list;
  }, [transactions, serviceFilter, serviceMap, shiftsInRange]);

  return (
    <TableContainer
      sx={{
        maxHeight: { xs: 240, sm: 260 },
        overflowX: "auto",
        borderRadius: 1.5,
        "& table": { minWidth: 460 },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Staff</TableCell>
            <TableCell align="right">Total Sales</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2}>No data in the selected range.</TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.staff}>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography noWrap>{r.staff}</Typography>
                </TableCell>
                <TableCell align="right">{fmtPeso(r.sales)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ---------------- helpers: mobile-only collapsible wrapper ---------------- */
function MobileSection({ title, children, defaultExpanded = false }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      sx={{ display: { xs: "block", md: "none" }, borderRadius: 2, "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>{children}</AccordionDetails>
    </Accordion>
  );
}
