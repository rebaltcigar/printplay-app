// src/utils/payrollHelpers.js
// Merged: was split between payrollHelpers.js + payroll_util.js (now deleted).
// Single source of truth for all payroll calculation helpers.

import { Timestamp } from "firebase/firestore";
import { sumDenominations } from "./shiftFinancials";
export { sumDenominations };



// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Exact minutes between two Firestore Timestamps or JS Dates. */
export function minutesBetween(start, end) {
  const s = start?.seconds ? new Date(start.seconds * 1000) : new Date(start);
  const e = end?.seconds ? new Date(end.seconds * 1000) : new Date(end);
  const ms = Math.max(0, e - s);
  return Math.round(ms / 60000);
}

/** minutes between 2 Firestore Timestamps (alias for clarity) */
export const minutesBetweenTS = (startTs, endTs) => {
  if (!startTs?.seconds || !endTs?.seconds) return 0;
  return minutesBetween(startTs, endTs);
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Peso with 2 decimal places (payroll display) */
export const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

/** minutes → hours (2 decimal places) */
export const toHours = (minutes) =>
  Number((Number(minutes || 0) / 60).toFixed(2));

/** Capitalize first letter of a string */
export const cap = (s) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// ---------------------------------------------------------------------------
// Date Helpers (PHT = Asia/Manila, UTC+8)
// ---------------------------------------------------------------------------

/** PHT → MM/DD/YYYY for display */
export const toLocaleDateStringPHT = (ts) => {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
  });
};

/** PHT → YYYY-MM-DD (for date inputs) */
export const toYMD_PHT_fromTS = (ts) => {
  if (!ts?.seconds) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date(ts.seconds * 1000));
};

/** PHT → local input style "YYYY-MM-DDTHH:mm" */
export const toLocalISO_PHT_fromTS = (ts) => {
  if (!ts?.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  const phtDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return phtDate.toISOString().slice(0, 16);
};

/** Today in PHT as YYYY-MM-DD */
export const todayYMD_PHT = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date());

/**
 * Build a Firestore Timestamp from a YYYY-MM-DD string.
 * NOTE: Uses explicit +08:00 offset to anchor the date in PHT (Asia/Manila)
 * and prevent off-by-8h errors on systems that parse "T00:00:00" as UTC.
 */
export const tsFromYMD = (ymd, endOfDay = false) =>
  Timestamp.fromDate(
    new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`)
  );

// ---------------------------------------------------------------------------
// Rate Resolution
// ---------------------------------------------------------------------------

/**
 * Picks the correct hourly rate from a staff member's payroll config,
 * as of a given date.
 *
 * Supports two historical field names:
 *   - `rateHistory` (older schema)
 *   - `effectiveRates` (newer schema)
 *
 * @param {Object} payroll  - Staff payroll doc data.
 * @param {Date|*} asOfDate - The date to resolve the rate for.
 * @returns {number} Hourly rate in PHP.
 */
export const resolveHourlyRate = (payroll, asOfDate) => {
  if (!payroll) return 0;

  const asOf =
    asOfDate instanceof Date ? asOfDate : new Date(asOfDate || Date.now());

  // Support both field names (schema migration compatibility)
  const history = Array.isArray(payroll.rateHistory)
    ? payroll.rateHistory
    : Array.isArray(payroll.effectiveRates)
      ? payroll.effectiveRates
      : [];

  // Walk history sorted ascending, keep the last rate that became effective
  // on or before `asOf`.
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

/** Compute cash shortage for a shift */
export const shortageForShift = (shift) => {
  // New Logic: shift has explicit totalCash field (Shift v2+)
  if (shift?.totalCash !== undefined) {
    const expectedCash = Number(shift.totalCash || 0) - Number(shift.expensesTotal || 0);
    const actualCash = sumDenominations(shift?.denominations || {});
    const delta = expectedCash - actualCash;
    return delta > 0 ? Number(delta.toFixed(2)) : 0;
  }

  // Legacy fallback for older shifts
  const systemTotal = Number(shift?.systemTotal || 0);
  const denomTotal = sumDenominations(shift?.denominations || {});
  const delta = systemTotal - denomTotal;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
};

/** Infer shift name (Morning / Afternoon / Night) from start timestamp */
export const inferShiftName = (startTS, title, label) => {
  if (title) return title;
  if (label) return label;
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

/** Compute the pay period (start/end Date) that contains a given date. */
export function computePeriodForDate(schedule, forDate) {
  const today = new Date(forDate);
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
