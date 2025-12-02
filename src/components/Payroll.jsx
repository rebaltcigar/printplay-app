// src/components/Payroll.jsx
import React, { useState, useRef } from "react";
import { Box, Card, Tab, Tabs } from "@mui/material";
import RunPayroll from "../components/payroll/RunPayroll";
import AllRuns from "../components/payroll/AllRuns";
import PayRates from "../components/payroll/PayRates";
// 1. IMPORT THE NEW COMPONENT
import AttendanceLog from "../components/payroll/AttendanceLog"; 
import PaystubDialog from "../components/Paystub";

export default function Payroll({ user }) {
  const [tab, setTab] = useState(0);
  const [openRunId, setOpenRunId] = useState("");
  const [openDialogAfterLoad, setOpenDialogAfterLoad] = useState(false);
  const [stubRunId, setStubRunId] = useState(null);
  const requestOpenDialogRef = useRef(null);

  const openRunInModalFromHistory = (id) => {
    setOpenRunId(id);
    setOpenDialogAfterLoad(true);
    setTab(0);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
          {/* 2. ADD TAB LABEL */}
          <Tab label="Attendance Logs" />
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
        
        {/* 3. RENDER THE COMPONENT */}
        {tab === 3 && <AttendanceLog />}
      </Box>

      <PaystubDialog
        open={!!stubRunId}
        onClose={() => setStubRunId(null)}
        runId={stubRunId}
      />
    </Box>
  );
}