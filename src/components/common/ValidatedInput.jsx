import React, { useState, useEffect } from 'react';
import { TextField } from '@mui/material';
import { cleanString, cleanPhone, cleanNumeric, isValidEmail, isValidTIN, isValidGCashRef, isValidPhone } from '../../utils/validation';

/**
 * A centralized wrapper around MUI TextField that automatically handles 
 * sanitization and validation based on the provided `rule`.
 * 
 * Supported Rules:
 * - "text" (default): Trims leading/trailing whitespace on blur.
 * - "phone": Digits only, max 11. Validated on submit/blur.
 * - "numeric": Valid positive numbers only, handles decimals.
 * - "email": Automatically tests regex and sets error state if invalid.
 * - "tin": Digits only, exactly 9 or 12 required.
 * - "gcash": Digits only, exactly 13 required.
 */
export default function ValidatedInput({
    rule = 'text',
    value,
    onChange,
    onBlur,
    error: propError,
    helperText: propHelperText,
    required,
    ...props
}) {
    const [internalError, setInternalError] = useState(false);
    const [internalHelperText, setInternalHelperText] = useState('');
    const [isTouched, setIsTouched] = useState(false);

    // Re-evaluate validation if value changes externally (or internally via typing)
    useEffect(() => {
        if (!value && !required) {
            setInternalError(false);
            setInternalHelperText('');
            return;
        }

        let isInvalid = false;
        let msg = '';

        if (required && !value && isTouched) {
            isInvalid = true;
            msg = 'This field is required';
        } else if (value) {
            switch (rule) {
                case 'email':
                    if (!isValidEmail(value)) {
                        isInvalid = true;
                        msg = 'Invalid email format';
                    }
                    break;
                case 'phone':
                    // Only show error if they've typed a full string but it's wrong, or on blur (handled later)
                    // For real-time, we mostly rely on the sanitizer blocking bad input.
                    if (value.length > 0 && value.length < 11) {
                        // Optional: could show "Too short" but often annoying while typing.
                    }
                    break;
                case 'gcash':
                    if (!isValidGCashRef(value)) {
                        isInvalid = true;
                        msg = 'Must be 13 digits';
                    }
                    break;
                case 'tin':
                    if (!isValidTIN(value)) {
                        isInvalid = true;
                        msg = 'Must be 9 or 12 digits';
                    }
                    break;
                default:
                    break;
            }
        }

        setInternalError(isInvalid);
        setInternalHelperText(msg);

    }, [value, rule, required, isTouched]);


    const handleChange = (e) => {
        let val = e.target.value;

        // Apply real-time sanitization based on rule
        switch (rule) {
            case 'phone':
                val = cleanPhone(val, 11);
                break;
            case 'tin':
                val = cleanPhone(val, 12);
                break;
            case 'gcash':
                val = cleanPhone(val, 13);
                break;
            case 'numeric':
                // For 'numeric', we don't strictly block typing decimal points or empty strings while typing,
                // otherwise it's hard to type "0.5". We handle strict cleaning on blur.
                // But we can block letters.
                if (val !== '' && val !== '.') {
                    // Basic check if it's a valid partial number. Simple regex for digits + one optional decimal
                    if (!/^\d*\.?\d*$/.test(val)) {
                        return; // Ignore the keystroke if it's not number-like
                    }
                }
                break;
            default:
                break;
        }

        if (onChange) {
            onChange(val);
        }
    };

    const handleBlur = (e) => {
        setIsTouched(true);
        let val = typeof value === 'string' ? value : '';

        // Apply final sanitization on blur
        switch (rule) {
            case 'text':
            case 'email':
                val = cleanString(val);
                break;
            case 'numeric':
                val = cleanNumeric(val);
                // Convert back to string for input value consistency, or pass number up.
                // Usually better to pass string if it's an uncontrolled MUI field, but our 
                // caller expects the cleaned value. We'll pass the cleaned string.
                val = val.toString();
                break;
            case 'phone':
                if (val.length > 0 && !isValidPhone(val)) {
                    setInternalError(true);
                    setInternalHelperText('Must be 11 digits');
                }
                break;
            case 'tin':
                if (val.length > 0 && !isValidTIN(val)) {
                    setInternalError(true);
                    setInternalHelperText('Must be 9 or 12 digits');
                }
                break;
            case 'gcash':
                if (val.length > 0 && !isValidGCashRef(val)) {
                    setInternalError(true);
                    setInternalHelperText('Must be 13 digits');
                }
                break;
            default:
                break;
        }

        // Only fire onChange if the value actually got altered by sanitization
        if (onChange && val !== value) {
            onChange(val);
        }

        if (onBlur) {
            onBlur(e);
        }
    };

    const finalError = propError !== undefined ? propError : internalError;
    const finalHelperText = propHelperText !== undefined ? propHelperText : internalHelperText;

    return (
        <TextField
            value={value || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            error={finalError}
            helperText={finalHelperText}
            required={required}
            {...props}
        />
    );
}
