// src/views/Payroll.jsx
import React, { useState, useRef } from "react";
import { Box, Card, Tab, Tabs } from "@mui/material";
import RunPayroll from "../components/payroll/RunPayroll";
import AllRuns from "../components/payroll/AllRuns";
import PayRates from "../components/payroll/PayRates";
import PaystubDialog from "../components/Paystub"; // same as your old import

export default function Payroll({ user, showSnackbar }) {
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
            showSnackbar={showSnackbar}
          />
        )}
        {tab === 1 && (
          <AllRuns
            onOpenRunInModal={openRunInModalFromHistory}
            onOpenPaystubs={(runId) => setStubRunId(runId)}
            showSnackbar={showSnackbar}
          />
        )}
        {tab === 2 && <PayRates showSnackbar={showSnackbar} />}
      </Box>

      <PaystubDialog
        open={!!stubRunId}
        onClose={() => setStubRunId(null)}
        runId={stubRunId}
      />
    </Box>
  );
}
