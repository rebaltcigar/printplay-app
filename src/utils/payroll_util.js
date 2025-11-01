import { Timestamp } from "firebase/firestore";

// exact minutes between two Firestore Timestamps or JS Dates
export function minutesBetween(start, end) {
  const s = start?.seconds ? new Date(start.seconds * 1000) : new Date(start);
  const e = end?.seconds ? new Date(end.seconds * 1000) : new Date(end);
  const ms = Math.max(0, e - s);
  return Math.round(ms / 60000);
}

// Resolve hourly rate from user's payroll history (default + effectiveRates)
export function resolveHourlyRate(payroll, atDate) {
  if (!payroll) return 0;
  let r = Number(payroll.defaultRate || 0);
  const at = atDate instanceof Date ? atDate : new Date(atDate);
  const history = (payroll.effectiveRates || [])
    .slice()
    .sort(
      (a, b) =>
        (a.effectiveFrom?.seconds || 0) - (b.effectiveFrom?.seconds || 0)
    );
  for (const h of history) {
    const when = h.effectiveFrom?.seconds
      ? new Date(h.effectiveFrom.seconds * 1000)
      : null;
    if (when && when <= at) r = Number(h.rate || r);
  }
  return r;
}

// Compute pay period for "today"
export function computePeriodForDate(schedule, forDate) {
  const today = new Date(forDate);
  today.setHours(0, 0, 0, 0);

  const anchor = schedule.anchorDate?.seconds
    ? new Date(schedule.anchorDate.seconds * 1000)
    : new Date();
  anchor.setHours(0, 0, 0, 0);
  const type = schedule.type || "biweekly";

  const start = new Date(today);
  const end = new Date(today);

  if (type === "weekly") {
    const day = today.getDay();
    const diff = (day + 6) % 7;
    start.setDate(today.getDate() - diff);
    end.setDate(start.getDate() + 6);
  } else if (type === "biweekly") {
    const days = Math.floor((today - anchor) / 86400000);
    const periodIndex = Math.floor(days / 14);
    start.setTime(anchor.getTime() + periodIndex * 14 * 86400000);
    end.setTime(start.getTime() + 13 * 86400000);
  } else if (type === "semi-monthly") {
    if (today.getDate() <= 15) {
      start.setDate(1);
      end.setDate(15);
    } else {
      start.setDate(16);
      end.setMonth(today.getMonth() + 1, 0);
    }
  } else if (type === "monthly") {
    start.setDate(1);
    end.setMonth(today.getMonth() + 1, 0);
  } else {
    start.setDate(1);
    end.setMonth(today.getMonth() + 1, 0);
  }

  return { start, end };
}
