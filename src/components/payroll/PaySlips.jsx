// src/components/payroll/PaySlips.jsx
// Pay slips listing — filter, view, and download generated pay stubs.
// Switched to Table for maximum stability and visual density.

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Skeleton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Button,
  useMediaQuery,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Checkbox,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useSearchParams } from "react-router-dom";

import ReceiptIcon from "@mui/icons-material/Receipt";
import PrintIcon from "@mui/icons-material/Print";
import PaidIcon from "@mui/icons-material/Paid";
import GroupIcon from "@mui/icons-material/Group";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import { fetchStubs } from "../../services/payrollService";
import { fmtCurrency, fmtDate } from "../../utils/formatters";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import DetailDrawer from "../common/DetailDrawer";
import PageHeader from "../common/PageHeader";
import SummaryCards from "../common/SummaryCards";
import PaySlipViewer from "./PaySlipViewer";
import { supabase } from "../../supabase";

export default function PaySlips({ appSettings }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [searchParams] = useSearchParams();
  const { showSnackbar } = useGlobalUI();

  const [stubs, setStubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedStub, setSelectedStub] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Staff list for filter
  const [staffList, setStaffList] = useState([]);
  const [filterStaff, setFilterStaff] = useState("");

  const totals = React.useMemo(() => ({
    count: stubs.length,
    netPay: stubs.reduce((sum, s) => sum + Number(s.net_pay || 0), 0),
    totalHours: stubs.reduce((sum, s) => sum + Number(s.total_hours || 0), 0),
  }), [stubs]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "staff")
      .order("full_name")
      .then(({ data }) => setStaffList(data || []));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const filters = {};
      const runParam = searchParams.get("run");
      if (runParam) filters.runId = runParam;
      if (filterStaff) filters.staffId = filterStaff;
      if (dateFrom) filters.fromDate = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
      if (dateTo) filters.toDate = new Date(`${dateTo}T23:59:59+08:00`).toISOString();

      const data = await fetchStubs(filters);
      setStubs(data);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load pay slips", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStaff, dateFrom, dateTo, searchParams]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(stubs.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBatchPrint = () => {
    showSnackbar(`Preparing ${selectedIds.length} slips for printing...`, "info");
    // Placeholder for batch print logic
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Employee Pay Slips"
        subtitle="View and print generated pay slips from previous payroll runs."
        actions={
          selectedIds.length > 0 && (
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={handleBatchPrint}
              size="small"
            >
              Print {selectedIds.length} Selected
            </Button>
          )
        }
      />

      {/* Filters */}
      <Box sx={{ mb: 3, p: 2, bgcolor: "background.paper", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Staff Member</InputLabel>
            <Select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} label="Staff Member">
              <MenuItem value="">All Staff</MenuItem>
              {staffList.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.full_name || s.email}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField 
            label="From" 
            type="date" 
            size="small" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)} 
            InputLabelProps={{ shrink: true }} 
            sx={{ minWidth: 140 }} 
          />
          <TextField 
            label="To" 
            type="date" 
            size="small" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            InputLabelProps={{ shrink: true }} 
            sx={{ minWidth: 140 }} 
          />
        </Stack>
      </Box>

      <SummaryCards
        loading={loading}
        sx={{ mb: 3 }}
        cards={[
          { label: "Total Slips", value: String(totals.count), icon: <ReceiptIcon fontSize="small" />, color: "primary.main" },
          { label: "Total Net Pay", value: fmtCurrency(totals.netPay), icon: <PaidIcon fontSize="small" />, color: "success.main", highlight: true },
          { label: "Total Hours", value: totals.totalHours.toFixed(2), icon: <AccessTimeIcon fontSize="small" />, color: "info.main" },
        ]}
      />

      {/* Table Area */}
      <TableContainer 
        component={Paper} 
        sx={{ 
          flex: 1, 
          minHeight: 0, 
          overflow: "auto", 
          maxHeight: { xs: "66vh", md: "70vh" }
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox 
                  size="small"
                  indeterminate={selectedIds.length > 0 && selectedIds.length < stubs.length}
                  checked={stubs.length > 0 && selectedIds.length === stubs.length}
                  onChange={handleToggleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Staff Member</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Pay Period</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Pay Date</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Hours</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Net Pay</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell padding="checkbox"><Skeleton variant="rectangular" width={20} height={20} /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: "auto" }} /></TableCell>
                  <TableCell align="right"><Skeleton variant="rectangular" width={60} height={30} sx={{ ml: "auto", borderRadius: 1 }} /></TableCell>
                </TableRow>
              ))
            ) : stubs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 10, textAlign: "center" }}>
                  <Typography variant="body2" color="text.secondary">No pay slips found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              stubs.map((row) => (
                <TableRow 
                  key={row.id} 
                  hover
                  selected={selectedIds.includes(row.id)}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 }, cursor: "pointer" }}
                  onClick={() => handleToggleId(row.id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox 
                      size="small" 
                      checked={selectedIds.includes(row.id)} 
                      onClick={(e) => { e.stopPropagation(); handleToggleId(row.id); }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: "0.75rem", bgcolor: alpha(theme.palette.success.main, 0.1), color: "success.main" }}>
                        {getInitials(row.staff_name)}
                      </Avatar>
                      <Typography variant="body2" fontWeight={600}>{row.staff_name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {fmtDate(row.period_start)} – {fmtDate(row.period_end)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{fmtDate(row.pay_date)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>{Number(row.total_hours || 0).toFixed(2)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      {fmtCurrency(row.net_pay)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={(e) => { e.stopPropagation(); setSelectedStub(row); }}
                      sx={{ textTransform: "none", borderRadius: 1.5 }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Batch Actions Overlay */}
      {selectedIds.length > 0 && (
        <Paper 
          elevation={10} 
          sx={{ 
            p: 2, 
            mt: 2, 
            borderRadius: 3, 
            bgcolor: alpha(theme.palette.background.paper, 0.8),
            backdropFilter: "blur(8px)",
            border: "1px solid", 
            borderColor: "primary.main" 
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" fontWeight={600}>
              {selectedIds.length} pay slips selected
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={handleBatchPrint}
              sx={{ textTransform: "none", borderRadius: 2 }}
            >
              Print Selected Slips
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button size="small" variant="text" onClick={() => setSelectedIds([])}>
              Cancel Selection
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!selectedStub}
        onClose={() => setSelectedStub(null)}
        title="Pay Slip"
        width={isMobile ? "100%" : 820}
      >
        {selectedStub && <PaySlipViewer stub={selectedStub} appSettings={appSettings} />}
      </DetailDrawer>
    </Box>
  );
}
