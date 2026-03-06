// src/components/Paystub.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  IconButton,
} from "@mui/material";
import DetailDrawer from "./common/DetailDrawer";
import DownloadIcon from "@mui/icons-material/Download";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import html2canvas from "html2canvas";

// ====== CONFIG ======
const PAYSLIP_WIDTH = "720px"; // change to "80mm" or "600px" if you like

const formatCurrency = (n) =>
  `₱${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;


const formatTimeRange = (start, end) => {
  if (!start?.seconds) return "—";
  const s = new Date(start.seconds * 1000);
  const startTime = s.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
  if (!end?.seconds) return `${startTime} - (Ongoing)`;
  const e = new Date(end.seconds * 1000);
  const endTime = e.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
  return `${startTime} - ${endTime} `;
};

// ---------- Single Paystub ----------
export function Paystub({ stub }) {
  const paystubRef = useRef(null);
  const [storeName, setStoreName] = useState('Kunek');
  useEffect(() => {
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists() && snap.data().storeName) setStoreName(snap.data().storeName);
    }).catch(() => {});
  }, []);

  if (!stub) {
    return (
      <Typography color="text.secondary">
        Select a paystub to view.
      </Typography>
    );
  }

  const handleSaveAsImage = () => {
    if (!paystubRef.current) {
      console.error("Paystub element not found.");
      return;
    }

    const payDate = stub.payDate?.seconds
      ? new Date(stub.payDate.seconds * 1000)
      : new Date();
    const mm = String(payDate.getMonth() + 1).padStart(2, "0");
    const dd = String(payDate.getDate()).padStart(2, "0");
    const yyyy = payDate.getFullYear();
    const dateString = `${mm}${dd}${yyyy} `;
    const staffName = (stub.staffName || "Employee").replace(/\s+/g, "_");
    const fileName = `Pay_Stub_${staffName}_${dateString}.png`;

    html2canvas(paystubRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
    }).then((canvas) => {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  // Totals for display
  const grossPay = Number(stub.grossPay || 0);
  const totalAdditions = Number(stub.totalAdditions || 0);
  const totalDeductions = Number(stub.totalDeductions || 0);
  const netPay = Number(stub.netPay || 0);

  const hasAdditions = (stub.additionItems && stub.additionItems.length > 0);

  return (
    <Box>
      <Tooltip
        title="Save as Image"
        sx={{ mb: 1, display: "block", textAlign: "right" }}
      >
        <IconButton onClick={handleSaveAsImage} color="primary">
          <DownloadIcon />
        </IconButton>
      </Tooltip>

      {/* FIXED-WIDTH PAYSLIP */}
      <Box
        ref={paystubRef}
        className="paystub-print-area"
        sx={{
          width: PAYSLIP_WIDTH,
          maxWidth: "100%",
          mx: "auto",
          p: 4,
          backgroundColor: "#fff",
          border: "1px solid #ddd",
          display: "flex",
          flexDirection: "column",
          // force text to be black inside the payslip
          color: "#000",
          "& *": {
            color: "#000 !important",
          },
        }}
      >
        {/* Header */}
        <Box sx={{ mb: 3, textAlign: "center" }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: "bold" }}>
            {storeName}
          </Typography>
          <Typography variant="body1">
            6 Abra St. Bago Bantay Quezon City
          </Typography>
        </Box>

        <Divider sx={{ my: 2, borderColor: "#ccc" }} />

        {/* Employee and Pay Date Info */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1">
            <strong>Employee Name:</strong> {stub.staffName || "N/A"}
          </Typography>
          <Typography variant="body1">
            <strong>Pay Date:</strong>{" "}
            {stub.payDate?.seconds
              ? new Date(stub.payDate.seconds * 1000).toLocaleDateString(
                "en-US",
                {
                  month: "2-digit",
                  day: "2-digit",
                  year: "numeric",
                }
              )
              : "N/A"}
          </Typography>
          {/* optional: period */}
          {stub.periodStart?.seconds && stub.periodEnd?.seconds && (
            <Typography variant="body1">
              <strong>Period:</strong>{" "}
              {new Date(
                stub.periodStart.seconds * 1000
              ).toLocaleDateString("en-US")}{" "}
              –{" "}
              {new Date(
                stub.periodEnd.seconds * 1000
              ).toLocaleDateString("en-US")}
            </Typography>
          )}
        </Box>

        {/* Shift Details */}
        <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
          Shift Details
        </Typography>
        <TableContainer sx={{ border: "1px solid #ddd", mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Shift</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Time</TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  Hours
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stub.shifts || []).map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>{shift.label}</TableCell>
                  <TableCell>{formatTimeRange(shift.startTime, shift.endTime)}</TableCell>
                  <TableCell align="right">
                    {Number(shift.hours).toFixed(2)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(shift.pay || 0)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals for Shifts */}
              <TableRow sx={{ backgroundColor: "#f0f0f0" }}>
                <TableCell colSpan={2} component="th" scope="row" sx={{ fontWeight: "bold" }}>
                  Total Hours | Gross Pay
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  {Number(stub.totalHours || 0).toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  {formatCurrency(grossPay)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Additions (New Section) */}
        {hasAdditions && (
          <>
            <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
              Additions
            </Typography>
            <TableContainer sx={{ border: "1px solid #ddd", mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#e8f5e9" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>Item</TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Amount
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stub.additionItems.map((item, index) => (
                    <TableRow key={item.id + index}>
                      <TableCell>{item.label}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ backgroundColor: "#e8f5e9" }}>
                    <TableCell component="th" scope="row" sx={{ fontWeight: "bold" }}>
                      Total Additions
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      {formatCurrency(totalAdditions)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Deductions */}
        <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
          Deductions
        </Typography>
        <TableContainer sx={{ border: "1px solid #ddd" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#ffebee" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Item</TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stub.deductionItems || []).length > 0 ? (
                stub.deductionItems.map((item, index) => (
                  <TableRow key={item.id + index}>
                    <TableCell>{item.label}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(item.amount)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2}>No deductions for this period.</TableCell>
                </TableRow>
              )}
              {/* Total for Deductions */}
              <TableRow sx={{ backgroundColor: "#ffebee" }}>
                <TableCell component="th" scope="row" sx={{ fontWeight: "bold" }}>
                  Total Deductions
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  {formatCurrency(totalDeductions)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Final Summary */}
        <Box sx={{ mt: "auto", pt: 3, maxWidth: "400px", ml: "auto" }}>
          <TableContainer>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ border: 0 }}>Gross Pay (Shifts)</TableCell>
                  <TableCell align="right" sx={{ border: 0 }}>
                    {formatCurrency(grossPay)}
                  </TableCell>
                </TableRow>
                {totalAdditions > 0 && (
                  <TableRow>
                    <TableCell sx={{ border: 0, color: 'green !important' }}>Additions</TableCell>
                    <TableCell align="right" sx={{ border: 0, color: 'green !important' }}>
                      + {formatCurrency(totalAdditions)}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell sx={{ border: 0 }}>Deductions</TableCell>
                  <TableCell align="right" sx={{ border: 0, color: 'red !important' }}>
                    - {formatCurrency(totalDeductions)}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: "#f0f0f0" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>NET PAY</TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: "bold",
                      fontSize: "1.1rem",
                    }}
                  >
                    {formatCurrency(netPay)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </Box>
  );
}

// ---------- Paystub Drawer (Container) ----------
export default function PaystubDialog({ open, onClose, runId }) {
  const [stubs, setStubs] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!open || !runId) {
      setStubs([]);
      setActive(null);
      return;
    }
    (async () => {
      const snap = await getDocs(
        collection(db, "payrollRuns", runId, "paystubs")
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.staffName || "").localeCompare(b.staffName || ""));
      setStubs(list);
      setActive(list[0]?.id || null);
    })();
  }, [open, runId]);

  const activeStub = useMemo(
    () => stubs.find((s) => s.id === active) || null,
    [stubs, active]
  );

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Paystubs"
      subtitle={stubs.length ? `${stubs.length} staff member${stubs.length !== 1 ? "s" : ""}` : undefined}
      width={800}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      <Stack direction="row" spacing={2} sx={{ height: "100%" }}>
        {/* LEFT: staff list */}
        <Stack spacing={1} sx={{ minWidth: 150, flexShrink: 0 }}>
          {stubs.map((s) => (
            <Button
              key={s.id}
              variant={s.id === active ? "contained" : "outlined"}
              size="small"
              onClick={() => setActive(s.id)}
              sx={{ justifyContent: "flex-start" }}
            >
              {s.staffName || s.staffEmail}
            </Button>
          ))}
          {!stubs.length && (
            <Typography color="text.secondary" variant="body2">
              No paystubs for this run.
            </Typography>
          )}
        </Stack>

        <Divider orientation="vertical" flexItem />

        {/* RIGHT: paystub content */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {activeStub ? (
            <Paystub stub={activeStub} />
          ) : (
            <Typography color="text.secondary">Select a paystub.</Typography>
          )}
        </Box>
      </Stack>
    </DetailDrawer>
  );
}