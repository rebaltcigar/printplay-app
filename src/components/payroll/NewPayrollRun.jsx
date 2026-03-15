// src/components/payroll/NewPayrollRun.jsx
// Phase 2 — Guided 4-step payroll run wizard.

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Stack,
  Chip,
  Avatar,
  Switch,
  FormControlLabel,
  Skeleton,
  IconButton,
  Tooltip,
  Collapse,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import PublishIcon from "@mui/icons-material/Publish";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";

import { generatePreview, saveRun, postRun, loadRun } from "../../services/payrollService";
import { supabase } from "../../supabase";
import {
  computeCurrentPeriod,
  toHours,
  toLocaleDateStringPHT,
  toLocalISO_PHT_fromTS,
  minutesBetween,
  recalcLine,
  calcGross,
  inferShiftName,
} from "../../utils/payrollHelpers";
import { fmtCurrency } from "../../utils/formatters";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import PageHeader from "../common/PageHeader";

const STEPS = ["Period Setup", "Staff & Hours", "Deductions & Additions", "Review & Confirm"];

export default function NewPayrollRun() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showSnackbar, showConfirm } = useGlobalUI();

  // ─── Wizard state ───────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1 — Period
  const defaultPeriod = useMemo(() => computeCurrentPeriod("semi-monthly"), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);
  const [payDate, setPayDate] = useState(defaultPeriod.end);
  const [notes, setNotes] = useState("");

  // Steps 2-4 — Line data
  const [lines, setLines] = useState([]);
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [existingRunId, setExistingRunId] = useState(null);
  const [existingStatus, setExistingStatus] = useState(null);

  // ─── Load existing run ──────────────────────────────────────────
  useEffect(() => {
    if (!runId) return;
    let alive = true;

    const loadExisting = async () => {
      setLoading(true);
      try {
        const { run, lines: dbLines } = await loadRun(runId);
        if (!alive) return;
        setExistingRunId(run.id);
        setExistingStatus(run.status);
        setPeriodStart(run.period_start?.slice(0, 10) || "");
        setPeriodEnd(run.period_end?.slice(0, 10) || "");
        setPayDate(run.pay_date?.slice(0, 10) || "");
        setNotes(run.notes || "");

        // Transform DB lines → local state shape
        const mapped = dbLines.map((l) => ({
          staffId: l.staff_id,
          staffName: l.staff_name,
          staffEmail: l.staff_email,
          rate: Number(l.rate),
          totalMinutes: l.total_minutes,
          gross: Number(l.gross),
          totalDeductions: Number(l.total_deductions),
          totalAdditions: Number(l.total_additions),
          net: Number(l.net),
          shifts: (l.shifts || []).map((s) => ({
            shiftId: s.shift_id,
            originalStart: s.original_start,
            originalEnd: s.original_end,
            overrideStart: s.override_start,
            overrideEnd: s.override_end,
            minutesUsed: s.minutes_used,
            excluded: s.excluded,
            shortage: Number(s.shortage),
            isOngoing: false,
            shiftPeriod: "",
            notes: s.notes || "",
          })),
          deductions: (l.deductions || []).map((d) => ({
            type: d.type,
            label: d.label,
            amount: Number(d.amount),
            sourceId: d.source_id,
            autoApplied: d.auto_applied,
          })),
          additions: (l.additions || []).map((a) => ({
            type: a.type,
            label: a.label,
            amount: Number(a.amount),
            autoApplied: a.auto_applied,
          })),
        }));

        setLines(mapped);
        setGeneratedOnce(true);
        setActiveStep(1);
      } catch (err) {
        console.error(err);
        showSnackbar("Failed to load payroll run", "error");
        navigate("/admin/payroll/history");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadExisting();
    return () => { alive = false; };
  }, [runId]);

  // ─── Generate preview ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!periodStart || !periodEnd) {
      return showSnackbar("Please set the period start and end dates", "warning");
    }
    setLoading(true);
    try {
      const preview = await generatePreview(periodStart, periodEnd);
      setLines(preview);
      setGeneratedOnce(true);
      if (preview.length === 0) {
        showSnackbar("No shifts found in this period", "warning");
      } else {
        setActiveStep(1);
      }
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to generate preview: " + (err.message || "Unknown error"), "error");
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, showSnackbar]);

  // ─── Line helpers ──────────────────────────────────────────────
  const updateLine = useCallback((staffId, updater) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.staffId !== staffId) return l;
        const updated = updater(l);
        const calc = recalcLine(updated);
        return { ...updated, ...calc };
      })
    );
  }, []);

  // ─── Save / Post ───────────────────────────────────────────────
  const handleSave = useCallback(async (statusOverride) => {
    setSaving(true);
    try {
      const authUser = (await supabase.auth.getSession()).data.session?.user;
      // When posting, save as "approved" first so postRun can transition to "posted"
      const saveStatus = statusOverride === "posted" ? "approved" : (statusOverride || "draft");
      const savedId = await saveRun({
        runId: existingRunId || null,
        periodStart,
        periodEnd,
        payDate,
        status: saveStatus,
        lines,
        notes,
        userId: authUser?.id || null,
      });

      if (statusOverride === "posted") {
        await postRun(savedId, authUser?.id || null);
      }

      showSnackbar(
        statusOverride === "posted"
          ? "Payroll posted successfully!"
          : "Payroll run saved as draft",
        "success"
      );
      navigate("/admin/payroll/history");
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to save: " + (err.message || "Unknown error"), "error");
    } finally {
      setSaving(false);
    }
  }, [existingRunId, periodStart, periodEnd, payDate, lines, notes, showSnackbar, navigate]);

  const handlePost = useCallback(() => {
    showConfirm({
      title: "Post Payroll Run",
      message: "Once posted, pay stubs will be generated. This cannot be undone easily. Continue?",
      confirmLabel: "Post Run",
      confirmColor: "success",
      onConfirm: () => handleSave("posted"),
    });
  }, [showConfirm, handleSave]);

  // ─── Totals ────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const staffCount = lines.length;
    const totalMinutes = lines.reduce((s, l) => s + l.totalMinutes, 0);
    const gross = lines.reduce((s, l) => s + l.gross, 0);
    const deductions = lines.reduce((s, l) => s + l.totalDeductions, 0);
    const additions = lines.reduce((s, l) => s + l.totalAdditions, 0);
    const net = lines.reduce((s, l) => s + l.net, 0);
    return { staffCount, totalMinutes, gross, deductions, additions, net };
  }, [lines]);

  // ─── Navigation ────────────────────────────────────────────────
  const canProceed = () => {
    if (activeStep === 0) return generatedOnce && lines.length > 0;
    return true;
  };

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  // ─── Loading state ─────────────────────────────────────────────
  if (loading && runId) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
        <PageHeader title={existingRunId ? "Edit Payroll Run" : "Run Payroll"} subtitle="Loading data..." />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={120} sx={{ mb: 2, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title={existingRunId ? "Edit Payroll Run" : "Run Payroll"}
        subtitle={
          <>
            {STEPS[activeStep]}
            {activeStep === 0 && " — Set the pay period and generate a preview."}
            {activeStep === 1 && " — Review hours per staff member. Exclude or override shifts."}
            {activeStep === 2 && " — Review auto-applied deductions. Add manual items."}
            {activeStep === 3 && " — Review totals and save or post."}
          </>
        }
        actions={
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate("/admin/payroll")} 
            size="small"
            variant="outlined"
          >
            Back to Payroll
          </Button>
        }
      />

      {/* Stepper */}
      <Stepper activeStep={activeStep} alternativeLabel={!isMobile} orientation={isMobile ? "vertical" : "horizontal"} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* ─── Step Content ────────────────────────────────────────── */}
      {activeStep === 0 && (
        <PeriodSetup
          periodStart={periodStart}
          periodEnd={periodEnd}
          payDate={payDate}
          notes={notes}
          setPeriodStart={setPeriodStart}
          setPeriodEnd={setPeriodEnd}
          setPayDate={setPayDate}
          setNotes={setNotes}
          onGenerate={handleGenerate}
          loading={loading}
          generatedOnce={generatedOnce}
          lineCount={lines.length}
          theme={theme}
        />
      )}

      {activeStep === 1 && (
        <StaffHoursReview
          lines={lines}
          updateLine={updateLine}
          theme={theme}
          isMobile={isMobile}
          totals={totals}
        />
      )}

      {activeStep === 2 && (
        <DeductionsAdditions
          lines={lines}
          updateLine={updateLine}
          theme={theme}
        />
      )}

      {activeStep === 3 && (
        <ReviewConfirm
          lines={lines}
          totals={totals}
          periodStart={periodStart}
          periodEnd={periodEnd}
          payDate={payDate}
          notes={notes}
          theme={theme}
        />
      )}

      {/* ─── Navigation Bar ──────────────────────────────────────── */}
      {generatedOnce && (
        <Paper
          elevation={2}
          sx={{
            position: "sticky",
            bottom: 0,
            mt: 3,
            p: 2,
            borderRadius: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={goBack}
            disabled={activeStep === 0}
            sx={{ textTransform: "none" }}
          >
            Back
          </Button>

          <Stack direction="row" spacing={1} sx={{ flex: 1, justifyContent: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {totals.staffCount} staff · {toHours(totals.totalMinutes)} hrs · Net {fmtCurrency(totals.net)}
            </Typography>
          </Stack>

          {activeStep < STEPS.length - 1 ? (
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={goNext}
              disabled={!canProceed()}
              sx={{ textTransform: "none" }}
            >
              Next
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => handleSave("draft")}
                disabled={saving}
                sx={{ textTransform: "none" }}
              >
                Save Draft
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <PublishIcon />}
                onClick={handlePost}
                disabled={saving}
                sx={{ textTransform: "none" }}
              >
                Post Run
              </Button>
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 1 — Period Setup
// ═════════════════════════════════════════════════════════════════════════════

function PeriodSetup({ periodStart, periodEnd, payDate, notes, setPeriodStart, setPeriodEnd, setPayDate, setNotes, onGenerate, loading, generatedOnce, lineCount, theme }) {
  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
        Pay Period
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Period Start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          label="Period End"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          label="Pay Date"
          type="date"
          value={payDate}
          onChange={(e) => setPayDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
      </Stack>

      <TextField
        label="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={2}
        fullWidth
        sx={{ mb: 3 }}
      />

      <Stack direction="row" alignItems="center" spacing={2}>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
          onClick={onGenerate}
          disabled={loading || !periodStart || !periodEnd}
          sx={{ textTransform: "none", px: 3 }}
        >
          {loading ? "Generating…" : "Generate Preview"}
        </Button>
        {generatedOnce && (
          <Chip
            icon={<CheckCircleIcon />}
            label={`${lineCount} staff found`}
            color="success"
            variant="outlined"
          />
        )}
      </Stack>
    </Paper>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 2 — Staff & Hours Review
// ═════════════════════════════════════════════════════════════════════════════

function StaffHoursReview({ lines, updateLine, theme, isMobile, totals }) {
  return (
    <Box>
      {/* Summary row */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <MiniStat label="Staff" value={totals.staffCount} />
        <MiniStat label="Total Hours" value={toHours(totals.totalMinutes)} />
        <MiniStat label="Gross" value={fmtCurrency(totals.gross)} color="success" />
      </Stack>

      <Stack spacing={2}>
        {lines.map((line) => (
          <StaffCard key={line.staffId} line={line} updateLine={updateLine} theme={theme} isMobile={isMobile} />
        ))}
      </Stack>
    </Box>
  );
}

function StaffCard({ line, updateLine, theme, isMobile }) {
  const [expanded, setExpanded] = useState(false);

  const toggleShiftExclude = (shiftIdx) => {
    updateLine(line.staffId, (l) => {
      const shifts = l.shifts.map((s, i) =>
        i === shiftIdx ? { ...s, excluded: !s.excluded } : s
      );
      return { ...l, shifts };
    });
  };

  const updateShiftOverride = (shiftIdx, field, value) => {
    updateLine(line.staffId, (l) => {
      const shifts = l.shifts.map((s, i) => {
        if (i !== shiftIdx) return s;
        const updated = { ...s, [field]: value || null };
        // Recalc minutes if overrides change
        const start = updated.overrideStart || updated.originalStart;
        const end = updated.overrideEnd || updated.originalEnd;
        if (start && end) {
          updated.minutesUsed = minutesBetween(start, end);
        }
        return updated;
      });
      return { ...l, shifts };
    });
  };

  const activeShifts = line.shifts.filter((s) => !s.excluded).length;

  return (
    <Paper
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        transition: "all 0.15s ease",
        "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.4) },
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2,
          cursor: "pointer",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.03) },
        }}
      >
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main, width: 40, height: 40 }}>
          <PersonIcon />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>
            {line.staffName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activeShifts}/{line.shifts.length} shifts · {toHours(line.totalMinutes)} hrs · ₱{line.rate}/hr
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="subtitle2" fontWeight={700} color="success.main">
              {fmtCurrency(line.gross)}
            </Typography>
            <Typography variant="caption" color="text.secondary">gross</Typography>
          </Box>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>
      </Box>

      {/* Shift Detail */}
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: "block" }}>
            SHIFTS IN PERIOD
          </Typography>
          <Stack spacing={1}>
            {line.shifts.map((shift, idx) => (
              <ShiftRow
                key={shift.shiftId}
                shift={shift}
                idx={idx}
                rate={line.rate}
                onToggleExclude={() => toggleShiftExclude(idx)}
                onOverride={(field, val) => updateShiftOverride(idx, field, val)}
                theme={theme}
                isMobile={isMobile}
              />
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}

function ShiftRow({ shift, idx, rate, onToggleExclude, onOverride, theme, isMobile }) {
  const [editing, setEditing] = useState(false);
  const shiftLabel = inferShiftName(shift.originalStart, shift.shiftPeriod, "");
  const shiftDate = toLocaleDateStringPHT(shift.originalStart);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        opacity: shift.excluded ? 0.45 : 1,
        transition: "opacity 0.2s",
        bgcolor: shift.excluded ? alpha(theme.palette.error.main, 0.03) : "transparent",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Tooltip title={shift.excluded ? "Include this shift" : "Exclude this shift"}>
          <Switch
            size="small"
            checked={!shift.excluded}
            onChange={onToggleExclude}
            color="primary"
          />
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 120 }}>
          <Typography variant="body2" fontWeight={600}>
            {shiftLabel} — {shiftDate}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {toHours(shift.minutesUsed)} hrs · {fmtCurrency(calcGross(shift.minutesUsed, rate))}
            {shift.isOngoing && (
              <Chip label="Ongoing" size="small" color="warning" variant="outlined" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />
            )}
            {shift.shortage > 0 && (
              <Chip label={`Shortage: ${fmtCurrency(shift.shortage)}`} size="small" color="error" variant="outlined" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />
            )}
          </Typography>
        </Box>

        <Tooltip title="Override times">
          <IconButton size="small" onClick={() => setEditing(!editing)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={editing}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5, pl: 5 }}>
          <TextField
            label="Override Start"
            type="datetime-local"
            size="small"
            value={shift.overrideStart ? toLocalISO_PHT_fromTS(shift.overrideStart) : ""}
            onChange={(e) => onOverride("overrideStart", e.target.value ? new Date(e.target.value).toISOString() : null)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Override End"
            type="datetime-local"
            size="small"
            value={shift.overrideEnd ? toLocalISO_PHT_fromTS(shift.overrideEnd) : ""}
            onChange={(e) => onOverride("overrideEnd", e.target.value ? new Date(e.target.value).toISOString() : null)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
        </Stack>
      </Collapse>
    </Paper>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 3 — Deductions & Additions
// ═════════════════════════════════════════════════════════════════════════════

function DeductionsAdditions({ lines, updateLine, theme }) {
  const [addDialog, setAddDialog] = useState(null); // { staffId, mode: 'deduction'|'addition' }

  const removeItem = (staffId, listKey, idx) => {
    updateLine(staffId, (l) => {
      const list = [...l[listKey]];
      list.splice(idx, 1);
      return { ...l, [listKey]: list };
    });
  };

  const addItem = (staffId, listKey, item) => {
    updateLine(staffId, (l) => ({
      ...l,
      [listKey]: [...l[listKey], item],
    }));
  };

  return (
    <Box>
      <Stack spacing={2}>
        {lines.map((line) => (
          <Paper
            key={line.staffId}
            sx={{ p: 2.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main }}>
                <PersonIcon fontSize="small" />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>{line.staffName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Gross: {fmtCurrency(line.gross)} · Net: {fmtCurrency(line.net)}
                </Typography>
              </Box>
            </Stack>

            {/* Deductions */}
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              <RemoveCircleOutlineIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "text-bottom" }} />
              DEDUCTIONS ({fmtCurrency(line.totalDeductions)})
            </Typography>
            {line.deductions.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2.5 }}>None</Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mb: 1 }}>
                {line.deductions.map((d, idx) => (
                  <Stack key={idx} direction="row" alignItems="center" spacing={1} sx={{ pl: 2.5 }}>
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {d.type.charAt(0).toUpperCase() + d.type.slice(1)} - {d.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={600} color="text.primary">{fmtCurrency(d.amount)}</Typography>
                    <IconButton size="small" onClick={() => removeItem(line.staffId, "deductions", idx)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
            <Button
              size="small"
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => setAddDialog({ staffId: line.staffId, staffName: line.staffName, mode: "deduction" })}
              sx={{ textTransform: "none", ml: 2, mb: 1.5 }}
            >
              Add Deduction
            </Button>

            <Divider sx={{ my: 1 }} />

            {/* Additions */}
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              <AddCircleOutlineIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "text-bottom" }} />
              ADDITIONS ({fmtCurrency(line.totalAdditions)})
            </Typography>
            {line.additions.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2.5 }}>None</Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mb: 1 }}>
                {line.additions.map((a, idx) => (
                  <Stack key={idx} direction="row" alignItems="center" spacing={1} sx={{ pl: 2.5 }}>
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {a.type.charAt(0).toUpperCase() + a.type.slice(1)} - {a.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={600} color="text.primary">{fmtCurrency(a.amount)}</Typography>
                    <IconButton size="small" onClick={() => removeItem(line.staffId, "additions", idx)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
            <Button
              size="small"
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => setAddDialog({ staffId: line.staffId, staffName: line.staffName, mode: "addition" })}
              sx={{ textTransform: "none", ml: 2 }}
            >
              Add Bonus
            </Button>
          </Paper>
        ))}
      </Stack>

      {/* Add Deduction/Addition Dialog */}
      {addDialog && (
        <AddItemDialog
          open
          mode={addDialog.mode}
          staffName={addDialog.staffName}
          onClose={() => setAddDialog(null)}
          onAdd={(item) => {
            const key = addDialog.mode === "deduction" ? "deductions" : "additions";
            addItem(addDialog.staffId, key, item);
            setAddDialog(null);
          }}
        />
      )}
    </Box>
  );
}

function AddItemDialog({ open, mode, staffName, onClose, onAdd }) {
  const isDeduction = mode === "deduction";
  const types = isDeduction
    ? ["manual", "shortage", "advance", "other"]
    : ["bonus", "overtime", "allowance", "manual", "other"];

  const [type, setType] = useState(types[0]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = () => {
    if (!label.trim() || !amount || Number(amount) <= 0) return;
    onAdd({
      type,
      label: label.trim(),
      amount: Number(Number(amount).toFixed(2)),
      sourceId: null,
      autoApplied: false,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Add {isDeduction ? "Deduction" : "Addition"} — {staffName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Type</InputLabel>
            <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <MenuItem key={t} value={t} sx={{ textTransform: "capitalize" }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Description"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            size="small"
            autoFocus
          />
          <TextField
            label="Amount (₱)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            size="small"
            inputProps={{ min: 0, step: "0.01" }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          variant="contained"
          color={isDeduction ? "error" : "success"}
          onClick={handleSubmit}
          disabled={!label.trim() || !amount || Number(amount) <= 0}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 4 — Review & Confirm
// ═════════════════════════════════════════════════════════════════════════════

function ReviewConfirm({ lines, totals, periodStart, periodEnd, payDate, notes, theme }) {
  return (
    <Box>
      {/* Period Summary */}
      <Paper sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider", mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Run Summary
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
          <Box>
            <Typography variant="caption" color="text.secondary">Period</Typography>
            <Typography variant="body2" fontWeight={600}>
              {toLocaleDateStringPHT(periodStart)} — {toLocaleDateStringPHT(periodEnd)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Pay Date</Typography>
            <Typography variant="body2" fontWeight={600}>{toLocaleDateStringPHT(payDate)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Staff</Typography>
            <Typography variant="body2" fontWeight={600}>{totals.staffCount}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Total Hours</Typography>
            <Typography variant="body2" fontWeight={600}>{toHours(totals.totalMinutes)}</Typography>
          </Box>
        </Stack>
        {notes && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Notes</Typography>
            <Typography variant="body2">{notes}</Typography>
          </Box>
        )}
      </Paper>

      {/* Totals */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TotalCard label="Gross Pay" value={fmtCurrency(totals.gross)} color={theme.palette.info.main} />
        <TotalCard label="Deductions" value={`-${fmtCurrency(totals.deductions)}`} color={theme.palette.error.main} />
        <TotalCard label="Additions" value={`+${fmtCurrency(totals.additions)}`} color={theme.palette.success.main} />
        <TotalCard label="Net Pay" value={fmtCurrency(totals.net)} color={theme.palette.primary.main} primary />
      </Stack>

      {/* Per-Staff Breakdown */}
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Per-Staff Breakdown
      </Typography>
      <Stack spacing={1.5}>
        {lines.map((line) => (
          <Paper
            key={line.staffId}
            sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main }}>
                <PersonIcon fontSize="small" />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={700} noWrap>{line.staffName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {toHours(line.totalMinutes)} hrs · ₱{line.rate}/hr
                  {line.totalDeductions > 0 && ` · Ded: -${fmtCurrency(line.totalDeductions)}`}
                  {line.totalAdditions > 0 && ` · Add: +${fmtCurrency(line.totalAdditions)}`}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                  {fmtCurrency(line.net)}
                </Typography>
                <Typography variant="caption" color="text.secondary">net</Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Warning if deductions exceed gross for any staff */}
      {lines.some((l) => l.net < 0) && (
        <Paper
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
            border: "1px solid",
            borderColor: alpha(theme.palette.warning.main, 0.3),
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <WarningAmberIcon color="warning" />
          <Typography variant="body2" color="warning.dark">
            Some staff have negative net pay. Review deductions before posting.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

function TotalCard({ label, value, color, primary }) {
  return (
    <Paper
      sx={{
        flex: 1,
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: primary ? color : "divider",
        bgcolor: primary ? alpha(color, 0.06) : "background.paper",
        textAlign: "center",
      }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
    </Paper>
  );
}

// ─── Shared small helpers ────────────────────────────────────────────────────

function MiniStat({ label, value, color }) {
  return (
    <Paper sx={{ px: 2, py: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider", minWidth: 100 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle2" fontWeight={700} color={color ? `${color}.main` : "text.primary"}>{value}</Typography>
    </Paper>
  );
}
