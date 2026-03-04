// src/components/Payroll.jsx
import React, { useState, useRef } from "react";
import { Box, Card, Tab, Tabs } from "@mui/material";
import RunPayroll from "./payroll/RunPayroll";
import AllRuns from "./payroll/AllRuns";
import PayRates from "./payroll/PayRates";
import PageHeader from "./common/PageHeader";

export default function Payroll({ user, showSnackbar }) {
  const [tab, setTab] = useState(0);
  const requestOpenDialogRef = useRef(null);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3 }}>
      <PageHeader
        title="Payroll"
        subtitle="Manage staff salaries, pay rates, and generate paystubs."
      />
      <Card sx={{ p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Run Payroll" />
          <Tab label="All Runs" />
          <Tab label="Pay Rates" />
        </Tabs>
      </Card>

      <Box>
        {tab === 0 && (
          <RunPayroll
            user={user}
            requestOpenDialogRef={requestOpenDialogRef}
            showSnackbar={showSnackbar}
          />
        )}
        {tab === 1 && (
          <AllRuns
            showSnackbar={showSnackbar}
          />
        )}
        {tab === 2 && <PayRates showSnackbar={showSnackbar} />}
      </Box>
    </Box>
  );
}
