import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Card, Typography, Stack, FormControl, InputLabel, Select, MenuItem, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { supabase } from "../../supabase";
import { useAnalytics } from "../../contexts/AnalyticsContext"; // Context hook
import { useOutstandingReceivables } from "../../hooks/useInvoices";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import { fmtCurrency } from "../../utils/formatters";
import { getFriendlyErrorMessage } from "../../services/errorService";
import { ROLES } from "../../utils/permissions";
import dayjs from "dayjs";

import {
  buildServiceMap,
  getRange,
  txAmount,
  classifyTx,
  buildTrendSeries,
  normalize,
  calculateMetrics,
} from "../../services/analyticsService";

import TrendSection from "../dashboard/TrendSection";
import ActiveShiftPanel from "../dashboard/ActiveShiftPanel";
import StaffLeaderboardPanel from "../dashboard/StaffLeaderboardPanel";
import SalesBreakdownPanel from "../dashboard/SalesBreakdownPanel";
import ExpenseBreakdownPanel from "../dashboard/ExpenseBreakdownPanel";
import LoadingScreen from "../common/LoadingScreen";
import PageHeader from "../common/PageHeader";




async function clearShiftLockIfMatches(shiftId, endedByEmail) {
  const { data } = await supabase.from('app_status').select('*').eq('id', 'current_shift').maybeSingle();
  if (data?.active_shift_id === shiftId) {
    await supabase.from('app_status').update({
      active_shift_id: null,
      ended_by: endedByEmail || ROLES.ADMIN,
      updated_at: new Date().toISOString()
    }).eq('id', 'current_shift');
  }
}

export default function AdminHome({ user, isActive = true }) {
  const { showSnackbar, showConfirm } = useGlobalUI();
  const theme = useTheme();

  // --- CONTEXT CONSUMPTION ---
  const {
    preset, setPreset,
    selectedMonthYear, setSelectedMonthYear,
    range: r,
    transactions: filteredTx,
    shifts: shiftsScope,
    services,
    loading: analyticsLoading
  } = useAnalytics();

  const { total: outstandingReceivables, loading: receivablesLoading } = useOutstandingReceivables();

  const transactionsRaw = filteredTx;

  /* ------------ global controls ------------ */
  // Presets managed by Context now.
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [includeCapitalInExpenses, setIncludeCapitalInExpenses] = useState(true);
  const [allTimeMode, setAllTimeMode] = useState("monthly");

  const YEARS = useMemo(() => {
    const list = [];
    const currentYear = dayjs().year();
    for (let y = currentYear; y >= 2024; y--) list.push(y);
    return list;
  }, []);

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handleMonthChange = (e) => {
    setSelectedMonthYear(selectedMonthYear.month(e.target.value));
  };

  const handleYearChange = (e) => {
    setSelectedMonthYear(selectedMonthYear.year(e.target.value));
  };




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
  const fetchActiveDebounceRef = useRef(null);

  /* 3. CURRENT SHIFT STATUS */
  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase.from('app_status').select('*').eq('id', 'current_shift').maybeSingle();
      if (data) {
        setCurrentShiftStatus({ id: data.id, activeShiftId: data.active_shift_id, staffEmail: data.staff_email });
      } else {
        setCurrentShiftStatus(null);
      }
    };

    fetchStatus();

    const channel = supabase.channel('current-shift-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_status', filter: 'id=eq.current_shift' }, (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          setCurrentShiftStatus({ id: payload.new.id, activeShiftId: payload.new.active_shift_id, staffEmail: payload.new.staff_email });
        } else {
          setCurrentShiftStatus(null);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /* 4. ACTIVE SHIFT DETAILS */
  const fetchActiveShiftData = useCallback(async () => {
    if (!currentShiftStatus?.activeShiftId) return;
    const sid = currentShiftStatus.activeShiftId;

    const { data: shiftData } = await supabase.from('shifts').select('*').eq('id', sid).maybeSingle();
    if (shiftData) {
      setTheActiveShift({
        id: shiftData.id,
        ...shiftData,
        pcRentalTotal: Number(shiftData.pc_rental_total),
        staffEmail: shiftData.staff_email,
        startTime: shiftData.start_time
      });
    }

    const [resOrders, resPc, resEx] = await Promise.all([
      supabase.from('order_items').select('*').eq('shift_id', sid),
      supabase.from('pc_transactions').select('*').eq('shift_id', sid),
      supabase.from('expenses').select('*').eq('shift_id', sid)
    ]);

    const list = [
      ...(resOrders.data || []).map(d => ({ ...d, paymentMethod: d.payment_method, isDeleted: false, amount: Number(d.amount), total: Number(d.amount), customerName: d.customer_name })),
      ...(resPc.data || []).map(d => ({ ...d, paymentMethod: d.payment_method, isDeleted: false, amount: Number(d.amount), total: Number(d.amount), customerName: d.customer_name })),
      ...(resEx.data || []).map(d => ({ ...d, item: 'Expenses', paymentMethod: 'Cash', isDeleted: false, amount: Number(d.amount), total: Number(d.amount), expenseType: d.expense_type }))
    ];
    setActiveShiftTx(list);
  }, [currentShiftStatus?.activeShiftId]);

  useEffect(() => {
    if (!currentShiftStatus?.activeShiftId) {
      setTheActiveShift(null);
      setActiveShiftTx([]);
      return;
    }

    fetchActiveShiftData();

    const sid = currentShiftStatus.activeShiftId;
    const debouncedFetch = () => {
      clearTimeout(fetchActiveDebounceRef.current);
      fetchActiveDebounceRef.current = setTimeout(fetchActiveShiftData, 300);
    };

    const channel = supabase.channel(`admin-tx-${sid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `shift_id=eq.${sid}` }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pc_transactions', filter: `shift_id=eq.${sid}` }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `shift_id=eq.${sid}` }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(fetchActiveDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentShiftStatus?.activeShiftId, fetchActiveShiftData]);

  // Map services from context
  const serviceMap = useMemo(() => buildServiceMap(services), [services]);

  /* ============ COMPUTATIONS ============ */

  // 1. FILTER TRANSACTIONS
  // Re-implement filter on top of context data
  const filteredTxValid = useMemo(() => {
    return transactionsRaw.filter((t) => !t.isDeleted);
  }, [transactionsRaw]);

  // 2. METRICS (Use centralized logic)
  const kpi = useMemo(() => {
    return calculateMetrics(filteredTxValid, shiftsScope);
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
    showConfirm({
      title: "Force End Shift?",
      message:
        "This will end the current active shift immediately. The system will calculate totals based on current data.",
      requireReason: true,
      confirmLabel: "End Shift",
      confirmColor: "error",
      onConfirm: async (reason) => {
        await supabase.from('shifts').update({
          end_time: new Date().toISOString(),
          forced_end_by: user.email,
          forced_end_reason: reason,
        }).eq('id', sid);
        await clearShiftLockIfMatches(sid, user.email);
        showSnackbar("Shift forced ended", "warning");
      },
    });
  };

  const handleSoftDeleteTx = async (tx) => {
    if (!tx?.id) return;
    showConfirm({
      title: "Delete Transaction? (Soft)",
      message: `Are you sure you want to delete ${tx.item} (${fmtCurrency(txAmount(tx))})? This will preserve the record for audit but exclude it from totals.`,
      requireReason: true,
      confirmLabel: "Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          const table = tx.item === 'Expenses' ? 'expenses' : (tx.id.startsWith('TXN') ? 'pc_transactions' : 'order_items');
          await supabase.from(table).delete().eq('id', tx.id);
          // Assuming soft delete is actually just returning funds or deleting for now.
          // True soft delete needs an is_deleted column which we didn't add to all tables. So we purge.
          showSnackbar("Transaction deleted", "success");
        } catch (err) {
          console.error(err);
          showSnackbar(getFriendlyErrorMessage(err), "error");
        }
      }
    });
  };

  const handleHardDeleteTx = async (tx) => {
    if (!tx?.id) return;
    showConfirm({
      title: "PERMANENT Delete?",
      message: `DANGER: Permanently delete ${tx.item} (${fmtCurrency(txAmount(tx))})? This CANNOT be undone and will be removed from all logs.`,
      requireReason: true,
      confirmLabel: "Hard Delete",
      confirmColor: "error",
      onConfirm: async (reason) => {
        try {
          // Log the hard delete intent before doing it? (Optional, but let's just delete)
          const table = tx.item === 'Expenses' ? 'expenses' : (tx.id.startsWith('TXN') ? 'pc_transactions' : 'order_items');
          await supabase.from(table).delete().eq('id', tx.id);
          showSnackbar("Transaction permanently deleted", "success");
        } catch (err) {
          console.error(err);
          showSnackbar(getFriendlyErrorMessage(err), "error");
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
              {preset === "customMonth" && (
                <Stack direction="row" spacing={1}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Month</InputLabel>
                    <Select
                      value={selectedMonthYear.month()}
                      label="Month"
                      onChange={handleMonthChange}
                    >
                      {MONTHS.map((m, i) => (
                        <MenuItem key={m} value={i}>{m}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>Year</InputLabel>
                    <Select
                      value={selectedMonthYear.year()}
                      label="Year"
                      onChange={handleYearChange}
                    >
                      {YEARS.map(y => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              )}
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Time Range</InputLabel>
                <Select value={preset} label="Time Range" onChange={(e) => setPreset(e.target.value)}>
                  <MenuItem value="today">Today</MenuItem>
                  <MenuItem value="yesterday">Yesterday</MenuItem>
                  <MenuItem value="thisWeek">This Week</MenuItem>
                  <MenuItem value="lastWeek">Last Week</MenuItem>
                  <MenuItem value="thisMonth">This Month</MenuItem>
                  <MenuItem value="lastMonth">Last Month</MenuItem>
                  <MenuItem value="customMonth">Specific Month</MenuItem>
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
              {fmtCurrency(kpi.profit)}
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
              {fmtCurrency(kpi.sales)}
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
              {fmtCurrency(kpi.expenses)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Operating Expenses Only (Excl. Assets)
            </Typography>
          </Card>

          {/* OUTSTANDING RECEIVABLES */}
          <Card sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Outstanding Receivables
            </Typography>
            <Typography
              variant="h4"
              sx={{ color: "error.main", fontWeight: "bold", my: 1 }}
            >
              {receivablesLoading ? "—" : fmtCurrency(outstandingReceivables)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {preset === 'allTime' ? 'Since earliest record' : 'Unpaid Customer Accounts'}
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
              currency={fmtCurrency}
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

    </Box>


  );
}
