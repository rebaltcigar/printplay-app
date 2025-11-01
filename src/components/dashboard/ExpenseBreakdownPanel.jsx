// src/components/dashboard/ExpenseBreakdownPanel.jsx
import React from "react";
import {
  Card,
  Typography,
  Stack,
  Box,
  LinearProgress,
} from "@mui/material";
import { fmtPeso } from "../../utils/analytics";

export default function ExpenseBreakdownPanel({ data }) {
  const list = data?.list || [];
  const total = data?.total || 0;

  return (
    <Card
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        height: "100%",
        minHeight: 280,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        Expense Breakdown
      </Typography>
      {list.length === 0 ? (
        <Typography variant="body2">No expenses in this range.</Typography>
      ) : (
        <Stack
          spacing={1}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            pr: 1,
          }}
        >
          {list.map((row) => {
            const pct = total > 0 ? (row.amount / total) * 100 : 0;
            return (
              <Stack
                key={row.type}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Box sx={{ width: 160 }}>
                  <Typography variant="body2" noWrap>
                    {row.type}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, pct)}
                  sx={{ flex: 1, height: 8, borderRadius: 999 }}
                />
                <Box sx={{ width: 120, textAlign: "right" }}>
                  <Typography variant="body2">
                    {fmtPeso(row.amount)} ({pct.toFixed(1)}%)
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
