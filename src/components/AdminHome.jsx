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
  Divider,
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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
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
} from "firebase/firestore";

/* ----------------- helpers ----------------- */
const startOfToday = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfToday = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const startOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};
const currency = (n) => `₱${Number(n || 0).toFixed(2)}`;
const LiveDot = ({ color = "success.main", size = 10 }) => (
  <FiberManualRecordIcon sx={{ color, fontSize: size }} />
);

/* ----------------- component ----------------- */
export default function AdminHome() {
  const theme = useTheme();
  // Treat <= md as “mobile/tablet” for stacking + accordions
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // date scope
  const [scope, setScope] = useState("month"); // month | 7d | today
  const { start, end } = useMemo(() => {
    if (scope === "today") return { start: startOfToday(), end: endOfToday() };
    if (scope === "7d") return { start: daysAgo(6), end: endOfToday() };
    return { start: startOfMonth(), end: endOfMonth() };
  }, [scope]);

  // streams
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  // keep debt stream only to compute Outstanding Debt KPI
  const [debtTxAll, setDebtTxAll] = useState([]);
  const [debtLoading, setDebtLoading] = useState(true);

  const [shiftsToday, setShiftsToday] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  const [connOk, setConnOk] = useState(true);
  const [lastWrite, setLastWrite] = useState(null);

  const logoUrl = "/logo.png";

  /* --------- scoped transactions (live) --------- */
  useEffect(() => {
    setTxLoading(true);
    const qRef = query(
      collection(db, "transactions"),
      where("timestamp", ">=", start),
      where("timestamp", "<=", end),
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
        setConnOk(false);
        setTxLoading(false);
      }
    );
    return () => unsub();
  }, [start, end]);

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

  /* --------- today shifts (to detect active) --------- */
  useEffect(() => {
    setShiftsLoading(true);
    const s = startOfToday();
    const e = endOfToday();
    const qRef = query(
      collection(db, "shifts"),
      where("startTime", ">=", Timestamp.fromDate(s)),
      where("startTime", "<=", Timestamp.fromDate(e)),
      orderBy("startTime", "asc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setShiftsToday(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setShiftsLoading(false);
      },
      (err) => {
        console.error("shifts stream error", err);
        setShiftsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* --------- derived --------- */
  const visibleTx = useMemo(
    () => transactions.filter((t) => t.isDeleted !== true),
    [transactions]
  );

  // revenue/expenses/net (scoped)
  const kpi = useMemo(() => {
    let revenue = 0;
    let expenses = 0;
    const byItem = new Map();
    visibleTx.forEach((t) => {
      const item = String(t.item || "");
      const amt = Number(t.total || 0);
      byItem.set(item, (byItem.get(item) || 0) + amt);
      if (item === "Expenses") expenses += amt;
      else revenue += amt; // include all non-Expenses (incl. debt items & services)
    });
    return { revenue, expenses, net: revenue - expenses, byItem };
  }, [visibleTx]);

  // Outstanding Debt KPI only
  const outstandingDebt = useMemo(() => {
    const per = new Map();
    debtTxAll.forEach((t) => {
      if (t.isDeleted) return;
      const id = t.customerId || "__unknown__";
      const amt = Number(t.total || 0);
      const prev = per.get(id) || 0;
      const bal =
        t.item === "New Debt" ? prev + amt : t.item === "Paid Debt" ? prev - amt : prev;
      per.set(id, bal);
    });
    return Array.from(per.values())
      .filter((v) => v >= 1)
      .reduce((a, b) => a + b, 0);
  }, [debtTxAll]);

  // expense breakdown (MTD)
  const monthExpenses = useMemo(() => {
    const s = startOfMonth();
    const e = endOfMonth();
    const map = new Map();
    transactions.forEach((t) => {
      if (t.isDeleted || t.item !== "Expenses") return;
      const ts = t.timestamp?.seconds
        ? new Date(t.timestamp.seconds * 1000)
        : t.timestamp
        ? new Date(t.timestamp)
        : null;
      if (!ts || ts < s || ts > e) return;
      let type = t.expenseType || "Misc";
      if (type === "Salary Advance") type = "Salary"; // merged as requested
      map.set(type, (map.get(type) || 0) + Number(t.total || 0));
    });
    const list = Array.from(map.entries())
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = list.reduce((a, b) => a + b.amount, 0);
    return { list, total };
  }, [transactions]);

  // sales breakdown (MTD) — include PC Rental + all debit items + all other non-Expenses
  const monthSales = useMemo(() => {
    const s = startOfMonth();
    const e = endOfMonth();
    const map = new Map(); // item -> amount
    transactions.forEach((t) => {
      if (t.isDeleted) return;
      const ts = t.timestamp?.seconds
        ? new Date(t.timestamp.seconds * 1000)
        : t.timestamp
        ? new Date(t.timestamp)
        : null;
      if (!ts || ts < s || ts > e) return;
      const item = String(t.item || "");
      if (item === "Expenses") return; // exclude expenses from sales
      map.set(item, (map.get(item) || 0) + Number(t.total || 0));
    });
    const list = Array.from(map.entries())
      .map(([item, amount]) => ({ item, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = list.reduce((a, b) => a + b.amount, 0);
    return { list, total };
  }, [transactions]);

  // Active shifts
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
      await updateDoc(doc(db, "shifts", shift.id), {
        endTime: Timestamp.fromDate(new Date()),
      });
      setLastWrite(new Date());
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
      setLastWrite(new Date());
    } catch (e) {
      console.error(e);
      alert("Failed to delete transaction.");
    }
  };

  const hardDeleteTx = async (row) => {
    if (!window.confirm("PERMANENTLY delete this transaction? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "transactions", row.id));
      setLastWrite(new Date());
    } catch (e) {
      console.error(e);
      alert("Hard delete failed.");
    }
  };

  /* ---------------- section bodies (content only, no outer Card/Accordion) ---------------- */
  const ActiveShiftBody = () => (
    <>
      {shiftsLoading && <LinearProgress sx={{ mt: 0.5 }} />}
      {activeShifts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, textAlign: "center" }}>
          No active shift.
        </Paper>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap", gap: { xs: 1, sm: 1 }, mb: 0.5 }}
          >
            {activeShifts.map((s) => {
              const st = s.startTime?.seconds ? new Date(s.startTime.seconds * 1000) : null;
              return (
                <Paper
                  key={s.id}
                  variant="outlined"
                  sx={{
                    px: 1,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    borderRadius: 1.5,
                  }}
                >
                  <LiveDot color="error.main" />
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    {s.shiftPeriod || "Shift"} — {s.staffEmail} • Start{" "}
                    {st ? st.toLocaleTimeString() : "—"}
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
                        <TableCell
                          align="right"
                          sx={{ display: { xs: "none", sm: "table-cell" } }}
                        >
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

  const SalesBreakdownBody = () => (
    <>
      {monthSales.list.length === 0 ? (
        <Typography variant="body2">No sales this month.</Typography>
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

  const ExpenseBreakdownBody = () => (
    <>
      {monthExpenses.list.length === 0 ? (
        <Typography variant="body2">No expenses this month.</Typography>
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

  const SystemHealthBody = () => (
    <Box
      sx={{
        display: { xs: "block", sm: "flex" },
        alignItems: { sm: "center" },
        gap: { xs: 1, sm: 2 },
      }}
    >
      <Chip
        icon={connOk ? <CheckCircleIcon /> : <WarningAmberIcon />}
        label={connOk ? "Firestore connected" : "Firestore error"}
        color={connOk ? "success" : "error"}
        size="small"
      />
      <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" } }} />
      <Typography variant="body2">
        Last write: {lastWrite ? new Date(lastWrite).toLocaleString() : "—"}
      </Typography>
    </Box>
  );

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
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
        <img
          src={logoUrl}
          alt="logo"
          style={{ height: 36 }}
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: 16, sm: 20 } }}>
          Admin Home
        </Typography>
        <Chip
          size="small"
          color={connOk ? "success" : "error"}
          icon={<LiveDot size={10} />}
          label={connOk ? "Live" : "Offline"}
        />
        <Box sx={{ flexGrow: 1 }} />
        <FormControl size="small" sx={{ minWidth: { xs: 140, sm: 180 } }}>
          <InputLabel>Date Scope</InputLabel>
          <Select label="Date Scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <MenuItem value="month">This Month</MenuItem>
            <MenuItem value="7d">Last 7 Days</MenuItem>
            <MenuItem value="today">Today</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* KPIs: equal-width responsive grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: { xs: 1.5, md: 2 },
          width: "100%",
        }}
      >
        <KpiCard title="Revenue" loading={txLoading} value={currency(kpi.revenue)} />
        <KpiCard title="Expenses" loading={txLoading} value={currency(kpi.expenses)} />
        <KpiCard
          title="Net"
          loading={txLoading}
          value={currency(kpi.net)}
          emphasize={kpi.net >= 0 ? "good" : "bad"}
        />
        <KpiCard title="Outstanding Debt" loading={debtLoading} value={currency(outstandingDebt)} />
      </Box>

      {/* CONTENT: mobile = single column + accordions; desktop = original grid */}
      {isMobile ? (
        // -------- MOBILE: single column, one after another, collapsible
        <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
          <MobileSection title="Active shift's transactions" defaultExpanded>
            <ActiveShiftBody />
          </MobileSection>

          <MobileSection title="Staff Leaderboard (This Month)" defaultExpanded>
            <StaffLeaderboard transactions={transactions} />
          </MobileSection>

          <MobileSection title="System Health">
            <SystemHealthBody />
          </MobileSection>

          <MobileSection title="Sales Breakdown (This Month)" defaultExpanded>
            <SalesBreakdownBody />
          </MobileSection>

          <MobileSection title="Expense Breakdown (This Month)">
            <ExpenseBreakdownBody />
          </MobileSection>
        </Stack>
      ) : (
        // -------- DESKTOP: keep the same layout as before
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { lg: "1fr 1fr" },
            gap: 2,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* LEFT COLUMN */}
          <Box sx={{ display: "grid", gridAutoRows: "minmax(180px, auto)", gap: 2, minHeight: 0 }}>
            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, minHeight: 240 }}>
              <SectionHeader title="Active shift's transactions" />
              <ActiveShiftBody />
            </Card>
          </Box>

          {/* RIGHT COLUMN — order: Staff Leaderboard, System Health */}
          <Box sx={{ display: "grid", gridAutoRows: "minmax(180px, auto)", gap: 2, minHeight: 0 }}>
            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, minHeight: 240 }}>
              <SectionHeader title="Staff Leaderboard (This Month)" />
              <StaffLeaderboard transactions={transactions} />
            </Card>

            <Card
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
              }}
            >
              <SectionHeader title="System Health" compact />
              <SystemHealthBody />
            </Card>
          </Box>

          {/* FULL-WIDTH ROW: Sales & Expenses side-by-side, same height */}
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
              <SectionHeader title="Sales Breakdown (This Month)" />
              <SalesBreakdownBody />
            </Card>

            <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, height: "100%" }}>
              <SectionHeader title="Expense Breakdown (This Month)" />
              <ExpenseBreakdownBody />
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ---------------- subcomponents ---------------- */

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

function StaffLeaderboard({ transactions }) {
  // This month, per staff: total sales (non-Expenses), total expenses (Expenses), total revenue = sales - expenses
  const rows = useMemo(() => {
    const s = startOfMonth();
    const e = endOfMonth();
    const map = new Map(); // staffEmail -> { sales, expenses }
    (transactions || []).forEach((t) => {
      if (t.isDeleted) return;
      const ts = t.timestamp?.seconds
        ? new Date(t.timestamp.seconds * 1000)
        : t.timestamp
        ? new Date(t.timestamp)
        : null;
      if (!ts || ts < s || ts > e) return;
      const staff = t.staffEmail || "—";
      const rec = map.get(staff) || { sales: 0, expenses: 0 };
      const amt = Number(t.total || 0);
      if (t.item === "Expenses") rec.expenses += amt;
      else rec.sales += amt; // include debt items & services as "sales"
      map.set(staff, rec);
    });
    const list = Array.from(map.entries()).map(([staff, v]) => ({
      staff,
      sales: v.sales,
      expenses: v.expenses,
      revenue: v.sales - v.expenses,
    }));
    list.sort((a, b) => b.revenue - a.revenue);
    return list;
  }, [transactions]);

  return (
    <TableContainer
      sx={{
        maxHeight: { xs: 240, sm: 260 },
        overflowX: "auto",
        borderRadius: 1.5,
        "& table": { minWidth: 520 },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Staff</TableCell>
            <TableCell align="right">Total Sales</TableCell>
            <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
              Total Expenses
            </TableCell>
            <TableCell align="right">Total Revenue</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No data this month.</TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.staff}>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography noWrap>{r.staff}</Typography>
                </TableCell>
                <TableCell align="right">{currency(r.sales)}</TableCell>
                <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  {currency(r.expenses)}
                </TableCell>
                <TableCell align="right">{currency(r.revenue)}</TableCell>
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
  // Accordion ONLY shows on mobile; desktop uses the card layout above.
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      sx={{
        display: { xs: "block", md: "none" },
        borderRadius: 2,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
