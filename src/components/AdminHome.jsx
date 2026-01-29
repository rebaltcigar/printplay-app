// src/components/AdminHome.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Stack,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  useMediaQuery,
} from "@mui/material";
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
  deleteDoc,
  serverTimestamp,
  Timestamp,
  limit,
} from "firebase/firestore";

import {
  getRange,
  buildServiceMap,
  classifyTx,
  txAmount,
  buildTrendSeries,
  normalize as norm,
  fmtPeso,
  saleMatchesService,
} from "../utils/analytics";

// ⬇️ THE NEW ONES – note the ./dashboard/... (not ../components/..)
import TrendSection from "./dashboard/TrendSection";
import ActiveShiftPanel from "./dashboard/ActiveShiftPanel";
import StaffLeaderboardPanel from "./dashboard/StaffLeaderboardPanel";
import SalesBreakdownPanel from "./dashboard/SalesBreakdownPanel";
import ExpenseBreakdownPanel from "./dashboard/ExpenseBreakdownPanel";
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";

/* small helper */
const currency = (n) => fmtPeso(n);

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

export default function AdminHome({ user, showSnackbar }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  /* ------------ global controls ------------ */
  const [preset, setPreset] = useState("thisMonth");
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [serviceFilter, setServiceFilter] = useState("All services");
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [includeCapitalInExpenses, setIncludeCapitalInExpenses] =
    useState(true);
  const [allTimeMode, setAllTimeMode] = useState("monthly");

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  const [earliestShiftStart, setEarliestShiftStart] = useState(null);

  const r = useMemo(
    () => getRange(preset, monthYear, earliestShiftStart),
    [preset, monthYear, earliestShiftStart]
  );

  useEffect(() => {
    if (preset === "allTime") {
      if (r.shouldDefaultYearly) setAllTimeMode("yearly");
      else setAllTimeMode("monthly");
    }
  }, [preset, r.shouldDefaultYearly]);

  /* ------------ data streams ------------ */
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  const [debtTxAll, setDebtTxAll] = useState([]);
  const [debtLoading, setDebtLoading] = useState(true);

  const [shiftsScope, setShiftsScope] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  const [currentShiftStatus, setCurrentShiftStatus] = useState(null);
  const [theActiveShift, setTheActiveShift] = useState(null);
  const [activeShiftTx, setActiveShiftTx] = useState([]);

  const [services, setServices] = useState([]);
  const serviceMap = useMemo(() => buildServiceMap(services), [services]);
  const [serviceOptions, setServiceOptions] = useState([
    "All services",
    "Unknown",
  ]);

  const logoUrl = "/logo.png";

  /* earliest shift for all-time */
  useEffect(() => {
    const qRef = query(
      collection(db, "shifts"),
      orderBy("startTime", "asc"),
      limit(1)
    );
    const unsub = onSnapshot(qRef, (snap) => {
      const first = snap.docs[0]?.data();
      if (first?.startTime?.seconds) {
        setEarliestShiftStart(new Date(first.startTime.seconds * 1000));
      }
    });
    return () => unsub();
  }, []);

  /* scoped transactions (by date range) */
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
        console.error("Transactions listener error:", err);
        if (showSnackbar) showSnackbar("Failed to load transactions.", 'error');
        setTxLoading(false);
      }
    );
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* services */
  useEffect(() => {
    const qRef = query(collection(db, "services"), orderBy("sortOrder"));
    const unsub = onSnapshot(qRef, (snap) => {
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
      setServiceFilter((prev) => (opts.includes(prev) ? prev : "All services"));
    });
    return () => unsub();
  }, []);

  /* shifts in range */
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
        console.error("Shifts listener error:", err);
        if (showSnackbar) showSnackbar("Failed to load shifts.", 'error');
        setShiftsLoading(false);
      }
    );
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* all-time debt for KPI */
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
        console.error("Debt listener error:", err);
        if (showSnackbar) showSnackbar("Failed to load debt records.", 'error');
        setDebtLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* active shift status */
  useEffect(() => {
    const ref = doc(db, "app_status", "current_shift");
    const unsub = onSnapshot(ref, (snap) =>
      setCurrentShiftStatus(snap.exists() ? snap.data() : null)
    );
    return () => unsub();
  }, []);

  const activeShiftId = currentShiftStatus?.activeShiftId;

  // 1) listen to active shift doc
  useEffect(() => {
    if (!activeShiftId) {
      setTheActiveShift(null);
      return;
    }
    const shiftRef = doc(db, "shifts", activeShiftId);
    const unsub = onSnapshot(
      shiftRef,
      (snap) =>
        setTheActiveShift(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setTheActiveShift(null)
    );
    return () => unsub();
  }, [activeShiftId]);

  // 2) listen to transactions for that shift
  useEffect(() => {
    if (!activeShiftId) {
      setActiveShiftTx([]);
      return;
    }
    const qRef = query(
      collection(db, "transactions"),
      where("shiftId", "==", activeShiftId),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const txs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => t.isDeleted !== true);
        setActiveShiftTx(txs);
      },
      () => setActiveShiftTx([])
    );
    return () => unsub();
  }, [activeShiftId]);

  /* ------------ derived ------------ */
  const activeShifts = useMemo(
    () => (theActiveShift ? [theActiveShift] : []),
    [theActiveShift]
  );
  const isLoadingActiveShift = !!activeShiftId && !theActiveShift;

  const visibleTx = useMemo(
    () => transactions.filter((t) => t.isDeleted !== true),
    [transactions]
  );

  // KPI values (with capital toggle applied)
  const kpi = useMemo(() => {
    let sales = 0;
    let expenses = 0;
    let capital = 0;

    for (const t of visibleTx) {
      const cls = classifyTx(t, serviceMap);
      if (!cls) continue;
      const amt = txAmount(t);

      if (cls === "expense") {
        expenses += amt;
        if (String(t.expenseType || "").toLowerCase().includes("capital")) {
          capital += amt;
        }
      } else {
        if (saleMatchesService(t, serviceFilter, serviceMap)) {
          sales += amt;
        }
      }
    }

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

    const effectiveExpenses = includeCapitalInExpenses
      ? expenses
      : Math.max(0, expenses - capital);

    return {
      sales,
      expenses: effectiveExpenses,
      net: sales - effectiveExpenses,
    };
  }, [
    visibleTx,
    serviceMap,
    serviceFilter,
    shiftsScope,
    includeCapitalInExpenses,
  ]);

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
      preset === "past7"
        ? "date"
        : preset === "thisMonth" || preset === "monthYear"
          ? "number"
          : gran === "month"
            ? "month"
            : "year";

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
  }, [
    visibleTx,
    shiftsScope,
    r.startLocal,
    r.endLocal,
    preset,
    allTimeMode,
    serviceFilter,
    serviceMap,
  ]);

  /* ------------ actions ------------ */
  const forceEndShift = async (shift) => {
    if (!shift?.id) return;
    setConfirmDialog({
      open: true,
      title: "Force End Shift",
      message: `Force end shift for ${shift.staffEmail || "unknown"} now?`,
      requireReason: false,
      confirmColor: "primary",
      onConfirm: async () => {
        try {
          const endedBy = auth.currentUser?.email || "admin";
          await updateDoc(doc(db, "shifts", shift.id), {
            endTime: Timestamp.fromDate(new Date()),
            endedBy,
            status: "ended",
          });
          await clearShiftLockIfMatches(shift.id, endedBy);
          if (showSnackbar) showSnackbar("Shift ended successfully.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to end shift.", 'error');
        }
      }
    });
  };

  const softDeleteTx = async (row) => {
    setConfirmDialog({
      open: true,
      title: "Soft Delete Transaction",
      message: `Delete transaction: ${row.item} (${fmtPeso(txAmount(row))})?`,
      requireReason: true,
      confirmColor: "warning",
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", row.id), {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: auth.currentUser?.email || "admin",
            deleteReason: reason,
            lastUpdatedAt: serverTimestamp(),
          });
          if (showSnackbar) showSnackbar("Transaction deleted (soft).", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Failed to delete transaction.", 'error');
        }
      }
    });
  };

  const hardDeleteTx = async (row) => {
    setConfirmDialog({
      open: true,
      title: "PERMANENT Delete",
      message: "This cannot be undone. Permanently delete this transaction?",
      requireReason: false,
      confirmColor: "error",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "transactions", row.id));
          if (showSnackbar) showSnackbar("Transaction permanently deleted.", 'success');
        } catch (e) {
          console.error(e);
          showSnackbar?.("Hard delete failed.", 'error');
        }
      }
    });
  };

  /* ------------ UI ------------ */
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
      {/* header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 1, sm: 2 },
          flexWrap: "wrap",
        }}
      >
        <img
          src={logoUrl}
          alt="logo"
          style={{ height: 36 }}
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Admin Home
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            label="Time Range"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <MenuItem value="past7">Past 7 Days</MenuItem>
            <MenuItem value="thisMonth">This Month</MenuItem>
            <MenuItem value="monthYear">Month–Year</MenuItem>
            <MenuItem value="thisYear">This Year</MenuItem>
            <MenuItem value="allTime">All Time</MenuItem>
          </Select>
        </FormControl>
        {preset === "monthYear" && (
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>Month</InputLabel>
              <Select
                label="Month"
                value={monthYear.getMonth()}
                onChange={(e) =>
                  setMonthYear(
                    new Date(
                      monthYear.getFullYear(),
                      Number(e.target.value),
                      1
                    )
                  )
                }
              >
                {[
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ].map((m, i) => (
                  <MenuItem key={m} value={i}>
                    {m}
                  </MenuItem>
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
              sx={{ width: 90 }}
            />
          </Stack>
        )}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Service</InputLabel>
          <Select
            label="Service"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
          >
            {serviceOptions.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* KPIs */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: { xs: 1.5, md: 2 },
        }}
      >
        <KpiCard
          title="Sales"
          loading={txLoading || shiftsLoading}
          value={currency(kpi.sales)}
        />
        <KpiCard
          title={
            includeCapitalInExpenses ? "Expenses" : "Expenses (no capital)"
          }
          loading={txLoading}
          value={currency(kpi.expenses)}
        />
        <KpiCard
          title="Net"
          loading={txLoading || shiftsLoading}
          value={currency(kpi.net)}
          emphasize={kpi.net >= 0 ? "good" : "bad"}
        />
        <KpiCard
          title="Outstanding Debt (All Time)"
          loading={debtLoading}
          value={currency(outstandingDebt)}
        />
      </Box>

      {/* TREND CARD */}
      <Card
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          height: 340,
          minHeight: 340,
        }}
      >
        <TrendSection
          preset={preset}
          allTimeMode={allTimeMode}
          setAllTimeMode={setAllTimeMode}
          trendSeries={trendSeries}
          showSales={showSales}
          setShowSales={setShowSales}
          showExpenses={showExpenses}
          setShowExpenses={setShowExpenses}
          includeCapitalInExpenses={includeCapitalInExpenses}
          setIncludeCapitalInExpenses={setIncludeCapitalInExpenses}
        />
      </Card>

      {/* MAIN GRID (desktop) */}
      {isMobile ? (
        <>
          <ActiveShiftPanel
            fixedHeight={340}
            shiftsLoading={isLoadingActiveShift}
            activeShifts={activeShifts}
            activeShiftTx={activeShiftTx}
            currency={currency}
            forceEndShift={forceEndShift}
            softDeleteTx={softDeleteTx}
            hardDeleteTx={hardDeleteTx}
          />
          <StaffLeaderboardPanel
            fixedHeight={340}
            rows={buildStaffLeaderboard(
              visibleTx,
              serviceFilter,
              serviceMap,
              shiftsScope
            )}
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
            }}
          >
            <SalesBreakdownPanel
              data={buildSalesBreakdown(
                visibleTx,
                serviceFilter,
                serviceMap,
                shiftsScope
              )}
            />
            <ExpenseBreakdownPanel
              data={buildExpenseBreakdown(visibleTx, serviceMap)}
            />
          </Box>
        </>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 2,
            alignItems: "stretch",
          }}
        >
          {/* top row - same fixed height */}
          <ActiveShiftPanel
            fixedHeight={340}
            shiftsLoading={isLoadingActiveShift}
            activeShifts={activeShifts}
            activeShiftTx={activeShiftTx}
            currency={currency}
            forceEndShift={forceEndShift}
            softDeleteTx={softDeleteTx}
            hardDeleteTx={hardDeleteTx}
          />
          <StaffLeaderboardPanel
            fixedHeight={340}
            rows={buildStaffLeaderboard(
              visibleTx,
              serviceFilter,
              serviceMap,
              shiftsScope
            )}
          />

          {/* bottom row - stretch both */}
          <Box
            sx={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
              alignItems: "stretch",
              minHeight: 280,
            }}
          >
            <SalesBreakdownPanel
              data={buildSalesBreakdown(
                visibleTx,
                serviceFilter,
                serviceMap,
                shiftsScope
              )}
            />
            <ExpenseBreakdownPanel
              data={buildExpenseBreakdown(visibleTx, serviceMap)}
            />
          </Box>
        </Box>
      )}
      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(p => ({ ...p, open: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        onConfirm={confirmDialog.onConfirm}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Box>
  );
}

/* ------------ helpers for AdminHome ------------ */

function KpiCard({ title, value, loading, emphasize }) {
  return (
    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: "100%" }}>
      <Typography variant="caption" sx={{ opacity: 0.7 }}>
        {title}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          mt: 0.5,
          fontWeight: 700,
          color:
            emphasize === "good"
              ? "success.main"
              : emphasize === "bad"
                ? "error.main"
                : "inherit",
        }}
      >
        {value}
      </Typography>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
    </Card>
  );
}

function buildStaffLeaderboard(
  transactions,
  serviceFilter,
  serviceMap,
  shiftsInRange
) {
  const salesByStaff = new Map();

  (transactions || []).forEach((t) => {
    const cls = classifyTx(t, serviceMap);
    if (!cls || cls === "expense") return;
    if (!saleMatchesService(t, serviceFilter, serviceMap)) return;
    const staff = t.staffEmail || "—";
    salesByStaff.set(staff, (salesByStaff.get(staff) || 0) + txAmount(t));
  });

  const includePCRental =
    !serviceFilter ||
    serviceFilter === "All services" ||
    norm(serviceFilter) === "pc rental";
  if (includePCRental) {
    (shiftsInRange || []).forEach((sh) => {
      const staff = sh.staffEmail || "—";
      salesByStaff.set(
        staff,
        (salesByStaff.get(staff) || 0) + Number(sh.pcRentalTotal || 0)
      );
    });
  }

  return Array.from(salesByStaff.entries())
    .map(([staff, sales]) => ({ staff, sales }))
    .sort((a, b) => b.sales - a.sales);
}

function buildSalesBreakdown(
  transactions,
  serviceFilter,
  serviceMap,
  shiftsInRange
) {
  const map = new Map();

  (transactions || []).forEach((t) => {
    const cls = classifyTx(t, serviceMap);
    if (!cls || cls === "expense") return;
    if (!saleMatchesService(t, serviceFilter, serviceMap)) return;
    const item = String(t.item || "");
    map.set(item, (map.get(item) || 0) + txAmount(t));
  });

  const includePCRental =
    !serviceFilter ||
    serviceFilter === "All services" ||
    norm(serviceFilter) === "pc rental";

  if (includePCRental) {
    const pc = (shiftsInRange || []).reduce(
      (a, sh) => a + Number(sh.pcRentalTotal || 0),
      0
    );
    if (pc) map.set("PC Rental", (map.get("PC Rental") || 0) + pc);
  }

  const list = Array.from(map.entries())
    .map(([item, amount]) => ({ item, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = list.reduce((a, b) => a + b.amount, 0);
  return { list, total };
}

function buildExpenseBreakdown(transactions, serviceMap) {
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
}
