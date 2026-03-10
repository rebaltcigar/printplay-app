// src/components/pos/MyPaystubsDrawer.jsx
// Staff self-service paystubs viewer using collection group query.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, CircularProgress, Divider,
} from '@mui/material';
import { supabase } from '../../supabase';
import DetailDrawer from '../common/DetailDrawer';
import { Paystub } from '../Paystub';
import { fmtDate } from '../../utils/formatters';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

export default function MyPaystubsDrawer({ open, onClose, userEmail }) {
  const [stubs, setStubs] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userEmail) { setStubs([]); setActive(null); return; }
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('paystubs')
          .select('*')
          .eq('staff_email', userEmail)
          .order('pay_date', { ascending: false });

        const list = (data || []).map(d => ({
          ...d,
          staffEmail: d.staff_email,
          payDate: d.pay_date
        }));

        setStubs(list);
        setActive(list[0]?.id || null);
      } catch (err) {
        console.error('MyPaystubs fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userEmail]);

  const activeStub = useMemo(() => stubs.find(s => s.id === active) || null, [stubs, active]);



  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="My Paystubs"
      subtitle={stubs.length ? `${stubs.length} paystub${stubs.length !== 1 ? 's' : ''}` : undefined}
      width={820}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : stubs.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <ReceiptLongIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
          <Typography color="text.secondary">No paystubs found.</Typography>
        </Box>
      ) : (
        <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
          {/* Pay date list */}
          <Stack spacing={1} sx={{ minWidth: 160, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pay Dates
            </Typography>
            {stubs.map(s => (
              <Button
                key={s.id}
                variant={s.id === active ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setActive(s.id)}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {fmtDate(s.payDate) || 'Unknown date'}
              </Button>
            ))}
          </Stack>

          <Divider orientation="vertical" flexItem />

          {/* Paystub content */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {activeStub ? <Paystub stub={activeStub} /> : null}
          </Box>
        </Stack>
      )}
    </DetailDrawer>
  );
}
