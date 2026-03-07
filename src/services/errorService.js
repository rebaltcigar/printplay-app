/**
 * Translates technical error codes (Firebase, etc.) into user-friendly messages.
 * 
 * @param {Error|string|Object} error The error object or code to translate
 * @returns {string} A user-friendly error message
 */
export const getFriendlyErrorMessage = (error) => {
    if (!error) return "An unknown error occurred.";

    const code = error.code || error.message || String(error);

    switch (code) {
        // Firebase Auth Errors
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return "Invalid email or password. Please try again.";
        case 'auth/email-already-in-use':
            return "This email is already registered.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters.";
        case 'auth/too-many-requests':
            return "Too many failed attempts. Please try again later.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection.";
        case 'auth/requires-recent-login':
            return "Please log out and log in again to perform this sensitive action.";

        // Firestore Errors
        case 'permission-denied':
            return "You do not have permission to perform this action.";
        case 'unavailable':
            return "The service is temporarily unavailable. Please try again later.";
        case 'not-found':
            return "The requested record could not be found.";
        case 'already-exists':
            return "This record already exists.";

        // System/Custom Errors
        case 'DRAWER_DISCONNECTED':
            return "Cash drawer is not connected. Please check connection.";
        case 'INVALID_AMOUNT':
            return "Please enter a valid amount.";
        case 'SHIFT_NOT_ACTIVE':
            return "You must have an active shift to perform this action.";

        default:
            console.warn("Unmapped error:", code);
            return "Something went wrong. Please try again.";
    }
};
