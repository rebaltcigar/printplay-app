// src/components/dashboard/StaffLeaderboardPanel.jsx
import React from "react";
import {
  Card,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { fmtPeso } from "../../utils/analytics";

export default function StaffLeaderboardPanel({ fixedHeight = 340, rows = [] }) {
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
        Staff Leaderboard
      </Typography>
      <TableContainer
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          borderRadius: 1.25,
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Staff</TableCell>
              <TableCell align="right">Total Sales</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2}>No data.</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.staff}>
                  <TableCell>{r.staff}</TableCell>
                  <TableCell align="right">{fmtPeso(r.sales)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
