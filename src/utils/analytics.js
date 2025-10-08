// src/utils/analytics.js
// Utilities for UTC+8 (Asia/Manila) ranges, classification, and binning.

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";
dayjs.extend(utc);
dayjs.extend(tz);

export const ZONE = "Asia/Manila"; // always UTC+8

/** Format helpers (UPDATED: add commas, no decimals) */
export const fmtPeso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

/** Range builder (always in Asia/Manila), returns JS Date in UTC for Firestore
 *  @param preset: "past7" | "thisMonth" | "monthYear" | "thisYear" | "allTime"
 *  @param monthYear: Date|null (for monthYear preset)
 *  @param allTimeStart: Date|null (earliest shift start for all-time)
 */
export function getRange(preset, monthYear /* Date|null */, allTimeStart /* Date|null */) {
  const now = dayjs().tz(ZONE);

  let start = now.startOf("month");
  let end = now.endOf("month");
  let granularity = "day";   // day | month | year
  let axis = "number";       // number|date|month|year

  switch (preset) {
    case "past7":
      start = now.startOf("day").subtract(6, "day");
      end = now.endOf("day");
      axis = "date";
      break;
    case "thisMonth":
      start = now.startOf("month");
      end = now.endOf("month");
      axis = "number";
      break;
    case "monthYear": {
      const d = dayjs(monthYear || now).tz(ZONE);
      start = d.startOf("month");
      end = d.endOf("month");
      axis = "number";
      break;
    }
    case "thisYear":
      start = now.startOf("year");
      end = now.endOf("year");
      granularity = "month";
      axis = "month";
      break;
    case "allTime": {
      const s = allTimeStart ? dayjs(allTimeStart).tz(ZONE) : dayjs("1970-01-01").tz(ZONE);
      start = s.startOf("day");
      end = now.endOf("day");
      granularity = "month";
      axis = "month";
      break;
    }
    default:
      start = now.startOf("month");
      end = now.endOf("month");
      axis = "number";
  }

  const monthsSpan = end.diff(start, "month");
  return {
    startUtc: start.utc().toDate(),
    endUtc: end.utc().toDate(),
    startLocal: start, // dayjs in ZONE
    endLocal: end,     // dayjs in ZONE
    axis,
    granularity,
    shouldDefaultYearly: monthsSpan > 36,
  };
}

/** Normalize service/item name */
export const normalize = (s) => String(s ?? "").trim().toLowerCase();

/** Build service map: serviceName(lowercased) -> { category, name } */
export function buildServiceMap(services /* active only */) {
  const m = new Map();
  (services || []).forEach((s) => {
    const name = String(s.serviceName || s.name || "").trim();
    if (!name) return;
    m.set(normalize(name), { category: String(s.category || ""), name });
  });
  return m;
}

/** Classify a transaction to 'sale' | 'expense' | 'unknownSale' | null */
export function classifyTx(t, serviceMap) {
  const item = normalize(t.item);
  if (serviceMap.has(item)) {
    const cat = normalize(serviceMap.get(item).category);
    if (cat === "debit") return "sale";
    if (cat === "credit") return "expense";
  }
  if (String(t.item) === "Expenses") return "expense";
  // Not a known service & not explicit "Expenses" -> Sales(Unknown)
  if (item) return "unknownSale";
  return null;
}

/** Amount of a transaction */
export function txAmount(t) {
  if (Number.isFinite(Number(t.total))) return Number(t.total);
  const price = Number(t.price), qty = Number(t.quantity);
  if (Number.isFinite(price) && Number.isFinite(qty)) return price * qty;
  return 0;
}

/** Should a sale count given the current service filter? */
export function saleMatchesService(t, serviceFilter, serviceMap) {
  if (!serviceFilter || serviceFilter === "All services") return true;
  if (serviceFilter === "Unknown") {
    const item = normalize(t.item);
    return !serviceMap.has(item) && String(t.item) !== "Expenses";
  }
  return normalize(t.item) === normalize(serviceFilter);
}

/** Adds a value to an object field */
function add(obj, key, v) {
  obj[key] = (obj[key] || 0) + (v || 0);
}

/** Generate keys for bucket filling */
export function generateDailyKeys(startLocal, endLocal) {
  const out = [];
  let d = startLocal.startOf("day");
  while (d.isBefore(endLocal) || d.isSame(endLocal, "day")) {
    out.push(d.format("YYYY-MM-DD"));
    d = d.add(1, "day");
  }
  return out;
}
export function generateMonthlyKeys(startLocal, endLocal) {
  const out = [];
  let d = startLocal.startOf("month");
  while (d.isBefore(endLocal) || d.isSame(endLocal, "month")) {
    out.push(d.format("YYYY-MM"));
    d = d.add(1, "month");
  }
  return out;
}
export function generateYearlyKeys(startLocal, endLocal) {
  const out = [];
  let d = startLocal.startOf("year");
  while (d.isBefore(endLocal) || d.isSame(endLocal, "year")) {
    out.push(d.format("YYYY"));
    d = d.add(1, "year");
  }
  return out;
}

/**
 * Bin transactions + shifts to series suitable for the trend chart.
 * - granularity: 'day' | 'month' | 'year'
 * - axis: controls how x labels should be shown ('number' for 1..31, 'date' for MM/DD, 'month', 'year')
 * - serviceFilter: "All services" | serviceName | "Unknown"
 *
 * PC Rental: included in Sales as part of shifts (adds to the appropriate bucket),
 * and respects service filter:
 *  - included when service == "All services"
 *  - included when service == "PC Rental" (exact match, case-insensitive)
 *  - otherwise excluded
 */
export function buildTrendSeries({
  transactions,
  shifts,
  startLocal,
  endLocal,
  granularity,
  axis,
  serviceFilter,
  serviceMap,
}) {
  const buckets = new Map(); // key -> { sales, expenses }

  // helper for bucket key from date
  const keyFor = (d /* dayjs in ZONE */) => {
    if (granularity === "day") return d.format("YYYY-MM-DD");
    if (granularity === "month") return d.format("YYYY-MM");
    return d.format("YYYY"); // year
  };

  // 1) Seed with zeros so the line is continuous
  const keys =
    granularity === "day"
      ? generateDailyKeys(startLocal, endLocal)
      : granularity === "month"
      ? generateMonthlyKeys(startLocal, endLocal)
      : generateYearlyKeys(startLocal, endLocal);

  keys.forEach((k) => buckets.set(k, { sales: 0, expenses: 0 }));

  // 2) Fold transactions into buckets
  (transactions || []).forEach((t) => {
    if (t.isDeleted) return;
    const ts = t.timestamp?.seconds
      ? dayjs.unix(t.timestamp.seconds).tz(ZONE)
      : dayjs(t.timestamp).tz(ZONE);
    if (!ts.isValid()) return;
    if (ts.isBefore(startLocal) || ts.isAfter(endLocal)) return;

    const key = keyFor(ts);
    const cls = classifyTx(t, serviceMap);
    if (!cls) return;

    const amt = txAmount(t);
    if (cls === "expense") {
      // Expenses ignore the service filter
      add(buckets.get(key), "expenses", amt);
    } else {
      // Sales / UnknownSales respect the service filter
      if (saleMatchesService(t, serviceFilter, serviceMap)) {
        add(buckets.get(key), "sales", amt);
      }
    }
  });

  // 3) Add PC Rental from shifts (Sales) per bucket if it should count
  const includePCRental =
    !serviceFilter ||
    serviceFilter === "All services" ||
    normalize(serviceFilter) === "pc rental";

  if (includePCRental) {
    (shifts || []).forEach((sh) => {
      const st = sh.startTime?.seconds
        ? dayjs.unix(sh.startTime.seconds).tz(ZONE)
        : null;
      if (!st || !st.isValid()) return;
      if (st.isBefore(startLocal) || st.isAfter(endLocal)) return;

      const key = keyFor(st);
      const amt = Number(sh.pcRentalTotal || 0);
      add(buckets.get(key), "sales", amt);
    });
  }

  // 4) Emit series with desired X labels
  const out = [];
  for (const k of keys) {
    const d =
      granularity === "day"
        ? dayjs.tz(k, "YYYY-MM-DD", ZONE)
        : granularity === "month"
        ? dayjs.tz(k, "YYYY-MM", ZONE)
        : dayjs.tz(k, "YYYY", ZONE);

    let x = k;
    if (granularity === "day") {
      if (axis === "number") x = Number(d.format("D")); // 1..31
      else x = d.format("MM/DD"); // dates for Past 7 Days
    } else if (granularity === "month") {
      x = d.format("MMM"); // Jan..Dec
    } else {
      x = d.format("YYYY");
    }

    const { sales, expenses } = buckets.get(k) || { sales: 0, expenses: 0 };
    out.push({
      x,
      key: k,
      sales,
      expenses,
      net: sales - expenses,
    });
  }

  return out;
}
