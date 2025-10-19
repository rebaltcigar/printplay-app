import React, { useEffect, useMemo, useState } from "react";
import { Box, Card, Tabs, Tab, Typography, Button, Stack, TextField, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, IconButton, Tooltip, Collapse, Divider, Chip, Select, MenuItem, FormControl, InputLabel, Dialog, DialogTitle, DialogContent, DialogActions, Grid, ListItemText, OutlinedInput, Checkbox } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { db, auth } from "../firebase";
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, getDocs, where, serverTimestamp, updateDoc, writeBatch, Timestamp, deleteDoc } from "firebase/firestore";
import { minutesBetween } from "../utils/payroll_util";
import PaystubDialog from "./Paystub"; 

/* ---------- helpers ---------- */
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;
const toHours = (minutes) => Number((Number(minutes || 0) / 60).toFixed(2));
const toYMD = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const tsFromYMD = (ymd, endOfDay = false) => Timestamp.fromDate(new Date(`${ymd}T${endOfDay ? "23:59:59" : "00:00:00"}`));
const minutesBetweenTS = (startTs, endTs) => {
  if (!startTs?.seconds || !endTs?.seconds) return 0;
  return minutesBetween(startTs, endTs);
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const resolveHourlyRate = (payroll, asOfDate) => {
  if (!payroll) return 0;
  const history = Array.isArray(payroll.rateHistory) ? payroll.rateHistory : [];
  const asOf = asOfDate instanceof Date ? asOfDate : new Date(asOfDate || Date.now());
  const picked = history
    .filter(r => r?.effectiveFrom?.seconds ? new Date(r.effectiveFrom.seconds * 1000) <= asOf : true)
    .sort((a, b) => {
      const da = a?.effectiveFrom?.seconds ? a.effectiveFrom.seconds : 0;
      const db = b?.effectiveFrom?.seconds ? b.effectiveFrom.seconds : 0;
      return da - db;
    })
    .pop();
  if (picked?.rate != null) return Number(picked.rate);
  if (payroll.defaultRate != null) return Number(payroll.defaultRate);
  return 0;
};

const sumDenominations = (denoms = {}) => {
  let total = 0;
  for (const [k, v] of Object.entries(denoms || {})) {
    const m = /^([bc])_(\d+(?:\.\d+)?)$/i.exec(k);
    if (!m) continue;
    const face = Number(m[2]);
    const count = Number(v || 0);
    if (!isFinite(face) || !isFinite(count)) continue;
    total += face * count;
  }
  return Number(total.toFixed(2));
};

const shortageForShift = (shift) => {
  const systemTotal = Number(shift?.systemTotal || 0);
  const denomTotal = sumDenominations(shift?.denominations || {});
  const delta = systemTotal - denomTotal;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
};

const inferShiftName = (startTS, title, label) => {
  if (title) return title;
  if (label) return label;
  const d = startTS?.seconds ? new Date(startTS.seconds * 1000) : new Date();
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  return "Night";
};

/* ---------- small stat chip ---------- */
const StatChip = ({ label, value, bold = false }) => (
  <Chip sx={{ fontWeight: bold ? 700 : 500 }} label={`${label}: ${value}`} />
);

/* ---------- RUN DIALOG (preview or existing run) ---------- */
function RunDialog({
  open,
  onClose,
  context,
  runId,
  status,
  periodStart,
  periodEnd,
  payDate,
  setPayDate,
  preview,
  setPreview,
  onCreateRun,
  onCreateAndFinalize,
  onSaveRun,
  onFinalize,
  showPaystubs
}) {
  const [expanded, setExpanded] = useState({});

  const calcGross = (minutes, rate) => Number((((Number(minutes || 0) / 60) * Number(rate || 0))).toFixed(2));

  const recalcLine = (line) => {
    const included = line.shiftRows.filter(r => !r.excluded);
    const minutes = included.reduce((m, r) => m + Number(r.minutesUsed || 0), 0);
    const gross = calcGross(minutes, line.rate);
    const advances = included.reduce((s, r) => s + Number(r.advance || 0), 0);
    const shortages = included.reduce((s, r) => s + Number(r.shortage || 0), 0);
    const net = Number((gross - advances - shortages).toFixed(2));
    return { minutes, gross, advances, shortages, net };
  };

  const setLine = (id, patch) => {
    setPreview(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const updateShiftRow = (lineId, shiftId, patch) => {
    setPreview(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const shiftRows = l.shiftRows.map(r => {
        if (r.id !== shiftId) return r;
        const next = { ...r, ...patch };
        const start = next.overrideStart?.seconds ? next.overrideStart : next.overrideStart ? Timestamp.fromDate(new Date(next.overrideStart)) : next.start;
        const end = next.overrideEnd?.seconds ? next.overrideEnd : next.overrideEnd ? Timestamp.fromDate(new Date(next.overrideEnd)) : next.end;
        next.minutesUsed = next.excluded ? 0 : minutesBetweenTS(start, end);
        next.shortage = shortageForShift({ denominations: next.denominations, systemTotal: next.systemTotal });
        return next;
      });
      const totals = recalcLine({ ...l, shiftRows });
      return { ...l, shiftRows, ...totals };
    }));
  };

  const totalMinutes = useMemo(() => preview.reduce((s, l) => s + Number(l.minutes || 0), 0), [preview]);
  const totalGross = useMemo(() => Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)), [preview]);
  const totalAdvances = useMemo(() => Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)), [preview]);
  const totalShortages = useMemo(() => Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)), [preview]);
  const totalNet = useMemo(() => Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)), [preview]);
  const disableEdits = status === "posted" || status === "voided";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>
        {context === "preview" ? "Payroll Preview" : `Run Details (${cap(status || "draft")})`} —{" "}
        {periodStart ? new Date(periodStart).toLocaleDateString() : ""} – {periodEnd ? new Date(periodEnd).toLocaleDateString() : ""}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="date"
              label="Pay Date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              disabled={disableEdits}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <StatChip label="Staff" value={preview.length} />
            <StatChip label="Hours" value={`${toHours(totalMinutes)} hrs`} />
            <StatChip label="Gross" value={peso(totalGross)} />
            <StatChip label="Adv" value={peso(totalAdvances)} />
            <StatChip label="Short" value={peso(totalShortages)} />
            <StatChip bold label="NET" value={peso(totalNet)} />
          </Stack>
        </Box>
        <Divider />
        <TableContainer component={Paper} sx={{ borderRadius: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Staff</TableCell>
                <TableCell>Email</TableCell>
                <TableCell align="right">Hours</TableCell>
                <TableCell align="right">Rate/hr</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Advances</TableCell>
                <TableCell align="right">Shortages</TableCell>
                <TableCell align="right">NET</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.map((l) => (
                <React.Fragment key={l.id}>
                  <TableRow>
                    <TableCell width={48}>
                      <IconButton size="small" onClick={() => setExpanded(p => ({ ...p, [l.id]: !p[l.id] }))}>
                        {expanded[l.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{l.staffName}</TableCell>
                    <TableCell>{l.staffEmail}</TableCell>
                    <TableCell align="right">{toHours(l.minutes)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={l.rate}
                        onChange={e => {
                          const rate = Number(e.target.value || 0);
                          const gross = Number((((l.minutes / 60) * rate)).toFixed(2));
                          const net = Number((gross - l.advances - l.shortages).toFixed(2));
                          setLine(l.id, { rate, gross, net });
                        }}
                        inputProps={{ step: "0.01", min: 0 }}
                        disabled={disableEdits}
                      />
                    </TableCell>
                    <TableCell align="right">{peso(l.gross)}</TableCell>
                    <TableCell align="right">{peso(l.advances)}</TableCell>
                    <TableCell align="right">{peso(l.shortages)}</TableCell>
                    <TableCell align="right"><b>{peso(l.net)}</b></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                      <Collapse in={!!expanded[l.id]} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: "background.default" }}>
                          <Typography variant="subtitle2" gutterBottom>Shifts (included)</Typography>
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
                                <TableCell align="center">Exclude</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {l.shiftRows.filter(r => !r.excluded).map(r => {
                                const startISO = (r.overrideStart ? new Date((r.overrideStart.seconds ? r.overrideStart.seconds * 1000 : Date.parse(r.overrideStart))) : new Date(r.start.seconds * 1000)).toISOString().slice(0, 16);
                                const endISO = (r.overrideEnd ? new Date((r.overrideEnd.seconds ? r.overrideEnd.seconds * 1000 : Date.parse(r.overrideEnd))) : new Date(r.end.seconds * 1000)).toISOString().slice(0, 16);
                                const label = `${inferShiftName(r.start, r.title, r.label)} — ${new Date(r.start.seconds * 1000).toLocaleDateString()}`;
                                return (
                                  <TableRow key={r.id}>
                                    <TableCell><Typography variant="body2">{label}</Typography></TableCell>
                                    <TableCell>
                                      <TextField type="datetime-local" size="small" value={startISO} onChange={e => updateShiftRow(l.id, r.id, { overrideStart: Timestamp.fromDate(new Date(e.target.value)) })} disabled={disableEdits} />
                                    </TableCell>
                                    <TableCell>
                                      <TextField type="datetime-local" size="small" value={endISO} onChange={e => updateShiftRow(l.id, r.id, { overrideEnd: Timestamp.fromDate(new Date(e.target.value)) })} disabled={disableEdits} />
                                    </TableCell>
                                    <TableCell align="right">{toHours(r.minutesUsed)}</TableCell>
                                    <TableCell align="right">{peso(r.systemTotal)}</TableCell>
                                    <TableCell align="right">{peso(sumDenominations(r.denominations))}</TableCell>
                                    <TableCell align="right">{peso(r.shortage)}</TableCell>
                                    <TableCell align="center">
                                      <input type="checkbox" checked={!!r.excluded} onChange={e => updateShiftRow(l.id, r.id, { excluded: !!e.target.checked })} disabled={disableEdits} />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {l.shiftRows.some(r => r.excluded) && (
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
                                  {l.shiftRows.filter(r => r.excluded).map(r => {
                                    const label = `${inferShiftName(r.start, r.title, r.label)} — ${new Date(r.start.seconds * 1000).toLocaleDateString()}`;
                                    return (
                                      <TableRow key={r.id}>
                                        <TableCell>{label}</TableCell>
                                        <TableCell align="right">{toHours(r.minutesOriginal)}</TableCell>
                                        <TableCell align="center">
                                          <Button size="small" onClick={() => updateShiftRow(l.id, r.id, { excluded: false, minutesUsed: r.minutesOriginal })} disabled={disableEdits}>
                                            Include
                                          </Button>
                                        </TableCell>
                                        <TableCell align="right"><Chip size="small" label={r.id.slice(-6)} /></TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                  <TableRow><TableCell colSpan={9}><Divider /></TableCell></TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        {context === "preview" && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="outlined" onClick={onCreateRun}>Create Run</Button>
            <Button variant="contained" onClick={onCreateAndFinalize}>Create & Approve</Button>
          </>
        )}
        {context === "existing" && (
          <>
            <Button onClick={onClose}>Close</Button>
            {(status !== "posted" && status !== "voided") && (
              <>
                <Button variant="outlined" onClick={onSaveRun}>Save Changes</Button>
                <Button variant="contained" startIcon={<CheckIcon />} onClick={onFinalize}>
                  Finalize (Approve & Post)
                </Button>
              </>
            )}
            {(status === "posted") && (
              <Button variant="contained" onClick={showPaystubs}>
                View Paystubs
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/* ---------- Run Payroll (editor + modal) ---------- */
function RunPayroll({ user, openRunId, openDialogAfterLoad, onOpenedFromHistory, onOpenPaystubs, requestOpenDialogRef }) {
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [payDate, setPayDate] = useState(() => toYMD(new Date()));
    const [preview, setPreview] = useState([]);
    const [runId, setRunId] = useState(null);
    const [status, setStatus] = useState("draft");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogContext, setDialogContext] = useState("preview");

    const calcGross = (minutes, rate) => Number((((Number(minutes || 0) / 60) * Number(rate || 0))).toFixed(2));

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

    const generatePreview = async () => {
        if (!periodStart || !periodEnd) return alert("Select a period first.");
        const start = tsFromYMD(periodStart, false);
        const end = tsFromYMD(periodEnd, true);
        const qShifts = query(collection(db, "shifts"), where("startTime", ">=", start), where("startTime", "<=", end));
        const sSnap = await getDocs(qShifts);

        const byStaff = new Map();
        const shiftsById = new Map();

        sSnap.forEach(d => {
            const s = d.data() || {};
            if (!s.startTime || !s.endTime) return;
            const email = s.staffEmail || "unknown";
            const minutes = minutesBetweenTS(s.startTime, s.endTime);
            const shortage = shortageForShift(s);
            const row = {
                id: d.id, start: s.startTime, end: s.endTime, title: s.title || s.shiftTitle || null,
                label: s.label || null, overrideStart: null, overrideEnd: null, excluded: false,
                minutesOriginal: minutes, minutesUsed: minutes, shortage, denominations: s.denominations || {},
                systemTotal: Number(s.systemTotal || 0), staffUid: s.staffUid || null,
                staffName: s.staffName || s.staffFullName || email, staffEmail: email
            };
            shiftsById.set(d.id, row);
            const bucket = byStaff.get(email) || {
                staffUid: s.staffUid || null, staffName: row.staffName,
                staffEmail: email, minutes: 0, shiftRows: []
            };
            bucket.minutes += minutes;
            bucket.shiftRows.push(row);
            byStaff.set(email, bucket);
        });

        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "staff")));
        const usersByEmail = new Map();
        usersSnap.forEach(u => {
            const v = u.data() || {};
            usersByEmail.set(v.email, { uid: u.id, name: v.fullName || v.name || v.email, payroll: v.payroll || null });
        });

        for (const row of shiftsById.values()) {
            const advQ = query(collection(db, "transactions"), where("expenseType", "==", "Salary Advance"), where("shiftId", "==", row.id));
            const advSnap = await getDocs(advQ);
            row.advance = advSnap.docs.reduce((sum, d) => sum + Number((d.data() || {}).total || 0), 0);
            row.advanceRefs = advSnap.docs.map(d => d.id);
        }

        const endDateForRate = new Date(`${periodEnd}T23:59:59`);
        const out = [];
        for (const [email, bucket] of byStaff.entries()) {
            const rec = usersByEmail.get(email) || { uid: null, name: email, payroll: null };
            const rate = resolveHourlyRate(rec.payroll, endDateForRate);
            const minutes = bucket.shiftRows.reduce((m, r) => m + Number(r.minutesUsed || 0), 0);
            const gross = calcGross(minutes, rate);
            const advances = bucket.shiftRows.reduce((s, r) => s + Number(r.advance || 0), 0);
            const shortages = bucket.shiftRows.reduce((s, r) => s + Number(r.shortage || 0), 0);
            const net = Number((gross - advances - shortages).toFixed(2));
            out.push({
                id: rec.uid || `email:${email}`, staffUid: rec.uid, staffEmail: email,
                staffName: rec.name || bucket.staffName, rate, minutes, gross,
                advances, shortages, net, shiftRows: bucket.shiftRows
            });
        }

        setRunId(null);
        setStatus("draft");
        setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
        setDialogContext("preview");
        setDialogOpen(true);
    };

    const loadRun = async (id) => {
        if (!id) {
            setRunId(null);
            setPreview([]);
            return;
        };
        const runRef = doc(db, "payrollRuns", id);
        const runDoc = await getDoc(runRef);
        if (!runDoc.exists()) return alert("Run not found.");
        const run = runDoc.data() || {};
        setRunId(id);
        setStatus(run.status || "draft");
        setPeriodStart(run.periodStart?.seconds ? toYMD(new Date(run.periodStart.seconds * 1000)) : "");
        setPeriodEnd(run.periodEnd?.seconds ? toYMD(new Date(run.periodEnd.seconds * 1000)) : "");
        setPayDate(run.payDate?.seconds ? toYMD(new Date(run.payDate.seconds * 1000)) : toYMD(new Date()));

        const linesSnap = await getDocs(collection(runRef, "lines"));
        const out = [];
        for (const ld of linesSnap.docs) {
            const l = ld.data() || {};
            const lineId = ld.id;
            const overSnap = await getDocs(collection(runRef, `lines/${lineId}/shifts`));
            const overrides = new Map();
            overSnap.forEach(od => {
                const v = od.data() || {};
                overrides.set(v.shiftId, v);
            });

            const shiftRows = [];
            for (const sid of (l.source?.shiftIds || [])) {
                const sDoc = await getDoc(doc(db, "shifts", sid));
                if (!sDoc.exists()) continue;
                const s = sDoc.data() || {};
                const ov = overrides.get(sid) || {};
                const start = ov.overrideStart || s.startTime;
                const end = ov.overrideEnd || s.endTime;
                const minutesOriginal = minutesBetweenTS(s.startTime, s.endTime);
                const minutesUsed = ov.excluded ? 0 : (ov.minutesUsed != null ? ov.minutesUsed : minutesBetweenTS(start, end));
                const row = {
                    id: sid, start: s.startTime, end: s.endTime, title: s.title || s.shiftTitle || null,
                    label: s.label || null, overrideStart: ov.overrideStart || null, overrideEnd: ov.overrideEnd || null,
                    excluded: !!ov.excluded, minutesOriginal, minutesUsed, shortage: shortageForShift(s),
                    denominations: s.denominations || {}, systemTotal: Number(s.systemTotal || 0),
                    staffUid: l.staffUid || null, staffName: l.staffName || s.staffName || s.staffFullName || l.staffEmail,
                    staffEmail: l.staffEmail || s.staffEmail
                };

                const advQ = query(collection(db, "transactions"), where("expenseType", "==", "Salary Advance"), where("shiftId", "==", sid));
                const advSnap = await getDocs(advQ);
                row.advance = advSnap.docs.reduce((sum, d) => sum + Number((d.data() || {}).total || 0), 0);
                row.advanceRefs = advSnap.docs.map(d => d.id);
                shiftRows.push(row);
            }
            const rate = Number(l.rate || 0);
            const minutes = shiftRows.filter(r => !r.excluded).reduce((m, r) => m + Number(r.minutesUsed || 0), 0);
            const gross = calcGross(minutes, rate);
            const advances = shiftRows.filter(r => !r.excluded).reduce((s, r) => s + Number(r.advance || 0), 0);
            const shortages = shiftRows.filter(r => !r.excluded).reduce((s, r) => s + Number(r.shortage || 0), 0);
            const net = Number((gross - advances - shortages).toFixed(2));
            out.push({
                id: lineId, staffUid: l.staffUid || null, staffEmail: l.staffEmail, staffName: l.staffName,
                rate, minutes, gross, advances, shortages, net, shiftRows
            });
        }
        setPreview(out.sort((a, b) => a.staffName.localeCompare(b.staffName)));
    };

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

    const saveEditsToRun = async (id = runId) => {
        if (!id) return alert("No run to save.");
        const batch = writeBatch(db);
        batch.update(doc(db, "payrollRuns", id), {
            payDate: tsFromYMD(payDate, false),
            totals: {
                staffCount: preview.length,
                minutes: preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
                gross: Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)),
                advances: Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)),
                shortages: Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)),
                net: Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
            },
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || "admin"
        });

        for (const line of preview) {
            batch.set(doc(db, `payrollRuns/${id}/lines/${line.id}`), {
                staffUid: line.staffUid || null, staffEmail: line.staffEmail, staffName: line.staffName,
                minutes: line.minutes, rate: line.rate, gross: line.gross, adjustments: [],
                source: { shiftIds: line.shiftRows.map(r => r.id) }, isEdited: true, createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || user?.uid || "admin"
            });

            const overSnap = await getDocs(collection(db, "payrollRuns", id, "lines", line.id, "shifts"));
            overSnap.forEach(o => batch.delete(o.ref));

            for (const r of line.shiftRows) {
                if (r.excluded || r.overrideStart || r.overrideEnd) {
                    batch.set(doc(db, "payrollRuns", id, "lines", line.id, "shifts", r.id), {
                        shiftId: r.id, originalStart: r.start, originalEnd: r.end,
                        overrideStart: r.overrideStart ? (r.overrideStart.seconds ? r.overrideStart : Timestamp.fromDate(new Date(r.overrideStart))) : null,
                        overrideEnd: r.overrideEnd ? (r.overrideEnd.seconds ? r.overrideEnd : Timestamp.fromDate(new Date(r.overrideEnd))) : null,
                        excluded: !!r.excluded, minutesUsed: r.minutesUsed
                    });
                }
            }
        }
        await batch.commit();
    };

    const createRunInternal = async () => {
        const run = {
            periodStart: tsFromYMD(periodStart, false), periodEnd: tsFromYMD(periodEnd, true), status: "draft",
            expenseMode: "per-staff", payDate: tsFromYMD(payDate, false),
            totals: {
                staffCount: preview.length, minutes: preview.reduce((s, l) => s + Number(l.minutes || 0), 0),
                gross: Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2)),
                advances: Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2)),
                shortages: Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2)),
                net: Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
            },
            createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid || user?.uid || "admin"
        };
        const runRef = await addDoc(collection(db, "payrollRuns"), run);
        await saveEditsToRun(runRef.id);
        setRunId(runRef.id);
        setStatus("draft");
        return runRef.id;
    };

    const onCreateRun = async () => {
        const id = await createRunInternal();
        setDialogContext("existing");
        setDialogOpen(true);
        alert("Run created.");
    };

    const onCreateAndFinalize = async () => {
        const id = await createRunInternal();
        await finalizeRun(id);
    };

    const finalizeRun = async (id = runId) => {
        if (!id) return alert("No run.");
        if (!window.confirm("Finalize this run? This will approve AND post (create NET Salary transactions) and save itemized paystubs.")) return;

        await saveEditsToRun(id);
        const runRef = doc(db, "payrollRuns", id);
        const linesSnap = await getDocs(collection(runRef, "lines"));
        const txBatch = writeBatch(db);

        const existing = await getDocs(query(collection(db, "transactions"), where("payrollRunId", "==", id), where("voided", "==", false)));
        existing.docs.forEach(t => txBatch.update(t.ref, { voided: true }));

        let runTotals = { staffCount: 0, minutes: 0, gross: 0, advances: 0, shortages: 0, net: 0 };
        const payWhen = new Date(`${payDate}T00:00:00`);

        for (const ld of linesSnap.docs) {
            const l = ld.data() || {};
            const lineId = ld.id;

            const overSnap = await getDocs(collection(runRef, `lines/${lineId}/shifts`));
            const overrides = new Map();
            overSnap.forEach(od => overrides.set(od.data().shiftId, od.data()));

            const shifts = [];
            const deductionItems = [];
            let totalMinutes = 0, totalAdvances = 0, totalShortages = 0;

            for (const sid of (l.source?.shiftIds || [])) {
                const sDoc = await getDoc(doc(db, "shifts", sid));
                if (!sDoc.exists()) continue;
                const s = sDoc.data();
                const ov = overrides.get(sid) || {};
                if (ov.excluded) continue;

                const start = ov.overrideStart || s.startTime;
                const end = ov.overrideEnd || s.endTime;
                const minutesUsed = ov.minutesUsed != null ? ov.minutesUsed : minutesBetweenTS(start, end);
                const shiftLabel = `${new Date(s.startTime.seconds * 1000).toLocaleDateString()} (${inferShiftName(s.startTime, s.title, s.label)})`;
                shifts.push({ id: sid, label: shiftLabel, hours: toHours(minutesUsed) });

                const advQ = query(collection(db, "transactions"), where("expenseType", "==", "Salary Advance"), where("shiftId", "==", sid));
                const advSnap = await getDocs(advQ);
                const advanceAmount = advSnap.docs.reduce((sum, d) => sum + Number((d.data() || {}).total || 0), 0);
                const shortageAmount = shortageForShift(s);

                if (advanceAmount > 0) {
                    deductionItems.push({ id: sid, label: `Salary Advance on ${shiftLabel}`, amount: advanceAmount });
                    totalAdvances += advanceAmount;
                }
                if (shortageAmount > 0) {
                    deductionItems.push({ id: sid, label: `Shortage on ${shiftLabel}`, amount: shortageAmount });
                    totalShortages += shortageAmount;
                }
                totalMinutes += minutesUsed;
            }

            const grossPay = calcGross(totalMinutes, l.rate);
            const totalDeductions = totalAdvances + totalShortages;
            const netPay = grossPay - totalDeductions;

            const paystubData = {
                staffUid: l.staffUid, staffEmail: l.staffEmail, staffName: l.staffName,
                periodStart: tsFromYMD(periodStart, false), periodEnd: tsFromYMD(periodEnd, true), payDate: tsFromYMD(payDate, false),
                shifts, deductionItems, totalHours: toHours(totalMinutes), grossPay, totalDeductions, netPay,
                createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid || "admin",
            };

            txBatch.set(doc(collection(runRef, "paystubs")), paystubData);

            txBatch.set(doc(collection(db, "transactions")), {
                item: "Expenses", expenseType: "Salary", expenseStaffId: l.staffUid,
                expenseStaffName: l.staffName, expenseStaffEmail: l.staffEmail,
                quantity: 1, price: netPay, total: netPay,
                notes: `Payroll [${periodStart} — ${periodEnd}] | Gross: ${peso(grossPay)} | Net: ${peso(netPay)}`,
                shiftId: null, source: `payroll_run:${id}`, payrollRunId: id, voided: false,
                timestamp: Timestamp.fromDate(payWhen), staffEmail: auth.currentUser?.email || "admin",
                isDeleted: false, isEdited: false
            });

            runTotals = {
                staffCount: runTotals.staffCount + 1, minutes: runTotals.minutes + totalMinutes,
                gross: runTotals.gross + grossPay, advances: runTotals.advances + totalAdvances,
                shortages: runTotals.shortages + totalShortages, net: runTotals.net + netPay
            };

            l.source?.shiftIds.forEach(sid => txBatch.update(doc(db, "shifts", sid), { payrollRunId: id }));
        }

        txBatch.update(runRef, { status: "posted", updatedAt: serverTimestamp(), totals: runTotals });
        await txBatch.commit();
        setStatus("posted");
        setDialogContext("existing");
        setDialogOpen(true);
        alert("Run finalized: posted & itemized paystubs saved.");
        onOpenPaystubs && onOpenPaystubs(id);
    };

    const [availableRuns, setAvailableRuns] = useState([]);
    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "payrollRuns"), orderBy("periodStart", "desc")), (snap) =>
            setAvailableRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
        return () => unsub();
    }, []);

    const totals = useMemo(() => {
        const minutes = preview.reduce((s, l) => s + Number(l.minutes || 0), 0);
        const gross = Number(preview.reduce((s, l) => s + Number(l.gross || 0), 0).toFixed(2));
        const adv = Number(preview.reduce((s, l) => s + Number(l.advances || 0), 0).toFixed(2));
        const short = Number(preview.reduce((s, l) => s + Number(l.shortages || 0), 0).toFixed(2));
        const net = Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2));
        return { minutes, gross, adv, short, net };
    }, [preview]);

    const hasData = preview.length > 0;
    const isFinalized = status === 'posted' || status === 'voided';

    return (
        <Card>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Grid container spacing={2} alignItems="center">
                    {/* ----- SETUP ----- */}
                    <Grid item xs={12} md={6}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <TextField type="date" label="Period Start" value={periodStart} onChange={e => setPeriodStart(e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
                            <TextField type="date" label="Period End" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
                            <FormControl size="small" sx={{ minWidth: 240 }}>
                                <InputLabel>Load Existing Run</InputLabel>
                                <Select
                                    value={runId || ""}
                                    onChange={(e) => loadRun(e.target.value)}
                                    label="Load Existing Run"
                                >
                                    <MenuItem value=""><em>None (New Run)</em></MenuItem>
                                    {availableRuns.map(r => (
                                        <MenuItem key={r.id} value={r.id}>
                                            {r.periodStart?.seconds ? new Date(r.periodStart.seconds * 1000).toLocaleDateString() : ""} – {r.periodEnd?.seconds ? new Date(r.periodEnd.seconds * 1000).toLocaleDateString() : ""} • {cap(r.status)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Grid>

                    {/* ----- ACTIONS ----- */}
                    <Grid item xs={12} md={6}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                            {hasData && !isFinalized && <Button onClick={() => saveEditsToRun()}>Save Changes</Button>}
                            {hasData && <Button variant="outlined" onClick={() => setDialogOpen(true)}>Run Details</Button>}

                            <Button
                                variant="contained"
                                startIcon={hasData ? <CheckIcon /> : <RefreshIcon />}
                                onClick={hasData ? () => finalizeRun() : generatePreview}
                                disabled={isFinalized || (!hasData && (!periodStart || !periodEnd))}
                            >
                                {hasData ? 'Finalize Run' : 'Generate Preview'}
                            </Button>

                            {runId && (
                                <Tooltip title="View Paystubs">
                                    <IconButton onClick={() => onOpenPaystubs && onOpenPaystubs(runId)}><ReceiptLongIcon /></IconButton>
                                </Tooltip>
                            )}
                        </Stack>
                    </Grid>
                </Grid>
            </Box>

            {/* ----- TOTALS & TABLE ----- */}
            {hasData && (
                <Box sx={{ p: 2 }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" sx={{ mb: 2 }}>
                        <StatChip label="Staff" value={preview.length} />
                        <StatChip label="Hours" value={`${toHours(totals.minutes)} hrs`} />
                        <StatChip label="Gross" value={peso(totals.gross)} />
                        <StatChip label="Adv" value={peso(totals.adv)} />
                        <StatChip label="Short" value={peso(totals.short)} />
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
                                        <TableCell align="right"><b>{peso(l.net)}</b></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {!hasData && (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        Select a period and generate a preview, or load an existing run.
                    </Typography>
                </Box>
            )}

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
                preview={preview}
                setPreview={setPreview}
                onCreateRun={onCreateRun}
                onCreateAndFinalize={onCreateAndFinalize}
                onSaveRun={() => saveEditsToRun()}
                onFinalize={() => finalizeRun()}
                showPaystubs={() => onOpenPaystubs && onOpenPaystubs(runId)}
            />
        </Card>
    );
}

/* ---------- Pay Rates (unchanged) ---------- */
function PayRates() {
    const [rows, setRows] = useState([]);
    const [edit, setEdit] = useState({});

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "users"), where("role", "==", "staff")), (snap) =>
            setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
        return () => unsub();
    }, []);

    const activeRateToday = (payroll) => resolveHourlyRate(payroll, new Date());
    const beginEdit = (uid) => setEdit(p => ({ ...p, [uid]: { rate: "", effectiveFrom: "" } }));
    const cancelEdit = (uid) => setEdit(({ [uid]: _, ...rest }) => rest);
    const saveRate = async (uid) => {
        const e = edit[uid] || {};
        const rate = Number(e.rate || 0);
        const when = e.effectiveFrom;
        if (!when) return alert("Pick effective date");
        const user = rows.find(r => r.id === uid);
        const prev = user?.payroll?.rateHistory || [];
        const nextHist = [...prev, { rate, effectiveFrom: Timestamp.fromDate(new Date(`${when}T00:00:00`)) }];
        await updateDoc(doc(db, "users", uid), {
            payroll: {
                ...(user?.payroll || {}),
                defaultRate: activeRateToday({ rateHistory: nextHist }),
                rateHistory: nextHist
            }
        });
        cancelEdit(uid);
    };

    return (
        <Card>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Staff</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell align="right">Current Rate/hr</TableCell>
                            <TableCell align="center">Rate History</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(r => {
                            const editing = !!edit[r.id];
                            const current = activeRateToday(r.payroll || {});
                            return (
                                <TableRow key={r.id}>
                                    <TableCell>{r.fullName || r.name || r.email}</TableCell>
                                    <TableCell>{r.email}</TableCell>
                                    <TableCell align="right">{peso(current)}</TableCell>
                                    <TableCell align="center">
                                        {!editing ? (
                                            <Stack direction="row" spacing={1} justifyContent="center">
                                                <Button size="small" onClick={() => beginEdit(r.id)}>Add Rate</Button>
                                            </Stack>
                                        ) : (
                                            <Stack direction="row" spacing={1} justifyContent="center">
                                                <TextField size="small" type="number" placeholder="Rate" value={edit[r.id].rate} onChange={e => setEdit(p => ({ ...p, [r.id]: { ...p[r.id], rate: e.target.value } }))} inputProps={{ step: "0.01", min: 0 }} />
                                                <TextField size="small" type="date" value={edit[r.id].effectiveFrom} onChange={e => setEdit(p => ({ ...p, [r.id]: { ...p[r.id], effectiveFrom: e.target.value } }))} InputLabelProps={{ shrink: true }} />
                                                <Button size="small" onClick={() => saveRate(r.id)}>Save</Button>
                                                <Button size="small" onClick={() => cancelEdit(r.id)}>Cancel</Button>
                                            </Stack>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Card>
    );
}

/* ---------- All Runs (unchanged) ---------- */
function AllRuns({ onOpenRunInModal, onOpenPaystubs }) {
    const [runs, setRuns] = useState([]);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [statusFilter, setStatusFilter] = useState(["draft", "approved", "posted", "voided"]);

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "payrollRuns"), orderBy("periodStart", "desc")), (snap) =>
            setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
        return () => unsub();
    }, []);

    const filtered = useMemo(() => {
        return runs.filter(r => {
            const d = r.periodStart?.seconds ? new Date(r.periodStart.seconds * 1000) : null;
            const okDate = (!fromDate && !toDate) || (d && (!fromDate || d >= new Date(fromDate)) && (!toDate || d <= new Date(toDate + "T23:59:59")));
            const okStatus = !statusFilter.length || statusFilter.includes(r.status);
            return okDate && okStatus;
        });
    }, [runs, fromDate, toDate, statusFilter]);

    const onDelete = async (r) => {
        if (r.status === "posted") {
            if (!window.confirm("This run is posted. Voiding will mark salary transactions voided and the run as voided. Continue?")) return;
            const txSnap = await getDocs(query(collection(db, "transactions"), where("payrollRunId", "==", r.id), where("voided", "==", false)));
            const batch = writeBatch(db);
            txSnap.docs.forEach(t => batch.update(t.ref, { voided: true }));
            batch.update(doc(db, "payrollRuns", r.id), { status: "voided", updatedAt: serverTimestamp() });
            await batch.commit();
            alert("Run voided.");
        } else {
            if (!window.confirm("Delete this run? This will remove the run and its lines/overrides/paystubs.")) return;
            const linesSnap = await getDocs(collection(db, "payrollRuns", r.id, "lines"));
            for (const l of linesSnap.docs) {
                const overSnap = await getDocs(collection(db, "payrollRuns", r.id, "lines", l.id, "shifts"));
                overSnap.forEach(o => deleteDoc(o.ref));
                await deleteDoc(l.ref);
            }
            const stubsSnap = await getDocs(collection(db, "payrollRuns", r.id, "paystubs"));
            stubsSnap.forEach(s => deleteDoc(s.ref));
            await deleteDoc(doc(db, "payrollRuns", r.id));
            alert("Run deleted.");
        }
    };

    const STATUSES = ["draft", "approved", "posted", "voided"];

    return (
        <Card>
            <Box sx={{ p: 2, display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: 2 }}>
                <TextField type="date" label="From" value={fromDate} onChange={e => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                <TextField type="date" label="To" value={toDate} onChange={e => setToDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                <FormControl>
                    <InputLabel>Statuses</InputLabel>
                    <Select
                        multiple
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        input={<OutlinedInput label="Statuses" />}
                        renderValue={(selected) => selected.map(cap).join(", ")}
                    >
                        {STATUSES.map((s) => (
                            <MenuItem key={s} value={s}>
                                <Checkbox checked={statusFilter.includes(s)} />
                                <ListItemText primary={cap(s)} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Period</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Staff</TableCell>
                            <TableCell align="right">Hours</TableCell>
                            <TableCell align="right">Gross</TableCell>
                            <TableCell align="right">Adv</TableCell>
                            <TableCell align="right">Short</TableCell>
                            <TableCell align="right">NET</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtered.map(r => (
                            <TableRow key={r.id}>
                                <TableCell>
                                    {r.periodStart?.seconds ? new Date(r.periodStart.seconds * 1000).toLocaleDateString() : ""} –{" "}
                                    {r.periodEnd?.seconds ? new Date(r.periodEnd.seconds * 1000).toLocaleDateString() : ""}
                                </TableCell>
                                <TableCell>{cap(r.status)}</TableCell>
                                <TableCell align="right">{r.totals?.staffCount || 0}</TableCell>
                                <TableCell align="right">{toHours(r.totals?.minutes || 0)}</TableCell>
                                <TableCell align="right">{peso(r.totals?.gross || 0)}</TableCell>
                                <TableCell align="right">{peso(r.totals?.advances || 0)}</TableCell>
                                <TableCell align="right">{peso(r.totals?.shortages || 0)}</TableCell>
                                <TableCell align="right"><b>{peso(r.totals?.net || 0)}</b></TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Open Run Modal">
                                        <IconButton onClick={() => onOpenRunInModal && onOpenRunInModal(r.id)}>
                                            <VisibilityIcon />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Paystubs">
                                        <IconButton onClick={() => onOpenPaystubs && onOpenPaystubs(r.id)}><ReceiptLongIcon /></IconButton>
                                    </Tooltip>
                                    <Tooltip title={r.status === "posted" ? "Void" : "Delete"}>
                                        <IconButton onClick={() => onDelete(r)}><DeleteIcon /></IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!filtered.length && (
                            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}> No runs match your filters. </TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Card>
    );
}

/* ---------- Root ---------- */
export default function Payroll({ user }) {
    const [tab, setTab] = useState(0);
    const [openRunId, setOpenRunId] = useState("");
    const [openDialogAfterLoad, setOpenDialogAfterLoad] = useState(false);
    const [stubRunId, setStubRunId] = useState(null);
    const requestOpenDialogRef = React.useRef(null);

    const openRunInModalFromHistory = (id) => {
        setOpenRunId(id);
        setOpenDialogAfterLoad(true);
        setTab(0);
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Card sx={{ p: 1 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
                    <Tab label="Run Payroll" />
                    <Tab label="All Runs" />
                    <Tab label="Pay Rates" />
                </Tabs>
            </Card>
            <Box>
                {tab === 0 && (
                    <RunPayroll
                        user={user}
                        openRunId={openRunId}
                        openDialogAfterLoad={openDialogAfterLoad}
                        onOpenedFromHistory={() => setOpenDialogAfterLoad(false)}
                        onOpenPaystubs={(runId) => setStubRunId(runId)}
                        requestOpenDialogRef={requestOpenDialogRef}
                    />
                )}
                {tab === 1 && (
                    <AllRuns
                        onOpenRunInModal={openRunInModalFromHistory}
                        onOpenPaystubs={(runId) => setStubRunId(runId)}
                    />
                )}
                {tab === 2 && <PayRates />}
            </Box>

            <PaystubDialog
                open={!!stubRunId}
                onClose={() => setStubRunId(null)}
                runId={stubRunId}
            />
        </Box>
    );
}