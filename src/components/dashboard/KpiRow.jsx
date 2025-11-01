// src/components/admin/KpiRow.jsx
import React from "react";
import { Box, Card, LinearProgress, Typography } from "@mui/material";

function KpiCard({ title, value, loading, emphasize }) {
  return (
    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: "100%" }}>
      <Typography variant="caption" sx={{ opacity: 0.7, fontSize: { xs: 11, sm: 12 } }}>
        {title}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          mt: 0.5,
          fontSize: { xs: 18, sm: 20 },
          color:
            emphasize === "good"
              ? "success.main"
              : emphasize === "bad"
              ? "error.main"
              : "inherit",
          fontWeight: 700,
        }}
      >
        {value}
      </Typography>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
    </Card>
  );
}

export default function KpiRow({ kpi, txLoading, shiftsLoading, debtLoading, currency }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: { xs: 1.5, md: 2 },
        width: "100%",
      }}
    >
      <KpiCard title="Sales" loading={txLoading || shiftsLoading} value={currency(kpi.sales)} />
      <KpiCard title="Expenses" loading={txLoading} value={currency(kpi.expenses)} />
      <KpiCard
        title="Net"
        loading={txLoading || shiftsLoading}
        value={currency(kpi.net)}
        emphasize={kpi.net >= 0 ? "good" : "bad"}
      />
      <KpiCard
        title="Outstanding Debt (All Time)"
        loading={debtLoading}
        value={currency(kpi.outstandingDebt)}
      />
    </Box>
  );
}
