// src/components/payroll/RunPayroll.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Backdrop,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { db, auth } from "../../firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import RunDialog from "./RunDialog";
import StatChip from "./StatChip";
import {
  cap,
  inferShiftName,
  minutesBetweenTS,
  peso,
  resolveHourlyRate,
  shortageForShift,
  toHours,
  toLocaleDateStringPHT,
  toYMD_PHT_fromTS,
  todayYMD_PHT,
  tsFromYMD,
} from "../../utils/payrollHelpers";

export default function RunPayroll({
  user,
  openRunId,
  openDialogAfterLoad,
  onOpenedFromHistory,
  onOpenPaystubs,
  requestOpenDialogRef,
}) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(() => todayYMD_PHT());
  const [expenseMode, setExpenseMode] = useState("per-staff");
  const [preview, setPreview] = useState([]);
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState("draft");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContext, setDialogContext] = useState("preview");

  // loader
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");

  // in-app dialogs
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [feedback, setFeedback] = useState({
    open: false,
    title: "",
    message: "",
  });

  const openFeedback = (title, message) =>
    setFeedback({ open: true, title, message });
  const closeFeedback = () =>
    setFeedback((p) => ({ ...p, open: false, message: "" }));

  const startBusy = (msg = "Working...") => {
    setBusy(true);
    setBusyMsg(msg);
  };
  const updateBusy = (msg) => setBusyMsg(msg);
  const stopBusy = () => {
    setBusy(false);
    setBusyMsg("");
  };

  const calcGross = (minutes, rate) =>
    Number((((Number(minutes || 0) / 60) * Number(rate || 0))).toFixed(2));

  // allow parent to open dialog
  useEffect(() => {
    if (requestOpenDialogRef) {
      requestOpenDialogRef.current = () => {
        if (runId || preview.length) {
          setDialogContext(runId ? "existing" : "preview");
          setDialogOpen(true);
        }
      };
    }
  }, [requestOpenDialogRef, runId, preview.length]);

  /** ----------------- generate preview from shifts ----------------- */
  const generatePreview = async () => {
    if (!periodStart || !periodEnd) {
      openFeedback("Select period", "Pick a start and end date first.");
      return;
    }

    startBusy("Loading shifts for the selected pay period...");

    try {
      const start = tsFromYMD(periodStart, false);
      const end = tsFromYMD(periodEnd, true);

      updateBusy("Querying shifts from Firestore...");
      const qShifts = query(
        collection(db, "shifts"),
        where("startTime", ">=", start),
        where("startTime", "<=", end)
      );
      const sSnap = await getDocs(qShifts);

      const byStaff = new Map();
      const shiftsById = new Map();

      sSnap.forEach((d) => {
        const s = d.data() || {};
        if (!s.startTime || !s.endTime) return;
        const email = s.staffEmail || "unknown";
        const minutes = minutesBetweenTS(s.startTime, s.endTime);
        const shortage = shortageForShift(s);
        const row = {
          id: d.id,
          start: s.startTime,
          end: s.endTime,
          title: s.title || s.shiftTitle || null,
          label: s.label || null,
          overrideStart: null,
          overrideEnd: null,
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
        shiftsById.set(d.id, row);
        const bucket =
          byStaff.get(email) || {
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

      updateBusy("Fetching staff records...");
      const usersSnap = await getDocs(
        query(collection(db, "users"), where("role", "==", "staff"))
      );
      const usersByEmail = new Map();
      usersSnap.forEach((u) => {
        const v = u.data() || {};
        usersByEmail.set(v.email, {
          uid: u.id,
          name: v.fullName || v.name || v.email,
          payroll: v.payroll || null,
        });
      });

      // extra advances (for other staff)
      updateBusy("Analyzing salary advances per shift...");
      const extraAdvancesByStaff = new Map();

      for (const row of shiftsById.values()) {
        const advQ = query(
          collection(db, "transactions"),
          where("expenseType", "==", "Salary Advance"),
          where("shiftId", "==", row.id)
        );
        const advSnap = await getDocs(advQ);

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

          const shiftLabel = `${inferShiftName(
            row.start,
            row.title,
            row.label
          )} — ${toLocaleDateStringPHT(row.start)}`;

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
      }

      // attach “foreign” advances
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
          bucket.extraAdvances = (bucket.extraAdvances || []).concat(
            info.details
          );
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
        const net = Number(
          (gross - advancesFromShifts - shortages - otherDeductions).toFixed(2)
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
          net,
          shiftRows: bucket.shiftRows,
          extraAdvances: bucket.extraAdvances || [],
          customDeductions: [],
        });
      }

      setRunId(null);
      setStatus("draft");
      setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
      setDialogContext("preview");
      setDialogOpen(true);
    } catch (err) {
      console.error(err);
      openFeedback(
        "Generate failed",
        "Failed to generate payroll preview. Check console for details."
      );
    } finally {
      stopBusy();
    }
  };

  /** ----------------- load existing run ----------------- */
  const loadRun = async (id) => {
    if (!id) {
      setRunId(null);
      setPreview([]);
      return;
    }

    startBusy("Loading selected payroll run...");

    try {
      const runRef = doc(db, "payrollRuns", id);
      const runDoc = await getDoc(runRef);
      if (!runDoc.exists()) {
        openFeedback("Not found", "That payroll run does not exist anymore.");
        return;
      }
      const run = runDoc.data() || {};
      setRunId(id);
      setStatus(run.status || "draft");
      setPeriodStart(
        run.periodStart?.seconds ? toYMD_PHT_fromTS(run.periodStart) : ""
      );
      setPeriodEnd(
        run.periodEnd?.seconds ? toYMD_PHT_fromTS(run.periodEnd) : ""
      );
      setPayDate(
        run.payDate?.seconds ? toYMD_PHT_fromTS(run.payDate) : todayYMD_PHT()
      );
      setExpenseMode(run.expenseMode || "per-staff");

      updateBusy("Loading run lines...");
      const linesSnap = await getDocs(collection(runRef, "lines"));
      const out = [];
      for (const ld of linesSnap.docs) {
        const l = ld.data() || {};
        const lineId = ld.id;
        const overSnap = await getDocs(
          collection(runRef, `lines/${lineId}/shifts`)
        );
        const overrides = new Map();
        overSnap.forEach((od) => {
          const v = od.data() || {};
          overrides.set(v.shiftId, v);
        });

        const shiftRows = [];
        for (const sid of l.source?.shiftIds || []) {
          const sDoc = await getDoc(doc(db, "shifts", sid));
          if (!sDoc.exists()) continue;
          const s = sDoc.data() || {};
          const ov = overrides.get(sid) || {};
          const start = ov.overrideStart || s.startTime;
          const end = ov.overrideEnd || s.endTime;
          const minutesOriginal = minutesBetweenTS(s.startTime, s.endTime);
          const minutesUsed = ov.excluded
            ? 0
            : ov.minutesUsed != null
            ? ov.minutesUsed
            : minutesBetweenTS(start, end);
          const row = {
            id: sid,
            start: s.startTime,
            end: s.endTime,
            title: s.title || s.shiftTitle || null,
            label: s.label || null,
            overrideStart: ov.overrideStart || null,
            overrideEnd: ov.overrideEnd || null,
            excluded: !!ov.excluded,
            minutesOriginal,
            minutesUsed,
            shortage: shortageForShift(s),
            denominations: s.denominations || {},
            systemTotal: Number(s.systemTotal || 0),
            staffUid: l.staffUid || null,
            staffName:
              l.staffName || s.staffName || s.staffFullName || l.staffEmail,
            staffEmail: l.staffEmail || s.staffEmail,
            expenseDate: ov.expenseDate || null,
          };

          // re-attach salary advances
          const advQ = query(
            collection(db, "transactions"),
            where("expenseType", "==", "Salary Advance"),
            where("shiftId", "==", sid)
          );
          const advSnap = await getDocs(advQ);
          let ownerAdvance = 0;
          const ownerAdvanceRefs = [];
          advSnap.docs.forEach((ad) => {
            const tx = ad.data() || {};
            if (tx.voided) return;
            const amt = Number(tx.total || 0);
            const targetEmail =
              tx.expenseStaffEmail || tx.staffEmail || row.staffEmail;
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
        const extraAdvTotal = extraAdvAdjustments.reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );
        const manualTotal = manualAdjustments.reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );
        const otherDeductions = Number((extraAdvTotal + manualTotal).toFixed(2));
        const net = Number(
          (gross - advances - shortages - otherDeductions).toFixed(2)
        );
        out.push({
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
        });
      }
      setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
    } catch (err) {
      console.error(err);
      openFeedback("Load failed", "Failed to load that payroll run.");
    } finally {
      stopBusy();
    }
  };

  // auto-load when coming from history
  useEffect(() => {
    if (openRunId) {
      loadRun(openRunId).then(() => {
        if (openDialogAfterLoad) {
          setDialogContext("existing");
          setDialogOpen(true);
          onOpenedFromHistory && onOpenedFromHistory();
        }
      });
    }
  }, [openRunId, openDialogAfterLoad, onOpenedFromHistory]);

  /** ----------------- save edits ----------------- */
  const saveEditsToRun = async (id = runId, { withLoader = true } = {}) => {
    if (!id) {
      openFeedback("Nothing to save", "No payroll run selected.");
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
          gross: Number(
            preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)
          ),
          advances: Number(
            preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)
          ),
          shortages: Number(
            preview
              .reduce((s, l) => s + Number(l.shortages || 0), 0)
              .toFixed(2)
          ),
          otherDeductions: Number(
            preview
              .reduce((s, l) => s + Number(l.otherDeductions || 0), 0)
              .toFixed(2)
          ),
          net: Number(
            preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)
          ),
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
              id: d.id || `manual-${idx}`,
              type: "manual-deduction",
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

        // clear previous overrides
        const overSnap = await getDocs(
          collection(db, "payrollRuns", id, "lines", line.id, "shifts")
        );
        overSnap.forEach((o) => batch.delete(o.ref));

        for (const r of line.shiftRows) {
          if (r.excluded || r.overrideStart || r.overrideEnd || r.expenseDate) {
            batch.set(
              doc(db, "payrollRuns", id, "lines", line.id, "shifts", r.id),
              {
                shiftId: r.id,
                originalStart: r.start,
                originalEnd: r.end,
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
      }
      await batch.commit();

      if (withLoader) {
        openFeedback("Saved", "Payroll changes were saved.");
      }
    } catch (err) {
      console.error(err);
      openFeedback("Save failed", "Failed to save payroll run.");
    } finally {
      if (withLoader) stopBusy();
    }
  };

  /** ----------------- create run ----------------- */
  const createRunInternal = async () => {
    startBusy("Creating new payroll run doc...");

    try {
      const run = {
        periodStart: tsFromYMD(periodStart, false),
        periodEnd: tsFromYMD(periodEnd, true),
        status: "draft",
        expenseMode: expenseMode || "per-staff",
        payDate: tsFromYMD(payDate, false),
        totals: {
          staffCount: preview.length,
          minutes: preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
          gross: Number(
            preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)
          ),
          advances: Number(
            preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)
          ),
          shortages: Number(
            preview
              .reduce((s, l) => s + Number(l.shortages || 0), 0)
              .toFixed(2)
          ),
          otherDeductions: Number(
            preview
              .reduce((s, l) => s + Number(l.otherDeductions || 0), 0)
              .toFixed(2)
          ),
          net: Number(
            preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)
          ),
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
      openFeedback("Create failed", "Failed to create payroll run.");
      return null;
    } finally {
      stopBusy();
    }
  };

  const onCreateRun = async () => {
    const id = await createRunInternal();
    if (id) {
      setDialogContext("existing");
      setDialogOpen(true);
      openFeedback("Run created", "New payroll run has been created.");
    }
  };

  const onCreateAndFinalize = async () => {
    const id = await createRunInternal();
    if (id) {
      setConfirmFinalizeOpen(true);
    }
  };

  /** ----------------- finalize run (post tx + paystubs) ----------------- */
  const finalizeRun = async (id = runId) => {
    if (!id) {
      openFeedback("No run", "There is no payroll run to finalize.");
      return;
    }

    startBusy("Saving latest edits before posting...");

    try {
      // 0. make sure run and lines are saved as-is
      await saveEditsToRun(id, { withLoader: false });

      updateBusy("Fetching run data...");
      const runRef = doc(db, "payrollRuns", id); // <-- declared ONCE here
      const runDoc = await getDoc(runRef);
      const runData = runDoc.data() || {};

      updateBusy("Loading run lines...");
      const linesSnap = await getDocs(collection(runRef, "lines"));

      // we'll do everything in one big batch
      const txBatch = writeBatch(db);

      // 1) void existing salary transactions for this run
      updateBusy("Voiding existing payroll transactions...");
      const existingTx = await getDocs(
        query(
          collection(db, "transactions"),
          where("payrollRunId", "==", id),
          where("voided", "==", false)
        )
      );
      existingTx.docs.forEach((t) => txBatch.update(t.ref, { voided: true }));

      // 2) lookups for cross-staff salary advances
      const lineIdByUid = new Map();
      const lineIdByEmail = new Map();
      linesSnap.docs.forEach((ld) => {
        const l = ld.data() || {};
        if (l.staffUid) lineIdByUid.set(l.staffUid, ld.id);
        if (l.staffEmail) lineIdByEmail.set(l.staffEmail, ld.id);
      });

      const extraDeductionsByLineId = new Map();
      const materializedLines = [];

      const periodStartTS = runData.periodStart;
      const periodEndTS = runData.periodEnd;

      const runPayDateTS =
        runData.payDate || tsFromYMD(payDate, false) || Timestamp.now();
      const runPayDate = runPayDateTS.seconds
        ? new Date(runPayDateTS.seconds * 1000)
        : new Date();

      const calcGrossLocal = (minutes, rate) =>
        Number((((Number(minutes || 0) / 60) * Number(rate || 0))).toFixed(2));

      updateBusy("Expanding each line to shift-level data...");
      for (const ld of linesSnap.docs) {
        const l = ld.data() || {};
        const lineId = ld.id;

        const overSnap = await getDocs(
          collection(runRef, `lines/${lineId}/shifts`)
        );
        const overrides = new Map();
        overSnap.forEach((od) => {
          const v = od.data() || {};
          overrides.set(v.shiftId, v);
        });

        const shiftDetails = [];
        let totalMinutes = 0;
        let totalAdvances = 0;
        let totalShortages = 0;

        for (const sid of l.source?.shiftIds || []) {
          const sDoc = await getDoc(doc(db, "shifts", sid));
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

          const shiftLabel = `${toLocaleDateStringPHT(
            s.startTime
          )} (${inferShiftName(s.startTime, s.title, s.label)})`;

          const expenseDateTS =
            ov.expenseDate ||
            s.startTime ||
            runData.payDate ||
            Timestamp.fromDate(runPayDate);

          const shortageAmount = shortageForShift(s);
          if (shortageAmount > 0) {
            totalShortages += shortageAmount;
          }

          const advSnap = await getDocs(
            query(
              collection(db, "transactions"),
              where("expenseType", "==", "Salary Advance"),
              where("shiftId", "==", sid)
            )
          );
          let advancesForThisShiftForThisStaff = 0;

          for (const advDoc of advSnap.docs) {
            const tx = advDoc.data() || {};
            if (tx.voided) continue;
            const amt = Number(tx.total || 0);
            const intendedEmail = tx.expenseStaffEmail || tx.staffEmail || null;
            const intendedUid = tx.expenseStaffId || tx.staffUid || null;

            const isForThisLine =
              (!!intendedUid && intendedUid === l.staffUid) ||
              (!!intendedEmail && intendedEmail === l.staffEmail) ||
              (!intendedEmail && !intendedUid);

            if (isForThisLine) {
              advancesForThisShiftForThisStaff += amt;
              totalAdvances += amt;
            } else {
              // this advance was intended for ANOTHER staff
              const targetLineId =
                (intendedUid && lineIdByUid.get(intendedUid)) ||
                (intendedEmail && lineIdByEmail.get(intendedEmail)) ||
                null;
              const list =
                extraDeductionsByLineId.get(targetLineId || lineId) || [];
              list.push({
                id: sid,
                label: `Salary Advance on ${shiftLabel}`,
                amount: amt,
                expenseDate: expenseDateTS,
              });
              extraDeductionsByLineId.set(targetLineId || lineId, list);
            }
          }

          shiftDetails.push({
            id: sid,
            label: shiftLabel,
            hours: toHours(minutesUsed),
            minutes: minutesUsed,
            expenseDate: expenseDateTS,
            advances: advancesForThisShiftForThisStaff,
            shortages: shortageAmount,
          });

          totalMinutes += minutesUsed;

          // tag shift with payrollRunId
          txBatch.update(doc(db, "shifts", sid), {
            payrollRunId: id,
          });
        }

        const grossPay = calcGrossLocal(totalMinutes, l.rate);

        const manualAdjustments = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "manual-deduction")
          : [];
        const manualTotal = manualAdjustments.reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );

        const extraAdvAdjustments = Array.isArray(l.adjustments)
          ? l.adjustments.filter((a) => a?.type === "extra-advance")
          : [];
        const extraAdvTotal = extraAdvAdjustments.reduce(
          (s, a) => s + Number(a.amount || 0),
          0
        );

        materializedLines.push({
          lineId,
          staffUid: l.staffUid,
          staffEmail: l.staffEmail,
          staffName: l.staffName,
          rate: l.rate,
          shifts: shiftDetails,
          totalMinutes,
          grossPay,
          totalAdvances,
          totalShortages,
          manualAdjustments,
          manualTotal,
          extraAdvAdjustments,
          extraAdvTotal,
        });
      }

      updateBusy("Merging cross-staff salary advances...");
      for (const [targetLineId, extraList] of extraDeductionsByLineId.entries()) {
        const target = materializedLines.find((m) => m.lineId === targetLineId);
        if (target) {
          extraList.forEach((e) => {
            target.totalAdvances += Number(e.amount || 0);
          });
          target.crossDeductions = extraList;
        }
      }

      updateBusy("Writing paystubs and posting salary expenses...");
      let runTotals = {
        staffCount: 0,
        minutes: 0,
        gross: 0,
        advances: 0,
        shortages: 0,
        otherDeductions: 0,
        net: 0,
      };

      const expenseModeToUse = runData.expenseMode || "per-staff";

      for (const m of materializedLines) {
        const deductionItems = [];

        m.shifts.forEach((s) => {
          if (s.advances > 0) {
            deductionItems.push({
              id: s.id,
              label: `Salary Advance on ${s.label}`,
              amount: s.advances,
            });
          }
          if (s.shortages > 0) {
            deductionItems.push({
              id: s.id,
              label: `Shortage on ${s.label}`,
              amount: s.shortages,
            });
          }
        });

        m.manualAdjustments.forEach((a) =>
          deductionItems.push({
            id: a.id,
            label: a.label,
            amount: Number(a.amount || 0),
          })
        );
        m.extraAdvAdjustments.forEach((a) =>
          deductionItems.push({
            id: a.id,
            label: a.label,
            amount: Number(a.amount || 0),
          })
        );
        (m.crossDeductions || []).forEach((a) =>
          deductionItems.push({
            id: a.id,
            label: a.label,
            amount: Number(a.amount || 0),
          })
        );

        const totalDeductions =
          m.totalAdvances +
          m.totalShortages +
          m.manualTotal +
          m.extraAdvTotal +
          (m.crossDeductions || []).reduce(
            (s, a) => s + Number(a.amount || 0),
            0
          );

        const netPay = Number((m.grossPay - totalDeductions).toFixed(2));

        const paystubData = {
          staffUid: m.staffUid,
          staffEmail: m.staffEmail,
          staffName: m.staffName,
          periodStart: periodStartTS,
          periodEnd: periodEndTS,
          payDate: runPayDateTS,
          shifts: m.shifts.map((s) => ({
            id: s.id,
            label: s.label,
            hours: s.hours,
          })),
          deductionItems,
          totalHours: toHours(m.totalMinutes),
          grossPay: m.grossPay,
          totalDeductions: Number(totalDeductions.toFixed(2)),
          netPay,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "admin",
        };

        txBatch.set(doc(collection(runRef, "paystubs")), paystubData);

        if (expenseModeToUse === "per-shift") {
          // per shift
          m.shifts.forEach((s) => {
            const shiftGross = Number(
              (((s.minutes || 0) / 60) * Number(m.rate || 0)).toFixed(2)
            );
            const shiftDeductions = deductionItems
              .filter((d) => d.id === s.id)
              .reduce((sum, d) => sum + Number(d.amount || 0), 0);
            const shiftNet = Number((shiftGross - shiftDeductions).toFixed(2));
            if (shiftGross === 0 && shiftDeductions === 0) return;

            txBatch.set(doc(collection(db, "transactions")), {
              item: "Expenses",
              expenseType: "Salary",
              expenseStaffId: m.staffUid,
              expenseStaffName: m.staffName,
              expenseStaffEmail: m.staffEmail,
              quantity: 1,
              price: shiftNet,
              total: shiftNet,
              notes: `Payroll [${toYMD_PHT_fromTS(
                periodStartTS
              )} — ${toYMD_PHT_fromTS(
                periodEndTS
              )}] | Shift: ${s.label} | Gross: ${peso(
                shiftGross
              )} | Net: ${peso(shiftNet)}`,
              shiftId: s.id,
              source: `payroll_run:${id}`,
              payrollRunId: id,
              voided: false,
              timestamp: s.expenseDate || runPayDateTS,
              staffEmail: auth.currentUser?.email || "admin",
              isDeleted: false,
              isEdited: false,
            });
          });

          const nonShiftDeds = deductionItems.filter(
            (d) => !m.shifts.find((s) => s.id === d.id)
          );
          if (nonShiftDeds.length) {
            const extraTotal = nonShiftDeds.reduce(
              (s, d) => s + Number(d.amount || 0),
              0
            );
            if (extraTotal > 0) {
              txBatch.set(doc(collection(db, "transactions")), {
                item: "Expenses",
                expenseType: "Salary",
                expenseStaffId: m.staffUid,
                expenseStaffName: m.staffName,
                expenseStaffEmail: m.staffEmail,
                quantity: 1,
                price: extraTotal * -1,
                total: extraTotal * -1,
                notes: `Payroll manual / cross-staff deductions [${toYMD_PHT_fromTS(
                  periodStartTS
                )} — ${toYMD_PHT_fromTS(periodEndTS)}]`,
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
          // per staff only
          txBatch.set(doc(collection(db, "transactions")), {
            item: "Expenses",
            expenseType: "Salary",
            expenseStaffId: m.staffUid,
            expenseStaffName: m.staffName,
            expenseStaffEmail: m.staffEmail,
            quantity: 1,
            price: netPay,
            total: netPay,
            notes: `Payroll [${toYMD_PHT_fromTS(
              periodStartTS
            )} — ${toYMD_PHT_fromTS(periodEndTS)}] | Gross: ${peso(
              m.grossPay
            )} | Net: ${peso(netPay)}`,
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
          advances: runTotals.advances + m.totalAdvances,
          shortages: runTotals.shortages + m.totalShortages,
          otherDeductions:
            runTotals.otherDeductions +
            m.manualTotal +
            m.extraAdvTotal +
            (m.crossDeductions || []).reduce(
              (s, a) => s + Number(a.amount || 0),
              0
            ),
          net: runTotals.net + netPay,
        };
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
      setDialogContext("existing");
      setDialogOpen(true);
      stopBusy();
      openFeedback(
        "Payroll complete",
        "Run was finalized, transactions were posted, and paystubs were created."
      );
      onOpenPaystubs && onOpenPaystubs(id);
    } catch (err) {
      console.error(err);
      stopBusy();
      openFeedback("Finalize failed", "Failed to finalize payroll run.");
    }
  };

  /** runs dropdown (top) */
  const [availableRuns, setAvailableRuns] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "payrollRuns"), orderBy("periodStart", "desc")),
      (snap) =>
        setAvailableRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // totals for small table below
  const totals = useMemo(() => {
    const minutes = preview.reduce((s, l) => s + Number(l.minutes || 0), 0);
    const gross = Number(
      preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)
    );
    const adv = Number(
      preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)
    );
    const short = Number(
      preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)
    );
    const other = Number(
      preview.reduce((s, l) => s + Number(l.otherDeductions || 0), 0).toFixed(2)
    );
    const net = Number(
      preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)
    );
    return { minutes, gross, adv, short, other, net };
  }, [preview]);

  const hasData = preview.length > 0;
  const isFinalized = status === "posted" || status === "voided";

  return (
    <>
      <Card>
        {/* header / filters */}
        <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Grid container spacing={2} alignItems="center">
            {/* period and load */}
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  type="date"
                  label="Period Start"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
                <TextField
                  type="date"
                  label="Period End"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel>Load Existing Run</InputLabel>
                  <Select
                    value={runId || ""}
                    onChange={(e) => loadRun(e.target.value)}
                    label="Load Existing Run"
                  >
                    <MenuItem value="">
                      <em>None (New Run)</em>
                    </MenuItem>
                    {availableRuns.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {toLocaleDateStringPHT(r.periodStart)} –{" "}
                        {toLocaleDateStringPHT(r.periodEnd)} • {cap(r.status)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Grid>

            {/* actions */}
            <Grid item xs={12} md={6}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="flex-end"
              >
                {hasData && !isFinalized && (
                  <Button onClick={() => saveEditsToRun()}>
                    Save Changes
                  </Button>
                )}
                {hasData && (
                  <Button
                    variant="outlined"
                    onClick={() => setDialogOpen(true)}
                  >
                    Run Details
                  </Button>
                )}

                <Button
                  variant="contained"
                  startIcon={hasData ? <CheckIcon /> : <RefreshIcon />}
                  onClick={
                    hasData
                      ? () => setConfirmFinalizeOpen(true)
                      : generatePreview
                  }
                  disabled={
                    isFinalized || (!hasData && (!periodStart || !periodEnd))
                  }
                >
                  {hasData ? "Finalize Run" : "Generate Preview"}
                </Button>

                {runId && (
                  <Tooltip title="View Paystubs">
                    <IconButton
                      onClick={() => onOpenPaystubs && onOpenPaystubs(runId)}
                    >
                      <ReceiptLongIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Box>

        {/* totals + table */}
        {hasData ? (
          <Box sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
              flexWrap="wrap"
              sx={{ mb: 2 }}
            >
              <StatChip label="Staff" value={preview.length} />
              <StatChip
                label="Hours"
                value={`${toHours(totals.minutes)} hrs`}
              />
              <StatChip label="Gross" value={peso(totals.gross)} />
              <StatChip label="Adv" value={peso(totals.adv)} />
              <StatChip label="Short" value={peso(totals.short)} />
              <StatChip label="Other" value={peso(totals.other)} />
              <StatChip bold label="NET" value={peso(totals.net)} />
            </Stack>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Staff</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell align="right">Hours</TableCell>
                    <TableCell align="right">Rate/hr</TableCell>
                    <TableCell align="right">Gross</TableCell>
                    <TableCell align="right">Advances</TableCell>
                    <TableCell align="right">Shortages</TableCell>
                    <TableCell align="right">Other Deds</TableCell>
                    <TableCell align="right">NET</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.staffName}</TableCell>
                      <TableCell>{l.staffEmail}</TableCell>
                      <TableCell align="right">{toHours(l.minutes)}</TableCell>
                      <TableCell align="right">{peso(l.rate)}</TableCell>
                      <TableCell align="right">{peso(l.gross)}</TableCell>
                      <TableCell align="right">{peso(l.advances)}</TableCell>
                      <TableCell align="right">{peso(l.shortages)}</TableCell>
                      <TableCell align="right">
                        {peso(l.otherDeductions || 0)}
                      </TableCell>
                      <TableCell align="right">
                        <b>{peso(l.net)}</b>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ) : (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              Select a period and generate a preview, or load an existing run.
            </Typography>
          </Box>
        )}

        {/* modal (run details) */}
        <RunDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          context={dialogContext}
          runId={runId}
          status={status}
          periodStart={periodStart}
          periodEnd={periodEnd}
          payDate={payDate}
          setPayDate={setPayDate}
          expenseMode={expenseMode}
          setExpenseMode={setExpenseMode}
          preview={preview}
          setPreview={setPreview}
          onCreateRun={onCreateRun}
          onCreateAndFinalize={onCreateAndFinalize}
          onSaveRun={() => saveEditsToRun()}
          onFinalize={() => setConfirmFinalizeOpen(true)}
          showPaystubs={() => onOpenPaystubs && onOpenPaystubs(runId)}
        />
      </Card>

      {/* finalize confirmation modal */}
      <Dialog
        open={confirmFinalizeOpen}
        onClose={() => setConfirmFinalizeOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Finalize this payroll run?</DialogTitle>
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
            Finalize now
          </Button>
        </DialogActions>
      </Dialog>

      {/* feedback dialog */}
      <Dialog
        open={feedback.open}
        onClose={closeFeedback}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{feedback.title || "Notice"}</DialogTitle>
        <DialogContent>
          <Typography>{feedback.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFeedback}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* global loader */}
      <Backdrop
        open={busy}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 10,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body1" sx={{ color: "#fff" }}>
          {busyMsg || "Working..."}
        </Typography>
      </Backdrop>
    </>
  );
}
