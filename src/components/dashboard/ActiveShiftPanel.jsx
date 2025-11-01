// src/components/dashboard/ActiveShiftPanel.jsx
import React from "react";
import {
  Box,
  Card,
  Typography,
  Stack,
  Paper,
  Tooltip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from "@mui/material";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";

const LiveDot = ({ color = "error.main", size = 10 }) => (
  <FiberManualRecordIcon sx={{ color, fontSize: size }} />
);

export default function ActiveShiftPanel({
  fixedHeight = 340,
  shiftsLoading,
  activeShifts,
  activeShiftTx,
  currency,
  forceEndShift,
  softDeleteTx,
  hardDeleteTx,
}) {
  return (
    <Card
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        height: fixedHeight,
        minHeight: fixedHeight,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Active shift&apos;s transactions
      </Typography>

      {shiftsLoading && <LinearProgress sx={{ mt: 0.5 }} />}

      {!shiftsLoading && (!activeShifts || activeShifts.length === 0) ? (
        <Paper variant="outlined" sx={{ p: 1.25, textAlign: "center" }}>
          No active shift.
        </Paper>
      ) : (
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: "wrap", gap: { xs: 1, sm: 1 } }}
        >
          {activeShifts.map((s) => {
            const st = s.startTime?.seconds
              ? new Date(s.startTime.seconds * 1000)
              : null;
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
                <LiveDot />
                <Typography variant="body2">
                  {s.shiftPeriod || "Shift"} — {s.staffEmail} • Start{" "}
                  {st ? st.toLocaleTimeString() : "—"}
                </Typography>
                <Tooltip title="Force End Shift">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => forceEndShift(s)}
                  >
                    <StopCircleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Paper>
            );
          })}
        </Stack>
      )}

      <TableContainer
        sx={{
          flex: 1,
          minHeight: 0,
          maxHeight: "100%",
          overflowX: "auto",
          borderRadius: 1.5,
          "& table": { minWidth: 520 },
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Notes</TableCell>
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
                const dt = r.timestamp?.seconds
                  ? new Date(r.timestamp.seconds * 1000)
                  : null;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell>{dt ? dt.toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{r.item}</TableCell>
                    <TableCell align="right">{r.quantity ?? ""}</TableCell>
                    <TableCell align="right">{currency(r.total)}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 180,
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
                      <Tooltip title="Hard delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => hardDeleteTx(r)}
                        >
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
    </Card>
  );
}
