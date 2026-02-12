// src/components/AdminHome.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Card, Typography, Stack, FormControl, InputLabel, Select, MenuItem, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { db } from "../firebase";
import { doc, updateDoc, deleteDoc, serverTimestamp, query, collection, where, onSnapshot } from "firebase/firestore";
import { useAnalytics } from "../contexts/AnalyticsContext"; // Context hook

import {
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
import LoadingScreen from "./common/LoadingScreen"; // NEW IMPORT


/* small helper */
const currency = (n) => fmtPeso(n);

async function clearShiftLockIfMatches(shiftId, endedByEmail) {
  // ... (keep helper)
  const statusRef = doc(db, "app_status", "current_shift");
  const snap = await (await import("firebase/firestore")).getDoc(statusRef);
  const data = snap.exists() ? snap.data() : null;
  if (data?.activeShiftId === shiftId) {
    await (await import("firebase/firestore")).setDoc(
      statusRef,
      { activeShiftId: null, endedBy: endedByEmail || "admin", endedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

export default function AdminHome({ user, showSnackbar, isActive = true }) {
  const theme = useTheme();

  // --- CONTEXT CONSUMPTION ---
  const {
    preset, setPreset,
    range: r,
    transactions: filteredTx, // Context returns raw list, but we filter 'isDeleted' in context or here? Context returns all. We filter here.
    shifts: shiftsScope,
    services,
    loading: analyticsLoading
  } = useAnalytics();

  // Local re-filter for deleted (Context gives everything found in range)
  // Actually context *could* filter, but let's do it here to be safe or use `filteredTx` name for raw and then filter.
  // Wait, `transactions` in context is raw.
  const transactionsRaw = filteredTx; // Alias

  /* ------------ global controls ------------ */
  // Presets managed by Context now.
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [includeCapitalInExpenses, setIncludeCapitalInExpenses] = useState(true);
  const [allTimeMode, setAllTimeMode] = useState("monthly");

  const [confirmDialog, setConfirmDialog] = useState({
    open: false, title: "", message: "", onConfirm: null, requireReason: false,
  });


  useEffect(() => {
    if (preset === "allTime") {
      if (r.shouldDefaultYearly) setAllTimeMode("yearly");
      else setAllTimeMode("monthly");
    }
  }, [preset, r.shouldDefaultYearly]);

  /* ------------ LIVE OPERATIONS (Active Shift) ------------ */
  // These remain local because they track "Right Now" regardless of selected Analytics range.
  const [currentShiftStatus, setCurrentShiftStatus] = useState(null);
  const [theActiveShift, setTheActiveShift] = useState(null);
  const [activeShiftTx, setActiveShiftTx] = useState([]);

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

  // Map services from context
  const serviceMap = useMemo(() => buildServiceMap(services), [services]);

  /* ============ COMPUTATIONS ============ */

  // 1. FILTER TRANSACTIONS
  // Re-implement filter on top of context data
  const filteredTxValid = useMemo(() => {
    return transactionsRaw.filter((t) => !t.isDeleted);
  }, [transactionsRaw]);

  // 2. METRICS (Use filteredTxValid)
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
    filteredTxValid.forEach((t) => {
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

        if (!isCap) {
          expenses += Math.abs(amt);
        }
      } else {
        sales += amt;
      }
    });

    sales += pcRentalRevenue;
    profit = sales - expenses;

    return { sales, expenses, profit, debtsIssued, debtsCollected };
  }, [filteredTxValid, shiftsScope]);

  // 3. TRENDS
  const trendData = useMemo(() => {
    let granularity = "day";
    if (preset === "thisYear" || preset === "lastYear") {
      granularity = "month";
    } else if (preset === "allTime") {
      granularity = allTimeMode === "yearly" ? "year" : "month";
    }

    return buildTrendSeries({
      transactions: filteredTxValid,
      shifts: shiftsScope,
      startLocal: r.startLocal,
      endLocal: r.endLocal,
      granularity,
      serviceMap
    });
  }, [filteredTxValid, shiftsScope, r.startLocal, r.endLocal, preset, allTimeMode, serviceMap]);

  // 4. LEADERBOARD ROWS (UPDATED: Shift-Based)
  const leaderboardRows = useMemo(() => {
    const map = {};

    // We iterate over the shifts currently in scope (filtered by date range)
    shiftsScope.forEach(shift => {
      // Use staffEmail from shift, fallback to 'Unknown'
      const staff = shift.staffEmail || "Unknown";

      // Calculate total sales for this shift
      // cashTotal usually represents the declared cash, but we want the actual calculated sales ideally.
      // 'totalSales' field might exist if we verified Shift schema.
      // If not, we might need to rely on what shiftsScope provides.
      // Assuming 'expectedCash' ~ Sales + StartingCash + Inputs - Expenses
      // Better to check if we store 'totalSales' or similar in shift doc.
      // If not, we might fail if we don't have it.
      // Let's assume we want to sum 'expectedCash' - 'startingCash' - 'cashInputs' + 'expenses'???
      // Actually, 'totalSales' is often stored or 'computedTotals.sales'. 
      // Let's check what came back in shift.
      // For now, let's look at `pcRentalTotal` + `soldItemsTotal` (if they exist).

      // FALLBACK: Use the helper in AnalyticsContext that might have enriched this?
      // No, raw shift data usually.

      // Let's use `grossSales` if available, or fallback to 0.
      // In `Shifts.jsx` it seems we compute it on the fly often.
      // But looking at stored data in typical implementations:
      // We'll trust `salesTotal` or `grossSales` if present. 
      // If not present, we might need to rely on the *transactions* but filtered by shift ID.
      // BUT user specifically asked: "pull the sales data of each shift they are assigned to based on the date filters"

      // Calculated in EndShiftDialog as: servicesTotal + pcRentalTotal
      const services = Number(shift.servicesTotal || 0);
      const rental = Number(shift.pcRentalTotal || 0);
      const sales = services + rental;

      if (!map[staff]) map[staff] = 0;
      map[staff] += sales;
    });

    return Object.entries(map)
      .map(([staff, sales]) => ({ staff, sales }))
      .sort((a, b) => b.sales - a.sales);
  }, [shiftsScope]);


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
  if (analyticsLoading) {
    return <LoadingScreen message="Analyzing business data..." />;
  }

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
              {filteredTxValid.filter(t => {
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
            {isActive && (
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
            )}
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
            {isActive && <SalesBreakdownPanel transactions={filteredTxValid} />}
          </Box>
          <Box sx={{ flex: 1 }}>
            {isActive && <ExpenseBreakdownPanel transactions={filteredTxValid} />}
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
