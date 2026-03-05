// src/components/pos/MyAccountDrawer.jsx
// Staff self-service: update display name only. Password change is admin-only.

import React, { useState, useEffect } from 'react';
import {
  Box, TextField, Button, Stack, Typography, Alert, Divider,
} from '@mui/material';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import DetailDrawer from '../common/DetailDrawer';

export default function MyAccountDrawer({ open, onClose, user, showSnackbar }) {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => {
    if (!open || !user?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setFullName(d.fullName || d.name || d.displayName || '');
          setEmail(d.email || user.email || '');
        }
      } catch (e) { console.error(e); }
    })();
  }, [open, user?.uid]);

  const handleSave = async () => {
    if (!fullName.trim()) { setErr('Name cannot be empty.'); return; }
    setSaving(true); setErr('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim(),
      });
      showSnackbar?.('Display name updated.', 'success');
      onClose();
    } catch {
      setErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="My Account"
      width={380}
      loading={saving}
      disableClose={saving}
      actions={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Stack spacing={2.5}>
        {err && <Alert severity="error">{err}</Alert>}

        <TextField
          label="Display Name"
          value={fullName}
          onChange={e => { setFullName(e.target.value); setErr(''); }}
          fullWidth
          disabled={saving}
          helperText="This name appears in shift logs and reports."
        />

        <TextField
          label="Email"
          value={email}
          fullWidth
          disabled
          helperText="Email cannot be changed here."
        />

        <Divider />

        <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Password change</strong> is handled by your admin. Contact your administrator to reset your password.
          </Typography>
        </Box>
      </Stack>
    </DetailDrawer>
  );
}
