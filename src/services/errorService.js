/**
 * Translates technical error codes (Supabase, PostgREST, GoTrue, etc.) into user-friendly messages.
 * 
 * @param {Error|string|Object} error The error object or code to translate
 * @returns {string} A user-friendly error message
 */
export const getFriendlyErrorMessage = (error) => {
    if (!error) return "An unknown error occurred.";

    const code = error.code || error.message || String(error);

    switch (code) {
        // Supabase Auth (GoTrue) Errors
        case 'invalid_credentials':
        case 'Invalid login credentials':
            return "Invalid email or password. Please try again.";
        case 'user_not_found':
            return "No account record found for this email.";
        case 'email_exists':
            return "This email is already registered.";
        case 'weak_password':
            return "Password should be at least 6 characters.";
        case 'email_address_invalid':
            return "Invalid email address. Supabase rejects test/disposable domains — use a real email (e.g. name@company.com).";
        case 'over_confirmation_rate_limit':
            return "Too many requests. Please try again later.";
        case 'network_error':
            return "Network error. Please check your internet connection.";

        // Supabase PostgREST Errors (PostgreSQL codes)
        case '23505': // unique_violation
            return "This record already exists.";
        case '23503': // foreign_key_violation
            return "This action cannot be performed because it is linked to other records.";
        case '42P01': // undefined_table
            return "System configuration error: table not found.";
        case 'PGRST116': // JSON object expected, but not found (single row)
            return "The requested record could not be found.";

        // Custom / Static Errors
        case 'DRAWER_DISCONNECTED':
            return "Cash drawer is not connected. Please check connection.";
        case 'INVALID_AMOUNT':
            return "Please enter a valid amount.";
        case 'SHIFT_NOT_ACTIVE':
            return "You must have an active shift to perform this action.";
        case 'auth/account-suspended':
            return "This account has been suspended. Please contact your administrator.";

        default:
            // Handle cases where the message is passed directly
            if (typeof code === 'string' && code.includes('JWT')) {
                return "Your session has expired. Please log in again.";
            }

            console.warn("Unmapped error:", code);
            return "Something went wrong. Please try again.";
    }
};
