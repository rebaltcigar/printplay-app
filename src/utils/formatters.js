// src/utils/formatters.js
// Shared formatting helpers used across the Kunek platform.
// Import from here rather than defining local copies in each component.

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * Formats a number as Philippine Peso with 2 decimal places.
 * e.g. 1234.5 → "₱1,234.50"
 * Use this for transaction amounts, totals, prices.
 */
export const fmtCurrency = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

/**
 * Formats a number as Philippine Peso with NO decimal places.
 * e.g. 1234.5 → "₱1,235"
 * Use this for dashboard KPI cards / summaries where decimals add noise.
 */
export const fmtPesoWhole = (n) =>
    `₱${Number(n || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;

// ---------------------------------------------------------------------------
// Date / Time
// ---------------------------------------------------------------------------

/** Returns the first millisecond of a month.  Default: current month. */
export const startOfMonth = (d = new Date()) =>
    new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

/** Returns the last millisecond of a month.  Default: current month. */
export const endOfMonth = (d = new Date()) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/**
 * Converts a Date to a YYYY-MM-DD string for use in <input type="date">.
 * Uses local time (not UTC) so the displayed date matches the user's timezone.
 */
export const toDateInput = (d) => {
    const x = new Date(d);
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Converts a Date to a YYYY-MM-DDThh:mm string for use in
 * <input type="datetime-local">.
 */
export const toDatetimeLocal = (d) => {
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(
        x.getHours()
    )}:${pad(x.getMinutes())}`;
};

/**
 * Parses a datetime-local input string back to a JS Date.
 */
export const fromDatetimeLocal = (s) => new Date(s);

/**
 * Ensures a valid Date object from Firestore Timestamp, Date, or string.
 */
function toDateObj(raw) {
    if (!raw) return null;
    if (raw.toDate) return raw.toDate(); // Firestore Timestamp
    if (raw instanceof Date) return raw;
    const parsed = new Date(raw);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Formats a date to purely the date portion (e.g., "Jan 1, 2024").
 */
export const fmtDate = (rawDate) => {
    const d = toDateObj(rawDate);
    if (!d) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

/**
 * Formats a date to include time (e.g., "Jan 1, 2024, 2:30 PM").
 */
export const fmtDateTime = (rawDate) => {
    const d = toDateObj(rawDate);
    if (!d) return "";
    return d.toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
    });
};

/**
 * Formats just the time (e.g., "2:30 PM").
 */
export const fmtTime = (rawDate) => {
    const d = toDateObj(rawDate);
    if (!d) return "";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/**
 * Formats a date to a short version (e.g., "Jan 1").
 */
export const fmtShortDate = (rawDate) => {
    const d = toDateObj(rawDate);
    if (!d) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * Formats a date to the weekday name (e.g., "Mon").
 */
export const fmtDayOfWeek = (rawDate) => {
    const d = toDateObj(rawDate);
    if (!d) return "";
    return d.toLocaleDateString("en-US", { weekday: "short" });
};

// ---------------------------------------------------------------------------
// Transaction Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable identifier for a transaction row.
 * For expense rows: shows expense type + staff name.
 * For sale rows: shows customer name.
 * Falls back to "—".
 */
export const identifierText = (tx) => {
    if (tx.item === 'Expenses') {
        const staffChunk = tx.expenseStaffName ? ` · ${tx.expenseStaffName}` : '';
        return `${tx.expenseType || ''}${staffChunk}`;
    }
    if (tx.customerName) return tx.customerName;
    return '—';
};

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

/**
 * Triggers a browser download of a CSV string.
 * @param {string} csvString - The full CSV content including header row.
 * @param {string} filename  - The filename for the download (e.g. "transactions_2024-03.csv").
 */
export const downloadCSV = (csvString, filename) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
