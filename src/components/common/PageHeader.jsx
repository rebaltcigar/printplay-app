import React from 'react';
import { Box, Typography, Stack } from '@mui/material';

/**
 * Universal Page Header for Admin and Report views.
 * Ensures consistent typography, spacing, and action placement.
 */
export default function PageHeader({ title, subtitle, actions }) {
    return (
        <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            sx={{ mb: 3, gap: 2 }}
        >
            <Box>
                <Typography
                    variant="h5"
                    sx={{
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        lineHeight: 1.2
                    }}
                >
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="body2" color="text.secondary">
                        {subtitle}
                    </Typography>
                )}
            </Box>
            {actions && (
                <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-end' }}>
                    {actions}
                </Stack>
            )}
        </Stack>
    );
}
