import React from 'react';
import { Stack } from '@mui/material';
import ValidatedInput from './ValidatedInput';
/**
 * A standardized set of form fields for customer data.
 * Used by both POS and Admin drawers to ensure consistency.
 */
export default function CustomerForm({ formData, onChange, disabled = false, autoFocusName = false }) {

    const handleChange = (field) => (val) => {
        onChange({ ...formData, [field]: val });
    };

    return (
        <Stack spacing={2.5}>
            <ValidatedInput
                label="Full Name"
                rule="text"
                required
                fullWidth
                value={formData.fullName || ''}
                onChange={handleChange('fullName')}
                disabled={disabled}
                autoFocus={autoFocusName}
            />
            <Stack direction="row" spacing={2}>
                <ValidatedInput
                    label="Username (Login)"
                    rule="text"
                    fullWidth
                    value={formData.username || ''}
                    onChange={handleChange('username')}
                    disabled={disabled}
                    placeholder="Min 4 characters, no spaces"
                />
                <ValidatedInput
                    label="Password"
                    rule="text"
                    fullWidth
                    value={formData.password || '123'}
                    onChange={handleChange('password')}
                    disabled={disabled}
                />
            </Stack>
            <Stack direction="row" spacing={2}>
                <ValidatedInput
                    label="Phone"
                    rule="phone"
                    fullWidth
                    value={formData.phone || ''}
                    onChange={handleChange('phone')}
                    disabled={disabled}
                />
                <ValidatedInput
                    label="Email"
                    rule="email"
                    fullWidth
                    value={formData.email || ''}
                    onChange={handleChange('email')}
                    disabled={disabled}
                />
            </Stack>
            <ValidatedInput
                label="TIN"
                rule="tin"
                fullWidth
                value={formData.tin || ''}
                onChange={handleChange('tin')}
                disabled={disabled}
            />
            <ValidatedInput
                label="Address"
                rule="text"
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
