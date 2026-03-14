// src/utils/analytics.js
// Utilities for UTC+8 (Asia/Manila) ranges, classification, and binning.

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";
import isoWeek from "dayjs/plugin/isoWeek";
dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(isoWeek);

export const ZONE = "Asia/Manila"; // always UTC+8

/** Normalize a string for matching */
export function normalize(s) {
  return String(s ?? '').trim().toLowerCase();
}

/** Determine if a transaction is a PC Rental billing transaction */
export function isPcRentalTx(tx) {
  const item = normalize(tx.item);
  const PC_RENTAL_ITEM_FALLBACK = 'pc rental';
  const PC_RENTAL_SERVICE_ID = 'pc-rental';
  return tx.serviceId === PC_RENTAL_SERVICE_ID ||
    item.includes(PC_RENTAL_ITEM_FALLBACK) ||
    item.startsWith('pc rental');
}

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
    case "past30":
      start = now.startOf("day").subtract(29, "day");
      end = now.endOf("day");
      break;
    case "yesterday":
      start = now.subtract(1, "day").startOf("day");
      end = now.subtract(1, "day").endOf("day");
      break;
    case "thisWeek":
      start = now.startOf("isoWeek");
      end = now.endOf("isoWeek");
      break;
    case "lastWeek":
      start = now.subtract(1, "week").startOf("isoWeek");
      end = now.subtract(1, "week").endOf("isoWeek");
      break;
    case "thisMonth":
      start = now.startOf("month");
      end = now.endOf("month");
      break;
    case "lastMonth":
      start = now.subtract(1, "month").startOf("month");
      end = now.subtract(1, "month").endOf("month");
      break;
    case "thisYear":
      start = now.startOf("year");
      end = now.endOf("year");
      break;
    case "lastYear":
      start = now.subtract(1, "year").startOf("year");
      end = now.subtract(1, "year").endOf("year");
      break;
    case "allTime": {
      const s = allTimeStart ? dayjs(allTimeStart).tz(ZONE) : dayjs("1970-01-01").tz(ZONE);
      start = s.startOf("day");
      end = now.endOf("day");
      break;
    }
    case "customMonth":
      if (monthYear) {
        const m = dayjs(monthYear).tz(ZONE);
        start = m.startOf("month");
        end = m.endOf("month");
      }
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

/** Classify an item into a reporting category (Printing, Services, etc.) */
export function classifyCategory(t, serviceMap) {
  const normItem = normalize(t.item);
  const svc = serviceMap.get(normItem);

  if (svc && svc.category) return svc.category.charAt(0).toUpperCase() + svc.category.slice(1);
  if (t.category) return t.category.charAt(0).toUpperCase() + t.category.slice(1);

  // Heuristics
  if (normItem.includes('print')) return "Printing";
  if (normItem.includes('scan') || normItem.includes('lamin')) return "Services";
  if (isPcRentalTx(t)) return "PC Rental";

  return "Uncategorized";
}

/** Classify a transaction to 'sale' | 'expense' | 'unknownSale' | null */
export function classifyTx(t, serviceMap) {
  const item = normalize(t.item);
  if (serviceMap.has(item)) {
    const svc = serviceMap.get(item);
    const cat = normalize(svc.category);
    // New values: 'sale' / 'expense'
    // Legacy fallback: 'debit' (old sale) / 'credit' (old expense)
    if (cat === 'sale' || cat === 'debit') return 'sale';
    if (cat === 'expense' || cat === 'credit') return 'expense';
  }
  if (String(t.item) === 'Expenses') return 'expense';
  if (item) return 'unknownSale';
  return null;
}

/** Determine if a transaction is 'retail' or 'service' based on the service catalog type */
export function getBusinessType(t, serviceMap) {
  const item = normalize(t.item);
  if (serviceMap.has(item)) {
    return serviceMap.get(item).type || 'service';
  }
  // Fallback heuristics
  if (item.includes('print') || item.includes('scan') || item.includes('photo')) return 'service';
  return 'retail'; // Assume retail for others if unknown
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
    const ts = dayjs(t.timestamp).tz(ZONE);
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
      const st = sh.startTime ? dayjs(sh.startTime).tz(ZONE) : null;
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

/** 
 * Build series for hourly transaction volume.
 * Returns array of { hour: 0-23, count: number, sales: number }
 */
export function buildHourlySeries(transactions) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, sales: 0 }));

  (transactions || []).forEach(t => {
    const isDeleted = t.isDeleted || t.is_deleted;
    const finCat = t.financialCategory || t.financial_category;
    if (isDeleted || finCat !== 'Revenue') return;
    const ts = dayjs(t.timestamp).tz(ZONE);

    if (!ts.isValid()) return;
    const h = ts.hour();
    hours[h].count += 1;
    hours[h].sales += txAmount(t);
  });
  return hours;
}

/**
 * Classify a transaction for financial reporting (Revenue, COGS, OPEX, etc.)
 */
export function classifyFinancialTx(t, serviceMap = new Map()) {
  const res = { type: 'none', amount: 0, cost: 0 };
  if (!t || t.isDeleted) return res;

  // 1. Basic Filters
  if (isPcRentalTx(t) || t.item === 'New Debt' || t.item === 'Paid Debt') return res;

  const amt = txAmount(t);
  res.amount = amt;
  const normItem = normalize(t.item);

  // 2. Modern Classification (financialCategory)
  if (t.financialCategory) {
    if (t.financialCategory === 'Revenue') {
      res.type = 'revenue';
      if (t.unitCost) {
        res.cost = Number(t.unitCost) * Number(t.quantity || 1);
      }
    } else if (t.financialCategory === 'COGS') {
      res.type = 'cogs';
    } else if (t.financialCategory === 'OPEX') {
      res.type = 'opex';
    } else if (t.financialCategory === 'CAPEX') {
      res.type = 'capex';
    }
    return res;
  }

  // 3. Legacy Fallback
  // Heuristic for expenses
  const isExp = t.category === 'expense' || !!t.expenseType || normItem === 'expenses' || t.amount < 0;

  if (isExp) {
    if (isCapitalExpense(t)) {
      res.type = 'capex';
    } else {
      res.type = 'opex';
    }
  } else {
    // Assume Revenue
    res.type = 'revenue';
  }

  return res;
}

/**
 * Calculate core metrics (Sales, Expenses, Profit) consistently.
 * EXCLUDES PC Rental from transaction sum (as it's usually counted from shifts).
 */
export function calculateMetrics(transactions = [], shifts = [], serviceMap = new Map()) {
  let sales = 0;
  let expenses = 0;

  // 1. PC Rental from shifts
  shifts.forEach(s => {
    sales += Number(s.pcRentalTotal || 0);
  });

  // 2. Regular transactions
  (transactions || []).forEach(t => {
    const cf = classifyFinancialTx(t, serviceMap);
    if (cf.type === 'revenue') {
      sales += cf.amount;
    } else if (cf.type === 'opex' || cf.type === 'cogs') {
      expenses += Math.abs(cf.amount);
    }
  });

  return {
    sales,
    expenses,
    profit: sales - expenses
  };
}

/**
 * Find the earliest valid timestamp across transactions and shifts.
 * Returns null if no data.
 */
export function getEarliestDate(transactions = [], shifts = []) {
  let earliest = null;

  const compare = (ts) => {
    if (!ts) return;
    const d = dayjs(ts);
    if (!d.isValid()) return;
    if (!earliest || d.isBefore(earliest)) earliest = d;
  };

  transactions.forEach(t => compare(t.timestamp));
  shifts.forEach(s => compare(s.startTime));

  return earliest ? earliest.toDate() : null;
}

/**
 * Aggregate consumables used across transactions.
 * Returns array of { itemId, name, qty }
 */
export function buildConsumptionSeries(transactions, serviceMap) {
  const map = {};

  (transactions || []).forEach(t => {
    if (t.isDeleted || !t.consumables || t.consumables.length === 0) return;

    const qtySold = Number(t.quantity || 1);
    t.consumables.forEach(c => {
      if (!map[c.itemId]) {
        map[c.itemId] = {
          itemId: c.itemId,
          name: c.itemName || 'Unknown Item',
          qty: 0
        };
      }
      map[c.itemId].qty += (Number(c.qty) * qtySold);
    });
  });

  return Object.values(map).sort((a, b) => b.qty - a.qty);
}

/**
 * Build a Profit & Loss series for a given range (usually monthly).
 * Returns array of { key, x, sales, cogs, opex, netProfit }
 */
export function buildPnLSeries({ transactions, shifts, startLocal, endLocal, serviceMap }) {
  const trend = buildTrendSeries({
    transactions,
    shifts,
    startLocal,
    endLocal,
    granularity: 'month',
    serviceMap
  });

  return trend.map(t => ({
    key: t.key,
    x: t.x,
    date: t.key, // Ensure compatibility with FinancialPnL
    sales: t.sales,
    cogs: t.cogs,
    opex: t.opex,
    netProfit: t.operatingProfit,
    margin: t.sales > 0 ? (t.operatingProfit / t.sales) * 100 : 0
  }));
}
