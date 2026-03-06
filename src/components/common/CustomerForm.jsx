import React from 'react';
import { TextField, Stack } from '@mui/material';

/**
 * A standardized set of form fields for customer data.
 * Used by both POS and Admin drawers to ensure consistency.
 */
export default function CustomerForm({ formData, onChange, disabled = false, autoFocusName = false }) {

    const handleChange = (field) => (e) => {
        onChange({ ...formData, [field]: e.target.value });
    };

    return (
        <Stack spacing={2.5}>
            <TextField
                label="Full Name"
                required
                fullWidth
                value={formData.fullName || ''}
                onChange={handleChange('fullName')}
                disabled={disabled}
                autoFocus={autoFocusName}
            />
            <Stack direction="row" spacing={2}>
                <TextField
                    label="Phone"
                    fullWidth
                    value={formData.phone || ''}
                    onChange={handleChange('phone')}
                    disabled={disabled}
                />
                <TextField
                    label="Email"
                    fullWidth
                    value={formData.email || ''}
                    onChange={handleChange('email')}
                    disabled={disabled}
                />
            </Stack>
            <TextField
                label="TIN"
                fullWidth
                value={formData.tin || ''}
                onChange={handleChange('tin')}
                disabled={disabled}
            />
            <TextField
                label="Address"
                fullWidth
                multiline
                rows={3}
                value={formData.address || ''}
                onChange={handleChange('address')}
                disabled={disabled}
            />
        </Stack>
    );
}
