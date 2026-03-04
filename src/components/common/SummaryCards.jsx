// src/components/common/SummaryCards.jsx
// Reusable row of KPI stat cards used above tables in Transactions, Expenses, etc.

import React from 'react';
import { Box, Card, Typography, Stack, Skeleton } from '@mui/material';

/**
 * @param {Array}  cards    - Array of { label, value, sub?, color?, icon?, highlight? }
 * @param {boolean} loading - Show skeletons while data loads
 * @param {object}  sx      - Extra sx on the container Box
 *
 * card shape:
 *   label     {string}  - Card title e.g. "Total Sales"
 *   value     {string}  - Primary value e.g. "₱12,450"
 *   sub       {string}  - Optional secondary text e.g. "32 transactions"
 *   color     {string}  - MUI color for the value text e.g. "success.main"
 *   icon      {node}    - Optional icon element
 *   highlight {boolean} - Whether to show a colored left border accent
 */
export default function SummaryCards({ cards = [], loading = false, sx }) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', ...sx }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} sx={{ flex: '1 1 140px', p: 2, minWidth: 130 }}>
            <Skeleton variant="text" width="60%" height={16} />
            <Skeleton variant="text" width="80%" height={32} sx={{ mt: 0.5 }} />
          </Card>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', ...sx }}>
      {cards.map((card, i) => (
        <Card
          key={i}
          sx={{
            flex: '1 1 140px',
            minWidth: 120,
            p: 2,
            borderLeft: card.highlight ? `3px solid` : undefined,
            borderLeftColor: card.highlight ? (card.color || 'primary.main') : undefined,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25}>
            {card.icon && (
              <Box sx={{ color: card.color || 'primary.main', display: 'flex', flexShrink: 0 }}>
                {card.icon}
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {card.label}
              </Typography>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ color: card.color, lineHeight: 1.2 }}
              >
                {card.value}
              </Typography>
              {card.sub && (
                <Typography variant="caption" color="text.secondary">
                  {card.sub}
                </Typography>
              )}
            </Box>
          </Stack>
        </Card>
      ))}
    </Box>
  );
}
