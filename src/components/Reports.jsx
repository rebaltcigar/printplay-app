import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, TextField, Button, Stack, ToggleButtonGroup, ToggleButton } from '@mui/material';
import ShiftDetailView from './ShiftDetailView';
import DebtReport from './DebtReport';
import { db } from '../firebase';
import { collection, query, orderBy, where, getDocs, Timestamp, onSnapshot } from 'firebase/firestore';

function Reports() {
  const [shifts, setShifts] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [viewingShift, setViewingShift] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportView, setReportView] = useState('summary');

  useEffect(() => {
    let q = query(collection(db, "shifts"), orderBy("startTime", "desc"));
    if (startDate) {
      q = query(q, where("startTime", ">=", Timestamp.fromDate(new Date(startDate))));
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      q = query(q, where("startTime", "<=", Timestamp.fromDate(endOfDay)));
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setShifts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching shifts:", error);
      if (error.code === 'failed-precondition') {
        alert("Firestore needs an index for this query. Check the developer console (F12) for a link to create it.");
      }
    });
    return () => unsubscribe();
  }, [startDate, endDate]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const users = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        users[data.email] = data.fullName;
      });
      setUserMap(users);
    });
    return () => unsub();
  }, []);
  
  useEffect(() => {
    const q = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllServices(snapshot.docs.map(doc => doc.data().serviceName));
    });
    return () => unsubscribe();
  }, []);

  const detailedHeaders = useMemo(() => {
    return allServices;
  }, [allServices]);

  const handleExportToCSV = () => {
    let headers;
    let rows;

    if (reportView === 'summary') {
      headers = ["Date", "Staff", "Shift Period", "PC Rental", "System Total", "Cash on Hand", "Difference"];
      rows = shifts.map(shift => [
        shift.startTime ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : 'N/A',
        userMap[shift.staffEmail] || shift.staffEmail,
        shift.shiftPeriod,
        shift.pcRentalTotal?.toFixed(2) || '0.00',
        shift.systemTotal?.toFixed(2) || '0.00',
        shift.cashOnHand?.toFixed(2) || '0.00',
        shift.difference?.toFixed(2) || '0.00',
      ].join(','));
    } else if (reportView === 'detailed') {
      headers = ["Date", "Staff", "Shift Period", ...detailedHeaders, "PC Rental", "System Total"];
      rows = shifts.map(shift => {
        const itemTotals = detailedHeaders.map(header => {
          const total = (shift.salesBreakdown?.[header] || shift.creditsBreakdown?.[header] || 0);
          return total.toFixed(2);
        });
        return [
          shift.startTime ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : 'N/A',
          userMap[shift.staffEmail] || shift.staffEmail,
          shift.shiftPeriod,
          ...itemTotals,
          shift.pcRentalTotal?.toFixed(2) || '0.00',
          shift.systemTotal?.toFixed(2) || '0.00',
        ].join(',');
      });
    } else {
      // No export for debt report yet
      return;
    }

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `shift_report_${reportView}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (viewingShift) {
    return <ShiftDetailView shift={viewingShift} userMap={userMap} onBack={() => setViewingShift(null)} />;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={reportView}
          exclusive
          onChange={(e, newView) => { if (newView !== null) setReportView(newView); }}
        >
          <ToggleButton value="summary">Summary</ToggleButton>
          <ToggleButton value="detailed">Detailed</ToggleButton>
          <ToggleButton value="debts">Debts</ToggleButton>
        </ToggleButtonGroup>
        
        {reportView !== 'debts' && (
          <Stack direction="row" spacing={1} sx={{ mt: { xs: 2, md: 0 } }}>
            <TextField label="Start Date" type="date" size="small" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="End Date" type="date" size="small" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant="outlined" onClick={handleExportToCSV} disabled={shifts.length === 0}>Export to CSV</Button>
          </Stack>
        )}
      </Box>

      {reportView === 'summary' && (
        <TableContainer component={Paper}>
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
                <TableRow key={shift.id} hover onClick={() => setViewingShift(shift)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{shift.startTime ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>{userMap[shift.staffEmail] || shift.staffEmail}</TableCell>
                  <TableCell>{shift.shiftPeriod}</TableCell>
                  <TableCell align="right">₱{shift.systemTotal?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell align="right" sx={{ color: shift.difference !== 0 ? 'error.main' : 'inherit' }}>
                    ₱{shift.difference?.toFixed(2) || '0.00'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {reportView === 'detailed' && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Staff</TableCell>
                {allServices.map(header => <TableCell key={header} align="right">{header}</TableCell>)}
                <TableCell align="right">PC Rental</TableCell>
                <TableCell align="right">System Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id} hover onClick={() => setViewingShift(shift)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{shift.startTime ? new Date(shift.startTime.seconds * 1000).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>{userMap[shift.staffEmail] || shift.staffEmail}</TableCell>
                  {allServices.map(header => (
                    <TableCell key={header} align="right">
                      ₱{(shift.salesBreakdown?.[header] || shift.creditsBreakdown?.[header] || 0).toFixed(2)}
                    </TableCell>
                  ))}
                  <TableCell align="right">₱{shift.pcRentalTotal?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell align="right">₱{shift.systemTotal?.toFixed(2) || '0.00'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {reportView === 'debts' && <DebtReport />}
    </Box>
  );
}

export default Reports;