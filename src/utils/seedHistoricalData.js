// src/utils/seedHistoricalData.js
// Quota-safe DEV seeder for Firebase Spark plan.
// - Purges only 'shifts' and 'transactions' docs (not collections)
// - Generates 2 shifts/day (Morning 11-19, Night 19-03)
// - Strictly low document counts: ~5 tx per shift (max), debts ~1 per day
// - Prices use your ranges only; DB price is ignored
// - Maintenance 50–1000, 1–2×/month
//
// Estimated full run (Mar 1, 2025 -> yesterday):
// ~440 shift docs
// ~ (<=5 tx/shift) * 440 ≈ <=2200 tx
// + weekly/monthly/misc/debts ≈ 100–200
// Total writes per run ≈ 2.5–2.8k  (safe for 3 runs/day under 60% of 20k)

import {
  addDoc, collection, getDocs, query, where, limit,
  setDoc, writeBatch, Timestamp, orderBy, startAfter, doc
} from "firebase/firestore";
import { db as defaultDb } from "../firebase";

// ----- fixed shop config -----
const MORNING = { hStart: 11, mStart: 0, hEnd: 19, mEnd: 0, label: "Morning", staff: "test@test.com" };
const NIGHT   = { hStart: 19, mStart: 0, hEnd:  3, mEnd: 0, label: "Night",   staff: "kleng@gmail.com" };

const RATE_PC = 15;   // ₱/hour
const PCS = 8;        // computers
const SHIFT_HOURS = 8;
const START_ISO = "2025-08-01"; // inclusive

// ----- helpers -----
const rnd    = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ts     = (d) => Timestamp.fromDate(d);

const atLocal = (baseDate, h, m) => {
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
};
const nextDay = (d) => {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  return n;
};

// ----- pricing strictly from your ranges -----
function classify(serviceName = "") {
  const s = (serviceName || "").toLowerCase();
  if (s.includes("photocopy")) return "photocopy";
  if (s.includes("photo"))     return "photo";      // detect before generic "print"
  if (s.includes("sticker"))   return "sticker";
  if (s.includes("laminate"))  return "laminate";
  if (s.includes("scan"))      return "scan";
  if (s.includes("wifi"))      return "wifi";
  if (s.includes("print"))     return "print";
  return null;
}
function priceFromCategory(cat) {
  switch (cat) {
    case "print":     return choose([3,5,10,20]);
    case "photocopy": return 3;
    case "photo":     return rnd(20,100);
    case "sticker":   return rnd(20,100);
    case "laminate":  return rnd(20,100);
    case "scan":      return 5;
    case "wifi":      return choose([1,5,10,20]);
    default:          return rnd(5,50);
  }
}

// ----- seasonality (quantities/occupancy only) -----
function seasonality(date, period) {
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const isWeekend = day === 0 || day === 6;
  const isMon = day === 1;
  const isWed = day === 3;

  // boost factor for quantities
  let boost = 1.0;
  // occupancy range for pc rentals
  let occMin, occMax;

  if (isWeekend) {
    boost = period === "Morning" ? 1.5 : 1.3;        // jam-packed weekends
    occMin = period === "Morning" ? 0.9 : 0.75;
    occMax = 1.0;
  } else if (isMon || isWed) {
    boost = period === "Morning" ? 0.7 : 0.5;        // low Mon/Wed
    occMin = period === "Morning" ? 0.5 : 0.25;
    occMax = period === "Morning" ? 0.8 : 0.6;
  } else {
    boost = period === "Morning" ? 1.0 : 0.7;        // weekday, day > night
    occMin = period === "Morning" ? 0.7 : 0.35;
    occMax = period === "Morning" ? 1.0 : 0.8;
  }
  return { boost, occMin, occMax };
}

// ----- Firestore utilities -----
async function purgeCollection(db, colName) {
  const col = collection(db, colName);
  let lastDoc = null;
  while (true) {
    const qy = lastDoc
      ? query(col, orderBy("__name__"), startAfter(lastDoc), limit(500))
      : query(col, orderBy("__name__"), limit(500));
    const snap = await getDocs(qy);
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}
async function purgeShiftsAndTransactions(db) {
  await purgeCollection(db, "transactions");
  await purgeCollection(db, "shifts");
}
async function fetchServices(db) {
  const snap = await getDocs(collection(db, "services"));
  const all = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));
  // Sales = 'Debit' (your convention). Ignore "Phone Charge".
  const revenue = all.filter(s =>
    (s.category || "").toLowerCase() === "debit" &&
    (s.serviceName || "") !== "Phone Charge"
  );
  return { revenue };
}
async function createTenCustomers(db) {
  const col = collection(db, "customers");
  const when = ts(new Date());
  for (let i = 0; i < 10; i++) {
    await addDoc(col, {
      fullName: `Customer ${rnd(1000, 9999)}`,
      username: `cust${rnd(100000, 999999)}`,
      createdAt: when
    });
  }
}

// ----- admin expenses (very few docs) -----
async function writeMonthlyFixedExpenses(db, startDate, endDate) {
  const txCol = collection(db, "transactions");
  const months = [];
  const s = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const e = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  for (let d = new Date(s); d <= e; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));

  for (const m of months) {
    const pairs = [
      { day: 1,  expenseType: "Rent",                    amount: 14000 },
      { day: 3,  expenseType: "Internet - PLDT",         amount: 3000 },
      { day: 4,  expenseType: "Internet - Converge",     amount: 3000 },
      { day: 5,  expenseType: "Internet - Globe",        amount: 3000 },
      { day: 10, expenseType: "Subscription - Canva",    amount: 500 },
      { day: 11, expenseType: "Subscription - Pondo",    amount: 280 },
    ];
    for (const p of pairs) {
      await addDoc(txCol, {
        item: "Expenses",
        expenseType: p.expenseType,
        price: p.amount, quantity: 1, total: p.amount,
        isDeleted: false, isEdited: true, addedByAdmin: true,
        source: "admin_manual", staffEmail: "admin",
        shiftId: null,
        timestamp: ts(atLocal(new Date(m.getFullYear(), m.getMonth(), p.day), 10, 0))
      });
    }
    // Maintenance 1–2×/month, ₱50–1000
    const maintenanceCount = rnd(1, 2);
    for (let i = 0; i < maintenanceCount; i++) {
      const day = rnd(6, 28);
      const amount = rnd(50, 1000);
      await addDoc(txCol, {
        item: "Expenses",
        expenseType: "Maintenance",
        price: amount, quantity: 1, total: amount,
        isDeleted: false, isEdited: true, addedByAdmin: true,
        source: "admin_manual", staffEmail: "admin",
        shiftId: null,
        timestamp: ts(atLocal(new Date(m.getFullYear(), m.getMonth(), day), rnd(9,18), rnd(0,59)))
      });
    }
  }
}
async function writeWeeklySalary(db, startDate, endDate) {
  const txCol = collection(db, "transactions");
  // first Sunday on/after start
  const d = new Date(startDate);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  while (d <= endDate) {
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - 6);
    const weekEnd = new Date(d);
    let days = 7;
    if (weekStart < startDate) days -= Math.ceil((startDate - weekStart) / 86400000);
    if (weekEnd > endDate) days -= Math.ceil((weekEnd - endDate) / 86400000);
    const amount = 400 * Math.max(0, Math.min(7, days));
    for (const staffEmail of ["test@test.com", "kleng@gmail.com"]) {
      await addDoc(txCol, {
        item: "Expenses",
        expenseType: "Salary",
        price: amount, quantity: 1, total: amount,
        isDeleted: false, isEdited: true, addedByAdmin: true,
        source: "admin_manual", staffEmail: "admin",
        shiftId: null,
        timestamp: ts(atLocal(new Date(d), 12, 0))
      });
    }
    d.setDate(d.getDate() + 7);
  }
}
async function writeMiscWeekly(db, startDate, endDate) {
  const txCol = collection(db, "transactions");
  for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 7)) {
    const count = rnd(0, 1); // tighten to reduce docs
    for (let i = 0; i < count; i++) {
      const day = rnd(0, 6);
      await addDoc(txCol, {
        item: "Expenses",
        expenseType: "Misc",
        price: rnd(20, 300), quantity: 1, total: rnd(20, 300),
        isDeleted: false, isEdited: true, addedByAdmin: true,
        source: "admin_manual", staffEmail: "admin",
        shiftId: null,
        timestamp: ts(atLocal(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + day), rnd(9,18), rnd(0,59)))
      });
    }
  }
}

// ----- low-doc shift generation -----
function poolsByCategory(revenueServices) {
  const pools = { print:[], photocopy:[], photo:[], sticker:[], laminate:[], scan:[], wifi:[] };
  for (const s of revenueServices) {
    const cat = classify(s.serviceName);
    if (cat && pools[cat]) pools[cat].push(s);
  }
  return pools;
}
function pcRentalTotalFor(date, period) {
  const { occMin, occMax } = seasonality(date, period);
  const occ = Math.random() * (occMax - occMin) + occMin;
  return Math.round(RATE_PC * (SHIFT_HOURS * PCS) * occ);
}
async function createShiftDoc(db, period, start, end, staffEmail) {
  const ref = await addDoc(collection(db, "shifts"), {
    shiftPeriod: period,
    staffEmail,
    startTime: ts(start),
    endTime: ts(end),
    servicesTotal: 0,
    pcRentalTotal: 0,
    expensesTotal: 0,
    systemTotal: 0
  });
  return ref.id;
}

// quantities per category without exploding doc counts
function quantityTargets(period, date) {
  const { boost } = seasonality(date, period);
  if (period === "Morning") {
    return {
      printQty: Math.round((80 + rnd(0, 220)) * boost),   // 80–300 boosted
      copyQty:  Math.round((20 + rnd(0, 100)) * boost),   // 20–120
      otherQty: Math.round((5 + rnd(0, 25))   * boost)    // small
    };
  } else {
    return {
      printQty: Math.round((20 + rnd(0, 100)) * boost),   // 20–120
      copyQty:  Math.round((5 + rnd(0, 55))   * boost),   // 5–60
      otherQty: Math.round((0 + rnd(0, 15))   * boost)
    };
  }
}

// Writes at most: 2 print + 1 copy + (0/1) other + 1 per-shift expense + (0/1) debt
async function generateForShift(db, {
  shiftId, period, start, end, staffEmail, pools, customers, allowDebt
}) {
  const txCol = collection(db, "transactions");
  const { printQty, copyQty, otherQty } = quantityTargets(period, start);

  let servicesTotal = 0;
  let expensesTotal = 0;
  const txs = [];

  // add up to 2 print lines (big quantities)
  if (pools.print.length && printQty > 0) {
    const partA = Math.floor(printQty * choose([0.55, 0.6, 0.7]));
    const partB = Math.max(0, printQty - partA);
    const svc = choose(pools.print);
    const line = (qty) => ({
      item: svc.serviceName || "Print",
      price: priceFromCategory("print"),
      quantity: qty,
      total: priceFromCategory("print") * qty,
      shiftId, staffEmail,
      isDeleted: false, isEdited: false, addedByAdmin: false,
      timestamp: ts(new Date(rnd(start.getTime(), end.getTime())))
    });
    if (partA > 0) txs.push(line(partA));
    if (partB > 0 && Math.random() < 0.75) txs.push(line(partB)); // second line optional
  }

  // 1 photocopy line
  if (pools.photocopy.length && copyQty > 0) {
    const svc = choose(pools.photocopy);
    const price = priceFromCategory("photocopy");
    txs.push({
      item: svc.serviceName || "Photocopy",
      price, quantity: copyQty, total: price * copyQty,
      shiftId, staffEmail,
      isDeleted: false, isEdited: false, addedByAdmin: false,
      timestamp: ts(new Date(rnd(start.getTime(), end.getTime())))
    });
  }

  // maybe 1 "other" line (more likely on weekends)
  const day = start.getDay();
  const weekend = (day === 0 || day === 6);
  const addOther = otherQty > 0 && Math.random() < (weekend ? 0.85 : 0.45);
  if (addOther) {
    const pool = [
      ...pools.photo, ...pools.sticker, ...pools.laminate, ...pools.scan, ...pools.wifi
    ].filter(Boolean);
    if (pool.length) {
      const svc = choose(pool);
      const cat = classify(svc.serviceName);
      const price = priceFromCategory(cat);
      txs.push({
        item: svc.serviceName || "Service",
        price, quantity: otherQty, total: price * otherQty,
        shiftId, staffEmail,
        isDeleted: false, isEdited: false, addedByAdmin: false,
        timestamp: ts(new Date(rnd(start.getTime(), end.getTime())))
      });
    }
  }

  // Per-shift Salary Advance ₱50
  txs.push({
    item: "Expenses",
    expenseType: "Salary Advance",
    price: 50, quantity: 1, total: 50,
    shiftId, staffEmail,
    isDeleted: false, isEdited: false, addedByAdmin: true,
    timestamp: ts(new Date(rnd(start.getTime(), end.getTime())))
  });

  // Optional: 1 New Debt tied to this shift (avg ~1 per day overall)
  const willDebt = allowDebt && customers.length && Math.random() < 0.5;
  let scheduledPaidDebt = null;
  if (willDebt) {
    const cust = choose(customers);
    const borrowed = choose([15, 30, 45, 60, 75, 90, 105, 120]);
    const when = new Date(rnd(start.getTime(), end.getTime()));
    txs.push({
      item: "New Debt",
      customerId: cust.id,
      customerName: cust.fullName || cust.username || "Customer",
      price: borrowed, quantity: 1, total: borrowed,
      isDeleted: false, isEdited: false, addedByAdmin: false,
      staffEmail, shiftId,
      timestamp: ts(when),
    });
    // schedule matching Paid Debt later (find shift after all are created)
    const payAt = new Date(when);
    payAt.setDate(payAt.getDate() + rnd(1, 2));
    payAt.setHours(rnd(9,21), rnd(0,59), 0, 0);
    scheduledPaidDebt = { customer: cust, amount: borrowed, when: payAt };
  }

  // compute totals
  for (const t of txs) {
    if (t.item === "Expenses") expensesTotal += t.total;
    else if (t.item !== "New Debt" && t.item !== "Paid Debt") servicesTotal += t.total;
  }

  // write (single batch for this shift)
  const batch = writeBatch(db);
  for (const tx of txs) batch.set(doc(txCol), tx);
  await batch.commit();

  return { servicesTotal, expensesTotal, scheduledPaidDebt };
}

async function seedShiftsRange(db, startDate, endDate, pools, customers) {
  const generatedShifts = [];   // [{id, start, end}]
  const scheduledPaidDebts = []; // [{customer, amount, when}]

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    // Morning
    {
      const start = atLocal(d, MORNING.hStart, MORNING.mStart);
      const end   = atLocal(d, MORNING.hEnd,   MORNING.mEnd);
      const shiftId = await createShiftDoc(db, MORNING.label, start, end, MORNING.staff);
      generatedShifts.push({ id: shiftId, start, end });

      const { servicesTotal, expensesTotal, scheduledPaidDebt } =
        await generateForShift(db, {
          shiftId, period: MORNING.label, start, end, staffEmail: MORNING.staff,
          pools, customers, allowDebt: true
        });

      if (scheduledPaidDebt) scheduledPaidDebts.push(scheduledPaidDebt);

      const pcTotal = pcRentalTotalFor(d, MORNING.label);
      await setDoc(doc(db, "shifts", shiftId), {
        servicesTotal,
        expensesTotal,
        pcRentalTotal: pcTotal,
        systemTotal: servicesTotal + pcTotal - expensesTotal
      }, { merge: true });
    }
    // Night
    {
      const start = atLocal(d, NIGHT.hStart, NIGHT.mStart);
      const end   = atLocal(nextDay(d), NIGHT.hEnd, NIGHT.mEnd);
      const shiftId = await createShiftDoc(db, NIGHT.label, start, end, NIGHT.staff);
      generatedShifts.push({ id: shiftId, start, end });

      const { servicesTotal, expensesTotal, scheduledPaidDebt } =
        await generateForShift(db, {
          shiftId, period: NIGHT.label, start, end, staffEmail: NIGHT.staff,
          pools, customers, allowDebt: false // average ~1 per day overall
        });

      if (scheduledPaidDebt) scheduledPaidDebts.push(scheduledPaidDebt);

      const pcTotal = pcRentalTotalFor(d, NIGHT.label);
      await setDoc(doc(db, "shifts", shiftId), {
        servicesTotal,
        expensesTotal,
        pcRentalTotal: pcTotal,
        systemTotal: servicesTotal + pcTotal - expensesTotal
      }, { merge: true });
    }
  }

  // Resolve Paid Debts: attach to the shift that covers the pay time
  const txCol = collection(db, "transactions");
  for (const p of scheduledPaidDebts) {
    const sh = generatedShifts.find(s => s.start <= p.when && p.when < s.end);
    if (!sh) continue;
    await addDoc(txCol, {
      item: "Paid Debt",
      customerId: p.customer.id,
      customerName: p.customer.fullName || p.customer.username || "Customer",
      price: p.amount, quantity: 1, total: p.amount,
      isDeleted: false, isEdited: false, addedByAdmin: false,
      staffEmail: "admin",
      shiftId: sh.id,
      timestamp: ts(p.when),
    });
  }
}

// ----- public entry -----
export async function generateFakeHistory({
  db = defaultDb,
  startISO = START_ISO,
  endISO,                 // defaults to yesterday
  doPurgeFirst = true,    // delete docs in 'shifts' and 'transactions' first
} = {}) {
  const startDate = new Date(startISO);
  const endDate = endISO ? new Date(endISO) : new Date();
  endDate.setDate(endDate.getDate() - 1); // up to yesterday

  if (doPurgeFirst) {
    await purgeShiftsAndTransactions(db);
  }

  // always add 10 customers (even if some exist)
  await createTenCustomers(db);

  const { revenue } = await fetchServices(db);
  const pools = poolsByCategory(revenue);

  // pull customers (existing + the 10 we just added)
  const cs = await getDocs(collection(db, "customers"));
  const customers = cs.docs.map(d => ({ id: d.id, ...d.data() }));

  await seedShiftsRange(db, startDate, endDate, pools, customers);

  // small number of admin expenses
  await writeMonthlyFixedExpenses(db, startDate, endDate);
  await writeWeeklySalary(db, startDate, endDate);
  await writeMiscWeekly(db, startDate, endDate);
}
