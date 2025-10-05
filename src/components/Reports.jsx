import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import ShiftDetailView from "./ShiftDetailView";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  where,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

function Reports() {
  const [shifts, setShifts] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [viewingShift, setViewingShift] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportView, setReportView] = useState("summary"); // 'summary' | 'detailed'

  // Shifts (with date filters)
  useEffect(() => {
    let qRef = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    if (startDate) {
      qRef = query(
        qRef,
        where("startTime", ">=", Timestamp.fromDate(new Date(startDate)))
      );
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      qRef = query(
        qRef,
        where("startTime", "<=", Timestamp.fromDate(endOfDay))
      );
    }
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.error("Error fetching shifts:", error);
        if (error.code === "failed-precondition") {
          alert(
            "Firestore needs an index for this query. Check the console for a link to create it."
          );
        }
      }
    );
    return () => unsub();
  }, [startDate, endDate]);

  // Users map (email -> fullName)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const map = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        map[data.email] = data.fullName;
      });
      setUserMap(map);
    });
    return () => unsub();
  }, []);

  // Services (for detailed headers)
  useEffect(() => {
    const qRef = query(collection(db, "services"), orderBy("sortOrder"));
    const unsub = onSnapshot(qRef, (snapshot) => {
      setAllServices(snapshot.docs.map((d) => d.data().serviceName));
    });
    return () => unsub();
  }, []);

  const detailedHeaders = useMemo(() => allServices, [allServices]);

  const handleExportToCSV = () => {
    let headers;
    let rows;

    if (reportView === "summary") {
      headers = [
        "Date",
        "Staff",
        "Shift Period",
        "PC Rental",
        "System Total",
        "Cash on Hand",
        "Difference",
      ];
      rows = shifts.map((shift) =>
        [
          shift.startTime
            ? new Date(shift.startTime.seconds * 1000).toLocaleDateString()
            : "N/A",
          userMap[shift.staffEmail] || shift.staffEmail,
          shift.shiftPeriod,
          shift.pcRentalTotal?.toFixed(2) || "0.00",
          shift.systemTotal?.toFixed(2) || "0.00",
          shift.cashOnHand?.toFixed(2) || "0.00",
          shift.difference?.toFixed(2) || "0.00",
        ].join(",")
      );
    } else if (reportView === "detailed") {
      headers = [
        "Date",
        "Staff",
        "Shift Period",
        ...detailedHeaders,
        "PC Rental",
        "System Total",
      ];
      rows = shifts.map((shift) => {
        const itemTotals = detailedHeaders.map((name) => {
          const v = (shift.salesBreakdown?.[name] ||
            shift.creditsBreakdown?.[name] ||
            0);
        return v.toFixed(2);
        });
        return [
          shift.startTime
            ? new Date(shift.startTime.seconds * 1000).toLocaleDateString()
            : "N/A",
          userMap[shift.staffEmail] || shift.staffEmail,
          shift.shiftPeriod,
          ...itemTotals,
          shift.pcRentalTotal?.toFixed(2) || "0.00",
          shift.systemTotal?.toFixed(2) || "0.00",
        ].join(",");
      });
    } else {
      return;
    }

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift_report_${reportView}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (viewingShift) {
    return (
      <ShiftDetailView
        shift={viewingShift}
        userMap={userMap}
        onBack={() => setViewingShift(null)}
      />
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <ToggleButtonGroup
          value={reportView}
          exclusive
          onChange={(e, v) => v && setReportView(v)}
        >
          <ToggleButton value="summary">Summary</ToggleButton>
          <ToggleButton value="detailed">Detailed</ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1} sx={{ mt: { xs: 2, md: 0 } }}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            onClick={handleExportToCSV}
            disabled={shifts.length === 0}
          >
            Export to CSV
          </Button>
        </Stack>
      </Box>

      {reportView === "summary" && (
        <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Shift Period</TableCell>
                <TableCell align="right">System Total</TableCell>
                <TableCell align="right">Difference</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow
                  key={shift.id}
                  hover
                  onClick={() => setViewingShift(shift)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    {shift.startTime
                      ? new Date(
                          shift.startTime.seconds * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>{userMap[shift.staffEmail] || shift.staffEmail}</TableCell>
                  <TableCell>{shift.shiftPeriod}</TableCell>
                  <TableCell align="right">
                    ₱{shift.systemTotal?.toFixed(2) || "0.00"}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color:
                        (shift.difference || 0) !== 0 ? "error.main" : "inherit",
                    }}
                  >
                    ₱{shift.difference?.toFixed(2) || "0.00"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {reportView === "detailed" && (
        <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Shift Period</TableCell>
                {allServices.map((h) => (
                  <TableCell key={h} align="right">
                    {h}
                  </TableCell>
                ))}
                <TableCell align="right">PC Rental</TableCell>
                <TableCell align="right">System Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow
                  key={shift.id}
                  hover
                  onClick={() => setViewingShift(shift)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    {shift.startTime
                      ? new Date(
                          shift.startTime.seconds * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>{userMap[shift.staffEmail] || shift.staffEmail}</TableCell>
                  <TableCell>{shift.shiftPeriod}</TableCell>
                  {allServices.map((h) => (
                    <TableCell key={h} align="right">
                      ₱
                      {(
                        shift.salesBreakdown?.[h] ||
                        shift.creditsBreakdown?.[h] ||
                        0
                      ).toFixed(2)}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    ₱{shift.pcRentalTotal?.toFixed(2) || "0.00"}
                  </TableCell>
                  <TableCell align="right">
                    ₱{shift.systemTotal?.toFixed(2) || "0.00"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default Reports;
