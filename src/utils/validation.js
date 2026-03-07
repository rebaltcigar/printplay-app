/**
 * src/utils/validation.js
 * Centralized utility for cleaning and validating user input.
 */

/** 
 * Trims whitespace and removes potentially dangerous characters.
 * Useful for Names, Addresses, Notes.
 */
export const cleanString = (val) => {
    if (typeof val !== 'string') return '';
    return val.trim();
};

/**
 * Returns only digits, optionally capped to a specific length.
 * Useful for Phone numbers, TIN, Reference numbers.
 */
export const cleanPhone = (val, maxLength = 11) => {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '');
    return digits.slice(0, maxLength);
};

/**
 * Ensures a value is a valid non-negative number.
 * Returns 0 if invalid.
 */
export const cleanNumeric = (val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return 0;
    return num;
};

/**
 * Validates basic email format.
 */
export const isValidEmail = (email) => {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
};

/**
 * Validates Philippine TIN (9 or 12 digits).
 */
export const isValidTIN = (tin) => {
    if (!tin) return false;
    const clean = String(tin).replace(/\D/g, '');
    return clean.length === 9 || clean.length === 12;
};

/**
 * Validates Philippine Phone (11 digits).
 */
export const isValidPhone = (val) => {
    if (!val) return false;
    const clean = String(val).replace(/\D/g, '');
    return clean.length === 11;
};

/**
 * Validates GCash Reference (13 digits).
 */
export const isValidGCashRef = (ref) => {
    if (!ref) return false;
    return /^\d{13}$/.test(String(ref).trim());
};
