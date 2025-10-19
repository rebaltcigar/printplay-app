import React, { useEffect, useMemo, useState, useRef } from "react";
import { Box, Typography, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, IconButton } from "@mui/material";
import DownloadIcon from '@mui/icons-material/Download';
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import html2canvas from 'html2canvas';

// Helper to format numbers as currency with the Peso sign
const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The main component for displaying a single paystub
function Paystub({ stub }) {
  const paystubRef = useRef(null);

  if (!stub) {
    return <Typography color="text.secondary">Select a paystub to view.</Typography>;
  }

  const handleSaveAsImage = () => {
    if (!paystubRef.current) {
      console.error("Paystub element not found.");
      return;
    }

    // Format the filename
    const payDate = stub.payDate?.seconds ? new Date(stub.payDate.seconds * 1000) : new Date();
    const mm = String(payDate.getMonth() + 1).padStart(2, '0');
    const dd = String(payDate.getDate()).padStart(2, '0');
    const yyyy = payDate.getFullYear();
    const dateString = `${mm}${dd}${yyyy}`;
    const staffName = (stub.staffName || 'Employee').replace(/\s+/g, '_');
    const fileName = `Pay_Stub_${staffName}_${dateString}.png`;

    html2canvas(paystubRef.current, { 
      scale: 2, // Increase scale for better image quality
      backgroundColor: '#ffffff' // Ensure background is white
    }).then(canvas => {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <Box>
      <Tooltip title="Save as Image" sx={{ mb: 1, display: 'block', textAlign: 'right' }}>
        <IconButton onClick={handleSaveAsImage} color="primary">
          <DownloadIcon />
        </IconButton>
      </Tooltip>
      <Box ref={paystubRef} sx={{ p: 4, backgroundColor: '#fff', color: '#000', border: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
            Print+Play Computer Shop
          </Typography>
          <Typography variant="body1">
            6 Abra St. Bago Bantay Quezon City
          </Typography>
        </Box>

        <Divider sx={{ my: 2, borderColor: '#ccc' }} />

        {/* Employee and Pay Date Info */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1">
            <strong>Employee Name:</strong> {stub.staffName || 'N/A'}
          </Typography>
          <Typography variant="body1">
            <strong>Pay Date:</strong> {stub.payDate?.seconds ? new Date(stub.payDate.seconds * 1000).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric'}) : "N/A"}
          </Typography>
        </Box>

        {/* Shift Details */}
        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>Shift Details</Typography>
        <TableContainer sx={{ border: '1px solid #ddd' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold', color: '#000' }}>Shift</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#000' }}>Hours</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stub.shifts || []).map(shift => (
                <TableRow key={shift.id}>
                  <TableCell sx={{ color: '#000' }}>{shift.label}</TableCell>
                  <TableCell align="right" sx={{ color: '#000' }}>{Number(shift.hours).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {/* Totals for Shifts */}
              <TableRow sx={{ backgroundColor: '#f0f0f0' }}>
                <TableCell component="th" scope="row" sx={{ fontWeight: 'bold', color: '#000' }}>
                  Total Hours | Gross Pay
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#000' }}>
                  {Number(stub.totalHours || 0).toFixed(2)} | {formatCurrency(stub.grossPay)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Deductions */}
        <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 3, mb: 1 }}>Deductions</Typography>
        <TableContainer sx={{ border: '1px solid #ddd' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold', color: '#000' }}>Item</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#000' }}>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stub.deductionItems || []).length > 0 ? (
                stub.deductionItems.map((item, index) => (
                  <TableRow key={item.id + index}>
                    <TableCell sx={{ color: '#000' }}>{item.label}</TableCell>
                    <TableCell align="right" sx={{ color: '#000' }}>{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} sx={{ color: '#000' }}>No deductions for this period.</TableCell>
                </TableRow>
              )}
              {/* Total for Deductions */}
              <TableRow sx={{ backgroundColor: '#f0f0f0' }}>
                <TableCell component="th" scope="row" sx={{ fontWeight: 'bold', color: '#000' }}>
                  Total Deductions
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#000' }}>
                  {formatCurrency(stub.totalDeductions)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Final Summary */}
        <Box sx={{ mt: 'auto', pt: 3, maxWidth: '400px', ml: 'auto' }}>
          <TableContainer>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ border: 0, color: '#000' }}>Gross Pay</TableCell>
                  <TableCell align="right" sx={{ border: 0, color: '#000' }}>{formatCurrency(stub.grossPay)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, color: '#000' }}>Deductions</TableCell>
                  <TableCell align="right" sx={{ border: 0, color: '#000' }}>{formatCurrency(stub.totalDeductions)}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: '#f0f0f0' }}>
                  <TableCell sx={{ fontWeight: 'bold', color: '#000' }}>NET PAY</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#000' }}>
                    {formatCurrency(stub.netPay)}
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

/* ---------- Paystub Dialog (Container) ---------- */
export default function PaystubDialog({ open, onClose, runId }) {
  const [stubs, setStubs] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!open || !runId) {
      setStubs([]);
      setActive(null);
      return;
    };
    (async () => {
      const snap = await getDocs(collection(db, "payrollRuns", runId, "paystubs"));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.staffName || "").localeCompare(b.staffName || ""));
      setStubs(list);
      setActive(list[0]?.id || null);
    })();
  }, [open, runId]);

  const activeStub = useMemo(() => stubs.find(s => s.id === active) || null, [stubs, active]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Paystubs</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ minHeight: '60vh' }}>
          <Grid item xs={12} md={3}>
            <Stack spacing={1}>
              {stubs.map(s => (
                <Button
                  key={s.id}
                  variant={s.id === active ? "contained" : "outlined"}
                  onClick={() => setActive(s.id)}
                  sx={{ justifyContent: "flex-start" }}
                >
                  {s.staffName || s.staffEmail}
                </Button>
              ))}
              {!stubs.length && <Typography color="text.secondary">No paystubs for this run.</Typography>}
            </Stack>
          </Grid>
          <Grid item xs={12} md={9}>
            {activeStub ? (
              <Paystub stub={activeStub} />
            ) : (
              <Typography color="text.secondary">Select a paystub.</Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}