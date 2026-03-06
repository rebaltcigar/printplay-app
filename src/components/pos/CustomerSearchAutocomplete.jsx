import React, { useState } from 'react';
import { Autocomplete, TextField, createFilterOptions, Box, Typography, InputAdornment } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useCustomers } from '../../hooks/useCustomers';

const filter = createFilterOptions({
    stringify: (option) => `${option.fullName} ${option.tin || ''} ${option.phone || ''} ${option.displayId || ''}`
});

export default function CustomerSearchAutocomplete({ value, onChange, onInputChange, inputValue, error, helperText, label = "Customer Name" }) {
    const { customers, loading } = useCustomers();

    return (
        <Autocomplete
            value={value} // This needs to be the whole object, or null
            onChange={(event, newValue) => {
                if (newValue && newValue.inputValue) {
                    // Create a new value from the "Add XXX" suggestion
                    onChange({
                        fullName: newValue.inputValue,
                        isNew: true
                    });
                } else {
                    // Normal selection (could be null if cleared)
                    onChange(newValue);
                }
            }}

            inputValue={inputValue}
            onInputChange={(event, newInputValue) => {
                if (onInputChange) onInputChange(event, newInputValue);
            }}
            filterOptions={(options, params) => {
                const filtered = filter(options, params);
                const { inputValue } = params;

                // Suggest the creation of a new value
                const isExisting = options.some((option) => inputValue === option.fullName);
                if (inputValue !== '' && !isExisting) {
                    filtered.push({
                        inputValue,
                        title: `Add new customer "${inputValue}"`,
                    });
                }
                return filtered;
            }}
            selectOnFocus
            clearOnBlur={false}
            handleHomeEndKeys
            id="customer-search-autocomplete"
            options={customers}
            getOptionLabel={(option) => {
                // Value selected with enter, right from the input
                if (typeof option === 'string') return option;
                // Add "xxx" option created dynamically
                if (option.inputValue) return option.inputValue;
                // Regular option
                return option.fullName || '';
            }}
            renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                // Use option.id for existing docs to prevent duplicate key errors when customer names are identical
                const uniqueKey = option.id || option.inputValue || key;
                return (
                    <li key={uniqueKey} {...optionProps}>
                        {option.title ? (
                            <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                                {option.title}
                            </Typography>
                        ) : (
                            <Box>
                                <Typography variant="body2">{option.fullName}</Typography>
                                {(option.phone || option.tin) && (
                                    <Typography variant="caption" color="text.secondary">
                                        {option.phone ? `Phone: ${option.phone} ` : ''}
                                        {option.tin ? `TIN: ${option.tin}` : ''}
                                    </Typography>
                                )}
                            </Box>
                        )}
                    </li>
                );
            }}
            loading={loading}
            renderInput={(params) => {
                const isValid = value && (value.id || value.isNew);
                const isTyping = !value && inputValue?.length > 0;

                return (
                    <TextField
                        {...params}
                        label={label}
                        size="small"
                        fullWidth
                        required
                        error={error}
                        helperText={helperText}
                        InputProps={{
                            ...params.InputProps,
                            startAdornment: (
                                <>
                                    {isValid ? (
                                        <InputAdornment position="start" sx={{ pl: 1 }}>
                                            <CheckCircleIcon color="success" fontSize="small" />
                                        </InputAdornment>
                                    ) : isTyping ? (
                                        <InputAdornment position="start" sx={{ pl: 1 }}>
                                            <ErrorOutlineIcon color="warning" fontSize="small" />
                                        </InputAdornment>
                                    ) : null}
                                    {params.InputProps.startAdornment}
                                </>
                            ),
                            sx: {
                                borderRadius: 2,
                                bgcolor: isValid ? '#f6ffed' : isTyping ? '#fffbe6' : 'inherit',
                                '& fieldset': {
                                    borderColor: isValid ? 'success.main' : isTyping ? 'warning.main' : undefined
                                }
                            }
                        }}
                    />
                );
            }}
        />
    );
}
