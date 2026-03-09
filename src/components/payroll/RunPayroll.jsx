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
import { db, auth } from "../../firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import SummaryCards from "../common/SummaryCards";
import {
  cap,
  calcGross,
  inferShiftName,
  minutesBetweenTS,
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
import LoadingScreen from "../common/LoadingScreen";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import PeopleIcon from "@mui/icons-material/People";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SellIcon from "@mui/icons-material/Sell";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import PaystubDialog from "../Paystub";

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

          const start = next.overrideStart?.seconds
            ? next.overrideStart
            : next.overrideStart
              ? Timestamp.fromDate(new Date(next.overrideStart))
              : next.start;

          const end = next.overrideEnd?.seconds
            ? next.overrideEnd
            : next.overrideEnd
              ? Timestamp.fromDate(new Date(next.overrideEnd))
              : next.end || next.overrideEnd;

          next.minutesUsed = next.excluded ? 0 : minutesBetweenTS(start, end);
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

      updateBusy("Querying shifts and transactions...");
      const [sSnap, adminSnap] = await Promise.all([
        getDocs(query(
          collection(db, "shifts"),
          where("startTime", ">=", start),
          where("startTime", "<=", end)
        )),
        getDocs(query(
          collection(db, "transactions"),
          where("timestamp", ">=", start),
          where("timestamp", "<=", end)
        )),
      ]);

      const rawShifts = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const ongoing = rawShifts.filter((s) => !s.endTime);

      if (ongoing.length > 0 && decision === null) {
        setOngoingPrompt({ open: true, shifts: ongoing });
        stopBusy();
        return;
      }

      const shiftsToProcess = rawShifts.filter((s) => {
        if (s.endTime) return true;
        if (decision === "include") return true;
        return false;
      });

      if (shiftsToProcess.length === 0) {
        showSnackbar("No eligible shifts found in this period.", "info");
        stopBusy();
        return;
      }

      updateBusy("Processing shifts...");

      const byStaff = new Map();
      const shiftsById = new Map();

      shiftsToProcess.forEach((s) => {
        if (!s.startTime) return;
        const email = s.staffEmail || "unknown";
        const isOngoing = !s.endTime;
        const effectiveEnd = isOngoing ? Timestamp.now() : s.endTime;
        const overrideEnd = isOngoing ? effectiveEnd : null;
        const minutes = minutesBetweenTS(s.startTime, effectiveEnd);
        const shortage = shortageForShift(s);

        const row = {
          id: s.id,
          start: s.startTime,
          end: s.endTime || null,
          title: s.title || s.shiftTitle || null,
          label: s.label || null,
          overrideStart: null,
          overrideEnd: overrideEnd,
          isOngoing: isOngoing,
          excluded: false,
          minutesOriginal: minutes,
          minutesUsed: minutes,
          shortage,
          denominations: s.denominations || {},
          systemTotal: Number(s.systemTotal || 0),
          staffUid: s.staffUid || null,
          staffName: s.staffName || s.staffFullName || email,
          staffEmail: email,
          expenseDate: null,
        };
        shiftsById.set(s.id, row);

        const bucket = byStaff.get(email) || {
          staffUid: s.staffUid || null,
          staffName: row.staffName,
          staffEmail: email,
          minutes: 0,
          shiftRows: [],
          extraAdvances: [],
        };
        bucket.minutes += minutes;
        bucket.shiftRows.push(row);
        byStaff.set(email, bucket);
      });

      updateBusy("Fetching staff records and salary advances...");
      const shiftRows = Array.from(shiftsById.values());
      const [usersSnap, ...advanceSnaps] = await Promise.all([
        getDocs(query(collection(db, "users"), where("role", "==", "staff"))),
        ...shiftRows.map((row) =>
          getDocs(query(
            collection(db, "transactions"),
            where("expenseType", "==", "Salary Advance"),
            where("shiftId", "==", row.id)
          ))
        ),
      ]);

      const usersByEmail = new Map();
      usersSnap.forEach((u) => {
        const v = u.data() || {};
        usersByEmail.set(v.email, {
          uid: u.id,
          name: v.fullName || v.name || v.email,
          payroll: v.payroll || null,
        });
      });

      const extraAdvancesByStaff = new Map();

      shiftRows.forEach((row, idx) => {
        const advSnap = advanceSnaps[idx];
        let ownerAdvance = 0;
        const ownerAdvanceRefs = [];
        advSnap.docs.forEach((advDoc) => {
          const tx = advDoc.data() || {};
          if (tx.voided) return;
          const amt = Number(tx.total || 0);
          const targetEmail = tx.expenseStaffEmail || tx.staffEmail || null;
          const targetUid = tx.expenseStaffId || tx.staffUid || null;
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
                tx.expenseStaffName ||
                usersByEmail.get(targetEmail || "")?.name ||
                targetEmail ||
                "Unknown Staff",
              total: 0,
              details: [],
            };
            existing.total += amt;
            existing.details.push({
              id: advDoc.id,
              label: `Salary Advance (recorded on ${shiftLabel})`,
              amount: amt,
              fromShiftId: row.id,
            });
            extraAdvancesByStaff.set(key, existing);
          } else {
            ownerAdvance += amt;
            ownerAdvanceRefs.push(advDoc.id);
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

      adminSnap.docs.forEach((docSnap) => {
        const tx = docSnap.data();
        if (tx.voided || tx.isDeleted) return;
        if (tx.expenseType !== "Salary Advance") return;
        if (tx.shiftId) return;

        const amt = Number(tx.total || 0);
        const staffEmail = tx.expenseStaffEmail || tx.staffEmail;
        const staffUid = tx.expenseStaffId;

        let key = staffEmail;
        if (!key && staffUid) {
          const userObj = Array.from(usersByEmail.values()).find((u) => u.uid === staffUid);
          key = userObj ? userObj.email : `uid:${staffUid}`;
        }
        if (!key) return;

        if (!byStaff.has(key)) {
          const name = tx.expenseStaffName || (usersByEmail.get(key)?.name) || "Unknown Staff";
          byStaff.set(key, {
            staffUid: staffUid || null,
            staffName: name,
            staffEmail: staffEmail || key,
            minutes: 0,
            shiftRows: [],
            extraAdvances: [],
          });
        }

        const bucket = byStaff.get(key);
        bucket.extraAdvances.push({
          id: docSnap.id,
          label: `${tx.expenseType} (Admin Manual - ${fmtDate(tx.timestamp)})`,
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

    startBusy("Loading selected payroll run...");

    try {
      const runRef = doc(db, "payrollRuns", id);
      const runDoc = await getDoc(runRef);
      if (!runDoc.exists()) {
        showSnackbar("That payroll run does not exist anymore.", "error");
        return;
      }
      const run = runDoc.data() || {};
      setRunId(id);
      setStatus(run.status || "draft");
      setPeriodStart(run.periodStart?.seconds ? toYMD_PHT_fromTS(run.periodStart) : "");
      setPeriodEnd(run.periodEnd?.seconds ? toYMD_PHT_fromTS(run.periodEnd) : "");
      setPayDate(run.payDate?.seconds ? toYMD_PHT_fromTS(run.payDate) : todayYMD_PHT());
      setExpenseMode(run.expenseMode || "per-staff");

      updateBusy("Loading run lines...");
      const linesSnap = await getDocs(collection(runRef, "lines"));

      const out = await Promise.all(linesSnap.docs.map(async (ld) => {
        const l = ld.data() || {};
        const lineId = ld.id;
        const shiftIds = l.source?.shiftIds || [];

        const [overSnap, ...shiftAndAdvResults] = await Promise.all([
          getDocs(collection(runRef, `lines/${lineId}/shifts`)),
          ...shiftIds.map((sid) => getDoc(doc(db, "shifts", sid))),
          ...shiftIds.map((sid) =>
            getDocs(query(
              collection(db, "transactions"),
              where("expenseType", "==", "Salary Advance"),
              where("shiftId", "==", sid)
            ))
          ),
        ]);

        const shiftDocs = shiftAndAdvResults.slice(0, shiftIds.length);
        const advanceSnaps = shiftAndAdvResults.slice(shiftIds.length);

        const overrides = new Map();
        overSnap.forEach((od) => {
          const v = od.data() || {};
          overrides.set(v.shiftId, v);
        });

        const shiftRows = [];
        for (let i = 0; i < shiftIds.length; i++) {
          const sid = shiftIds[i];
          const sDoc = shiftDocs[i];
          if (!sDoc.exists()) continue;
          const s = sDoc.data() || {};
          const ov = overrides.get(sid) || {};

          const isOngoing = !s.endTime;
          const start = ov.overrideStart || s.startTime;
          const end = ov.overrideEnd || s.endTime || (isOngoing ? Timestamp.now() : null);

          const minutesOriginal = minutesBetweenTS(s.startTime, s.endTime || Timestamp.now());
          const minutesUsed = ov.excluded
            ? 0
            : ov.minutesUsed != null
              ? ov.minutesUsed
              : minutesBetweenTS(start, end);

          const row = {
            id: sid,
            start: s.startTime,
            end: s.endTime || null,
            title: s.title || s.shiftTitle || null,
            label: s.label || null,
            overrideStart: ov.overrideStart || null,
            overrideEnd: ov.overrideEnd || null,
            isOngoing: isOngoing,
            excluded: !!ov.excluded,
            minutesOriginal,
            minutesUsed,
            shortage: shortageForShift(s),
            denominations: s.denominations || {},
            systemTotal: Number(s.systemTotal || 0),
            staffUid: l.staffUid || null,
            staffName: l.staffName || s.staffName || s.staffFullName || l.staffEmail,
            staffEmail: l.staffEmail || s.staffEmail,
            expenseDate: ov.expenseDate || null,
          };

          const advSnap = advanceSnaps[i];
          let ownerAdvance = 0;
          const ownerAdvanceRefs = [];
          advSnap.docs.forEach((ad) => {
            const tx = ad.data() || {};
            if (tx.voided) return;
            const amt = Number(tx.total || 0);
            const targetEmail = tx.expenseStaffEmail || tx.staffEmail || row.staffEmail;
            const targetUid = tx.expenseStaffId || tx.staffUid || row.staffUid;
            const isForThisStaff =
              (l.staffEmail && targetEmail === l.staffEmail) ||
              (l.staffUid && targetUid === l.staffUid) ||
              (!tx.expenseStaffEmail && !tx.expenseStaffId);
            if (isForThisStaff) {
              ownerAdvance += amt;
              ownerAdvanceRefs.push(ad.id);
            }
          });
          row.advance = ownerAdvance;
          row.advanceRefs = ownerAdvanceRefs;

          shiftRows.push(row);
        }

        const manualAdjustments = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "manual-deduction")
          : [];
        const manualAdditions = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "manual-addition")
          : [];
        const extraAdvAdjustments = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "extra-advance")
          : [];

        const rate = Number(l.rate || 0);
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
          staffUid: l.staffUid || null,
          staffEmail: l.staffEmail,
          staffName: l.staffName,
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
    if (!id) {
      showSnackbar("No payroll run selected.", "warning");
      return;
    }
    if (withLoader) startBusy("Saving payroll changes...");

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "payrollRuns", id), {
        payDate: tsFromYMD(payDate, false),
        expenseMode: expenseMode,
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
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "admin",
      });

      for (const line of preview) {
        batch.set(doc(db, `payrollRuns/${id}/lines/${line.id}`), {
          staffUid: line.staffUid || null,
          staffEmail: line.staffEmail,
          staffName: line.staffName,
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
          isEdited: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || user?.uid || "admin",
        });
      }

      const overSnaps = await Promise.all(
        preview.map((line) =>
          getDocs(collection(db, "payrollRuns", id, "lines", line.id, "shifts"))
        )
      );

      preview.forEach((line, lineIdx) => {
        overSnaps[lineIdx].forEach((o) => batch.delete(o.ref));
        for (const r of line.shiftRows) {
          if (r.excluded || r.overrideStart || r.overrideEnd || r.expenseDate || r.isOngoing) {
            batch.set(
              doc(db, "payrollRuns", id, "lines", line.id, "shifts", r.id),
              {
                shiftId: r.id,
                originalStart: r.start,
                originalEnd: r.end || null,
                overrideStart: r.overrideStart
                  ? r.overrideStart.seconds
                    ? r.overrideStart
                    : Timestamp.fromDate(new Date(r.overrideStart))
                  : null,
                overrideEnd: r.overrideEnd
                  ? r.overrideEnd.seconds
                    ? r.overrideEnd
                    : Timestamp.fromDate(new Date(r.overrideEnd))
                  : null,
                excluded: !!r.excluded,
                minutesUsed: r.minutesUsed,
                expenseDate: r.expenseDate || null,
              }
            );
          }
        }
      });
      await batch.commit();

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
      const displayId = await generateDisplayId("payrollRuns", "PAY");
      const run = {
        displayId,
        periodStart: tsFromYMD(periodStart, false),
        periodEnd: tsFromYMD(periodEnd, true),
        status: "draft",
        expenseMode: expenseMode || "per-staff",
        payDate: tsFromYMD(payDate, false),
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
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || user?.uid || "admin",
      };
      const runRef = await addDoc(collection(db, "payrollRuns"), run);
      updateBusy("Saving line overrides...");
      await saveEditsToRun(runRef.id, { withLoader: false });
      setRunId(runRef.id);
      setStatus("draft");
      return runRef.id;
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
      const runRef = doc(db, "payrollRuns", id);
      const runDoc = await getDoc(runRef);
      const runData = runDoc.data() || {};

      updateBusy("Loading run lines...");
      const linesSnap = await getDocs(collection(runRef, "lines"));

      const txBatch = writeBatch(db);

      updateBusy("Voiding existing payroll transactions...");
      const existingTx = await getDocs(
        query(
          collection(db, "transactions"),
          where("payrollRunId", "==", id),
          where("voided", "==", false)
        )
      );
      existingTx.docs.forEach((t) => txBatch.update(t.ref, { voided: true }));

      updateBusy("Cleaning up old paystubs...");
      const oldStubs = await getDocs(collection(runRef, "paystubs"));
      oldStubs.docs.forEach((s) => txBatch.delete(s.ref));

      const lineIdByUid = new Map();
      const lineIdByEmail = new Map();
      linesSnap.docs.forEach((ld) => {
        const l = ld.data() || {};
        if (l.staffUid) lineIdByUid.set(l.staffUid, ld.id);
        if (l.staffEmail) lineIdByEmail.set(l.staffEmail, ld.id);
      });

      const extraDeductionsByLineId = new Map();
      const materializedLines = [];
      const pendingTransactions = [];

      const periodStartTS = runData.periodStart;
      const periodEndTS = runData.periodEnd;

      const runPayDateTS =
        runData.payDate || tsFromYMD(payDate, false) || Timestamp.now();
      const runPayDate = runPayDateTS.seconds
        ? new Date(runPayDateTS.seconds * 1000)
        : new Date();


      updateBusy("Expanding each line to shift-level data...");

      const linesFetchData = await Promise.all(linesSnap.docs.map(async (ld) => {
        const l = ld.data() || {};
        const lineId = ld.id;
        const shiftIds = l.source?.shiftIds || [];

        const [overSnap, ...shiftAndAdvResults] = await Promise.all([
          getDocs(collection(runRef, `lines/${lineId}/shifts`)),
          ...shiftIds.map((sid) => getDoc(doc(db, "shifts", sid))),
          ...shiftIds.map((sid) =>
            getDocs(query(
              collection(db, "transactions"),
              where("expenseType", "==", "Salary Advance"),
              where("shiftId", "==", sid)
            ))
          ),
        ]);

        return {
          ld,
          l,
          lineId,
          shiftIds,
          overSnap,
          shiftDocs: shiftAndAdvResults.slice(0, shiftIds.length),
          advanceSnaps: shiftAndAdvResults.slice(shiftIds.length),
        };
      }));

      for (const { ld, l, lineId, shiftIds, overSnap, shiftDocs, advanceSnaps } of linesFetchData) {
        const overrides = new Map();
        overSnap.forEach((od) => {
          const v = od.data() || {};
          overrides.set(v.shiftId, v);
        });

        const shiftDetails = [];
        let totalMinutesLine = 0;
        let totalAdvancesLine = 0;
        let totalShortagesLine = 0;

        for (let _si = 0; _si < shiftIds.length; _si++) {
          const sid = shiftIds[_si];
          const sDoc = shiftDocs[_si];
          if (!sDoc.exists()) continue;
          const s = sDoc.data() || {};

          const ov = overrides.get(sid) || {};
          if (ov.excluded) continue;

          const start = ov.overrideStart || s.startTime;
          const end = ov.overrideEnd || s.endTime;

          const minutesUsed =
            ov.minutesUsed != null
              ? ov.minutesUsed
              : minutesBetweenTS(start, end);

          const shiftLabel = `${fmtDate(s.startTime)} (${inferShiftName(s.startTime, s.title, s.label)})`;

          const expenseDateTS =
            ov.expenseDate || s.startTime || runData.payDate || Timestamp.fromDate(runPayDate);

          const shortageAmount = shortageForShift(s);
          if (shortageAmount > 0) {
            totalShortagesLine += shortageAmount;
          }

          const advSnap = advanceSnaps[_si];
          let advancesForThisShiftForThisStaff = 0;

          for (const advDoc of advSnap.docs) {
            const tx = advDoc.data() || {};
            if (tx.voided) continue;
            const amt = Number(tx.total || 0);
            const intendedEmail = tx.expenseStaffEmail || tx.staffEmail || null;
            const intendedUid = tx.expenseStaffId || tx.staffUid || null;

            const isForThisLine =
              (!!l.staffUid && intendedUid === l.staffUid) ||
              (!!l.staffEmail && intendedEmail === l.staffEmail) ||
              (!intendedEmail && !intendedUid && s.staffEmail === l.staffEmail);

            if (isForThisLine) {
              advancesForThisShiftForThisStaff += amt;
            } else {
              const targetLineId =
                (intendedUid && lineIdByUid.get(intendedUid)) ||
                (intendedEmail && lineIdByEmail.get(intendedEmail)) ||
                null;
              const key = targetLineId || lineId;
              const list = extraDeductionsByLineId.get(key) || [];
              list.push({
                id: sid,
                label: `Salary Advance on ${shiftLabel}`,
                amount: amt,
                expenseDate: expenseDateTS,
              });
              extraDeductionsByLineId.set(key, list);
            }
          }

          totalAdvancesLine += advancesForThisShiftForThisStaff;

          shiftDetails.push({
            id: sid,
            label: shiftLabel,
            hours: toHours(minutesUsed),
            minutes: minutesUsed,
            startTime: start,
            endTime: end,
            expenseDate: expenseDateTS,
            advances: advancesForThisShiftForThisStaff,
            shortages: shortageAmount,
          });

          totalMinutesLine += minutesUsed;

          txBatch.update(doc(db, "shifts", sid), { payrollRunId: id });
        }

        const grossPay = calcGross(totalMinutesLine, l.rate);

        const manualAdjustments = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "manual-deduction")
          : [];
        const manualTotal = manualAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

        const manualAdditions = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "manual-addition")
          : [];
        const additionTotal = manualAdditions.reduce((s, a) => s + Number(a.amount || 0), 0);

        materializedLines.push({
          lineId,
          staffUid: l.staffUid,
          staffEmail: l.staffEmail,
          staffName: l.staffName,
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
      const startTS = tsFromYMD(runData.periodStart ? toYMD_PHT_fromTS(runData.periodStart) : periodStart, false);
      const endTS = tsFromYMD(runData.periodEnd ? toYMD_PHT_fromTS(runData.periodEnd) : periodEnd, true);

      const adminSnap = await getDocs(query(
        collection(db, "transactions"),
        where("timestamp", ">=", startTS),
        where("timestamp", "<=", endTS),
        where("item", "==", "Expenses")
      ));

      for (const docSnap of adminSnap.docs) {
        const tx = { id: docSnap.id, ...docSnap.data() };
        if (tx.voided || tx.isDeleted) continue;
        if (tx.expenseType !== "Salary Advance") continue;
        if (tx.shiftId) continue;

        const email = tx.expenseStaffEmail || tx.staffEmail;
        const uid = tx.expenseStaffId || tx.staffUid;
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
      }

      for (const [targetLineId, extraList] of extraDeductionsByLineId.entries()) {
        const target = materializedLines.find((m) => m.lineId === targetLineId);
        if (target) {
          const current = target.crossDeductions || [];
          target.crossDeductions = [...current, ...extraList];
        }
      }

      updateBusy("Writing paystubs and posting salary expenses...");
      let runTotals = { staffCount: 0, minutes: 0, gross: 0, additions: 0, advances: 0, shortages: 0, otherDeductions: 0, net: 0 };

      const expenseModeToUse = runData.expenseMode || "per-staff";

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

        const paystubData = {
          staffUid: m.staffUid,
          staffEmail: m.staffEmail,
          staffName: m.staffName,
          periodStart: periodStartTS,
          periodEnd: periodEndTS,
          payDate: runPayDateTS,
          shifts: shiftsForStub,
          deductionItems,
          additionItems,
          totalHours: toHours(m.totalMinutes),
          grossPay: m.grossPay,
          totalAdditions: m.additionTotal,
          totalDeductions: Number(totalDeductions.toFixed(2)),
          netPay,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "admin",
        };

        txBatch.set(doc(collection(runRef, "paystubs")), paystubData);

        if (m.additionTotal > 0 && expenseModeToUse === "per-shift") {
          pendingTransactions.push({
            item: "Expenses",
            expenseType: "Salary",
            expenseStaffId: m.staffUid,
            expenseStaffName: m.staffName,
            expenseStaffEmail: m.staffEmail,
            quantity: 1,
            price: m.additionTotal,
            total: m.additionTotal,
            notes: `Payroll Additions/Bonuses [${toYMD_PHT_fromTS(periodStartTS)} — ${toYMD_PHT_fromTS(periodEndTS)}]`,
            shiftId: null,
            source: `payroll_run:${id}`,
            payrollRunId: id,
            voided: false,
            timestamp: runPayDateTS,
            staffEmail: auth.currentUser?.email || "admin",
            isDeleted: false,
            isEdited: false,
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

            pendingTransactions.push({
              item: "Expenses",
              expenseType: "Salary",
              expenseStaffId: m.staffUid,
              expenseStaffName: m.staffName,
              expenseStaffEmail: m.staffEmail,
              quantity: 1,
              price: shiftNet,
              total: shiftNet,
              notes: `Payroll [${toYMD_PHT_fromTS(periodStartTS)} — ${toYMD_PHT_fromTS(periodEndTS)}] | Shift: ${s.label} | Gross: ${peso(shiftGross)} | Net: ${peso(shiftNet)}`,
              shiftId: null,
              source: `payroll_run:${id}`,
              payrollRunId: id,
              voided: false,
              timestamp: s.expenseDate || runPayDateTS,
              staffEmail: auth.currentUser?.email || "admin",
              isDeleted: false,
              isEdited: false,
            });
          });

          const nonShiftDeds = deductionItems.filter((d) => !m.shifts.find((s) => s.id === d.id));
          if (nonShiftDeds.length) {
            const extraTotal = nonShiftDeds.reduce((s, d) => s + Number(d.amount || 0), 0);
            if (extraTotal > 0) {
              pendingTransactions.push({
                item: "Expenses",
                expenseType: "Salary",
                expenseStaffId: m.staffUid,
                expenseStaffName: m.staffName,
                expenseStaffEmail: m.staffEmail,
                quantity: 1,
                price: extraTotal * -1,
                total: extraTotal * -1,
                notes: `Payroll manual / cross-staff deductions [${toYMD_PHT_fromTS(periodStartTS)} — ${toYMD_PHT_fromTS(periodEndTS)}]`,
                shiftId: null,
                source: `payroll_run:${id}`,
                payrollRunId: id,
                voided: false,
                timestamp: runPayDateTS,
                staffEmail: auth.currentUser?.email || "admin",
                isDeleted: false,
                isEdited: false,
              });
            }
          }
        } else {
          pendingTransactions.push({
            item: "Expenses",
            expenseType: "Salary",
            expenseStaffId: m.staffUid,
            expenseStaffName: m.staffName,
            expenseStaffEmail: m.staffEmail,
            quantity: 1,
            price: netPay,
            total: netPay,
            notes: `Payroll [${toYMD_PHT_fromTS(periodStartTS)} — ${toYMD_PHT_fromTS(periodEndTS)}] | Gross: ${peso(m.grossPay)} | Adds: ${peso(m.additionTotal)} | Net: ${peso(netPay)}`,
            shiftId: null,
            source: `payroll_run:${id}`,
            payrollRunId: id,
            voided: false,
            timestamp: runPayDateTS,
            staffEmail: auth.currentUser?.email || "admin",
            isDeleted: false,
            isEdited: false,
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

      if (pendingTransactions.length > 0) {
        updateBusy(`Generating IDs for ${pendingTransactions.length} expenses...`);
        const expIds = await generateBatchIds("expenses", "EXP", pendingTransactions.length);
        pendingTransactions.forEach((tx, idx) => {
          const newRef = doc(collection(db, "transactions"));
          tx.displayId = expIds[idx];
          txBatch.set(newRef, tx);
        });
      }

      updateBusy("Updating run status...");
      txBatch.update(runRef, {
        status: "posted",
        updatedAt: serverTimestamp(),
        totals: runTotals,
        expenseMode: expenseModeToUse,
      });

      await txBatch.commit();

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
                                        : r.expenseDate?.seconds
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
