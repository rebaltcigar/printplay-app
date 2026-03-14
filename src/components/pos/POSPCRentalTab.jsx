import React from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import MonitorIcon from '@mui/icons-material/Monitor';
import TimerIcon from '@mui/icons-material/Timer';

/**
 * POSPCRentalTab — Placeholder for future PC Rental integration in POS.
 * Currently simplified per user request to "Coming Soon".
 */
export default function POSPCRentalTab() {
  return (
    <Box 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        p: 3,
        bgcolor: 'background.default'
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 400,
          borderRadius: 4,
          borderStyle: 'dashed',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2
        }}
      >
        <Box 
          sx={{ 
            width: 80, 
            height: 80, 
            borderRadius: '50%', 
            bgcolor: 'primary.main', 
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
            boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
          }}
        >
          <MonitorIcon sx={{ fontSize: 40 }} />
        </Box>

        <Typography variant="h5" fontWeight={800} color="text.primary">
          PC Rental Tab
        </Typography>
        
        <Typography variant="body1" color="text.secondary">
          We're integrating the PC Timer directly into the POS flow. Stay tuned for seamless PC session management and billing!
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, color: 'primary.main' }}>
          <TimerIcon fontSize="small" />
          <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 1, textTransform: 'uppercase' }}>
            Coming Soon
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
