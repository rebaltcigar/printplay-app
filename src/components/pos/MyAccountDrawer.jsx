// src/components/pos/MyAccountDrawer.jsx
// Staff profile view — display only. Name and role are managed by admins.

import React, { useState, useEffect } from 'react';
import {
  Box, Stack, Typography, Divider,
} from '@mui/material';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import DetailDrawer from '../common/DetailDrawer';

export default function MyAccountDrawer({ open, onClose, user }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!open || !user?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch (e) { console.error(e); }
    })();
  }, [open, user?.uid]);

  const name  = profile?.fullName || profile?.name || profile?.displayName || '—';
  const email = profile?.email || user?.email || '—';
  const role  = profile?.role || '—';

  return (
    <DetailDrawer open={open} onClose={onClose} title="My Account" width={380}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Full Name
          </Typography>
          <Typography variant="body1" fontWeight={600}>{name}</Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Email
          </Typography>
          <Typography variant="body1">{email}</Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Role
          </Typography>
          <Typography variant="body1">{role.charAt(0).toUpperCase() + role.slice(1)}</Typography>
        </Box>

        <Divider />

        <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            To update your name or password, contact your administrator.
          </Typography>
        </Box>
      </Stack>
    </DetailDrawer>
  );
}
