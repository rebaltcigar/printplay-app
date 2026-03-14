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
import { supabase } from "../../supabase";
import { peso, resolveHourlyRate } from "../../utils/payrollHelpers";

export default function PayRates({ showSnackbar }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState({});

  useEffect(() => {
    const fetchStaff = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "staff");
      if (data) setRows(data);
    };

    fetchStaff();

    const channel = supabase.channel("payrates-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchStaff)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const activeRateToday = (payroll_config) => resolveHourlyRate(payroll_config, new Date());
  const beginEdit = (uid) =>
    setEdit((p) => ({ ...p, [uid]: { rate: "", effectiveFrom: "" } }));
  const cancelEdit = (uid) =>
    setEdit(({ [uid]: _, ...rest }) => rest);

  const saveRate = async (uid) => {
    const e = edit[uid] || {};
    const nAmount = Number(e.rate || 0);
    const when = e.effectiveFrom;
    if (!when) {
      showSnackbar?.("Pick effective date", "warning");
      return;
    }
    const user = rows.find((r) => r.id === uid);
    const prev = user?.payroll_config?.rate_history || [];
    const nextHistory = [
      ...prev,
      { rate: nAmount, effective_from: new Date(`${when}T00:00:00`).toISOString() },
    ];
    const newPayrollConfig = {
      ...(user?.payroll_config || {}),
      defaultRate: activeRateToday({ rate_history: nextHistory }),
      rate_history: nextHistory,
    };
    const { error } = await supabase
      .from("profiles")
      .update({ payroll_config: newPayrollConfig, updated_at: new Date().toISOString() })
      .eq("id", uid);
    if (error) {
      showSnackbar?.("Failed to save rate", "error");
      return;
    }
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
              const current = activeRateToday(r.payroll_config || {});
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.full_name || r.email}</TableCell>
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
                              [r.id]: { ...p[r.id], rate: e.target.value },
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
                              [r.id]: { ...p[r.id], effectiveFrom: e.target.value },
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
