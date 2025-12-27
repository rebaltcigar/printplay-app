// src/components/payroll/RunDialog.jsx
import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip, //
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
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
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckIcon from "@mui/icons-material/Check";
import {
  peso,
  toHours,
  toLocaleDateStringPHT,
  toYMD_PHT_fromTS,
  toLocalISO_PHT_fromTS,
  todayYMD_PHT,
  tsFromYMD,
  minutesBetweenTS,
  sumDenominations,
  shortageForShift,
  inferShiftName,
  cap,
} from "../../utils/payrollHelpers";
import { Timestamp } from "firebase/firestore";
import StatChip from "./StatChip";

export default function RunDialog({
  open,
  onClose,
  context,
  runId,
  status,
  periodStart,
  periodEnd,
  payDate,
  setPayDate,
  expenseMode,
  setExpenseMode,
  preview,
  setPreview,
  onCreateRun,
  onCreateAndFinalize,
  onSaveRun,
  onFinalize,
  showPaystubs,
}) {
  const [expanded, setExpanded] = useState({});
  
  // Refactored to generic "itemEdit" to handle both additions and deductions
  const [itemEdit, setItemEdit] = useState({
    open: false,
    type: "deduction", // 'deduction' | 'addition'
    lineId: null,
    index: -1,
    label: "",
    amount: "",
  });

  const isPerStaffMode = expenseMode === "per-staff";

  const calcGross = (minutes, rate) =>
    Number((((Number(minutes || 0) / 60) * Number(rate || 0))).toFixed(2));

  const recalcLine = (line) => {
    const included = line.shiftRows.filter((r) => !r.excluded);
    const minutes = included.reduce((m, r) => m + Number(r.minutes || r.minutesUsed || 0), 0);
    const gross = calcGross(minutes, line.rate);
    
    // Deductions
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

    // Additions (New)
    const customAdditions = (line.customAdditions || []).reduce(
      (s, d) => s + Number(d.amount || 0),
      0
    );
    const totalAdditions = Number(customAdditions.toFixed(2));

    // Net Calculation
    const net = Number(
      (gross + totalAdditions - advances - shortages - otherDeductions).toFixed(2)
    );
    
    return { 
      minutes, 
      gross, 
      advances, 
      shortages, 
      otherDeductions, 
      totalAdditions, 
      net 
    };
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

          //
          const end = next.overrideEnd?.seconds
            ? next.overrideEnd
            : next.overrideEnd
            ? Timestamp.fromDate(new Date(next.overrideEnd))
            : next.end || next.overrideEnd; // critical change for ongoing support

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

  // totals for header
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
  const totalAdditions = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.totalAdditions || 0), 0).toFixed(2)),
    [preview]
  );
  const totalNet = useMemo(
    () => Number(preview.reduce((s, l) => s + Number(l.net || 0), 0).toFixed(2)),
    [preview]
  );

  const disableEdits = status === "posted" || status === "voided";

  const openItemDialog = (type, lineId, existing) => {
    if (existing) {
      setItemEdit({
        open: true,
        type,
        lineId,
        index: existing.index,
        label: existing.label,
        amount: existing.amount,
      });
    } else {
      setItemEdit({
        open: true,
        type,
        lineId,
        index: -1,
        label: "",
        amount: "",
      });
    }
  };

  const saveItem = () => {
    const { type, lineId, index, label, amount } = itemEdit;
    const nAmount = Number(amount || 0);
    if (!lineId || !label) {
      closeItemDialog();
      return;
    }

    setPreview((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        
        // Decide which array to update based on type
        const field = type === "addition" ? "customAdditions" : "customDeductions";
        const list = Array.isArray(l[field]) ? [...l[field]] : [];
        
        const idPrefix = type === "addition" ? "manual-add" : "manual-ded";

        if (index >= 0 && index < list.length) {
          list[index] = { ...list[index], label, amount: nAmount };
        } else {
          list.push({
            id: `${idPrefix}-${Date.now()}`,
            label,
            amount: nAmount,
          });
        }
        
        // Reconstruct line with new list
        const updatedLine = { ...l, [field]: list };
        const totals = recalcLine(updatedLine);
        return { ...updatedLine, ...totals };
      })
    );
    closeItemDialog();
  };

  const deleteItem = (type, lineId, index) => {
    setPreview((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;

        const field = type === "addition" ? "customAdditions" : "customDeductions";
        const list = Array.isArray(l[field])
          ? l[field].filter((_, i) => i !== index)
          : [];
          
        const updatedLine = { ...l, [field]: list };
        const totals = recalcLine(updatedLine);
        return { ...updatedLine, ...totals };
      })
    );
  };

  const closeItemDialog = () => {
    setItemEdit({
      open: false,
      type: "deduction",
      lineId: null,
      index: -1,
      label: "",
      amount: "",
    });
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>
        {context === "preview"
          ? "Payroll Preview"
          : `Run Details (${cap(status || "draft")})`}{" "}
        — {periodStart} – {periodEnd}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {/* header */}
        <Box
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="date"
              label="Pay Date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              disabled={disableEdits || isPerStaffMode}
            />
            <FormControl size="small">
              <InputLabel>Expense Mode</InputLabel>
              <Select
                value={expenseMode}
                label="Expense Mode"
                onChange={(e) => handleExpenseModeChange(e.target.value)}
                disabled={disableEdits}
              >
                <MenuItem value="per-staff">
                  Post once per staff (use pay date)
                </MenuItem>
                <MenuItem value="per-shift">
                  Post using each shift&apos;s expense date
                </MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <StatChip label="Staff" value={preview.length} />
            <StatChip label="Hours" value={`${toHours(totalMinutes)} hrs`} />
            <StatChip label="Gross" value={peso(totalGross)} />
            <StatChip label="Adds" value={peso(totalAdditions)} color="success" />
            <StatChip label="Adv" value={peso(totalAdvances)} />
            <StatChip label="Short" value={peso(totalShortages)} />
            <StatChip label="Other Deds" value={peso(totalOtherDeds)} />
            <StatChip bold label="NET" value={peso(totalNet)} />
          </Stack>
        </Box>
        <Divider />

        {/* table */}
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
                <TableCell align="right">Additions</TableCell>
                <TableCell align="right">Advances</TableCell>
                <TableCell align="right">Shortages</TableCell>
                <TableCell align="right">Other Deds</TableCell>
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
                        onClick={() =>
                          setExpanded((p) => ({ ...p, [l.id]: !p[l.id] }))
                        }
                      >
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
                        onChange={(e) => {
                          const rate = Number(e.target.value || 0);
                          setLine(l.id, { rate });
                          // Force recalc happens via setLine -> but we need to run recalc logic
                          // Actually setLine only patches. 
                          // We need to re-trigger calculations manually here or inside setLine.
                          // The easiest way with current structure:
                          setPreview(prev => prev.map(line => {
                            if(line.id !== l.id) return line;
                            const newLine = { ...line, rate };
                            return { ...newLine, ...recalcLine(newLine) };
                          }));
                        }}
                        inputProps={{ step: "0.01", min: 0 }}
                        disabled={disableEdits}
                      />
                    </TableCell>
                    <TableCell align="right">{peso(l.gross)}</TableCell>
                    <TableCell align="right" sx={{ color: "green" }}>
                      {peso(l.totalAdditions)}
                    </TableCell>
                    <TableCell align="right">{peso(l.advances)}</TableCell>
                    <TableCell align="right">{peso(l.shortages)}</TableCell>
                    <TableCell align="right">
                      {peso(l.otherDeductions || 0)}
                    </TableCell>
                    <TableCell align="right">
                      <b>{peso(l.net)}</b>
                    </TableCell>
                  </TableRow>
                  {/* expanded row */}
                  <TableRow>
                    <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                      <Collapse in={!!expanded[l.id]} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: "background.default" }}>
                          {/* SHIFTS INCLUDED */}
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
                                  //
                                  const endForISO = r.overrideEnd || r.end;
                                  
                                  const startISO = toLocalISO_PHT_fromTS(startForISO);
                                  const endISO = toLocalISO_PHT_fromTS(endForISO);
                                  
                                  const label = `${inferShiftName(
                                    r.start,
                                    r.title,
                                    r.label
                                  )} — ${toLocaleDateStringPHT(r.start)}`;

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
                                          {/* */}
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
                                              overrideStart: Timestamp.fromDate(
                                                new Date(e.target.value)
                                              ),
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
                                              overrideEnd: Timestamp.fromDate(
                                                new Date(e.target.value)
                                              ),
                                            })
                                          }
                                          disabled={disableEdits}
                                        />
                                      </TableCell>
                                      <TableCell align="right">
                                        {toHours(r.minutesUsed)}
                                      </TableCell>
                                      <TableCell align="right">
                                        {peso(r.systemTotal)}
                                      </TableCell>
                                      <TableCell align="right">
                                        {peso(sumDenominations(r.denominations))}
                                      </TableCell>
                                      <TableCell align="right">
                                        {peso(r.shortage)}
                                      </TableCell>
                                      <TableCell align="right">
                                        <TextField
                                          type="date"
                                          size="small"
                                          value={expenseDateYMD}
                                          onChange={(e) =>
                                            updateShiftRow(l.id, r.id, {
                                              expenseDate: tsFromYMD(
                                                e.target.value,
                                                false
                                              ),
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
                                            updateShiftRow(l.id, r.id, {
                                              excluded: !!e.target.checked,
                                            })
                                          }
                                          disabled={disableEdits}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>

                          {/* EXCLUDED */}
                          {l.shiftRows.some((r) => r.excluded) && (
                            <>
                              <Divider sx={{ my: 2 }} />
                              <Typography variant="subtitle2" gutterBottom>
                                Excluded
                              </Typography>
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
                                      const label = `${inferShiftName(
                                        r.start,
                                        r.title,
                                        r.label
                                      )} — ${toLocaleDateStringPHT(r.start)}`;
                                      return (
                                        <TableRow key={r.id}>
                                          <TableCell>{label}</TableCell>
                                          <TableCell align="right">
                                            {toHours(r.minutesOriginal)}
                                          </TableCell>
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
                                            <Typography
                                              variant="caption"
                                              sx={{ opacity: 0.7 }}
                                            >
                                              {r.id.slice(-6)}
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

                          {/* ADDITIONS / ADDITIONAL PAY */}
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ mb: 1 }}
                          >
                            <Typography variant="subtitle2" gutterBottom sx={{ color: 'green' }}>
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
                              {(l.customAdditions && l.customAdditions.length > 0) ? (
                                l.customAdditions.map((d, idx) => (
                                  <TableRow key={`add-${idx}`}>
                                    <TableCell>{d.label}</TableCell>
                                    <TableCell align="right" sx={{ color: 'green', fontWeight: 'bold' }}>
                                      {peso(d.amount)}
                                    </TableCell>
                                    <TableCell align="center">
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        justifyContent="center"
                                      >
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
                                          onClick={() =>
                                            deleteItem("addition", l.id, idx)
                                          }
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
                                  <TableCell colSpan={3} align="center" sx={{ color: "text.secondary", fontStyle: 'italic' }}>
                                    No additional pay.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>

                          <Divider sx={{ my: 2 }} />

                          {/* DEDUCTIONS */}
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ mb: 1 }}
                          >
                            <Typography variant="subtitle2" gutterBottom>
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
                              {(l.extraAdvances?.length ||
                                l.customDeductions?.length) ? (
                                <>
                                  {(l.extraAdvances || []).map((d, idx) => (
                                    <TableRow key={`extra-${idx}`}>
                                      <TableCell>Salary Advance</TableCell>
                                      <TableCell>{d.label}</TableCell>
                                      <TableCell align="right">
                                        {peso(d.amount)}
                                      </TableCell>
                                      <TableCell align="center">
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          auto
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {(l.customDeductions || []).map((d, idx) => (
                                    <TableRow key={`custom-${idx}`}>
                                      <TableCell>Custom</TableCell>
                                      <TableCell>{d.label}</TableCell>
                                      <TableCell align="right">
                                        {peso(d.amount)}
                                      </TableCell>
                                      <TableCell align="center">
                                        <Stack
                                          direction="row"
                                          spacing={1}
                                          justifyContent="center"
                                        >
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
                                            onClick={() =>
                                              deleteItem("deduction", l.id, idx)
                                            }
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
                                  <TableCell
                                    colSpan={4}
                                    align="center"
                                    sx={{ color: "text.secondary" }}
                                  >
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
                    <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                      <Divider />
                    </TableCell>
                  </TableRow>
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
            <Button variant="outlined" onClick={onCreateRun}>
              Create Run
            </Button>
            <Button variant="contained" onClick={onCreateAndFinalize}>
              Create & Approve
            </Button>
          </>
        )}
        {context === "existing" && (
          <>
            <Button onClick={onClose}>Close</Button>
            {status !== "posted" && status !== "voided" && (
              <>
                <Button variant="outlined" onClick={onSaveRun}>
                  Save Changes
                </Button>
                <Button
                  variant="contained"
                  startIcon={<CheckIcon />}
                  onClick={onFinalize}
                >
                  Finalize (Approve & Post)
                </Button>
              </>
            )}
            {status === "posted" && (
              <Button variant="contained" onClick={showPaystubs}>
                View Paystubs
              </Button>
            )}
          </>
        )}
      </DialogActions>

      {/* mini dialog for custom ded/add */}
      <Dialog
        open={itemEdit.open}
        onClose={closeItemDialog}
      >
        <DialogTitle>
          {itemEdit.type === 'addition' ? 'Additional Pay' : 'Custom Deduction'}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", gap: 2, mt: 1 }}>
          <TextField
            label="Label"
            fullWidth
            value={itemEdit.label}
            onChange={(e) =>
              setItemEdit((p) => ({ ...p, label: e.target.value }))
            }
          />
          <TextField
            label="Amount"
            type="number"
            value={itemEdit.amount}
            onChange={(e) =>
              setItemEdit((p) => ({ ...p, amount: e.target.value }))
            }
            inputProps={{ step: "0.01", min: 0 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeItemDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveItem}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}