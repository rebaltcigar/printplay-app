// src/utils/payrollHelpers.js
// Single source of truth for all payroll calculation helpers.

import { sumDenominations } from "./shiftFinancials";
import { fmtCurrency, fmtDate, toDateInput, toDatetimeLocal } from "./formatters";
export { sumDenominations };

// ---------------------------------------------------------------------------
// Time & Calculations
// ---------------------------------------------------------------------------

/**
 * Calculates the exact minutes between two time points.
 * @param {Date|string|number} start - Start time.
 * @param {Date|string|number} end - End time.
 * @returns {number} Total minutes (rounded).
 */
export function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const ms = Math.max(0, e - s);
  return Math.round(ms / 60000);
}

/**
 * Formats a number as Philippine Peso with 2 decimal places.
 * @param {number} n - Amount in PHP.
 * @returns {string} Formatted string (e.g. ₱1,234.50).
 */
export const peso = (n) => fmtCurrency(n);

/**
 * Converts minutes to hours with 2 decimal places.
 * @param {number} minutes 
 * @returns {number} Hours as float.
 */
export const toHours = (minutes) =>
  Number((Number(minutes || 0) / 60).toFixed(2));

/**
 * Calculates gross pay.
 * @param {number} minutes 
 * @param {number} rate - Hourly rate 
 * @returns {number} Gross pay rounded to 2 decimal places.
 */
export const calcGross = (minutes, rate) =>
  Number(((Number(minutes || 0) / 60) * Number(rate || 0)).toFixed(2));

/**
 * Capitalizes the first letter of a string.
 * @param {string} s 
 * @returns {string} Capitalized string.
 */
export const cap = (s) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// ---------------------------------------------------------------------------
// Date Helpers (Consolidated to use formatters.js)
// ---------------------------------------------------------------------------

/**
 * Formats a Date/string to "Jan 1, 2024" (PHT).
 * @param {Date|string} val 
 * @returns {string}
 */
export const toLocaleDateStringPHT = (val) => fmtDate(val);

/**
 * Formats a Date/string to "YYYY-MM-DD" for date inputs.
 * @param {Date|string} val 
 * @returns {string}
 */
export const toYMD_PHT_fromTS = (val) => toDateInput(val);

/**
 * Formats a Date/string to "YYYY-MM-DDTHH:mm" for datetime-local inputs.
 * @param {Date|string} val 
 * @returns {string}
 */
export const toLocalISO_PHT_fromTS = (val) => toDatetimeLocal(val);

/**
 * Returns today's date in PHT as "YYYY-MM-DD".
 * @returns {string}
 */
export const todayYMD_PHT = () => toDateInput(new Date());

/**
 * Build an ISO string from a YYYY-MM-DD string anchored in PHT (UTC+8).
 * @param {string} ymd - "YYYY-MM-DD"
 * @param {boolean} [endOfDay=false] - If true, sets time to 23:59:59.
 * @returns {string}
 */
export const tsFromYMD = (ymd, endOfDay = false) =>
  new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`).toISOString();

// ---------------------------------------------------------------------------
// Rate Resolution
// ---------------------------------------------------------------------------

/**
 * Picks the correct hourly rate from a staff member's payroll configuration as of a given date.
 * Supports historical schemas: `rateHistory` or `effectiveRates`.
 *
 * @param {Object} payroll - Staff payroll document data.
 * @param {Date|string} asOfDate - The reference date.
 * @returns {number} Hourly rate in PHP.
 */
export const resolveHourlyRate = (payroll, asOfDate) => {
  if (!payroll) return 0;

  const asOf = new Date(asOfDate || Date.now());

  const history = Array.isArray(payroll.rate_history)
    ? payroll.rate_history
    : Array.isArray(payroll.rateHistory)
      ? payroll.rateHistory
      : Array.isArray(payroll.effectiveRates)
        ? payroll.effectiveRates
        : [];

  // Sort by effective date ascending and find the last one that applies before/on asOf.
  const picked = history
    .filter((r) => {
      const effectDate = new Date(r.effective_from || r.effectiveFrom || 0);
      return effectDate <= asOf;
    })
    .sort((a, b) => {
      const da = new Date(a.effective_from || a.effectiveFrom || 0).getTime();
      const db = new Date(b.effective_from || b.effectiveFrom || 0).getTime();
      return da - db;
    })
    .pop();

  if (picked?.rate != null) return Number(picked.rate);
  if (payroll.default_rate != null) return Number(payroll.default_rate);
  if (payroll.defaultRate != null) return Number(payroll.defaultRate);
  return 0;
};

/**
 * Computes the cash shortage for a shift based on expected vs actual cash.
 * @param {Object} shift - Shift document data.
 * @returns {number} Shortage amount (max of 0 and difference).
 */
export const shortageForShift = (shift) => {
  if (shift?.total_cash !== undefined || shift?.totalCash !== undefined) {
    const totalCash = Number(shift.total_cash || shift.totalCash || 0);
    const expensesTotal = Number(shift.expenses_total || shift.expensesTotal || 0);
    const expectedCash = totalCash - expensesTotal;
    const actualCash = sumDenominations(shift?.denominations || {});
    const delta = expectedCash - actualCash;
    return delta > 0 ? Number(delta.toFixed(2)) : 0;
  }

  // Legacy fallback
  const systemTotal = Number(shift?.system_total || shift?.systemTotal || 0);
  const denomTotal = sumDenominations(shift?.denominations || {});
  const delta = systemTotal - denomTotal;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
};

/**
 * Infers the shift name (Morning/Afternoon/Night) based on start time in PHT.
 * @param {Date|string} startTime - Start time.
 * @param {string} [title] - Override title.
 * @param {string} [label] - Override label.
 * @returns {string} "Morning", "Afternoon", or "Night".
 */
export const inferShiftName = (startTime, title, label) => {
  if (title) return title;
  if (label) return label;
  if (!startTime) return 'Unknown';

  const d = new Date(startTime);
  if (isNaN(d.getTime())) return 'Unknown';

  const h = parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Manila',
    }).format(d)
  );
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 18) return 'Afternoon';
  return 'Night';
};

// ---------------------------------------------------------------------------
// Pay Period Computation
// ---------------------------------------------------------------------------

/**
 * Determines the start and end dates of the pay period containing `forDate`.
 * @param {Object} schedule - Payroll schedule configuration.
 * @param {Date|string} forDate - The reference date.
 * @returns {{start: Date, end: Date}}
 */
export function computePeriodForDate(schedule, forDate) {
  const dateObj = new Date(forDate || Date.now());
  const today = new Date(dateObj);
  today.setHours(0, 0, 0, 0);

  const anchor = new Date(schedule.anchor_date || schedule.anchorDate || Date.now());
  anchor.setHours(0, 0, 0, 0);

  const type = schedule.type || 'biweekly';
  const start = new Date(today);
  const end = new Date(today);

  if (type === 'weekly') {
    const diff = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - diff);
    end.setDate(start.getDate() + 6);
  } else if (type === 'biweekly') {
    const days = Math.floor((today - anchor) / 86400000);
    const periodIndex = Math.floor(days / 14);
    start.setTime(anchor.getTime() + periodIndex * 14 * 86400000);
    end.setTime(start.getTime() + 13 * 86400000);
  } else if (type === 'semi-monthly') {
    if (today.getDate() <= 15) {
      start.setDate(1);
      end.setDate(15);
    } else {
      start.setDate(16);
      end.setMonth(today.getMonth() + 1, 0);
    }
  } else {
    // monthly (default)
    start.setDate(1);
    end.setMonth(today.getMonth() + 1, 0);
  }

  return { start, end };
}


