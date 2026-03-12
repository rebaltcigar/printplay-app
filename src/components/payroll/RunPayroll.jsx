// src/components/payroll/RunPayroll.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { supabase } from "../../supabase";
import SummaryCards from "../common/SummaryCards";
import {
  cap,
  calcGross,
  inferShiftName,
  minutesBetween,
  peso,
  resolveHourlyRate,
  shortageForShift,
  toHours,
  toLocalISO_PHT_fromTS,
  toLocaleDateStringPHT,
  toYMD_PHT_fromTS,
  todayYMD_PHT,
  tsFromYMD,
  sumDenominations,
} from "../../utils/payrollHelpers";
import { fmtDate, fmtCurrency } from "../../utils/formatters";
import { generateDisplayId, generateBatchIds } from "../../services/orderService";
import { generateUUID } from "../../utils/uuid";
import LoadingScreen from "../common/LoadingScreen";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import PeopleIcon from "@mui/icons-material/People";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SellIcon from "@mui/icons-material/Sell";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import PaystubDialog from "../pages/Paystub";

export default function RunPayroll({
  user,
  openRunId,
  openDialogAfterLoad,
  onOpenedFromHistory,
  onOpenPaystubs,
  requestOpenDialogRef,
}) {
  const { showSnackbar, showConfirm } = useGlobalUI();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(() => todayYMD_PHT());
  const [expenseMode, setExpenseMode] = useState("per-staff");
  const [preview, setPreview] = useState([]);
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState("draft");

  // Step state: 0 = Setup, 1 = Preview/Review, 2 = Confirm/Summary
  const [step, setStep] = useState(0);

  // loader
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");

  // inline dialogs (ongoing prompt, finalize confirm) — these are lightweight
  // and are NOT nested inside a modal, so they remain as small dialogs
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [ongoingPrompt, setOngoingPrompt] = useState({
    open: false,
    shifts: [],
  });

  // Paystub drawer — replaces nested paystub dialog
  const [paystubDrawerRunId, setPaystubDrawerRunId] = useState(null);

  // Expand state for the step-1 detail table
  const [expanded, setExpanded] = useState({});

  // Ref for sticky header card (no measurement needed)
  const headerCardRef = useRef(null);

  // Item edit inline mini-dialog (add/edit custom deductions and additions)
  const [itemEdit, setItemEdit] = useState({
    open: false,
    type: "deduction",
    lineId: null,
    index: -1,
    label: "",
    amount: "",
  });

  const startBusy = (msg = "Working...") => {
    setBusy(true);
    setBusyMsg(msg);
  };
  const updateBusy = (msg) => setBusyMsg(msg);
  const stopBusy = () => {
    setBusy(false);
    setBusyMsg("");
  };


  // ─── recalc helpers (previously lived in RunDialog) ─────────────────────────

  const recalcLine = (line) => {
    const included = line.shiftRows.filter((r) => !r.excluded);
    const minutes = included.reduce((m, r) => m + Number(r.minutes || r.minutesUsed || 0), 0);
    const gross = calcGross(minutes, line.rate);

    const advances = included.reduce((s, r) => s + Number(r.advance || 0), 0);
    const shortages = included.reduce((s, r) => s + Number(r.shortage || 0), 0);
    const extraAdvances = (line.extraAdvances || []).reduce(
      (s, d) => s + Number(d.amount || 0),
      0
    );
    const customDeductions = (line.customDeductions || []).reduce(
      (s, d) => s + Number(d.amount || 0),
      0
    );
    const otherDeductions = Number((extraAdvances + customDeductions).toFixed(2));

    const customAdditions = (line.customAdditions || []).reduce(
      (s, d) => s + Number(d.amount || 0),
      0
    );
    const totalAdditions = Number(customAdditions.toFixed(2));

    const net = Number(
      (gross + totalAdditions - advances - shortages - otherDeductions).toFixed(2)
    );

    return { minutes, gross, advances, shortages, otherDeductions, totalAdditions, net };
  };

  const setLine = (id, patch) => {
    setPreview((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  };

  const updateShiftRow = (lineId, shiftId, patch) => {
    setPreview((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const shiftRows = l.shiftRows.map((r) => {
          if (r.id !== shiftId) return r;
          const next = { ...r, ...patch };

          const start = next.overrideStart || next.start;
          const end = next.overrideEnd || next.end || next.overrideEnd;
          next.minutesUsed = next.excluded ? 0 : minutesBetween(start, end);
          next.shortage = shortageForShift({
            denominations: next.denominations,
            systemTotal: next.systemTotal,
          });
          return next;
        });
        const totals = recalcLine({ ...l, shiftRows });
        return { ...l, shiftRows, ...totals };
      })
    );
  };

  // Totals for the step-1 header summary
  const totalMinutes = useMemo(
    () => preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
    [preview]
  );
  const totalGross = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)),
    [preview]
  );
  const totalAdvances = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)),
    [preview]
  );
  const totalShortages = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)),
    [preview]
  );
  const totalOtherDeds = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.otherDeductions || 0), 0).toFixed(2)),
    [preview]
  );
  const totalAdditionsSum = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.totalAdditions || 0), 0).toFixed(2)),
    [preview]
  );
  const totalNet = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
    [preview]
  );

  const isPerStaffMode = expenseMode === "per-staff";
  const disableEdits = status === "posted" || status === "voided";

  // ─── item dialog helpers ─────────────────────────────────────────────────────

  const openItemDialog = (type, lineId, existing) => {
    if (existing) {
      setItemEdit({ open: true, type, lineId, index: existing.index, label: existing.label, amount: existing.amount });
    } else {
      setItemEdit({ open: true, type, lineId, index: -1, label: "", amount: "" });
    }
  };

  const closeItemDialog = () => {
    setItemEdit({ open: false, type: "deduction", lineId: null, index: -1, label: "", amount: "" });
  };

  const saveItem = () => {
    const { type, lineId, index, label, amount } = itemEdit;
    const nAmount = Number(amount || 0);
    if (!lineId || !label) { closeItemDialog(); return; }

    setPreview((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const field = type === "addition" ? "customAdditions" : "customDeductions";
        const idPrefix = type === "addition" ? "manual-add" : "manual-ded";
        const list = Array.isArray(l[field]) ? [...l[field]] : [];
        if (index >= 0 && index < list.length) {
          list[index] = { ...list[index], label, amount: nAmount };
        } else {
          list.push({ id: `${idPrefix}-${Date.now()}`, label, amount: nAmount });
        }
        const updatedLine = { ...l, [field]: list };
        return { ...updatedLine, ...recalcLine(updatedLine) };
      })
    );
    closeItemDialog();
  };

  const deleteItem = (type, lineId, index) => {
    setPreview((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const field = type === "addition" ? "customAdditions" : "customDeductions";
        const list = Array.isArray(l[field]) ? l[field].filter((_, i) => i !== index) : [];
        const updatedLine = { ...l, [field]: list };
        return { ...updatedLine, ...recalcLine(updatedLine) };
      })
    );
  };

  const handleExpenseModeChange = (val) => {
    const today = todayYMD_PHT();
    setExpenseMode(val);
    if (val === "per-staff") {
      setPayDate(today);
      setPreview((prev) =>
        prev.map((line) => ({
          ...line,
          shiftRows: line.shiftRows.map((r) => ({
            ...r,
            expenseDate: tsFromYMD(today, false),
          })),
        }))
      );
    } else {
      setPayDate((old) => (old ? old : today));
      setPreview((prev) =>
        prev.map((line) => ({
          ...line,
          shiftRows: line.shiftRows.map((r) => ({
            ...r,
            expenseDate: r.expenseDate || tsFromYMD(today, false),
          })),
        }))
      );
    }
  };

  // allow parent to set step/open from history (replaces old requestOpenDialogRef)
  useEffect(() => {
    if (requestOpenDialogRef) {
      requestOpenDialogRef.current = () => {
        if (runId || preview.length) {
          setStep(runId ? 1 : 1);
        }
      };
    }
  }, [requestOpenDialogRef, runId, preview.length]);

  /** ─── generate preview from shifts ─────────────────────────────────────── */
  const generatePreview = async (decision = null) => {
    if (!periodStart || !periodEnd) {
      showSnackbar("Pick a start and end date first.", "warning");
      return;
    }

    startBusy("Loading shifts for the selected pay period...");

    try {
      const start = tsFromYMD(periodStart, false);
      const end = tsFromYMD(periodEnd, true);

      shiftsToProcess.forEach((s) => {
        if (!s.start_time) return;
        const email = s.staff_email || "unknown";
        const staffId = s.staff_id || email;
        const isOngoing = !s.end_time;
        const effectiveEnd = isOngoing ? new Date().toISOString() : s.end_time;
        const minutes = minutesBetween(s.start_time, effectiveEnd);
        const shortage = shortageForShift(s);

        const row = {
          id: s.id,
          start: s.start_time,
          end: s.end_time || null,
          title: s.title || s.shift_title || null,
          label: s.label || null,
          overrideStart: null,
          overrideEnd: isOngoing ? effectiveEnd : null,
          isOngoing: isOngoing,
          excluded: false,
          minutesOriginal: minutes,
          minutesUsed: minutes,
          shortage,
          denominations: s.denominations || {},
          systemTotal: Number(s.system_total || 0),
          staffUid: staffId,
          staffName: s.staff_name || s.staff_full_name || email,
          staffEmail: email,
          expenseDate: null,
        };
        shiftsById.set(s.id, row);

        const bucket = byStaff.get(staffId) || {
          staffUid: staffId,
          staffName: row.staffName,
          staffEmail: email,
          minutes: 0,
          shiftRows: [],
          extraAdvances: [],
        };
        bucket.minutes += minutes;
        bucket.shiftRows.push(row);
        byStaff.set(staffId, bucket);
      });

      updateBusy("Fetching staff records and salary advances...");
      const shiftIds = Array.from(shiftsById.keys());
      const [uRes, advRes] = await Promise.all([
        supabase.from('profiles')
          .select('*')
          .eq('role', 'staff'),
        supabase.from('expenses')
          .select('*')
          .eq('expense_type', 'Salary Advance')
          .in('shift_id', shiftIds)
      ]);

      if (uRes.error) throw uRes.error;
      if (advRes.error) throw advRes.error;

      const usersByEmail = new Map();
      uRes.data.forEach((v) => {
        usersByEmail.set(v.email, {
          uid: v.id,
          name: v.full_name || v.name || v.email,
          payroll: v.payroll || null,
        });
      });

      const extraAdvancesByStaff = new Map();
      const advByShift = new Map();
      advRes.data.forEach(tx => {
        if (tx.voided) return;
        const list = advByShift.get(tx.shift_id) || [];
        list.push(tx);
        advByShift.set(tx.shift_id, list);
      });

      Array.from(shiftsById.values()).forEach((row) => {
        const txs = advByShift.get(row.id) || [];
        let ownerAdvance = 0;
        const ownerAdvanceRefs = [];
        txs.forEach((tx) => {
          const amt = Number(tx.total || 0);
          const targetEmail = tx.expense_staff_email || tx.staff_email || null;
          const targetUid = tx.expense_staff_id || tx.staff_id || null;
          const shiftOwnerEmail = row.staffEmail;
          const shiftOwnerUid = row.staffUid;

          const shiftLabel = `${inferShiftName(row.start, row.title, row.label)} — ${fmtDate(row.start)}`;

          const isForOther =
            (targetEmail && targetEmail !== shiftOwnerEmail) ||
            (targetUid && targetUid !== shiftOwnerUid);

          if (isForOther) {
            const key = targetEmail || `uid:${targetUid}`;
            const existing = extraAdvancesByStaff.get(key) || {
              staffEmail: targetEmail || null,
              staffUid: targetUid || null,
              staffName:
                tx.expense_staff_name ||
                usersByEmail.get(targetEmail || "")?.name ||
                targetEmail ||
                "Unknown Staff",
              total: 0,
              details: [],
            };
            existing.total += amt;
            existing.details.push({
              id: tx.id,
              label: `Salary Advance (recorded on ${shiftLabel})`,
              amount: amt,
              fromShiftId: row.id,
            });
            extraAdvancesByStaff.set(key, existing);
          } else {
            ownerAdvance += amt;
            ownerAdvanceRefs.push(tx.id);
          }
        });
        row.advance = ownerAdvance;
        row.advanceRefs = ownerAdvanceRefs;
      });

      for (const [, info] of extraAdvancesByStaff.entries()) {
        const emailKey =
          info.staffEmail ||
          (info.staffUid
            ? Array.from(usersByEmail.values()).find(
              (u) => u.uid === info.staffUid
            )?.email
            : null);
        const bucketKey = emailKey || info.staffEmail || null;
        if (bucketKey && byStaff.has(bucketKey)) {
          const bucket = byStaff.get(bucketKey);
          bucket.extraAdvances = (bucket.extraAdvances || []).concat(info.details);
        } else {
          const name = info.staffName || bucketKey || "Unknown Staff";
          byStaff.set(bucketKey || name, {
            staffUid: info.staffUid || null,
            staffName: name,
            staffEmail: bucketKey || name,
            minutes: 0,
            shiftRows: [],
            extraAdvances: info.details,
          });
        }
      }

      adminRes.data.forEach((tx) => {
        if (tx.voided || tx.isDeleted) return;
        const amt = Number(tx.total || 0);
        const staffId = tx.staff_id; // Standardized

        let key = staffId;
        if (!key) return;

        if (!byStaff.has(key)) {
          const name = tx.expense_staff_name || (usersByEmail.get(key)?.name) || "Unknown Staff";
          byStaff.set(key, {
            staffUid: staffId,
            staffName: name,
            staffEmail: tx.expense_staff_email || tx.staff_email || key,
            minutes: 0,
            shiftRows: [],
            extraAdvances: [],
          });
        }

        const bucket = byStaff.get(key);
        bucket.extraAdvances.push({
          id: tx.id,
          label: `${tx.expense_type} (Admin Manual - ${fmtDate(tx.timestamp)})`,
          amount: amt,
          fromShiftId: null,
        });
      });

      updateBusy("Building payroll preview...");
      const endDateForRate = new Date(`${periodEnd}T23:59:59`);
      const out = [];
      for (const [email, bucket] of byStaff.entries()) {
        const rec = usersByEmail.get(email) || {
          uid: bucket.staffUid || null,
          name: bucket.staffName || email,
          payroll: null,
        };
        const rate = resolveHourlyRate(rec.payroll, endDateForRate);
        const minutes = bucket.shiftRows.reduce(
          (m, r) => m + Number(r.minutesUsed || 0),
          0
        );
        const gross = calcGross(minutes, rate);
        const advancesFromShifts = bucket.shiftRows.reduce(
          (s, r) => s + Number(r.advance || 0),
          0
        );
        const extraAdvanceTotal = (bucket.extraAdvances || []).reduce(
          (s, d) => s + Number(d.amount || 0),
          0
        );
        const shortages = bucket.shiftRows.reduce(
          (s, r) => s + Number(r.shortage || 0),
          0
        );
        const otherDeductions = Number(extraAdvanceTotal.toFixed(2));
        const totalAdditions = 0;
        const net = Number(
          (gross + totalAdditions - advancesFromShifts - shortages - otherDeductions).toFixed(2)
        );
        out.push({
          id: rec.uid || `email:${email}`,
          staffUid: rec.uid,
          staffEmail: email,
          staffName: rec.name || bucket.staffName,
          rate,
          minutes,
          gross,
          advances: advancesFromShifts,
          shortages,
          otherDeductions,
          totalAdditions,
          net,
          shiftRows: bucket.shiftRows,
          extraAdvances: bucket.extraAdvances || [],
          customDeductions: [],
          customAdditions: [],
        });
      }

      setRunId(null);
      setStatus("draft");
      setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
      setStep(1);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to generate payroll preview.", "error");
    } finally {
      stopBusy();
    }
  };

  /** ─── load existing run ─────────────────────────────────────────────────── */
  const loadRun = async (id) => {
    if (!id) {
      setRunId(null);
      setPreview([]);
      setStep(0);
      return;
    }

    try {
      const { data: run, error: runErr } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('id', id)
        .single();

      if (runErr || !run) {
        showSnackbar("That payroll run does not exist anymore.", "error");
        return;
      }

      setRunId(id);
      setStatus(run.status || "draft");
      setPeriodStart(run.period_start || "");
      setPeriodEnd(run.period_end || "");
      setPayDate(run.pay_date || todayYMD_PHT());
      setExpenseMode(run.expense_mode || "per-staff");

      updateBusy("Loading run lines...");
      const { data: lines, error: linesErr } = await supabase
        .from('payroll_lines')
        .select('*')
        .eq('run_id', id);

      if (linesErr) throw linesErr;

      const out = await Promise.all(lines.map(async (lineRec) => {
        const lineId = lineRec.id;
        const shiftIds = lineRec.source?.shiftIds || [];

        const [{ data: overData }, { data: shiftsData }, { data: advData }] = await Promise.all([
          supabase.from('payroll_line_shifts').select('*').eq('line_id', lineId),
          supabase.from('shifts').select('*').in('id', shiftIds),
          supabase.from('expenses').select('*').eq('expense_type', 'Salary Advance').in('shift_id', shiftIds)
        ]);

        const overrides = new Map();
        (overData || []).forEach((ov) => {
          overrides.set(ov.shift_id, ov);
        });

        const shiftsById = new Map();
        (shiftsData || []).forEach(s => shiftsById.set(s.id, s));

        const advByShift = new Map();
        (advData || []).forEach(tx => {
          if (tx.voided) return;
          const list = advByShift.get(tx.shift_id) || [];
          list.push(tx);
          advByShift.set(tx.shift_id, list);
        });

        const shiftRows = [];
        for (const sid of shiftIds) {
          const s = shiftsById.get(sid);
          if (!s) continue;
          const ov = overrides.get(sid) || {};

          const isOngoing = !s.end_time;
          const start = ov.override_start || s.start_time;
          const end = ov.override_end || s.end_time || (isOngoing ? new Date().toISOString() : null);

          const minutesOriginal = minutesBetween(s.start_time, s.end_time || new Date());
          const minutesUsed = ov.excluded
            ? 0
            : ov.minutes_used != null
              ? ov.minutes_used
              : minutesBetween(start, end);

          const row = {
            id: sid,
            start: s.start_time,
            end: s.end_time || null,
            title: s.title || s.shift_title || null,
            label: s.label || null,
            overrideStart: ov.override_start || null,
            overrideEnd: ov.override_end || null,
            isOngoing: isOngoing,
            excluded: !!ov.excluded,
            minutesOriginal,
            minutesUsed,
            shortage: shortageForShift(s),
            denominations: s.denominations || {},
            systemTotal: Number(s.system_total || 0),
            staffUid: lineRec.staff_id || null,
            staffName: lineRec.staff_name || s.staff_name || s.staff_full_name || lineRec.staff_email,
            staffEmail: lineRec.staff_email || s.staff_email,
            expenseDate: ov.expense_date || null,
          };

          const txs = advByShift.get(sid) || [];
          let ownerAdvance = 0;
          const ownerAdvanceRefs = [];
          txs.forEach((tx) => {
            const amt = Number(tx.total || 0);
            const targetEmail = tx.expense_staff_email || tx.staff_email || row.staffEmail;
            const targetUid = tx.expense_staff_id || tx.staff_id || row.staffUid;
            const isForThisStaff =
              (lineRec.staff_email && targetEmail === lineRec.staff_email) ||
              (lineRec.staff_id && targetUid === lineRec.staff_id) ||
              (!tx.expense_staff_email && !tx.expense_staff_id);
            if (isForThisStaff) {
              ownerAdvance += amt;
              ownerAdvanceRefs.push(tx.id);
            }
          });
          row.advance = ownerAdvance;
          row.advanceRefs = ownerAdvanceRefs;

          shiftRows.push(row);
        }

        const manualAdjustments = Array.isArray(lineRec.adjustments)
          ? lineRec.adjustments.filter((a) => a?.type === "manual-deduction")
          : [];
        const manualAdditions = Array.isArray(lineRec.adjustments)
          ? lineRec.adjustments.filter((a) => a?.type === "manual-addition")
          : [];
        const extraAdvAdjustments = Array.isArray(lineRec.adjustments)
          ? lineRec.adjustments.filter((a) => a?.type === "extra-advance")
          : [];

        const rate = Number(lineRec.rate || 0);
        const minutes = shiftRows
          .filter((r) => !r.excluded)
          .reduce((m, r) => m + Number(r.minutesUsed || 0), 0);
        const gross = calcGross(minutes, rate);
        const advances = shiftRows
          .filter((r) => !r.excluded)
          .reduce((s, r) => s + Number(r.advance || 0), 0);
        const shortages = shiftRows
          .filter((r) => !r.excluded)
          .reduce((s, r) => s + Number(r.shortage || 0), 0);
        const extraAdvTotal = extraAdvAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);
        const manualTotal = manualAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);
        const additionTotal = manualAdditions.reduce((s, a) => s + Number(a.amount || 0), 0);

        const otherDeductions = Number((extraAdvTotal + manualTotal).toFixed(2));
        const totalAdditions = Number(additionTotal.toFixed(2));
        const net = Number(
          (gross + totalAdditions - advances - shortages - otherDeductions).toFixed(2)
        );

        return {
          id: lineId,
          staffUid: lineRec.staff_id || null,
          staffEmail: lineRec.staff_email,
          staffName: lineRec.staff_name,
          rate,
          minutes,
          gross,
          advances,
          shortages,
          otherDeductions,
          totalAdditions,
          net,
          shiftRows,
          extraAdvances: extraAdvAdjustments.map((a) => ({
            id: a.id,
            label: a.label,
            amount: a.amount,
            fromShiftId: a.fromShiftId || null,
          })),
          customDeductions: manualAdjustments.map((a) => ({
            id: a.id,
            label: a.label,
            amount: a.amount,
          })),
          customAdditions: manualAdditions.map((a) => ({
            id: a.id,
            label: a.label,
            amount: a.amount,
          })),
        };
      }));

      setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
      setStep(1);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load that payroll run.", "error");
    } finally {
      stopBusy();
    }
  };

  // auto-load when coming from history
  useEffect(() => {
    if (openRunId) {
      loadRun(openRunId).then(() => {
        if (openDialogAfterLoad) {
          onOpenedFromHistory?.();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunId, openDialogAfterLoad]);

  /** ─── save edits to run ─────────────────────────────────────────────────── */
  const saveEditsToRun = async (id = runId, { withLoader = true } = {}) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id || "admin";

      const { error: runErr } = await supabase
        .from('payroll_runs')
        .update({
          pay_date: tsFromYMD(payDate, false),
          expense_mode: expenseMode,
          totals: {
            staffCount: preview.length,
            minutes: preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
            gross: Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)),
            advances: Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)),
            shortages: Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)),
            otherDeductions: Number(preview.reduce((s, l) => s + Number(l.otherDeductions || 0), 0).toFixed(2)),
            additions: Number(preview.reduce((s, l) => s + Number(l.totalAdditions || 0), 0).toFixed(2)),
            net: Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
          },
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', id);

      if (runErr) throw runErr;

      for (const line of preview) {
        const { error: lineErr } = await supabase
          .from('payroll_lines')
          .upsert({
            id: line.id.startsWith('email:') || line.id.startsWith('uid:') ? undefined : line.id,
            run_id: id,
            staff_id: line.staffUid || null,
            staff_email: line.staffEmail,
            staff_name: line.staffName,
            minutes: line.minutes,
            rate: line.rate,
            gross: line.gross,
            adjustments: [
              ...(line.customDeductions || []).map((d, idx) => ({
                id: d.id || `manual-ded-${idx}`,
                type: "manual-deduction",
                label: d.label,
                amount: Number(d.amount || 0),
              })),
              ...(line.customAdditions || []).map((d, idx) => ({
                id: d.id || `manual-add-${idx}`,
                type: "manual-addition",
                label: d.label,
                amount: Number(d.amount || 0),
              })),
              ...(line.extraAdvances || []).map((d, idx) => ({
                id: d.id || `extra-adv-${idx}`,
                type: "extra-advance",
                label: d.label,
                amount: Number(d.amount || 0),
                fromShiftId: d.fromShiftId || null,
              })),
            ],
            source: { shiftIds: line.shiftRows.map((r) => r.id) },
            is_edited: true,
            updated_at: new Date().toISOString(),
            updated_by: userId,
          }, { onConflict: 'id' });

        if (lineErr) throw lineErr;

        // Manage shift overrides
        await supabase.from('payroll_line_shifts').delete().eq('line_id', line.id);
        const overrideRows = line.shiftRows
          .filter(r => r.excluded || r.overrideStart || r.overrideEnd || r.expenseDate || r.isOngoing)
          .map(r => ({
            line_id: line.id,
            shift_id: r.id,
            original_start: r.start,
            original_end: r.end || null,
            override_start: r.overrideStart || null,
            override_end: r.overrideEnd || null,
            excluded: !!r.excluded,
            minutes_used: r.minutesUsed,
            expense_date: r.expenseDate || null,
          }));

        if (overrideRows.length > 0) {
          const { error: ovErr } = await supabase.from('payroll_line_shifts').insert(overrideRows);
          if (ovErr) throw ovErr;
        }
      }

      if (withLoader) {
        showSnackbar("Payroll changes were saved.", "success");
      }
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to save payroll run.", "error");
    } finally {
      if (withLoader) stopBusy();
    }
  };

  /** ─── create run ────────────────────────────────────────────────────────── */
  const createRunInternal = async () => {
    startBusy("Creating new payroll run doc...");

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id || "admin";

      updateBusy("Generating Payroll ID...");
      const newRunId = await generateDisplayId("payroll", "PY");
      
      const run = {
        id: newRunId,
        display_id: newRunId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "draft",
        expense_mode: expenseMode || "per-staff",
        pay_date: payDate,
        totals: {
          staffCount: preview.length,
          minutes: preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
          gross: Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)),
          advances: Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)),
          shortages: Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)),
          other_deductions: Number(preview.reduce((s, l) => s + Number(l.otherDeductions || 0), 0).toFixed(2)),
          additions: Number(preview.reduce((s, l) => s + Number(l.totalAdditions || 0), 0).toFixed(2)),
          net: Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
        },
        created_at: new Date().toISOString(),
        created_by: userId,
      };

      const { data: newRun, error: insErr } = await supabase
        .from('payroll_runs')
        .insert(run)
        .select()
        .single();

      if (insErr) throw insErr;

      updateBusy("Saving line overrides...");
      await saveEditsToRun(newRun.id, { withLoader: false });
      setRunId(newRun.id);
      setStatus("draft");
      return newRun.id;
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to create payroll run.", "error");
      return null;
    } finally {
      stopBusy();
    }
  };

  const handleSaveRun = async () => {
    const id = await createRunInternal();
    if (id) {
      showSnackbar("New payroll run has been created.", "success");
    }
  };

  const handleCreateAndFinalize = async () => {
    const id = await createRunInternal();
    if (id) {
      setConfirmFinalizeOpen(true);
    }
  };

  const handleFinalize = () => setConfirmFinalizeOpen(true);

  /** ─── finalize run ──────────────────────────────────────────────────────── */
  const finalizeRun = async (id = runId) => {
    if (!id) {
      showSnackbar("There is no payroll run to finalize.", "warning");
      return;
    }

    startBusy("Saving latest edits before posting...");

    try {
      await saveEditsToRun(id, { withLoader: false });

      updateBusy("Fetching run data...");
      const { data: runData, error: runErr } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('id', id)
        .single();
      if (runErr || !runData) throw runErr || new Error("Run not found");

      updateBusy("Loading run lines...");
      const { data: lines, error: linesErr } = await supabase
        .from('payroll_lines')
        .select('*')
        .eq('run_id', id);
      if (linesErr) throw linesErr;

      updateBusy("Voiding existing payroll transactions...");
      await supabase
        .from('expenses')
        .update({ voided: true })
        .eq('payroll_run_id', id)
        .eq('voided', false);

      updateBusy("Cleaning up old paystubs...");
      await supabase
        .from('payroll_stubs')
        .delete()
        .eq('run_id', id);

      const lineIdByUid = new Map();
      const lineIdByEmail = new Map();
      lines.forEach((l) => {
        if (l.staff_id) lineIdByUid.set(l.staff_id, l.id);
        if (l.staff_email) lineIdByEmail.set(l.staff_email, l.id);
      });

      const extraDeductionsByLineId = new Map();
      const materializedLines = [];

      const periodStartTS = runData.period_start;
      const periodEndTS = runData.period_end;

      const runPayDate = runData.pay_date || payDate || new Date().toISOString();


      updateBusy("Expanding each line to shift-level data...");

      updateBusy("Expanding each line to shift-level data...");

      for (const l of lines) {
        const lineId = l.id;
        const shiftIds = l.source?.shiftIds || [];

        const [{ data: overData }, { data: shiftsData }, { data: advData }] = await Promise.all([
          supabase.from('payroll_line_shifts').select('*').eq('line_id', lineId),
          supabase.from('shifts').select('*').in('id', shiftIds),
          supabase.from('expenses').select('*').eq('expense_type', 'Salary Advance').in('shift_id', shiftIds)
        ]);

        const overrides = new Map();
        (overData || []).forEach((ov) => {
          overrides.set(ov.shift_id, ov);
        });

        const shiftsById = new Map();
        (shiftsData || []).forEach(s => shiftsById.set(s.id, s));

        const advByShift = new Map();
        (advData || []).forEach(tx => {
          if (tx.voided) return;
          const list = advByShift.get(tx.shift_id) || [];
          list.push(tx);
          advByShift.set(tx.shift_id, list);
        });

        const shiftDetails = [];
        let totalMinutesLine = 0;
        let totalAdvancesLine = 0;
        let totalShortagesLine = 0;

        for (const sid of shiftIds) {
          const s = shiftsById.get(sid);
          if (!s) continue;

          const ov = overrides.get(sid) || {};
          if (ov.excluded) continue;

          const start = ov.override_start || s.start_time;
          const end = ov.override_end || s.end_time;

          const minutesUsed = ov.minutes_used != null ? ov.minutes_used : minutesBetween(start, end);
          const shiftLabel = `${fmtDate(s.start_time)} (${inferShiftName(s.start_time, s.title, s.label)})`;
          const expenseDate = ov.expense_date || s.start_time || runData.pay_date || new Date().toISOString();

          const shortageAmount = shortageForShift(s);
          if (shortageAmount > 0) totalShortagesLine += shortageAmount;

          const txs = advByShift.get(sid) || [];
          let advancesForThisShiftForThisStaff = 0;

          txs.forEach((tx) => {
            const amt = Number(tx.total || 0);
            const intendedEmail = tx.expense_staff_email || tx.staff_email || null;
            const intendedUid = tx.expense_staff_id || tx.staff_id || null;

            const isForThisLine =
              (!!l.staff_id && intendedUid === l.staff_id) ||
              (!!l.staff_email && intendedEmail === l.staff_email) ||
              (!intendedEmail && !intendedUid && s.staff_email === l.staff_email);

            if (isForThisLine) {
              advancesForThisShiftForThisStaff += amt;
            } else {
              const targetLineId = (intendedUid && lineIdByUid.get(intendedUid)) || (intendedEmail && lineIdByEmail.get(intendedEmail)) || null;
              const key = targetLineId || lineId;
              const list = extraDeductionsByLineId.get(key) || [];
              list.push({
                id: sid,
                label: `Salary Advance on ${shiftLabel}`,
                amount: amt,
                expenseDate,
              });
              extraDeductionsByLineId.set(key, list);
            }
          });

          totalAdvancesLine += advancesForThisShiftForThisStaff;
          shiftDetails.push({
            id: sid,
            label: shiftLabel,
            hours: toHours(minutesUsed),
            minutes: minutesUsed,
            startTime: start,
            endTime: end,
            expenseDate,
            advances: advancesForThisShiftForThisStaff,
            shortages: shortageAmount,
          });

          totalMinutesLine += minutesUsed;
          await supabase.from('shifts').update({ payroll_run_id: id }).eq('id', sid);
        }

        const grossPay = calcGross(totalMinutesLine, l.rate);
        const manualAdjustments = Array.isArray(l.adjustments) ? l.adjustments.filter((a) => a?.type === "manual-deduction") : [];
        const manualTotal = manualAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);
        const manualAdditions = Array.isArray(l.adjustments) ? l.adjustments.filter((a) => a?.type === "manual-addition") : [];
        const additionTotal = manualAdditions.reduce((s, a) => s + Number(a.amount || 0), 0);

        materializedLines.push({
          lineId,
          staffUid: l.staff_id,
          staffEmail: l.staff_email,
          staffName: l.staff_name,
          rate: l.rate,
          shifts: shiftDetails,
          totalMinutes: totalMinutesLine,
          grossPay,
          totalAdvances: totalAdvancesLine,
          totalShortages: totalShortagesLine,
          manualAdjustments,
          manualTotal,
          manualAdditions,
          additionTotal,
          crossDeductions: [],
        });
      }

      updateBusy("Merging cross-staff salary advances...");
      updateBusy("Fetching admin manual salary entries...");
      const startYMD = runData.period_start;
      const endYMD = runData.period_end;

      const { data: adminData, error: adminErr } = await supabase
        .from('expenses')
        .select('*')
        .gte('timestamp', startYMD)
        .lte('timestamp', endYMD)
        .eq('item', 'Expenses')
        .eq('expense_type', 'Salary Advance')
        .is('shift_id', null)
        .eq('voided', false);

      if (adminErr) throw adminErr;

      (adminData || []).forEach((tx) => {
        const email = tx.expense_staff_email || tx.staff_email;
        const uid = tx.expense_staff_id || tx.staff_id;
        const amt = Number(tx.total || 0);

        const targetLine = materializedLines.find((l) =>
          (uid && l.staffUid === uid) || (email && l.staffEmail === email)
        );

        if (targetLine) {
          const exists = (targetLine.crossDeductions || []).some((d) => d.id === tx.id);
          if (!exists) {
            if (!targetLine.crossDeductions) targetLine.crossDeductions = [];
            targetLine.crossDeductions.push({
              id: tx.id,
              label: `Manual: ${tx.notes || "Salary Advance"}`,
              amount: amt,
              expenseDate: tx.timestamp,
            });
          }
        }
      });

      for (const [targetLineId, extraList] of extraDeductionsByLineId.entries()) {
        const target = materializedLines.find((m) => m.lineId === targetLineId);
        if (target) {
          const current = target.crossDeductions || [];
          target.crossDeductions = [...current, ...extraList];
        }
      }

      updateBusy("Writing paystubs and posting salary expenses...");
      let runTotals = { staffCount: 0, minutes: 0, gross: 0, additions: 0, advances: 0, shortages: 0, otherDeductions: 0, net: 0 };

      const expenseModeToUse = runData.expense_mode || "per-staff";
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id || "admin";
      const userEmail = currentUser?.email || "admin";

      const allPaystubs = [];
      const pendingExpenses = [];

      for (const m of materializedLines) {
        const deductionItems = [];
        const additionItems = [];

        const shiftsForStub = m.shifts.map((s) => {
          const shiftPay = Number(((s.minutes / 60) * m.rate).toFixed(2));
          if (s.advances > 0) {
            deductionItems.push({ id: s.id, label: `Salary Advance on ${s.label}`, amount: s.advances });
          }
          if (s.shortages > 0) {
            deductionItems.push({ id: s.id, label: `Shortage on ${s.label}`, amount: s.shortages });
          }
          return { id: s.id, label: s.label, hours: s.hours, startTime: s.startTime || null, endTime: s.endTime || null, pay: shiftPay };
        });

        m.manualAdjustments.forEach((a) =>
          deductionItems.push({ id: a.id, label: a.label, amount: Number(a.amount || 0) })
        );

        m.manualAdditions.forEach((a) =>
          additionItems.push({ id: a.id, label: a.label, amount: Number(a.amount || 0) })
        );

        (m.crossDeductions || []).forEach((a) =>
          deductionItems.push({ id: a.id, label: a.label, amount: Number(a.amount || 0) })
        );

        const crossStaffTotal = (m.crossDeductions || []).reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );

        const totalDeductions =
          m.totalAdvances + m.totalShortages + m.manualTotal + crossStaffTotal;

        const netPay = Number((m.grossPay + m.additionTotal - totalDeductions).toFixed(2));

        allPaystubs.push({
          run_id: id,
          staff_id: m.staffUid,
          staff_email: m.staffEmail,
          staff_name: m.staffName,
          period_start: periodStartTS,
          period_end: periodEndTS,
          pay_date: runPayDate,
          shifts: shiftsForStub,
          deduction_items: deductionItems,
          addition_items: additionItems,
          total_hours: toHours(m.totalMinutes),
          gross_pay: m.grossPay,
          total_additions: m.additionTotal,
          total_deductions: Number(totalDeductions.toFixed(2)),
          net_pay: netPay,
          created_at: new Date().toISOString(),
          created_by: userId,
        });

        if (m.additionTotal > 0 && expenseModeToUse === "per-shift") {
          pendingExpenses.push({
            item: "Expenses",
            expense_type: "Salary",
            expense_staff_id: m.staffUid,
            expense_staff_name: m.staffName,
            expense_staff_email: m.staffEmail,
            quantity: 1,
            price: m.additionTotal,
            total: m.additionTotal,
            notes: `Payroll Additions/Bonuses [${periodStartTS} — ${periodEndTS}]`,
            shift_id: null,
            source: `payroll_run:${id}`,
            payroll_run_id: id,
            voided: false,
            timestamp: runPayDate,
            staff_email: userEmail,
            is_deleted: false,
            is_edited: false,
          });
        }

        if (expenseModeToUse === "per-shift") {
          m.shifts.forEach((s) => {
            const shiftGross = Number((((s.minutes || 0) / 60) * Number(m.rate || 0)).toFixed(2));
            const shiftDeductions = deductionItems
              .filter((d) => d.id === s.id)
              .reduce((sum, d) => sum + Number(d.amount || 0), 0);
            const shiftNet = Number((shiftGross - shiftDeductions).toFixed(2));
            if (shiftGross === 0 && shiftDeductions === 0) return;

            pendingExpenses.push({
              item: "Expenses",
              expense_type: "Salary",
              expense_staff_id: m.staffUid,
              expense_staff_name: m.staffName,
              expense_staff_email: m.staffEmail,
              quantity: 1,
              price: shiftNet,
              total: shiftNet,
              notes: `Payroll [${periodStartTS} — ${periodEndTS}] | Shift: ${s.label} | Gross: ${peso(shiftGross)} | Net: ${peso(shiftNet)}`,
              shift_id: null,
              source: `payroll_run:${id}`,
              payroll_run_id: id,
              voided: false,
              timestamp: s.expenseDate || runPayDate,
              staff_email: userEmail,
              is_deleted: false,
              is_edited: false,
            });
          });

          const nonShiftDeds = deductionItems.filter((d) => !m.shifts.find((s) => s.id === d.id));
          if (nonShiftDeds.length) {
            const extraTotal = nonShiftDeds.reduce((s, d) => s + Number(d.amount || 0), 0);
            if (extraTotal > 0) {
              pendingExpenses.push({
                item: "Expenses",
                expense_type: "Salary",
                expense_staff_id: m.staffUid,
                expense_staff_name: m.staffName,
                expense_staff_email: m.staffEmail,
                quantity: 1,
                price: extraTotal * -1,
                total: extraTotal * -1,
                notes: `Payroll manual / cross-staff deductions [${periodStartTS} — ${periodEndTS}]`,
                shift_id: null,
                source: `payroll_run:${id}`,
                payroll_run_id: id,
                voided: false,
                timestamp: runPayDate,
                staff_email: userEmail,
                is_deleted: false,
                is_edited: false,
              });
            }
          }
        } else {
          pendingExpenses.push({
            item: "Expenses",
            expense_type: "Salary",
            expense_staff_id: m.staffUid,
            expense_staff_name: m.staffName,
            expense_staff_email: m.staffEmail,
            quantity: 1,
            price: netPay,
            total: netPay,
            notes: `Payroll [${periodStartTS} — ${periodEndTS}] | Gross: ${peso(m.grossPay)} | Adds: ${peso(m.additionTotal)} | Net: ${peso(netPay)}`,
            shift_id: null,
            source: `payroll_run:${id}`,
            payroll_run_id: id,
            voided: false,
            timestamp: runPayDate,
            staff_email: userEmail,
            is_deleted: false,
            is_edited: false,
          });
        }

        runTotals = {
          staffCount: runTotals.staffCount + 1,
          minutes: runTotals.minutes + m.totalMinutes,
          gross: runTotals.gross + m.grossPay,
          additions: runTotals.additions + m.additionTotal,
          advances: runTotals.advances + m.totalAdvances,
          shortages: runTotals.shortages + m.totalShortages,
          otherDeductions: runTotals.otherDeductions + m.manualTotal + crossStaffTotal,
          net: runTotals.net + netPay,
        };
      }

      if (allPaystubs.length > 0) {
        const { error: stubErr } = await supabase.from('payroll_stubs').insert(allPaystubs);
        if (stubErr) throw stubErr;
      }

      if (pendingExpenses.length > 0) {
        updateBusy(`Generating IDs for ${pendingExpenses.length} expenses...`);
        const expIds = await generateBatchIds("expenses", "EXP", pendingExpenses.length);
        const expensesToInsert = pendingExpenses.map((tx, idx) => ({ ...tx, display_id: expIds[idx] }));
        const { error: expErr } = await supabase.from('expenses').insert(expensesToInsert);
        if (expErr) throw expErr;
      }

      updateBusy("Updating run status...");
      const { error: finalRunErr } = await supabase
        .from('payroll_runs')
        .update({
          status: "posted",
          updated_at: new Date().toISOString(),
          totals: runTotals,
          expense_mode: expenseModeToUse,
          updated_by: userId,
        })
        .eq('id', id);

      if (finalRunErr) throw finalRunErr;

      setStatus("posted");
      setStep(1);
      stopBusy();
      showSnackbar("Run finalized, transactions posted, and paystubs created.", "success");
      onOpenPaystubs && onOpenPaystubs(id);
    } catch (err) {
      console.error(err);
      stopBusy();
      showSnackbar("Failed to finalize payroll run.", "error");
    }
  };

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

        {/* Step indicator */}
        <Stepper activeStep={step} alternativeLabel>
          <Step>
            <StepLabel>Select Period</StepLabel>
          </Step>
          <Step>
            <StepLabel>Review & Post</StepLabel>
          </Step>
        </Stepper>

        {/* ── Step 0: Period Setup ─────────────────────────────────────────── */}
        {step === 0 && (
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Payroll Period
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
                  disabled={isPerStaffMode ? false : false}
                />
              </Stack>
              <FormControl fullWidth>
                <InputLabel>Expense Mode</InputLabel>
                <Select
                  value={expenseMode}
                  onChange={(e) => handleExpenseModeChange(e.target.value)}
                  label="Expense Mode"
                >
                  <MenuItem value="per-staff">Post once per staff (use pay date)</MenuItem>
                  <MenuItem value="per-shift">Post using each shift's expense date</MenuItem>
                </Select>
              </FormControl>
              <Box>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => generatePreview(null)}
                  disabled={!periodStart || !periodEnd || busy}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
                >
                  Preview Payroll
                </Button>
              </Box>
            </Stack>
          </Card>
        )}

        {/* ── Step 1: Review Hours (was RunDialog content) ─────────────────── */}
        {step === 1 && (
          <Box>
            {/* Header bar — sticky so it stays visible while scrolling */}
            <Card ref={headerCardRef} sx={{ p: 2, mb: 2, position: "sticky", top: 0, zIndex: 10 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <TextField
                  type="date"
                  label="Pay Date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  disabled={disableEdits || isPerStaffMode}
                />
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel>Expense Mode</InputLabel>
                  <Select
                    value={expenseMode}
                    label="Expense Mode"
                    onChange={(e) => handleExpenseModeChange(e.target.value)}
                    disabled={disableEdits}
                  >
                    <MenuItem value="per-staff">Post once per staff (use pay date)</MenuItem>
                    <MenuItem value="per-shift">Post using each shift's expense date</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <SummaryCards
                cards={[
                  { label: "Staff", value: String(preview.length), icon: <PeopleIcon fontSize="small" />, color: "primary.main" },
                  { label: "Hours", value: `${toHours(totalMinutes)} hrs`, icon: <ScheduleIcon fontSize="small" />, color: "info.main" },
                  { label: "Gross", value: peso(totalGross), color: "text.primary" },
                  ...(totalAdditionsSum > 0 ? [{ label: "Additions", value: peso(totalAdditionsSum), color: "success.main", icon: <SellIcon fontSize="small" /> }] : []),
                  { label: "Deductions", value: peso(totalAdvances + totalShortages + totalOtherDeds), color: "error.main", icon: <ReceiptIcon fontSize="small" /> },
                  { label: "NET", value: peso(totalNet), color: "success.main", icon: <AccountBalanceIcon fontSize="small" />, highlight: true },
                ]}
              />
            </Card>

            {/* Staff table */}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={48} />
                    <TableCell>Staff</TableCell>
                    <TableCell align="right">Hours</TableCell>
                    <TableCell align="right">Gross</TableCell>
                    <TableCell align="right" sx={{ color: "success.main" }}>Additions</TableCell>
                    <TableCell align="right">NET</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.map((l) => (
                    <React.Fragment key={l.id}>
                      <TableRow>
                        <TableCell width={48}>
                          <IconButton
                            size="small"
                            onClick={() => setExpanded(p => ({ ...p, [l.id]: !p[l.id] }))}
                          >
                            {!!expanded[l.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{l.staffName}</Typography>
                          <Typography variant="caption" color="text.secondary">{l.staffEmail}</Typography>
                        </TableCell>
                        <TableCell align="right">{toHours(l.minutes)}</TableCell>
                        <TableCell align="right">{peso(l.gross)}</TableCell>
                        <TableCell align="right" sx={{ color: "success.main" }}>
                          {peso(l.totalAdditions)}
                        </TableCell>
                        <TableCell align="right">
                          <b>{peso(l.net)}</b>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail */}
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                          <Collapse in={!!expanded[l.id]} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: "background.default" }}>
                              {/* Rate override */}
                              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                <Typography variant="subtitle2">Hourly Rate</Typography>
                                <TextField
                                  type="number"
                                  size="small"
                                  label="Rate / hr"
                                  value={l.rate}
                                  onChange={(e) => {
                                    const rate = Number(e.target.value || 0);
                                    setPreview((prev) =>
                                      prev.map((line) => {
                                        if (line.id !== l.id) return line;
                                        const newLine = { ...line, rate };
                                        return { ...newLine, ...recalcLine(newLine) };
                                      })
                                    );
                                  }}
                                  inputProps={{ step: "0.01", min: 0 }}
                                  disabled={disableEdits}
                                  sx={{ width: 120 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  Advances: {peso(l.advances)} &nbsp;|&nbsp; Shortages: {peso(l.shortages)} &nbsp;|&nbsp; Other Deds: {peso(l.otherDeductions || 0)}
                                </Typography>
                              </Stack>

                              {/* Shifts included */}
                              <Typography variant="subtitle2" gutterBottom>
                                Shifts (included)
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Shift</TableCell>
                                    <TableCell>Start</TableCell>
                                    <TableCell>End</TableCell>
                                    <TableCell align="right">Hours</TableCell>
                                    <TableCell align="right">System</TableCell>
                                    <TableCell align="right">Denoms</TableCell>
                                    <TableCell align="right">Shortage</TableCell>
                                    <TableCell align="right">Expense Date</TableCell>
                                    <TableCell align="center">Exclude</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {l.shiftRows
                                    .filter((r) => !r.excluded)
                                    .map((r) => {
                                      const startForISO = r.overrideStart || r.start;
                                      const endForISO = r.overrideEnd || r.end;
                                      const startISO = toLocalISO_PHT_fromTS(startForISO);
                                      const endISO = toLocalISO_PHT_fromTS(endForISO);

                                      const label = `${inferShiftName(r.start, r.title, r.label)} — ${toLocaleDateStringPHT(r.start)}`;

                                      const expenseDateYMD = isPerStaffMode
                                        ? payDate
                                        : r.expenseDate
                                          ? toYMD_PHT_fromTS(r.expenseDate)
                                          : payDate || todayYMD_PHT();

                                      return (
                                        <TableRow key={r.id}>
                                          <TableCell>
                                            <Typography variant="body2">
                                              {label}
                                              {r.isOngoing && (
                                                <Chip
                                                  label="Ongoing"
                                                  size="small"
                                                  color="warning"
                                                  variant="outlined"
                                                  sx={{ ml: 1, height: 20, fontSize: 10 }}
                                                />
                                              )}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <TextField
                                              type="datetime-local"
                                              size="small"
                                              value={startISO}
                                              onChange={(e) =>
                                                updateShiftRow(l.id, r.id, {
                                                  overrideStart: Timestamp.fromDate(new Date(e.target.value)),
                                                })
                                              }
                                              disabled={disableEdits}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <TextField
                                              type="datetime-local"
                                              size="small"
                                              value={endISO}
                                              onChange={(e) =>
                                                updateShiftRow(l.id, r.id, {
                                                  overrideEnd: Timestamp.fromDate(new Date(e.target.value)),
                                                })
                                              }
                                              disabled={disableEdits}
                                            />
                                          </TableCell>
                                          <TableCell align="right">{toHours(r.minutesUsed)}</TableCell>
                                          <TableCell align="right">{peso(r.systemTotal)}</TableCell>
                                          <TableCell align="right">{peso(sumDenominations(r.denominations))}</TableCell>
                                          <TableCell align="right">{peso(r.shortage)}</TableCell>
                                          <TableCell align="right">
                                            <TextField
                                              type="date"
                                              size="small"
                                              value={expenseDateYMD}
                                              onChange={(e) =>
                                                updateShiftRow(l.id, r.id, {
                                                  expenseDate: tsFromYMD(e.target.value, false),
                                                })
                                              }
                                              disabled={disableEdits || isPerStaffMode}
                                            />
                                          </TableCell>
                                          <TableCell align="center">
                                            <input
                                              type="checkbox"
                                              checked={!!r.excluded}
                                              onChange={(e) =>
                                                updateShiftRow(l.id, r.id, { excluded: !!e.target.checked })
                                              }
                                              disabled={disableEdits}
                                            />
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                </TableBody>
                              </Table>

                              {/* Excluded shifts */}
                              {l.shiftRows.some((r) => r.excluded) && (
                                <>
                                  <Divider sx={{ my: 2 }} />
                                  <Typography variant="subtitle2" gutterBottom>Excluded</Typography>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Shift</TableCell>
                                        <TableCell align="right">Hours</TableCell>
                                        <TableCell align="center">Re-include</TableCell>
                                        <TableCell align="right">ID</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {l.shiftRows
                                        .filter((r) => r.excluded)
                                        .map((r) => {
                                          const label = `${inferShiftName(r.start, r.title, r.label)} — ${toLocaleDateStringPHT(r.start)}`;
                                          return (
                                            <TableRow key={r.id}>
                                              <TableCell>{label}</TableCell>
                                              <TableCell align="right">{toHours(r.minutesOriginal)}</TableCell>
                                              <TableCell align="center">
                                                <Button
                                                  size="small"
                                                  onClick={() =>
                                                    updateShiftRow(l.id, r.id, {
                                                      excluded: false,
                                                      minutesUsed: r.minutesOriginal,
                                                    })
                                                  }
                                                  disabled={disableEdits}
                                                >
                                                  Include
                                                </Button>
                                              </TableCell>
                                              <TableCell align="right">
                                                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                                  {r.displayId || r.id.slice(-6)}
                                                </Typography>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                    </TableBody>
                                  </Table>
                                </>
                              )}

                              <Divider sx={{ my: 2 }} />

                              {/* Additions */}
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle2" sx={{ color: "green" }}>
                                  Additional Pay / Bonuses
                                </Typography>
                                <Button
                                  size="small"
                                  onClick={() => openItemDialog("addition", l.id)}
                                  disabled={disableEdits}
                                >
                                  + Add Pay
                                </Button>
                              </Stack>
                              <Table size="small" sx={{ mb: 2 }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Label</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {l.customAdditions && l.customAdditions.length > 0 ? (
                                    l.customAdditions.map((d, idx) => (
                                      <TableRow key={`add-${idx}`}>
                                        <TableCell>{d.label}</TableCell>
                                        <TableCell align="right" sx={{ color: "green", fontWeight: "bold" }}>
                                          {peso(d.amount)}
                                        </TableCell>
                                        <TableCell align="center">
                                          <Stack direction="row" spacing={1} justifyContent="center">
                                            <Button
                                              size="small"
                                              onClick={() =>
                                                openItemDialog("addition", l.id, {
                                                  index: idx,
                                                  label: d.label,
                                                  amount: d.amount,
                                                })
                                              }
                                              disabled={disableEdits}
                                            >
                                              Edit
                                            </Button>
                                            <Button
                                              size="small"
                                              onClick={() => deleteItem("addition", l.id, idx)}
                                              disabled={disableEdits}
                                            >
                                              Delete
                                            </Button>
                                          </Stack>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={3} align="center" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                                        No additional pay.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>

                              <Divider sx={{ my: 2 }} />

                              {/* Deductions */}
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle2">
                                  Deductions for {l.staffName}
                                </Typography>
                                <Button
                                  size="small"
                                  onClick={() => openItemDialog("deduction", l.id)}
                                  disabled={disableEdits}
                                >
                                  + Add Custom Deduction
                                </Button>
                              </Stack>
                              <Table size="small" sx={{ mb: 2 }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Label</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {(l.extraAdvances?.length || l.customDeductions?.length) ? (
                                    <>
                                      {(l.extraAdvances || []).map((d, idx) => (
                                        <TableRow key={`extra-${idx}`}>
                                          <TableCell>Salary Advance</TableCell>
                                          <TableCell>{d.label}</TableCell>
                                          <TableCell align="right">{peso(d.amount)}</TableCell>
                                          <TableCell align="center">
                                            <Typography variant="caption" color="text.secondary">auto</Typography>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      {(l.customDeductions || []).map((d, idx) => (
                                        <TableRow key={`custom-${idx}`}>
                                          <TableCell>Custom</TableCell>
                                          <TableCell>{d.label}</TableCell>
                                          <TableCell align="right">{peso(d.amount)}</TableCell>
                                          <TableCell align="center">
                                            <Stack direction="row" spacing={1} justifyContent="center">
                                              <Button
                                                size="small"
                                                onClick={() =>
                                                  openItemDialog("deduction", l.id, {
                                                    index: idx,
                                                    label: d.label,
                                                    amount: d.amount,
                                                  })
                                                }
                                                disabled={disableEdits}
                                              >
                                                Edit
                                              </Button>
                                              <Button
                                                size="small"
                                                onClick={() => deleteItem("deduction", l.id, idx)}
                                                disabled={disableEdits}
                                              >
                                                Delete
                                              </Button>
                                            </Stack>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </>
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                                        No other deductions.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
                          <Divider />
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>


            {/* Step 1 action bar */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mt: 2 }}
            >
              <Button onClick={() => setStep(0)}>Back</Button>
              <Stack direction="row" spacing={1} alignItems="center">
                {runId && status === "posted" && (
                  <Tooltip title="View Paystubs">
                    <IconButton onClick={() => setPaystubDrawerRunId(runId)}>
                      <ReceiptLongIcon />
                    </IconButton>
                  </Tooltip>
                )}
                {runId ? (
                  <>
                    {status === "posted" ? (
                      <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleFinalize}>
                        Regenerate Paystubs
                      </Button>
                    ) : status !== "voided" ? (
                      <>
                        <Button variant="outlined" onClick={() => saveEditsToRun()}>
                          Save Changes
                        </Button>
                        <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={handleFinalize}>
                          Post Payroll
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button variant="outlined" onClick={handleSaveRun}>
                      Save Draft
                    </Button>
                    <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={handleCreateAndFinalize}>
                      Post Payroll
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

      </Box>

      {/* ── Finalize confirmation dialog (lightweight, not nested in modal) ── */}
      <Dialog
        open={confirmFinalizeOpen}
        onClose={() => setConfirmFinalizeOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Post this payroll run?</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 1 }}>This will:</Typography>
          <Typography component="ul" sx={{ pl: 3 }}>
            <li>save any unsaved edits</li>
            <li>void previous salary transactions for this run</li>
            <li>create new salary transactions</li>
            <li>generate paystubs</li>
          </Typography>
          <Typography sx={{ mt: 2 }} color="text.secondary">
            You can view the paystubs after it finishes.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmFinalizeOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmFinalizeOpen(false);
              finalizeRun();
            }}
          >
            Post now
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Ongoing shifts prompt (lightweight) ─────────────────────────────── */}
      <Dialog
        open={ongoingPrompt.open}
        onClose={() => setOngoingPrompt({ open: false, shifts: [] })}
      >
        <DialogTitle>Ongoing Shifts Detected</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Found {ongoingPrompt.shifts.length} shift(s) that have started but not ended yet
            within this period.
            <br /><br />
            Do you want to include them in this payroll calculation (using "now" as the presumed
            end time), or skip them?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOngoingPrompt({ open: false, shifts: [] });
              generatePreview("exclude");
            }}
          >
            Skip Ongoing
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setOngoingPrompt({ open: false, shifts: [] });
              generatePreview("include");
            }}
          >
            Include (Assume Ended Now)
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Item edit mini-dialog (add/edit deductions/additions) ───────────── */}
      <Dialog open={itemEdit.open} onClose={closeItemDialog}>
        <DialogTitle>
          {itemEdit.type === "addition" ? "Additional Pay" : "Custom Deduction"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", gap: 2, mt: 1 }}>
          <TextField
            label="Label"
            fullWidth
            value={itemEdit.label}
            onChange={(e) => setItemEdit((p) => ({ ...p, label: e.target.value }))}
          />
          <TextField
            label="Amount"
            type="number"
            value={itemEdit.amount}
            onChange={(e) => setItemEdit((p) => ({ ...p, amount: e.target.value }))}
            inputProps={{ step: "0.01", min: 0 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeItemDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveItem}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── Paystub Drawer (replaces nested paystub dialog) ─────────────────── */}
      <PaystubDialog
        open={!!paystubDrawerRunId}
        onClose={() => setPaystubDrawerRunId(null)}
        runId={paystubDrawerRunId}
      />

      {busy && <LoadingScreen message={busyMsg || "Working..."} overlay />}
    </>
  );
}
