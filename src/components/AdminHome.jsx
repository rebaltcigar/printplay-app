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
  classifyTx,
  buildTrendSeries,
  fmtPeso,
  normalize,
} from "../utils/analytics";

import TrendSection from "./dashboard/TrendSection";
import ActiveShiftPanel from "./dashboard/ActiveShiftPanel";
import StaffLeaderboardPanel from "./dashboard/StaffLeaderboardPanel";
import SalesBreakdownPanel from "./dashboard/SalesBreakdownPanel";
import ExpenseBreakdownPanel from "./dashboard/ExpenseBreakdownPanel";
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import LoadingScreen from "./common/LoadingScreen";
import PageHeader from "./common/PageHeader";


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
      const itemName = normalize(t.item);
      const isPcRental = itemName === 'pc rental';

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
        // ... (keep capital check)
        const isCap =
          (t.expenseType || "").toLowerCase().includes("asset") ||
          (t.notes || "").toLowerCase().includes("capex") ||
          t.financialCategory === 'CAPEX';

        if (!isCap) {
          expenses += Math.abs(amt);
        }
      } else {
        // EXCLUDE PC Rental from transaction sum as it comes from shift.pcRentalTotal
        if (!isPcRental) {
          sales += amt;
        }
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

    // 1. Initialize with PC Rental from shifts
    shiftsScope.forEach(shift => {
      const staff = shift.staffEmail || "Unknown";
      if (!map[staff]) map[staff] = 0;
      map[staff] += Number(shift.pcRentalTotal || 0);
    });

    // 2. Add service sales from live transactions
    filteredTxValid.forEach(tx => {
      const staff = tx.staffEmail || "Unknown";
      const itemName = normalize(tx.item);
      const isPcRental = itemName === 'pc rental';

      const cls = classifyTx(tx, serviceMap);
      if (cls === 'sale' || cls === 'unknownSale') {
        // EXCLUDE PC Rental from transaction sum as it comes from shift.pcRentalTotal
        if (!isPcRental) {
          if (!map[staff]) map[staff] = 0;
          map[staff] += txAmount(tx);
        }
      }
    });

    return Object.entries(map)
      .map(([staff, sales]) => ({ staff, sales }))
      .sort((a, b) => b.sales - a.sales);
  }, [shiftsScope, filteredTxValid, serviceMap]);


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
    setConfirmDialog({
      open: true,
      title: "Delete Transaction? (Soft)",
      message: `Are you sure you want to delete ${tx.item} (${currency(txAmount(tx))})? This will preserve the record for audit but exclude it from totals.`,
      requireReason: true,
      confirmText: "Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          const ref = doc(db, "transactions", tx.id);
          await updateDoc(ref, {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user.email,
            deleteReason: reason,
          });
          showSnackbar("Transaction deleted (soft)", "success");
        } catch (err) {
          console.error(err);
          showSnackbar("Failed to delete", "error");
        }
      }
    });
  };

  const handleHardDeleteTx = async (tx) => {
    if (!tx?.id) return;
    setConfirmDialog({
      open: true,
      title: "PERMANENT Delete?",
      message: `DANGER: Permanently delete ${tx.item} (${currency(txAmount(tx))})? This CANNOT be undone and will be removed from all logs.`,
      requireReason: true,
      confirmText: "Hard Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          // Log the hard delete intent before doing it? (Optional, but let's just delete)
          await deleteDoc(doc(db, "transactions", tx.id));
          showSnackbar("Transaction permanently deleted", "success");
        } catch (err) {
          console.error(err);
          showSnackbar("Failed to hard delete", "error");
        }
      }
    });
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
      <Box sx={{ p: 3, pb: 0 }}>
        <PageHeader
          title="Dashboard"
          subtitle="Overview & Analytics"
          actions={
            <Stack direction="row" spacing={2} alignItems="center">
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
          }
        />
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
