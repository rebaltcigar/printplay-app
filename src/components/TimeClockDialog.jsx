import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, InputLabel, Select, MenuItem,
  Typography, Box, CircularProgress, Alert
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { verifyFingerprint } from '../utils/biometrics';

export default function TimeClockDialog({ open, onClose }) {
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [currentStatus, setCurrentStatus] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  // 1. Load Staff
  useEffect(() => {
    if (open) {
      const loadStaff = async () => {
        setLoading(true);
        try {
          const q = query(collection(db, 'users'), where('role', '==', 'staff'));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setStaffList(list.sort((a, b) => a.fullName.localeCompare(b.fullName)));
        } catch (err) {
          console.error("Error loading staff:", err);
        } finally {
          setLoading(false);
        }
      };
      loadStaff();
      setSelectedStaffId('');
      setCurrentStatus(null);
      setMessage(null);
    }
  }, [open]);

  // 2. Check Status (Local & Global)
  useEffect(() => {
    if (!selectedStaffId) {
      setCurrentStatus(null);
      return;
    }
    const user = staffList.find(u => u.id === selectedStaffId);
    // We rely on the 'isClockedIn' flag stored on the user document
    setCurrentStatus(user?.isClockedIn ? 'in' : 'out');
  }, [selectedStaffId, staffList]);

  // 3. Handle Clock Action
  const handleClockAction = async () => {
    setMessage(null);
    setProcessing(true);
    
    try {
      const staffUser = staffList.find(u => u.id === selectedStaffId);
      if (!staffUser) throw new Error("Staff not found.");

      const intendedAction = currentStatus === 'in' ? 'clock_out' : 'clock_in';

      // --- CONSTRAINT CHECK: SINGLE STAFF LOGIN ---
      if (intendedAction === 'clock_in') {
        // Check if ANYONE else is currently clocked in
        const qActive = query(collection(db, 'users'), where('isClockedIn', '==', true));
        const snapActive = await getDocs(qActive);
        
        // If someone is found AND it's not the current user (just in case state drifted)
        if (!snapActive.empty) {
          const activeUser = snapActive.docs[0].data();
          if (snapActive.docs[0].id !== staffUser.id) {
             throw new Error(`Cannot clock in. ${activeUser.fullName} is currently clocked in. They must clock out first.`);
          }
        }
      }
      // -------------------------------------------

      // A. Biometric Verification
      if (!staffUser.biometricId) throw new Error("No fingerprint registered.");
      const isVerified = await verifyFingerprint(staffUser.biometricId);
      if (!isVerified) throw new Error("Fingerprint verification failed.");

      // B. Save Log
      await addDoc(collection(db, 'payroll_logs'), {
        staffId: staffUser.id,
        staffName: staffUser.fullName,
        action: intendedAction,
        timestamp: serverTimestamp(),
        method: 'biometric'
      });

      // C. Update User Status Flag
      await updateDoc(doc(db, 'users', staffUser.id), {
        isClockedIn: intendedAction === 'clock_in'
      });

      // D. Update Local State
      setMessage({ 
        type: 'success', 
        text: `Successfully ${intendedAction === 'clock_in' ? 'Clocked IN' : 'Clocked OUT'}!` 
      });
      setCurrentStatus(intendedAction === 'clock_in' ? 'in' : 'out');
      
      // Refresh staff list to keep local flags in sync
      setStaffList(prev => prev.map(u => 
        u.id === staffUser.id ? { ...u, isClockedIn: intendedAction === 'clock_in' } : u
      ));

    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccessTimeIcon color="primary" /> Staff Time Clock
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          
          {message && <Alert severity={message.type}>{message.text}</Alert>}

          <FormControl fullWidth>
            <InputLabel>Select Your Name</InputLabel>
            <Select
              value={selectedStaffId}
              label="Select Your Name"
              onChange={(e) => setSelectedStaffId(e.target.value)}
              disabled={processing}
            >
              {staffList.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.fullName} {u.isClockedIn ? '(IN)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedStaffId && (
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
               <Typography variant="h5" fontWeight="bold" color={currentStatus === 'in' ? 'success.main' : 'text.secondary'}>
                  {currentStatus === 'in' ? 'CURRENTLY IN' : 'CURRENTLY OUT'}
               </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, flexDirection: 'column', gap: 1 }}>
        <Button
          fullWidth variant="contained" size="large"
          disabled={!selectedStaffId || processing}
          onClick={handleClockAction}
          startIcon={processing ? <CircularProgress size={20} color="inherit"/> : <FingerprintIcon />}
          color={currentStatus === 'in' ? 'warning' : 'primary'}
        >
          {processing ? 'Verifying...' : currentStatus === 'in' ? 'Scan to Clock OUT' : 'Scan to Clock IN'}
        </Button>
        <Button fullWidth onClick={onClose} disabled={processing}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}