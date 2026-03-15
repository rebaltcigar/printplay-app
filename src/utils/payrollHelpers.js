// src/utils/payrollHelpers.js
// Clean utility functions for payroll calculations.

import { fmtCurrency, fmtDate, toDateInput, toDatetimeLocal } from "./formatters";

// ─── Time & Calculations ────────────────────────────────────────────────────

/**
 * Calculates exact minutes between two time points.
 */
export function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const ms = Math.max(0, new Date(end) - new Date(start));
  return Math.round(ms / 60000);
}

/**
 * Format as Philippine Peso.
 */
export const peso = (n) => fmtCurrency(n);

/**
 * Minutes → hours (2 decimal places).
 */
export const toHours = (minutes) =>
  Number((Number(minutes || 0) / 60).toFixed(2));

/**
 * Gross pay = (minutes / 60) × rate.
 */
export const calcGross = (minutes, rate) =>
  Number(((Number(minutes || 0) / 60) * Number(rate || 0)).toFixed(2));

/**
 * Capitalize first letter.
 */
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// ─── Date Helpers ───────────────────────────────────────────────────────────

/** Format to "Jan 1, 2024" (PHT). */
export const toLocaleDateStringPHT = (val) => fmtDate(val);

/** Format to "YYYY-MM-DD" for inputs. */
export const toYMD_PHT_fromTS = (val) => toDateInput(val);

/** Format to "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
export const toLocalISO_PHT_fromTS = (val) => toDatetimeLocal(val);

/** Today as "YYYY-MM-DD" in PHT. */
export const todayYMD_PHT = () => toDateInput(new Date());

/** Build ISO string from "YYYY-MM-DD" anchored in PHT (UTC+8). */
export const tsFromYMD = (ymd, endOfDay = false) =>
  new Date(`${ymd}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`).toISOString();

// ─── Rate Resolution ────────────────────────────────────────────────────────

/**
 * Picks the correct hourly rate from a staff member's payroll config as of a given date.
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

  const picked = history
    .filter((r) => new Date(r.effective_from || r.effectiveFrom || 0) <= asOf)
    .sort((a, b) =>
      new Date(a.effective_from || a.effectiveFrom || 0) -
      new Date(b.effective_from || b.effectiveFrom || 0)
    )
    .pop();

  if (picked?.rate != null) return Number(picked.rate);
  if (payroll.default_rate != null) return Number(payroll.default_rate);
  if (payroll.defaultRate != null) return Number(payroll.defaultRate);
  return 0;
};

// ─── Shift Shortage ─────────────────────────────────────────────────────────

/**
 * Computes cash shortage for a shift.
 * NOTE: Automatic shortage detection is disabled because cash_difference
 * includes the effect of digital/AR payments and is not a reliable indicator
 * of actual cash shortages. Real shortages should be added manually as
 * deductions during the payroll run.
 */
export const shortageForShift = (/* shift */) => {
  return 0;
};

/**
 * Infers shift name based on start time in PHT.
 */
export const inferShiftName = (startTime, title, label) => {
  if (title) return title;
  if (label) return label;
  if (!startTime) return "Unknown";
  const d = new Date(startTime);
  if (isNaN(d.getTime())) return "Unknown";
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(d)
  );
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  return "Night";
};

// ─── Pay Period Computation ─────────────────────────────────────────────────

/**
 * Determines the start and end dates of the current pay period.
 */
export function computeCurrentPeriod(type = "semi-monthly") {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (type === "weekly") {
    const diff = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - diff);
    end.setDate(start.getDate() + 6);
  } else if (type === "semi-monthly") {
    if (today.getDate() <= 15) {
      start.setDate(1);
      end.setDate(15);
    } else {
      start.setDate(16);
      end.setMonth(today.getMonth() + 1, 0);
    }
  } else {
    // monthly
    start.setDate(1);
    end.setMonth(today.getMonth() + 1, 0);
  }

  return {
    start: toDateInput(start),
    end: toDateInput(end),
  };
}

// ─── Recalculation ──────────────────────────────────────────────────────────

/**
 * Recalculates a single line's totals from its shifts, deductions, and additions.
 */
export function recalcLine(line) {
  const activeShifts = (line.shifts || []).filter((s) => !s.excluded);
  const totalMinutes = activeShifts.reduce((s, r) => s + Number(r.minutesUsed || 0), 0);
  const gross = calcGross(totalMinutes, line.rate);
  const totalDeductions = (line.deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalAdditions = (line.additions || []).reduce((s, a) => s + Number(a.amount || 0), 0);
  const net = Number((gross + totalAdditions - totalDeductions).toFixed(2));

  return { totalMinutes, gross, totalDeductions, totalAdditions, net };
}
