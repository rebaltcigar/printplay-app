// src/components/payroll/PayrollDashboard.jsx
// Dashboard home for the payroll module — KPIs, quick actions, and recent activity.

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  Avatar,
  Stack,
  Divider,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

import PlayCircleFilledIcon from "@mui/icons-material/PlayCircleFilled";
import HistoryIcon from "@mui/icons-material/History";
import PeopleIcon from "@mui/icons-material/People";
import ReceiptIcon from "@mui/icons-material/Receipt";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import GroupIcon from "@mui/icons-material/Group";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DraftsIcon from "@mui/icons-material/Drafts";

import { fetchDashboardStats } from "../../services/payrollService";
import { peso, toLocaleDateStringPHT } from "../../utils/payrollHelpers";
import { fmtCurrency } from "../../utils/formatters";
import PageHeader from "../common/PageHeader";

const STATUS_COLORS = {
  draft: "default",
  reviewed: "info",
  approved: "warning",
  posted: "success",
  voided: "error",
};

export default function PayrollDashboard() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchDashboardStats()
      .then((data) => mounted && setStats(data))
      .catch(console.error)
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title="Payroll"
        subtitle="Manage staff compensation, run payroll, and generate pay slips."
      />

      {/* ─── Quick Actions ─── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 2,
          mb: 4,
        }}
      >
        <QuickAction
          icon={<PlayCircleFilledIcon />}
          label="Run Payroll"
          description="Start a new payroll run"
          color={theme.palette.primary.main}
          onClick={() => navigate("/admin/payroll/run")}
          primary
        />
        <QuickAction
          icon={<HistoryIcon />}
          label="History"
          description="View past runs"
          color={theme.palette.info.main}
          onClick={() => navigate("/admin/payroll/history")}
        />
        <QuickAction
          icon={<PeopleIcon />}
          label="Staff Pay"
          description="Manage pay rates"
          color={theme.palette.warning.main}
          onClick={() => navigate("/admin/payroll/staff")}
        />
        <QuickAction
          icon={<ReceiptIcon />}
          label="Pay Slips"
          description="Generated pay slips"
          color={theme.palette.success.main}
          onClick={() => navigate("/admin/payroll/payslips")}
        />
      </Box>

      {/* ─── KPI Cards ─── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 2,
          mb: 4,
        }}
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Paper key={i} sx={{ p: 2.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <Skeleton variant="text" width={80} />
              <Skeleton variant="text" width={120} height={36} />
            </Paper>
          ))
        ) : (
          <>
            <KpiCard
              icon={<TrendingUpIcon />}
              label="Total Paid"
              value={fmtCurrency(stats?.totalNetPaid || 0)}
              color={theme.palette.success.main}
            />
            <KpiCard
              icon={<CheckCircleIcon />}
              label="Completed Runs"
              value={stats?.postedRuns || 0}
              color={theme.palette.info.main}
            />
            <KpiCard
              icon={<GroupIcon />}
              label="Active Staff"
              value={stats?.activeStaffCount || 0}
              color={theme.palette.warning.main}
            />
            <KpiCard
              icon={<PendingActionsIcon />}
              label="Pending Drafts"
              value={stats?.pendingDrafts || 0}
              color={stats?.pendingDrafts > 0 ? theme.palette.primary.main : theme.palette.text.secondary}
            />
          </>
        )}
      </Box>

      {/* ─── Two-Column: Last Run + Recent Activity ─── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
        }}
      >
        {/* Last Completed Run */}
        <Paper
          sx={{
            p: 3,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <EventRepeatIcon fontSize="small" color="primary" />
            Last Completed Run
          </Typography>
          {loading ? (
            <Box>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="80%" />
            </Box>
          ) : stats?.lastPostedRun ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {toLocaleDateStringPHT(stats.lastPostedRun.period_start)} — {toLocaleDateStringPHT(stats.lastPostedRun.period_end)}
              </Typography>
              <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
                {fmtCurrency(stats.lastPostedRun.totals?.net || 0)}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  label={`${stats.lastPostedRun.totals?.staffCount || 0} staff`}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label="Posted"
                  color="success"
                />
              </Stack>
            </Box>
          ) : (
            <Box sx={{ py: 3, textAlign: "center", opacity: 0.5 }}>
              <Typography variant="body2">No completed runs yet</Typography>
              <Button
                size="small"
                sx={{ mt: 1, textTransform: "none" }}
                onClick={() => navigate("/admin/payroll/run")}
              >
                Run your first payroll →
              </Button>
            </Box>
          )}
        </Paper>

        {/* Recent Activity */}
        <Paper
          sx={{
            p: 3,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <HistoryIcon fontSize="small" color="primary" />
            Recent Activity
          </Typography>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                <Skeleton variant="circular" width={32} height={32} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="30%" />
                </Box>
              </Box>
            ))
          ) : stats?.recentRuns?.length > 0 ? (
            <Stack divider={<Divider />} spacing={0}>
              {stats.recentRuns.map((run) => (
                <Box
                  key={run.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 1.5,
                    cursor: "pointer",
                    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    borderRadius: 1,
                    px: 1,
                    mx: -1,
                  }}
                  onClick={() => navigate(
                    run.status === "draft"
                      ? `/admin/payroll/run/${run.id}`
                      : "/admin/payroll/history"
                  )}
                >
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: alpha(
                        theme.palette[STATUS_COLORS[run.status] || "default"]?.main || theme.palette.grey[500],
                        0.15
                      ),
                      color: theme.palette[STATUS_COLORS[run.status] || "default"]?.main || theme.palette.grey[500],
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {run.status === "posted" ? "✓" : run.status === "draft" ? "D" : run.status === "voided" ? "V" : "R"}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {toLocaleDateStringPHT(run.period_start)} — {toLocaleDateStringPHT(run.period_end)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtCurrency(run.totals?.net || 0)} · {run.totals?.staffCount || 0} staff
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={run.status}
                    color={STATUS_COLORS[run.status] || "default"}
                    sx={{ fontSize: "0.7rem", height: 22, textTransform: "capitalize" }}
                  />
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={{ py: 3, textAlign: "center", opacity: 0.5 }}>
              <Typography variant="body2">No payroll activity yet</Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function QuickAction({ icon, label, description, color, onClick, primary }) {
  const theme = useTheme();
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.5,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: primary ? color : "divider",
        bgcolor: primary ? alpha(color, 0.08) : "background.paper",
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: color,
          bgcolor: alpha(color, 0.12),
          transform: "translateY(-2px)",
          boxShadow: `0 4px 20px ${alpha(color, 0.2)}`,
        },
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box sx={{ color, display: "flex", alignItems: "center", gap: 1 }}>
        {icon}
        <Typography variant="subtitle2" fontWeight={700} sx={{ color }}>
          {label}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Paper>
  );
}

function KpiCard({ icon, label, value, color }) {
  const theme = useTheme();
  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
      }}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: alpha(color, 0.12),
          color,
        }}
      >
        {icon}
      </Avatar>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.3 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}
