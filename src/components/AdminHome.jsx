// src/components/AdminHome.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore";

import {
  getRange,
  buildServiceMap,
  txAmount,
  buildTrendSeries,
  fmtPeso,
} from "../utils/analytics";

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

  const [shiftsScope, setShiftsScope] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  const [currentShiftStatus, setCurrentShiftStatus] = useState(null);
  const [theActiveShift, setTheActiveShift] = useState(null);
  const [activeShiftTx, setActiveShiftTx] = useState([]);

  const [services, setServices] = useState([]);
  const serviceMap = useMemo(() => buildServiceMap(services), [services]);

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

  /* 1. TRANSACTIONS (range) */
  useEffect(() => {
    if (!r.startUtc || !r.endUtc) return;
    setTxLoading(true);
    const q = query(
      collection(db, "transactions"),
      where("timestamp", ">=", Timestamp.fromDate(r.startUtc)),
      where("timestamp", "<=", Timestamp.fromDate(r.endUtc))
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setTransactions(list);
        setTxLoading(false);
      },
      (err) => {
        console.error("Tx load error", err);
        setTxLoading(false);
      }
    );
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* 2. SHIFTS (range) */
  useEffect(() => {
    if (!r.startUtc || !r.endUtc) return;
    setShiftsLoading(true);
    const q = query(
      collection(db, "shifts"),
      where("startTime", ">=", Timestamp.fromDate(r.startUtc)),
      where("startTime", "<=", Timestamp.fromDate(r.endUtc))
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setShiftsScope(list);
      setShiftsLoading(false);
    });
    return () => unsub();
  }, [r.startUtc, r.endUtc]);

  /* 3. CURRENT SHIFT STATUS */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "app_status", "current_shift"), (doc) => {
      setCurrentShiftStatus(doc.exists() ? doc.data() : null);
    });
    return () => unsub();
  }, []);

  /* 4. ACTIVE SHIFT DETAILS */
  useEffect(() => {
    if (!currentShiftStatus?.activeShiftId) {
      setTheActiveShift(null);
      setActiveShiftTx([]);
      return;
    }
    const unsubShift = onSnapshot(
      doc(db, "shifts", currentShiftStatus.activeShiftId),
      (s) => {
        setTheActiveShift(s.exists() ? { id: s.id, ...s.data() } : null);
      }
    );
    const qTx = query(
      collection(db, "transactions"),
      where("shiftId", "==", currentShiftStatus.activeShiftId)
    );
    const unsubTx = onSnapshot(qTx, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setActiveShiftTx(list);
    });
    return () => {
      unsubShift();
      unsubTx();
    };
  }, [currentShiftStatus?.activeShiftId]);

  /* 5. SERVICES */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "services"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setServices(list);
    });
    return () => unsub();
  }, []);

  /* ============ COMPUTATIONS ============ */

  // 1. FILTER TRANSACTIONS
  const filteredTx = useMemo(() => {
    return transactions.filter((t) => !t.isDeleted);
  }, [transactions]);

  // 2. METRICS
  const kpi = useMemo(() => {
    let sales = 0;
    let expenses = 0;
    let profit = 0;
    let debtsCollected = 0;
    let debtsIssued = 0;

    // Sum PC Rentals from Shifts
    let pcRentalRevenue = 0;
    shiftsScope.forEach(s => {
      pcRentalRevenue += Number(s.pcRentalTotal || 0);
    });

    // Sum Transactions
    filteredTx.forEach((t) => {
      const amt = txAmount(t);
      const isExp =
        t.category === "credit" ||
        (t.amount < 0 && !t.serviceId) ||
        t.expenseType ||
        t.item === "Expenses";

      const isDebtNew = t.item === "New Debt";
      const isDebtPaid = t.item === "Paid Debt";

      if (isDebtNew) {
        debtsIssued += amt;
      } else if (isDebtPaid) {
        debtsCollected += amt;
      } else if (isExp) {
        // check capital
        const isCap =
          (t.expenseType || "").toLowerCase().includes("asset") ||
          (t.notes || "").toLowerCase().includes("capex") ||
          t.financialCategory === 'CAPEX';

        // Fix: Widget specifically asked to exclude CAPEX.
        // We will calculate "expenses" as Pure OpEx for the KPI card.
        // We can create a separate "totalOutflow" if needed, but for "Operating Expenses" widget:
        if (!isCap) {
          expenses += Math.abs(amt);
        }
      } else {
        // Sales from Transactions (Items, Services, etc.)
        sales += amt;
      }
    });

    // Total Gross Sales = Transaction Sales + PC Rental Revenue
    sales += pcRentalRevenue;

    profit = sales - expenses; // Net Profit (OpEx based)

    return { sales, expenses, profit, debtsIssued, debtsCollected };
  }, [filteredTx, shiftsScope]);

  // 3. TRENDS
  const trendData = useMemo(() => {
    let granularity = "day";
    if (preset === "thisYear" || preset === "lastYear") {
      granularity = "month";
    } else if (preset === "allTime") {
      granularity = allTimeMode === "yearly" ? "year" : "month";
    }

    return buildTrendSeries({
      transactions: filteredTx,
      shifts: shiftsScope,
      startLocal: r.startLocal,
      endLocal: r.endLocal,
      granularity,
      serviceMap
    });
  }, [filteredTx, shiftsScope, r.startLocal, r.endLocal, preset, allTimeMode, serviceMap]);

  // 4. LEADERBOARD ROWS
  const leaderboardRows = useMemo(() => {
    const map = {};
    filteredTx.forEach(t => {
      const amt = txAmount(t);
      if (t.isDeleted || amt <= 0) return;
      const isExp = t.category === "credit" || t.expenseType || t.item === "Expenses" || t.item === "Paid Debt";
      if (isExp) return;

      const user = t.staffEmail || "Unknown";
      if (!map[user]) map[user] = 0;
      map[user] += amt;
    });
    return Object.entries(map)
      .map(([staff, sales]) => ({ staff, sales }))
      .sort((a, b) => b.sales - a.sales);
  }, [filteredTx]);

  /* ============ ACTIONS ============ */
  const handleForceEndShift = (shift) => {
    const sid = shift?.id;
    if (!sid) return;
    setConfirmDialog({
      open: true,
      title: "Force End Shift?",
      message:
        "This will end the current active shift immediately. The system will calculate totals based on current data.",
      requireReason: true,
      confirmText: "End Shift",
      confirmColor: "error",
      onConfirm: async (reason) => {
        await updateDoc(doc(db, "shifts", sid), {
          endTime: serverTimestamp(),
          forcedEndBy: user.email,
          forcedEndReason: reason,
        });
        await clearShiftLockIfMatches(sid, user.email);
        showSnackbar("Shift forced ended", "warning");
      },
    });
  };

  const handleSoftDeleteTx = async (tx) => {
    if (!tx?.id) return;
    try {
      const ref = doc(db, "transactions", tx.id);
      await updateDoc(ref, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.email,
      });
      showSnackbar("Transaction deleted (soft)", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to delete", "error");
    }
  };

  const handleHardDeleteTx = async (tx) => {
    if (!tx?.id) return;
    if (!window.confirm("Are you sure you want to permanently delete this transaction? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "transactions", tx.id));
      showSnackbar("Transaction permanently deleted", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to delete", "error");
    }
  };


  /* ============ RENDER ============ */
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden", // main scroll handling
        bgcolor: "background.default",
      }}
    >
      {/* HEADER CONTROLS */}
      <Box
        sx={{
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Overview & Analytics
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} alignItems="center">

            <Box sx={{ flexGrow: 1 }} />

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Time Range</InputLabel>
              <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="yesterday">Yesterday</MenuItem>
                <MenuItem value="thisWeek">This Week</MenuItem>
                <MenuItem value="lastWeek">Last Week</MenuItem>
                <MenuItem value="thisMonth">This Month</MenuItem>
                <MenuItem value="lastMonth">Last Month</MenuItem>
                <MenuItem value="thisYear">This Year</MenuItem>
                <MenuItem value="lastYear">Last Year</MenuItem>
                <MenuItem value="allTime">All Time</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Box>

      {/* SCROLLABLE CONTENT */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        {/* ROW 1: TOP CARDS */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 2,
            mb: 3,
          }}
        >
          {/* NET PROFIT */}
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Net Profit
            </Typography>
            <Typography
              variant="h4"
              sx={{
                color: kpi.profit >= 0 ? "success.main" : "error.main",
                fontWeight: "bold",
                my: 1,
              }}
            >
              {currency(kpi.profit)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Sales - Expenses
            </Typography>
          </Card>

          {/* GROSS SALES */}
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Gross Sales
            </Typography>
            <Typography
              variant="h4"
              sx={{ color: "primary.main", fontWeight: "bold", my: 1 }}
            >
              {currency(kpi.sales)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {filteredTx.filter(t => {
                const amt = txAmount(t);
                return amt > 0 && !t.expenseType && t.item !== "Paid Debt";
              }).length} transactions
            </Typography>
          </Card>

          {/* EXPENSES */}
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Operating Expenses
            </Typography>
            <Typography
              variant="h4"
              sx={{ color: "error.main", fontWeight: "bold", my: 1 }}
            >
              {currency(kpi.expenses)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Operating Expenses Only (Excl. Assets)
            </Typography>
          </Card>
        </Box>

        {/* ROW 2: Trend Chart (Full Width) */}
        <Box sx={{ mb: 3 }}>
          <Card sx={{ p: 2, height: 450, display: "flex", flexDirection: "column" }}>
            <TrendSection
              preset={preset}
              allTimeMode={allTimeMode}
              setAllTimeMode={setAllTimeMode}
              trendSeries={trendData}
              showSales={showSales}
              setShowSales={setShowSales}
              showExpenses={showExpenses}
              setShowExpenses={setShowExpenses}
              includeCapitalInExpenses={includeCapitalInExpenses}
              setIncludeCapitalInExpenses={setIncludeCapitalInExpenses}
            />
          </Card>
        </Box>

        {/* ROW 3: Active Shift & Leaderboard */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3 }}>
          <Box sx={{ flex: 1 }}>
            {/* Always visible Active Shift Panel */}
            <ActiveShiftPanel
              shiftsLoading={false}
              activeShifts={theActiveShift ? [theActiveShift] : []}
              activeShiftTx={activeShiftTx}
              currency={currency}
              forceEndShift={handleForceEndShift}
              softDeleteTx={handleSoftDeleteTx}
              hardDeleteTx={handleHardDeleteTx}
              fixedHeight={380}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <StaffLeaderboardPanel
              fixedHeight={380}
              rows={leaderboardRows}
            />
          </Box>
        </Stack>

        {/* ROW 4: Breakdowns */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 5 }}>
          <Box sx={{ flex: 1 }}>
            <SalesBreakdownPanel transactions={filteredTx} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <ExpenseBreakdownPanel transactions={filteredTx} />
          </Box>
        </Stack>
      </Box>

      {/* Confirms */}
      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog((p) => ({ ...p, open: false }))}
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
