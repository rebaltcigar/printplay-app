// src/utils/payrollHelpers.js
import { Timestamp } from "firebase/firestore";
import { minutesBetween } from "../utils/payroll_util"; // keep your original util

// pesos
export const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

// minutes → hours (2 decimals)
export const toHours = (minutes) =>
  Number((Number(minutes || 0) / 60).toFixed(2));

/** PHT (UTC+8) → MM/DD/YYYY-ish for display */
export const toLocaleDateStringPHT = (ts) => {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
  });
};

/** PHT (UTC+8) → YYYY-MM-DD (for inputs) */
export const toYMD_PHT_fromTS = (ts) => {
  if (!ts?.seconds) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(new Date(ts.seconds * 1000));
};

/** PHT (UTC+8) → local input style "YYYY-MM-DDTHH:mm" */
export const toLocalISO_PHT_fromTS = (ts) => {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  const phtDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return phtDate.toISOString().slice(0, 16);
};

/** Today in PHT as YYYY-MM-DD */
export const todayYMD_PHT = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(new Date());

/** Build TS from YYYY-MM-DD */
export const tsFromYMD = (ymd, endOfDay = false) =>
  Timestamp.fromDate(new Date(`${ymd}T${endOfDay ? "23:59:59" : "00:00:00"}`));

/** minutes between 2 Firestore timestamps */
export const minutesBetweenTS = (startTs, endTs) => {
  if (!startTs?.seconds || !endTs?.seconds) return 0;
  return minutesBetween(startTs, endTs);
};

export const cap = (s) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

/** choose hourly rate based on "as of" date */
export const resolveHourlyRate = (payroll, asOfDate) => {
  if (!payroll) return 0;
  const history = Array.isArray(payroll.rateHistory) ? payroll.rateHistory : [];
  const asOf =
    asOfDate instanceof Date ? asOfDate : new Date(asOfDate || Date.now());
  const picked = history
    .filter((r) =>
      r?.effectiveFrom?.seconds
        ? new Date(r.effectiveFrom.seconds * 1000) <= asOf
        : true
    )
    .sort((a, b) => {
      const da = a?.effectiveFrom?.seconds ? a.effectiveFrom.seconds : 0;
      const db = b?.effectiveFrom?.seconds ? b.effectiveFrom.seconds : 0;
      return da - db;
    })
    .pop();
  if (picked?.rate != null) return Number(picked.rate);
  if (payroll.defaultRate != null) return Number(payroll.defaultRate);
  return 0;
};

/** sum denominations object */
export const sumDenominations = (denoms = {}) => {
  let total = 0;
  for (const [k, v] of Object.entries(denoms || {})) {
    const m = /^([bc])_(\d+(?:\.\d+)?)$/i.exec(k);
    if (!m) continue;
    const face = Number(m[2]);
    const count = Number(v || 0);
    if (!isFinite(face) || !isFinite(count)) continue;
    total += face * count;
  }
  return Number(total.toFixed(2));
};

/** compute shortage for a shift */
export const shortageForShift = (shift) => {
  const systemTotal = Number(shift?.systemTotal || 0);
  const denomTotal = sumDenominations(shift?.denominations || {});
  const delta = systemTotal - denomTotal;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
};

/** infer shift name (Morning / Afternoon / Night) */
export const inferShiftName = (startTS, title, label) => {
  if (title) return title;
  if (label) return label;
  const d = new Date(startTS.seconds * 1000);
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Manila",
    }).format(d)
  );
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  return "Night";
};
