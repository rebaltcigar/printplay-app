// src/components/payroll/PayRates.jsx
import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  query,
  updateDoc,
  where,
  doc,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { peso, resolveHourlyRate } from "../../utils/payrollHelpers";

export default function PayRates() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "staff")),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  const activeRateToday = (payroll) => resolveHourlyRate(payroll, new Date());
  const beginEdit = (uid) =>
    setEdit((p) => ({ ...p, [uid]: { rate: "", effectiveFrom: "" } }));
  const cancelEdit = (uid) =>
    setEdit(({ [uid]: _, ...rest }) => rest);

  const saveRate = async (uid) => {
    const e = edit[uid] || {};
    const rate = Number(e.rate || 0);
    const when = e.effectiveFrom;
    if (!when) return alert("Pick effective date");
    const user = rows.find((r) => r.id === uid);
    const prev = user?.payroll?.rateHistory || [];
    const nextHist = [
      ...prev,
      { rate, effectiveFrom: Timestamp.fromDate(new Date(`${when}T00:00:00`)) },
    ];
    await updateDoc(doc(db, "users", uid), {
      payroll: {
        ...(user?.payroll || {}),
        defaultRate: activeRateToday({ rateHistory: nextHist }),
        rateHistory: nextHist,
      },
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
            {rows.map((r) => {
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
                        <Button size="small" onClick={() => beginEdit(r.id)}>
                          Add Rate
                        </Button>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <TextField
                          size="small"
                          type="number"
                          placeholder="Rate"
                          value={edit[r.id].rate}
                          onChange={(e) =>
                            setEdit((p) => ({
                              ...p,
                              [r.id]: {
                                ...p[r.id],
                                rate: e.target.value,
                              },
                            }))
                          }
                          inputProps={{ step: "0.01", min: 0 }}
                        />
                        <TextField
                          size="small"
                          type="date"
                          value={edit[r.id].effectiveFrom}
                          onChange={(e) =>
                            setEdit((p) => ({
                              ...p,
                              [r.id]: {
                                ...p[r.id],
                                effectiveFrom: e.target.value,
                              },
                            }))
                          }
                          InputLabelProps={{ shrink: true }}
                        />
                        <Button size="small" onClick={() => saveRate(r.id)}>
                          Save
                        </Button>
                        <Button size="small" onClick={() => cancelEdit(r.id)}>
                          Cancel
                        </Button>
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
