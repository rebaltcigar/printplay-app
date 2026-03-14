---
name: Post-Import Code Fix Plan
description: All code changes required after the Firebase → Supabase CSV migration. Covers broken column names, removed columns, and renamed FKs introduced in schema v3.1.
type: project
---

# Post-Import Code Fix Plan
**Schema version:** v3.1
**Last updated:** 2026-03-14
**Depends on:** migration phases 1–6 complete (data imported, IDs resequenced, staff_id resolved, counters synced, backfills done)

---

## Overview

Four classes of breaking changes from schema v3.1 that the app code has not yet caught up to:

| # | Change | Severity | Affected Files |
|---|--------|----------|----------------|
| 1 | `sequential_id` → `staff_id` on `profiles` | **CRITICAL** | 7 files |
| 2 | `parent_order_number` → `parent_order_id` on `order_items` | **CRITICAL** | 3 files |
| 3 | `covered_by_uid/email/name` → `covered_by_id` on `schedules` | **CRITICAL** | 3 files |
| 4 | `order_id` + `customer_name` removed from `invoices` | **HIGH** | 1 file |

Everything else (e.g. `serviceName` as in-memory convention, `staff_name` on orders, camelCase↔snake_case mapping) is handled correctly in the current code and does not need changing.

---

## Fix 1 — `sequential_id` → `staff_id` (profiles column rename)

Schema v3.1 renamed `profiles.sequential_id` → `profiles.staff_id`. Every place the code reads or writes `sequential_id` from a profiles row is now broken.

### 1a. `src/utils/idUtils.js` — line 8
**Change:** `user?.sequential_id` → `user?.staff_id`

```js
// BEFORE
export const getStaffIdentity = (user) => {
    return user?.sequential_id || user?.id || 'unknown';
};

// AFTER
export const getStaffIdentity = (user) => {
    return user?.staff_id || user?.id || 'unknown';
};
```
Also update the JSDoc comment on line 5.

---

### 1b. `src/App.jsx` — lines 204, 209, 362, 374, 394, 523

| Line | Old | New |
|------|-----|-----|
| 204 | `userData?.sequential_id \|\| null` | `userData?.staff_id \|\| null` |
| 209 | `userData?.sequential_id` | `userData?.staff_id` |
| 362 | `userData.sequential_id` | `userData.staff_id` |
| 374 | `.or(\`id.eq.${x},sequential_id.eq.${x}\`)` | `.or(\`id.eq.${x},staff_id.eq.${x}\`)` |
| 394 | `userData.sequential_id \|\| email` | `userData.staff_id \|\| email` |
| 523 | `staff_uid: userData?.sequential_id \|\| user.id` | `staff_uid: userData?.staff_id \|\| user.id` |

> Line 374 also fixes the `.or()` query against `profiles` — `sequential_id` no longer exists as a column.

---

### 1c. `src/hooks/useStaffList.js` — lines 26, 31
```js
// BEFORE
if (v.sequential_id) bySeqId[v.sequential_id] = fullName;
...
sequential_id: v.sequential_id,

// AFTER
if (v.staff_id) bySeqId[v.staff_id] = fullName;
...
staff_id: v.staff_id,
```

---

### 1d. `src/components/pages/UserManagement.jsx` — line 283

The `staff_id` is **auto-assigned by the `trg_profile_staff_id` trigger** on insert. The code should not manually generate and insert this field — just drop the line entirely.

```js
// BEFORE (line ~283)
sequential_id: await generateDisplayId("profiles", "ST"),

// AFTER — delete this line. Trigger handles it.
```

---

### 1e. `src/components/pages/POS.jsx` — lines 1029, 1039
```js
// BEFORE
const s = staffOptions.find(o => o.sequential_id === e.target.value || o.id === e.target.value);
...
<MenuItem key={s.id} value={s.sequential_id || s.id}>{s.fullName}</MenuItem>

// AFTER
const s = staffOptions.find(o => o.staff_id === e.target.value || o.id === e.target.value);
...
<MenuItem key={s.id} value={s.staff_id || s.id}>{s.fullName}</MenuItem>
```

---

### 1f. `src/components/pages/OrderManagement.jsx` — line 524
```jsx
// BEFORE
<MenuItem key={s.sequential_id || s.id} value={s.sequential_id || s.id}>{s.fullName}</MenuItem>

// AFTER
<MenuItem key={s.staff_id || s.id} value={s.staff_id || s.id}>{s.fullName}</MenuItem>
```

---

## Fix 2 — `parent_order_number` → `parent_order_id` (order_items FK)

Schema v3.1 renamed this column and changed its type: it now stores `orders.id` (e.g. `OR-xxxxxxxx`), not `orders.order_number`. All three query sites must change both the **column name** and the **value being matched**.

### 2a. `src/components/pages/Transactions.jsx` — lines 446 and 529

Both are in separate expand-row handlers. Same fix for each:

```js
// BEFORE (line 446 and 529)
supabase.from('order_items').select('*').eq('parent_order_number', row.order_number)

// AFTER — use orders.id (row.order_id), not order_number
supabase.from('order_items').select('*').eq('parent_order_id', row.order_id)
```

> `row.order_id` is the `orders.id` FK already stored on the `order_items` / transaction row.

---

### 2b. `src/components/dialogs/OrderDetailsDialog.jsx` — line 36

```js
// BEFORE
.eq('parent_order_number', order.order_number)

// AFTER
.eq('parent_order_id', order.id)
```

---

## Fix 3 — `schedules.covered_by_*` column cleanup

Schema v3.1 removed `covered_by_uid`, `covered_by_email`, `covered_by_name` from `schedules`. Only `covered_by_id` (→ `profiles.staff_id`) remains. Three affected files need changes.

### 3a. `src/App.jsx` — line 406

This queries schedules to find shift-cover entries for the current user's email:
```js
// BEFORE
const { data: coverSnap } = await supabase.from('schedules').select('*').eq('covered_by_email', email);

// AFTER — look up staff_id from profiles first, then query by covered_by_id
const { data: profileSnap } = await supabase.from('profiles').select('staff_id').eq('email', email).single();
const coverStaffId = profileSnap?.staff_id;
const { data: coverSnap } = coverStaffId
    ? await supabase.from('schedules').select('*').eq('covered_by_id', coverStaffId)
    : { data: [] };
```

---

### 3b. `src/components/admin/Schedule.jsx` — lines 360–362 (insert/update)

```js
// BEFORE
covered_by_uid: s?.uid || '',
covered_by_email: coverStaff,
covered_by_name: s ? (s.fullName || coverStaff) : coverStaff,

// AFTER — only store covered_by_id
covered_by_id: s?.staff_id || '',
```
> `s` here is a staff profile object. Use `s.staff_id` (the ST-xxxxxxxx value).

---

### 3c. `src/components/admin/Schedule.jsx` — lines 107, 109, 644–645 (display)

`covered_by_name` no longer exists on the row. Resolve the display name from `covered_by_id` via the staff list hook.

```jsx
// BEFORE (line 107–109)
{entry.covered_by_name && (
    ...↳ {entry.covered_by_name}

// AFTER — look up name from staffById (already available from useStaffList)
{entry.covered_by_id && (
    ...↳ {staffById[entry.covered_by_id] || entry.covered_by_id}
```

Same pattern for lines 644–645.

---

### 3d. `src/components/pos/MyScheduleDrawer.jsx` — line 61

```js
// BEFORE
coveredByName: e.covered_by_name

// AFTER — resolve at read time, or store covered_by_id and resolve in render
coveredByName: staffById?.[e.covered_by_id] || e.covered_by_id || null
```

> If `staffById` is not available in this file's scope, pass `covered_by_id` through and resolve it where the name is rendered.

---

## Fix 4 — `invoiceService.js` removed columns

Schema v3.1 removed `order_id` and `customer_name` from the `invoices` table. `invoiceService.js` still writes both.

### 4a. `src/services/invoiceService.js` — lines 30 and 33

```js
// BEFORE (inside invoiceDoc object, lines 30–33)
order_id: order.id || null,
customer_id: normalized.customerId || normalized.customer_id || null,
customer_name: normalized.customerName,

// AFTER — drop order_id and customer_name; keep customer_id only
customer_id: normalized.customerId || normalized.customer_id || null,
```

Also check lines ~107 and ~157 where `customer_name` is read back from an invoice row or used in a PDF/print context — those reads won't fail (just return undefined) but any rendering depending on `invoice.customer_name` will be blank. If the customer name is needed for display, fetch it via `customer_id` → `customers.full_name` instead.

---

## Fix 5 — `App.jsx` schedule query context (line 369 comment)

Minor: line 369 has a misleading comment referencing `sequential_id`:
```js
// BEFORE
// Try to get the cashier's display name (lookup by UUID first, fall back to sequential_id)

// AFTER
// Try to get the cashier's display name (lookup by UUID first, fall back to staff_id)
```

---

## Fix Order (recommended sequence)

1. **Fix 1** (`sequential_id` → `staff_id`) first — it affects auth flow and is used by everything else
2. **Fix 4** (`invoiceService`) next — prevents insert failures on any invoice creation
3. **Fix 2** (`parent_order_number`) — breaks order item lookups in Transactions and OrderDetails
4. **Fix 3** (`covered_by_*`) last — schedules is lower-traffic than the above

---

## Files to touch

| File | Fix(es) |
|------|---------|
| `src/utils/idUtils.js` | 1a |
| `src/App.jsx` | 1b, 3a, Fix 5 |
| `src/hooks/useStaffList.js` | 1c |
| `src/components/pages/UserManagement.jsx` | 1d |
| `src/components/pages/POS.jsx` | 1e |
| `src/components/pages/OrderManagement.jsx` | 1f |
| `src/components/pages/Transactions.jsx` | 2a |
| `src/components/dialogs/OrderDetailsDialog.jsx` | 2b |
| `src/components/admin/Schedule.jsx` | 3b, 3c |
| `src/components/pos/MyScheduleDrawer.jsx` | 3d |
| `src/services/invoiceService.js` | 4a |

Total: **11 files**.

---

## Out of scope (not broken, no action needed)

- `serviceName` as in-memory field — intentional. `usePOSServices.js` and `useServiceList.js` map DB `name` → `serviceName`; all write paths correctly use `name:`.
- `staff_name` on `orders` — still present in schema (deferred removal). Queries selecting it are fine.
- `customer_name/phone/address/tin` on `orders` — still present in schema (deferred removal). Queries fine.
- `staff_uid` on `payroll_logs` — schema keeps this legacy column for now. `App.jsx:523` write is acceptable.
- `isDeleted` / `is_deleted` dual-path handling in various components — correctly bridged.
- `inventory_logs.staff_email` — schema keeps this as-is (low-priority log table).
