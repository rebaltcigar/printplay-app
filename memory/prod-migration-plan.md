---
name: Prod DB Migration Plan
description: Fresh migration plan — CSV-based approach. Reads from ./exports/ (already exported from Firebase), imports directly to Supabase. No live Firebase reads during migration.
type: project
---

# Prod DB Migration Plan v2 — CSV → Supabase

**Last updated:** 2026-03-14 (revised post-review)

## Strategy

Data is already exported. All migration reads from `./exports/*.csv` — no Firebase connection needed after the auth step.

```
Firebase Prod (source of truth, read-only)
    ↓ export-to-csv.mjs (already done)
./exports/*.csv
    ↓ import-from-csv.mjs (new — to be written)
Dev Supabase (test run first)
    ↓ verified → repeat
Prod Supabase (go-live)
```

**Dev Supabase:** `euckwqeyfhtfzbmbdzqg.supabase.co` (`.env.development`)
**Prod Supabase:** `utdkuftaavxvieosqqzz.supabase.co` (for later)
**Firebase prod:** `printplay-prod-23f4e` (auth only — all data is in CSVs)

---

## Scripts Overview

| Script | Status | Purpose |
|---|---|---|
| `scripts/export-to-csv.mjs` | ✅ Done | Firebase → CSV export (already ran) |
| `scripts/migrate_auth.js` | ✅ Reuse | Firebase Auth → Supabase Auth + profiles rows |
| `scripts/reset_admin_password.js` | ✅ Reuse | Set admin passwords to temp value post-migration |
| `scripts/import-from-csv.mjs` | ✅ Written | CSV → Supabase (main migration script) |
| `scripts/post-import.sql` | ✅ Written | Resequence IDs + update FK references |
| `scripts/resolve-staff-ids.sql` | ✅ Written | staffEmail → profiles.staff_id across all tables |
| `scripts/sync-counters.sql` | ✅ Written | Set counter current_value above max imported ID |
| `scripts/backfill-customer-stats.sql` | 🔲 Write | Compute lifetime_value, outstanding_balance, total_orders |
| `scripts/backfill_cash_difference.js` | ✅ Reuse | Backfill shifts.cash_difference |

> Old scripts (`migrate.js`, `resequence_data.sql`, `alter_schema_v2.sql`, `add_missing_tables.sql`, `complete_staff_id_migration.sql`, `repair_expenses.js`, `audit_orders_tx.js`) are **retired** — replaced by the CSV-based approach.

---

## Phase 0 — Clear Dev Supabase

Wipe everything so there are no ID or schema conflicts.

- [ ] **0.1** — In dev Supabase SQL Editor, run `memory/supabase_schema.sql` (v3.1).
  This drops all existing tables first (DROP TABLE IF EXISTS CASCADE at top of file), then recreates everything cleanly.
- [ ] **0.2** — In dev Supabase → Authentication → Users, delete all existing test auth users:
  ```sql
  DELETE FROM auth.users;
  ```
  Run via SQL Editor with service role, or delete manually in the Auth dashboard.
- [ ] **0.3** — Confirm in Table Editor: all tables exist, all are empty.

---

## Phase 1 — Auth Migration

Creates `auth.users` records + corresponding `profiles` rows. Must run before CSV import since `profiles.id` is a FK to `auth.users.id`.

- [ ] **1.1** — Run auth migration pointing at Firebase prod but writing to dev Supabase:
  ```bash
  VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
  node scripts/migrate_auth.js --prod
  ```
- [ ] **1.2** — Confirm user count in dev Supabase Auth matches Firebase prod (12 users).
- [ ] **1.3** — Spot-check 2–3 users: email, full_name, role, suspended all populated correctly.
- [ ] **1.4** — Reset admin password so you can log in after smoke test:
  ```bash
  VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
  node scripts/reset_admin_password.js
  ```
  > Sets all admin/owner/superadmin passwords to `password123` with `requires_password_reset = true`.

> **Note:** Firebase Auth passwords cannot be exported. All staff will need passwords reset after go-live.

---

## Phase 2 — CSV Import

Runs the main migration script. Reads from `./exports/`, writes to Supabase in FK-safe dependency order.

- [ ] **2.1** — Write `scripts/import-from-csv.mjs` (see spec below).
- [ ] **2.2** — Run against dev Supabase:
  ```bash
  VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
  node scripts/import-from-csv.mjs --env=dev
  ```
- [ ] **2.3** — Watch output for errors. Script should report row counts per table on completion.
- [ ] **2.4** — Verify row counts in Supabase match expected (see source map).

### Import order (FK dependency)

```
1.  products          ← services.csv
2.  customers         ← customers.csv
3.  settings          ← settings.csv
4.  app_status        ← app_status.csv
5.  daily_stats       ← stats_daily.csv
6.  shift_templates   ← shiftTemplates.csv
7.  shifts            ← shifts.csv
8.  [SKIPPED]         payroll_runs — blank
9.  orders            ← orders.csv            (needs shifts, customers)
10. order_items       ← transactions.csv TX*  (needs orders, products, shifts)
11. expenses          ← transactions.csv EXP* (needs shifts)
12. invoices          ← invoices.csv          (needs customers, shifts)
13. [SKIPPED]         payroll_line_items — blank
14. [SKIPPED]         paystubs — blank
```

> `profiles` rows already exist from Phase 1 (auth migration). Do not re-import from `users.csv`.

### import-from-csv.mjs — transformation rules

**products** (`services.csv`)
- `category` ← `type` (Firebase field `type` = 'service'/'retail')
- `financial_category` ← `financialCategory` (Firebase field `category`) — names are swapped
- `created_at` / `updated_at` ← `lastUpdated`
- `consumables` ← default `[]`
- IDs imported as Firebase doc IDs; resequenced to `PR-xxxxxxxx` in Phase 3

**customers** (`customers.csv`)
- `phone`, `address`, `email`, `tin` ← NULL (not in export)
- `lifetime_value`, `outstanding_balance`, `total_orders` ← 0 (computed in post-import)
- Discard: `createdBy`

**settings** (`settings.csv`)
- Reassemble JSONB fields from flattened CSV columns:
  - `drawer_hotkey` ← `{ code: drawerHotkey.code, altKey: drawerHotkey.altKey, display: drawerHotkey.display }`
  - `checkout_hotkey` ← `{ code: checkoutHotkey.code, key: checkoutHotkey.key, display: checkoutHotkey.display }`
  - `id_prefixes` ← `{ shifts, expenses, transactions, payroll }` from `idPrefixes.*`
  - `payment_methods` ← reassemble full nested object from all `paymentMethods.*` columns
- `drawer_signal_type` ← default `'usb'`

**shifts** (`shifts.csv`)
- `staff_id` ← `staffEmail` (raw email on import; resolved to staff_id in post-import)
- `total_digital` ← `totalGcash`
- `denominations` ← reassemble all `denominations.*` CSV keys into one object (normalize key naming)
- `cash_difference` ← NULL (backfilled in post-import)
- Discard: `payrollRunId`, `endedBy`, `status`

**orders** (`orders.csv`)
- `staff_id` ← `staffId` if set, else `staffEmail` (raw email on import; resolved in post-import)
- `discount` ← reassemble `{ type: discount.type, value: discount.value, amount: discount.amount }`
- `payment_details` ← reassemble `{ refNumber, phone, bankId, bankName }` from `paymentDetails.*`
- **NOT imported:** `customer_name`, `customer_address`, `customer_tin` — use `customer_id` FK instead
- `customer_phone`, `staff_name` — imported as-is
- Discard: `editReason`, `editedBy`, `isEdited`, `lastUpdatedAt`, `deleteReason`, `deletedAt`, `staffEmail`

**order_items** (`transactions.csv` — filter: `displayId.startsWith('TX')`)
- `parent_order_id` ← resolve `orderNumber` → `orders.id` (build lookup map from orders import)
- `product_id` ← `serviceId` (soft ref; updated to `PR-xxxxxxxx` when products resequenced in Phase 3)
- `cost_price` ← `costPrice` || `unitCost`
- `amount` ← `total`
- `staff_id` ← `staffEmail` (raw email on import; resolved in post-import)
- `metadata` ← pack `{ note, parentServiceId, variantGroup, variantLabel, paymentDetails, consumables }`
- `updated_at` ← `lastUpdatedAt`
- IDs imported as TX-prefixed; resequenced to `OI-xxxxxxxx` in Phase 3

**expenses** (`transactions.csv` — filter: `displayId.startsWith('EXP')` OR `expenseType` non-empty)
- Skip rows where `displayId` is empty AND `expenseType` is empty (~50 Firestore artifacts)
- `amount` ← `total`
- `staff_id` ← `expenseStaffEmail` || `staffEmail` (raw email; resolved in post-import)
- `category` — valid values: **`OPEX`** or **`CAPEX`**; import as-is, verify post-import
- `item` — imported (schema `NOT NULL`); **dropped post-migration** in Phase 7
- `metadata` ← pack `{ payrollRunId, source }`
- `notes` ← `notes` || `note`

**invoices** (`invoices.csv`)
- `staff_id` ← `staffEmail` (raw email; resolved in post-import)
- `invoice_number` — imported; **dropped post-migration** in Phase 7
- Discard: `customerName`, `customerEmail`, `customerPhone`, `orderId`, `orderNumber`

**payroll_runs / payroll_line_items / paystubs** — **SKIPPED**
- All payroll tables left blank. Payroll starts fresh post-launch.
- `payroll_runs` counter reset to floor (`10000000`) in sync-counters.sql.

---

## Phase 3 — Post-Import: Resequence IDs

**Write `scripts/post-import.sql`**

Assigns new sequential IDs to all rows that need them, then updates all FK references to match. Run in dev Supabase SQL Editor.

Tables to resequence and their target formats.
**Counter floor: first ID assigned = `10000000`** (loops start at 10000000).

| Table | New ID format | Counter key | FK dependents updated |
|---|---|---|---|
| `customers` | `CU-xxxxxxxx` | `customers` | `orders.customer_id`, `order_items.customer_id`, `invoices.customer_id`, `sessions.customer_id` |
| `shifts` | `SH-xxxxxxxx` | `shifts` | `orders.shift_id`, `order_items.shift_id`, `expenses.shift_id`, `invoices.shift_id`, `app_status.active_shift_id`, `sessions.shift_id`, `schedules.shift_id` |
| `orders` | `OR-xxxxxxxx` | `orders` | `order_items.parent_order_id` |
| `invoices` | `IV-xxxxxxxx` | `invoices` | none |
| `expenses` | `EX-xxxxxxxx` | `expenses` | none |
| `products` | `PR-xxxxxxxx` | `products` | `products.parent_service_id` (self), `order_items.product_id` |
| `order_items` | `OI-xxxxxxxx` | `order_items` | none |

Tables that keep their existing IDs (no resequence):
- `payroll_runs` — not imported; `payroll_runs` counter reset to floor
- `payroll_line_items`, `paystubs` — not imported
- `profiles` — UUID (auth FK, cannot change)

**Resequence script logic:**
```sql
-- For each table being resequenced:
-- 1. Build a mapping table: old_id → new_id
-- 2. Rename old IDs to temp (e.g. OLD-<id>)
-- 3. Assign new sequential IDs using counter-format
-- 4. Update all FK columns across dependent tables
-- 5. Drop mapping table
```

**FK update map** (what references what):

```
shifts.id referenced by:
  → orders.shift_id
  → order_items.shift_id
  → expenses.shift_id
  → invoices.shift_id
  → schedules.shift_id
  → sessions.shift_id
  → app_status.active_shift_id

orders.id referenced by:
  → order_items.parent_order_id

customers.id referenced by:
  → orders.customer_id
  → order_items.customer_id
  → invoices.customer_id
  → sessions.customer_id

invoices.id: no external FK dependents
expenses.id: no external FK dependents
```

- [ ] **3.1** — `scripts/post-import.sql` is written
- [ ] **3.2** — Run in dev Supabase SQL Editor
- [ ] **3.3** — Spot-check: verify `SH-`, `OR-`, `EX-`, `CU-`, `IV-`, `PR-`, `OI-` prefixes on rows
- [ ] **3.4** — Verify FK integrity: `order_items.shift_id` / `parent_order_id` / `customer_id` / `product_id` all resolve

---

## Phase 4 — Post-Import: Resolve staffEmail → staff_id

**Write `scripts/resolve-staff-ids.sql`**

All `staff_id` columns were populated with raw email addresses during CSV import. This step resolves them to `profiles.staff_id` (`ST-xxxxxxxx`). The target is `profiles.staff_id`, NOT `profiles.id` (UUID).

```sql
-- Build email → profiles.staff_id lookup
-- Then UPDATE each affected table:
--   shifts.staff_id
--   app_status.staff_id
--   orders.staff_id
--   orders.deleted_by
--   order_items.staff_id
--   expenses.staff_id
--   invoices.staff_id
-- (payroll_runs / payroll_line_items / paystubs NOT imported — skip)
-- Set unresolvable emails to NULL (not to a bad value)
```

- [ ] **4.1** — Write `scripts/resolve-staff-ids.sql`
- [ ] **4.2** — Run in dev Supabase SQL Editor
- [ ] **4.3** — Verify: `SELECT staff_id FROM shifts WHERE staff_id LIKE '%@%'` should return 0 rows
- [ ] **4.4** — Verify: `SELECT staff_id FROM orders WHERE staff_id LIKE '%@%'` should return 0 rows

---

## Phase 5 — Post-Import: Counter Sync

**Write `scripts/sync-counters.sql`**

Sets each counter's `current_value` to one above the highest sequential number already in use. Prevents new records from colliding with migrated ones.

```sql
-- For each counter, compute max current value from imported data:
UPDATE counters SET current_value = (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000)
  FROM shifts WHERE id LIKE 'SH-%'
) WHERE id = 'shifts';
-- ... repeat for orders, expenses, customers, invoices, payroll_runs, profiles
```

- [ ] **5.1** — Write `scripts/sync-counters.sql`
- [ ] **5.2** — Run in dev Supabase SQL Editor
- [ ] **5.3** — Verify: `SELECT * FROM counters` shows values above the max imported ID for each prefix

---

## Phase 6 — Post-Import: Backfills

Run these after resequence and staff_id resolution are complete.

**Customer aggregates** — Write `scripts/backfill-customer-stats.sql`:
```sql
UPDATE customers c SET
  total_orders        = (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND is_deleted = false),
  lifetime_value      = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE customer_id = c.id AND is_deleted = false),
  outstanding_balance = (SELECT COALESCE(SUM(balance), 0) FROM invoices WHERE customer_id = c.id AND status != 'PAID');
```

**cash_difference on shifts** — reuse existing script:
```bash
VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
node scripts/backfill_cash_difference.js
```

- [ ] **6.1** — Write and run `scripts/backfill-customer-stats.sql`
- [ ] **6.2** — Run `backfill_cash_difference.js` against dev
- [ ] **6.3** — Spot-check a customer with orders: `lifetime_value` and `total_orders` match expectations

---

## Phase 7 — Post-Migration Column Drops

Drop legacy columns that were only needed for migration compatibility:

```sql
-- Drop item column from expenses (was needed as NOT NULL during import)
ALTER TABLE expenses DROP COLUMN item;

-- Drop invoice_number column from invoices
ALTER TABLE invoices DROP COLUMN invoice_number;
```

- [ ] **7.1** — Run column drop SQL in dev Supabase SQL Editor
- [ ] **7.2** — Verify: `SELECT column_name FROM information_schema.columns WHERE table_name IN ('expenses','invoices')` — confirm dropped columns are gone
- [ ] **7.3** — Verify `expenses.category` values: `SELECT DISTINCT category FROM expenses` — should be only `OPEX` and/or `CAPEX`

---

## Phase 9 — Smoke Test

No env file changes needed — local already hits dev Supabase via `.env.development`.

- [ ] **9.1** — `npm run dev` — app starts normally
- [ ] **9.2** — Log in with admin account using `password123`, change password immediately
- [ ] **9.3** — Dashboard: verify row counts match expected (shifts ~584, orders ~1,362, etc.)
- [ ] **9.4** — Spot-check 3 recent shifts: totals, denominations, cash_difference populated
- [ ] **9.5** — Verify `shift_id` is populated on orders, expenses, and order_items (no nulls)
- [ ] **9.6** — Verify `customer_id` on orders and invoices uses `CU-xxxxxxxx`, not Firebase IDs
- [ ] **9.7** — Verify `parent_order_id` on order_items resolves correctly
- [ ] **9.8** — Verify `staff_id` on shifts and orders uses `ST-xxxxxxxx`, not raw emails
- [ ] **9.9** — Payroll: `payroll_runs`, `payroll_line_items`, `paystubs` are empty (as expected)
- [ ] **9.10** — Invoices: outstanding balances match expectations; `invoice_number` column dropped; no `order_id` / `order_number` columns
- [ ] **9.11** — Products: `category` shows 'service'/'retail', `financial_category` shows 'Sale'/'Expense'; IDs use `PR-xxxxxxxx`
- [ ] **9.12** — Order items: IDs use `OI-xxxxxxxx`; `product_id` uses `PR-xxxxxxxx`
- [ ] **9.13** — Expenses: `category` values are `OPEX`/`CAPEX`; `item` column dropped
- [ ] **9.14** — Customers: `lifetime_value`, `total_orders`, `outstanding_balance` computed correctly
- [ ] **9.15** — Settings: JSONB fields (hotkeys, payment_methods) look correct in admin Settings page
- [ ] **9.16** — Realtime: open two tabs, confirm dashboard updates live
- [ ] **9.17** — Process a test transaction end-to-end and void it

---

## Phase 10 — Repeat for Prod Supabase (When Ready)

Once Phase 9 passes cleanly:

- [ ] **10.1** — Repeat Phase 0 for prod Supabase (clear schema)
- [ ] **10.2** — Repeat Phase 1 (auth migration) pointing at prod Supabase
- [ ] **10.3** — Repeat Phase 2 (CSV import) pointing at prod Supabase
- [ ] **10.4** — Repeat Phases 3–7 (post-import SQL + column drops) in prod Supabase SQL Editor
- [ ] **10.5** — Create `.env.local` temporarily to point local dev at prod for final verification:
  ```
  VITE_SUPABASE_URL=https://utdkuftaavxvieosqqzz.supabase.co
  VITE_SUPABASE_ANON_KEY=<prod-anon-key>
  VITE_SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>
  ```
- [ ] **10.6** — Repeat smoke tests
- [ ] **10.7** — Delete `.env.local`, deploy, update hosting env vars, archive Firebase

---

## Rollback

- Firebase prod data is **never written to** — read-only throughout.
- CSV exports in `./exports/` are the single source of truth. Re-export if needed.
- If dev Supabase is broken: re-run schema (Phase 0 → Phase 6) from scratch.
- If prod Supabase is broken: same — drop and redo. Firebase + CSVs are still intact.

---

## Key File Reference

| File | Status | Purpose |
|---|---|---|
| `memory/supabase_schema.sql` | ✅ v3.1 | Drop + recreate all tables. Run first. |
| `memory/migration-source-map.md` | ✅ Done | Full column mapping, JSONB rules, FK map |
| `scripts/export-to-csv.mjs` | ✅ Done | Firebase → CSV (already exported) |
| `exports/` | ✅ Done | All source CSVs |
| `scripts/migrate_auth.js` | ✅ Reuse | Firebase Auth → Supabase Auth + profiles |
| `scripts/reset_admin_password.js` | ✅ Reuse | Temp password for admins post-migration |
| `scripts/import-from-csv.mjs` | ✅ Written | Main data import (CSVs → Supabase) |
| `scripts/post-import.sql` | ✅ Written | Resequence IDs + update FK references (7 tables) |
| `scripts/resolve-staff-ids.sql` | ✅ Written | staffEmail → profiles.staff_id across all tables |
| `scripts/sync-counters.sql` | ✅ Written | Set counter current_value above max used |
| `scripts/backfill-customer-stats.sql` | 🔲 Write | Compute customer aggregates |
| `scripts/backfill_cash_difference.js` | ✅ Reuse | Backfill shifts.cash_difference |
| `firebase-service-account-prod.json` | ✅ Local | Prod Firebase SA key — NOT in repo |

---

## Dev Supabase Service Role Key

Found in: dev Supabase Dashboard → Project Settings → API → `service_role` key.
Already in `.env.development` as `VITE_SUPABASE_SERVICE_ROLE_KEY`.
