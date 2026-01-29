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

/** Small helper so we can reuse the capital logic elsewhere */
export const isCapitalExpense = (t) => {
  const et = String(t?.expenseType || "").toLowerCase();
  // make it a little forgiving
  return et.includes("capital");
};

/** Range builder (always in Asia/Manila) */
export function getRange(preset, monthYear /* Date|null */, allTimeStart /* Date|null */) {
  const now = dayjs().tz(ZONE);

  let start = now.startOf("month");
  let end = now.endOf("month");

  switch (preset) {
    case "past7":
      start = now.startOf("day").subtract(6, "day");
      end = now.endOf("day");
      break;
    case "thisMonth":
      start = now.startOf("month");
      end = now.endOf("month");
      break;
    case "monthYear": {
      const d = dayjs(monthYear || now).tz(ZONE);
      start = d.startOf("month");
      end = d.endOf("month");
      break;
    }
    case "thisYear":
      start = now.startOf("year");
      end = now.endOf("year");
      break;
    case "allTime": {
      const s = allTimeStart ? dayjs(allTimeStart).tz(ZONE) : dayjs("1970-01-01").tz(ZONE);
      start = s.startOf("day");
      end = now.endOf("day");
      break;
    }
    case "past12":
      // Start of month, 11 months ago -> Total 12 months including current
      start = now.subtract(11, "month").startOf("month");
      end = now.endOf("month");
      break;
    default:
      start = now.startOf("month");
      end = now.endOf("month");
  }

  const monthsSpan = end.diff(start, "month");
  return {
    startUtc: start.utc().toDate(),
    endUtc: end.utc().toDate(),
    startLocal: start,
    endLocal: end,
    // this is used by your view
    granularity: "day",
    axis: "number",
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
  if (item) return "unknownSale";
  return null;
}

/** Amount of a transaction */
export function txAmount(t) {
  if (Number.isFinite(Number(t.total))) return Number(t.total);
  const price = Number(t.price),
    qty = Number(t.quantity);
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
 * Build series for the TrendChart.
 * NOW ALSO EMITS:
 *   - capital: expenses that are capital
 *   - expenses: still full expenses (includes capital)
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
  const buckets = new Map();

  const keyFor = (d /* dayjs */) => {
    if (granularity === "day") return d.format("YYYY-MM-DD");
    if (granularity === "month") return d.format("YYYY-MM");
    return d.format("YYYY");
  };

  const keys =
    granularity === "day"
      ? generateDailyKeys(startLocal, endLocal)
      : granularity === "month"
        ? generateMonthlyKeys(startLocal, endLocal)
        : generateYearlyKeys(startLocal, endLocal);

  // seed
  keys.forEach((k) => buckets.set(k, { sales: 0, cogs: 0, opex: 0, capex: 0 }));

  // 2) transactions
  (transactions || []).forEach((t) => {
    if (t.isDeleted) return;
    const ts = t.timestamp?.seconds
      ? dayjs.unix(t.timestamp.seconds).tz(ZONE)
      : dayjs(t.timestamp).tz(ZONE);
    if (!ts.isValid()) return;
    if (ts.isBefore(startLocal) || ts.isAfter(endLocal)) return;

    const key = keyFor(ts);
    const bucket = buckets.get(key);
    if (!bucket) return;

    const amt = txAmount(t);

    // 1. Explicit Financial Category
    if (t.financialCategory) {
      if (t.financialCategory === 'Revenue') {
        add(bucket, "sales", amt);
        // COGS from unitCost
        if (t.unitCost) {
          const cost = Number(t.unitCost) * Number(t.quantity || 1);
          add(bucket, "cogs", cost);
        }
      }
      else if (t.financialCategory === 'COGS') add(bucket, "cogs", amt);
      else if (t.financialCategory === 'OPEX') add(bucket, "opex", amt);
      else if (t.financialCategory === 'CAPEX') add(bucket, "capex", amt);
      return;
    }

    // 2. Legacy Fallback
    const cls = classifyTx(t, serviceMap);
    if (!cls) return;

    if (cls === "expense") {
      if (isCapitalExpense(t)) {
        add(bucket, "capex", amt);
      } else {
        add(bucket, "opex", amt);
      }
    } else {
      // sales + unknown sales respect service filter
      if (saleMatchesService(t, serviceFilter, serviceMap)) {
        add(bucket, "sales", amt);
      }
    }
  });

  // 3) PC Rental (sales)
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
      const bucket = buckets.get(key);
      if (!bucket) return;
      add(bucket, "sales", Number(sh.pcRentalTotal || 0));
    });
  }

  // 4) emit
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
      if (axis === "number") x = Number(d.format("D"));
      else x = d.format("MM/DD");
    } else if (granularity === "month") {
      x = d.format("MMM");
    } else {
      x = d.format("YYYY");
    }

    const bucket = buckets.get(k) || { sales: 0, cogs: 0, opex: 0, capex: 0 };
    // Derived Calculations
    const grossProfit = bucket.sales - bucket.cogs;
    const operatingProfit = grossProfit - bucket.opex;
    const netCashFlow = operatingProfit - bucket.capex;

    out.push({
      x,
      key: k,
      sales: bucket.sales,
      cogs: bucket.cogs,
      opex: bucket.opex,
      capex: bucket.capex,
      grossProfit,
      operatingProfit,
      netCashFlow
    });
  }

  return out;
}
