import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Select, MenuItem, FormControl, InputLabel, Typography, Alert
} from '@mui/material';

const DrawerSettingsDialog = ({ open, onClose }) => {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load ports when dialog opens
  useEffect(() => {
    if (open) {
      loadPorts();
      const saved = localStorage.getItem('drawer_com_port');
      if (saved) setSelectedPort(saved);
    }
  }, [open]);

  const loadPorts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:5000/ports');
      if (!res.ok) throw new Error("Failed to connect to local backend.");
      const data = await res.json();
      setPorts(data);
    } catch (err) {
      setError("Could not load ports. Is the backend server running on Port 5000?");
      setPorts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem('drawer_com_port', selectedPort);
    onClose();
    alert(`Configuration Saved! Drawer will use ${selectedPort}`);
  };

  const handleTest = async () => {
    if (!selectedPort) return;
    try {
      const res = await fetch('http://localhost:5000/open-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portName: selectedPort })
      });
      if (res.ok) alert("Signal Sent! Did the drawer open?");
      else alert("Test Failed. Check backend logs.");
    } catch (e) {
      alert("Error sending test signal.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Cash Drawer Setup</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Select the COM port (USB Serial Device) where the cash drawer is connected.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <FormControl fullWidth>
          <InputLabel>COM Port</InputLabel>
          <Select
            value={selectedPort}
            label="COM Port"
            onChange={(e) => setSelectedPort(e.target.value)}
          >
            {ports.length === 0 && <MenuItem disabled>No ports found</MenuItem>}
            {ports.map((p) => (
              <MenuItem key={p.path} value={p.path}>
                {p.path} {p.manufacturer ? `- ${p.manufacturer}` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleTest} disabled={!selectedPort} color="warning">
          Test
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!selectedPort}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DrawerSettingsDialog;