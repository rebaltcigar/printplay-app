import React, { useEffect, useState } from "react";
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, CircularProgress
} from "@mui/material";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import FingerprintIcon from '@mui/icons-material/Fingerprint';

export default function AttendanceLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        // Fetch last 100 logs (newest first)
        const q = query(
          collection(db, "payroll_logs"),
          orderBy("timestamp", "desc"),
          limit(100)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLogs(data);
      } catch (err) {
        console.error("Error loading logs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp?.seconds) return "—";
    return new Date(timestamp.seconds * 1000).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Biometric Attendance Logs (Last 100)
      </Typography>
      
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Staff Name</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Method</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center"><CircularProgress size={24} /></TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">No logs found.</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>{formatTime(log.timestamp)}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{log.staffName}</TableCell>
                  <TableCell>
                    <Chip 
                      label={log.action === 'clock_in' ? "IN" : "OUT"} 
                      color={log.action === 'clock_in' ? "success" : "default"} 
                      size="small" 
                      variant="outlined"
                      sx={{ minWidth: 60, fontWeight: 'bold' }}
                    />
                  </TableCell>
                  <TableCell>
                    {log.method === 'biometric' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.6 }}>
                        <FingerprintIcon fontSize="inherit" />
                        <Typography variant="caption">Fingerprint</Typography>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}