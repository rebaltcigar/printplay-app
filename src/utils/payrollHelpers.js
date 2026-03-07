// src/utils/payrollHelpers.js
// Single source of truth for all payroll calculation helpers.

import { Timestamp } from "firebase/firestore";
import { sumDenominations } from "./shiftFinancials";
import { fmtCurrency, fmtDate, toDateInput, toDatetimeLocal } from "./formatters";
export { sumDenominations };

// ---------------------------------------------------------------------------
// Time & Calculations
// ---------------------------------------------------------------------------

/**
 * Calculates the exact minutes between two time points.
 * @param {Timestamp|Date|number} start - Start time.
 * @param {Timestamp|Date|number} end - End time.
 * @returns {number} Total minutes (rounded).
 */
export function minutesBetween(start, end) {
  const s = start?.seconds ? new Date(start.seconds * 1000) : new Date(start);
  const e = end?.seconds ? new Date(end.seconds * 1000) : new Date(end);
  const ms = Math.max(0, e - s);
  return Math.round(ms / 60000);
}

/**
 * Alias for minutesBetween specifically for Firestore Timestamps.
 */
export const minutesBetweenTS = (startTs, endTs) => {
  if (!startTs?.seconds || !endTs?.seconds) return 0;
  return minutesBetween(startTs, endTs);
};

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
 * Formats a Firestore Timestamp to "Jan 1, 2024" (PHT).
 * @param {Timestamp} ts 
 * @returns {string}
 */
export const toLocaleDateStringPHT = (ts) => fmtDate(ts);

/**
 * Formats a Firestore Timestamp to "YYYY-MM-DD" for date inputs.
 * @param {Timestamp} ts 
 * @returns {string}
 */
export const toYMD_PHT_fromTS = (ts) => toDateInput(ts);

/**
 * Formats a Firestore Timestamp to "YYYY-MM-DDTHH:mm" for datetime-local inputs.
 * @param {Timestamp} ts 
 * @returns {string}
 */
export const toLocalISO_PHT_fromTS = (ts) => toDatetimeLocal(ts);

/**
 * Returns today's date in PHT as "YYYY-MM-DD".
 * @returns {string}
 */
export const todayYMD_PHT = () => toDateInput(new Date());

/**
 * Build a Firestore Timestamp from a YYYY-MM-DD string anchored in PHT (UTC+8).
 * @param {string} ymd - "YYYY-MM-DD"
 * @param {boolean} [endOfDay=false] - If true, sets time to 23:59:59.
 * @returns {Timestamp}
 */
export const tsFromYMD = (ymd, endOfDay = false) =>
  Timestamp.fromDate(
    new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`)
  );

// ---------------------------------------------------------------------------
// Rate Resolution
// ---------------------------------------------------------------------------

/**
 * Picks the correct hourly rate from a staff member's payroll configuration as of a given date.
 * Supports historical schemas: `rateHistory` or `effectiveRates`.
 *
 * @param {Object} payroll - Staff payroll document data.
 * @param {Date|Timestamp|string} asOfDate - The reference date.
 * @returns {number} Hourly rate in PHP.
 */
export const resolveHourlyRate = (payroll, asOfDate) => {
  if (!payroll) return 0;

  const asOf = asOfDate?.toDate ? asOfDate.toDate() : new Date(asOfDate || Date.now());

  const history = Array.isArray(payroll.rateHistory)
    ? payroll.rateHistory
    : Array.isArray(payroll.effectiveRates)
      ? payroll.effectiveRates
      : [];

  // Sort by effective date ascending and find the last one that applies before/on asOf.
  const picked = history
    .filter((r) =>
      r?.effectiveFrom?.seconds
        ? new Date(r.effectiveFrom.seconds * 1000) <= asOf
        : true
    )
    .sort((a, b) => {
      const da = a?.effectiveFrom?.seconds ?? 0;
      const db = b?.effectiveFrom?.seconds ?? 0;
      return da - db;
    })
    .pop();

  if (picked?.rate != null) return Number(picked.rate);
  if (payroll.defaultRate != null) return Number(payroll.defaultRate);
  return 0;
};

/**
 * Computes the cash shortage for a shift based on expected vs actual cash.
 * @param {Object} shift - Shift document data.
 * @returns {number} Shortage amount (max of 0 and difference).
 */
export const shortageForShift = (shift) => {
  if (shift?.totalCash !== undefined) {
    const expectedCash = Number(shift.totalCash || 0) - Number(shift.expensesTotal || 0);
    const actualCash = sumDenominations(shift?.denominations || {});
    const delta = expectedCash - actualCash;
    return delta > 0 ? Number(delta.toFixed(2)) : 0;
  }

  // Legacy fallback
  const systemTotal = Number(shift?.systemTotal || 0);
  const denomTotal = sumDenominations(shift?.denominations || {});
  const delta = systemTotal - denomTotal;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
};

/**
 * Infers the shift name (Morning/Afternoon/Night) based on start time in PHT.
 * @param {Object} startTS - Firestore Timestamp.
 * @param {string} [title] - Override title.
 * @param {string} [label] - Override label.
 * @returns {string} "Morning", "Afternoon", or "Night".
 */
export const inferShiftName = (startTS, title, label) => {
  if (title) return title;
  if (label) return label;
  if (!startTS?.seconds) return 'Unknown';

  const d = new Date(startTS.seconds * 1000);
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
 * @param {Date|Timestamp} forDate - The reference date.
 * @returns {{start: Date, end: Date}}
 */
export function computePeriodForDate(schedule, forDate) {
  const dateObj = forDate?.toDate ? forDate.toDate() : new Date(forDate);
  const today = new Date(dateObj);
  today.setHours(0, 0, 0, 0);

  const anchor = schedule.anchorDate?.seconds
    ? new Date(schedule.anchorDate.seconds * 1000)
    : new Date();
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

