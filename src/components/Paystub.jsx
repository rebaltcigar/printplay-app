// src/components/Paystub.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
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
import DownloadIcon from "@mui/icons-material/Download";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import html2canvas from "html2canvas";

// ====== CONFIG ======
const PAYSLIP_WIDTH = "720px"; // change to "80mm" or "600px" if you like

// Helper to format numbers as currency with the Peso sign
const formatCurrency = (n) =>
  `₱${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ---------- Single Paystub ----------
function Paystub({ stub }) {
  const paystubRef = useRef(null);

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
    const dateString = `${mm}${dd}${yyyy}`;
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
            Print+Play Computer Shop
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
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  Hours
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stub.shifts || []).map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>{shift.label}</TableCell>
                  <TableCell align="right">
                    {Number(shift.hours).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals for Shifts */}
              <TableRow sx={{ backgroundColor: "#f0f0f0" }}>
                <TableCell component="th" scope="row" sx={{ fontWeight: "bold" }}>
                  Total Hours | Gross Pay
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  {Number(stub.totalHours || 0).toFixed(2)} |{" "}
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

// ---------- Paystub Dialog (Container) ----------
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
      list.sort((a, b) =>
        (a.staffName || "").localeCompare(b.staffName || "")
      );
      setStubs(list);
      setActive(list[0]?.id || null);
    })();
  }, [open, runId]);

  const activeStub = useMemo(
    () => stubs.find((s) => s.id === active) || null,
    [stubs, active]
  );

  // print css to keep width when someone hits CTRL+P
  const printCss = `
    @media print {
      .MuiDialog-paper {
        margin: 0 !important;
        max-width: none !important;
        width: auto !important;
        box-shadow: none !important;
      }
      .paystub-print-area {
        width: ${PAYSLIP_WIDTH} !important;
        margin: 0 auto !important;
        box-shadow: none !important;
      }
      .paystub-dialog-left,
      .MuiDialogActions-root {
        display: none !important;
      }
      body {
        background: #fff !important;
      }
    }
  `;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      {/* inject print styles */}
      <style>{printCss}</style>

      <DialogTitle>Paystubs</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ minHeight: "60vh" }}>
          {/* LEFT: per staff list (kept exactly like you had it) */}
          <Grid item xs={12} md={3} className="paystub-dialog-left">
            <Stack spacing={1}>
              {stubs.map((s) => (
                <Button
                  key={s.id}
                  variant={s.id === active ? "contained" : "outlined"}
                  onClick={() => setActive(s.id)}
                  sx={{ justifyContent: "flex-start" }}
                >
                  {s.staffName || s.staffEmail}
                </Button>
              ))}
              {!stubs.length && (
                <Typography color="text.secondary">
                  No paystubs for this run.
                </Typography>
              )}
            </Stack>
          </Grid>

          {/* RIGHT: payslip (now fixed width, black text) */}
          <Grid item xs={12} md={9}>
            {activeStub ? (
              <Paystub stub={activeStub} />
            ) : (
              <Typography color="text.secondary">Select a paystub.</Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}