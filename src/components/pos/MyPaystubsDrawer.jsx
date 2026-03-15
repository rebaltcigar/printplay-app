// src/components/pos/MyPaystubsDrawer.jsx
// Staff self-service paystubs viewer — queries new payroll_stubs table.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, CircularProgress, Divider,
} from '@mui/material';
import { supabase } from '../../supabase';
import DetailDrawer from '../common/DetailDrawer';
import PaySlipViewer from '../payroll/PaySlipViewer';
import { fmtDate } from '../../utils/formatters';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

export default function MyPaystubsDrawer({ open, onClose, staffId }) {
  const [stubs, setStubs] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !staffId) { setStubs([]); setActive(null); return; }
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('payroll_stubs')
          .select('*')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false });

        setStubs(data || []);
        setActive((data || [])[0]?.id || null);
      } catch (err) {
        console.error('MyPaystubs fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, staffId]);

  const activeStub = useMemo(() => stubs.find(s => s.id === active) || null, [stubs, active]);

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="My Pay Slips"
      subtitle={stubs.length ? `${stubs.length} pay slip${stubs.length !== 1 ? 's' : ''}` : undefined}
      width={820}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : stubs.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <ReceiptLongIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
          <Typography color="text.secondary">No pay slips found.</Typography>
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
                {fmtDate(s.pay_date) || 'Unknown date'}
              </Button>
            ))}
          </Stack>

          <Divider orientation="vertical" flexItem />

          {/* Pay slip content */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {activeStub ? <PaySlipViewer stub={activeStub} /> : null}
          </Box>
        </Stack>
      )}
    </DetailDrawer>
  );
}
