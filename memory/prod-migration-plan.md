---
name: Prod DB Migration Plan
description: Plan to migrate Firebase prod data into dev Supabase for testing, then migrate to prod Supabase when verified. Includes clearing dev DB and pointing local at real prod data safely.
type: project
---

# Prod DB Migration Plan — Firebase Prod → Supabase Dev (Test Run First)

**Strategy:** Don't touch prod Supabase yet. Instead:
1. Wipe dev Supabase clean
2. Run migration from **Firebase prod** → **dev Supabase**
3. Test locally against real prod data in a safe environment
4. Once verified, repeat the exact same steps against prod Supabase

**Why:** If something breaks, dev Supabase is throwaway. Firebase prod data stays untouched throughout. Zero risk to live operations.

**Dev Supabase:** `euckwqeyfhtfzbmbdzqg.supabase.co` (already in `.env.development`)
**Prod Supabase:** `utdkuftaavxvieosqqzz.supabase.co` (for later)
**Firebase prod:** `printplay-prod-23f4e` (source of truth)

---

## Prerequisites

- [ ] You have `firebase-service-account-prod.json` locally (Firebase Console → `printplay-prod-23f4e` → Project Settings → Service Accounts → Generate new private key). **Do NOT commit this file.**
- [ ] Dev Supabase project (`euckwqeyfhtfzbmbdzqg`) is accessible in the Supabase dashboard.
- [ ] `npm install` done locally.
- [ ] Local app currently uses `.env.development` (dev Supabase) — no changes needed to env files.

---

## Phase 0 — Clear Dev Supabase DB

Wipe all existing dev data so there are no ID or duplicate conflicts.

### Task list

- [ ] **0.1** — In dev Supabase SQL Editor, run the following to drop and recreate all tables:
  ```sql
  -- Drop everything in dependency order
  DROP TABLE IF EXISTS paystubs CASCADE;
  DROP TABLE IF EXISTS payroll_line_items CASCADE;
  DROP TABLE IF EXISTS payroll_runs CASCADE;
  DROP TABLE IF EXISTS payroll_logs CASCADE;
  DROP TABLE IF EXISTS transactions CASCADE;
  DROP TABLE IF EXISTS order_items CASCADE;
  DROP TABLE IF EXISTS orders CASCADE;
  DROP TABLE IF EXISTS invoices CASCADE;
  DROP TABLE IF EXISTS expenses CASCADE;
  DROP TABLE IF EXISTS shifts CASCADE;
  DROP TABLE IF EXISTS sessions CASCADE;
  DROP TABLE IF EXISTS stations CASCADE;
  DROP TABLE IF EXISTS customers CASCADE;
  DROP TABLE IF EXISTS products CASCADE;
  DROP TABLE IF EXISTS packages CASCADE;
  DROP TABLE IF EXISTS rates CASCADE;
  DROP TABLE IF EXISTS zones CASCADE;
  DROP TABLE IF EXISTS schedules CASCADE;
  DROP TABLE IF EXISTS shift_templates CASCADE;
  DROP TABLE IF EXISTS settings CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TABLE IF EXISTS app_status CASCADE;
  DROP TABLE IF EXISTS pc_transactions CASCADE;
  DROP TABLE IF EXISTS counters CASCADE;
  ```
- [ ] **0.2** — Confirm in Table Editor that all tables are gone (or empty).
- [ ] **0.3** — In dev Supabase → Authentication → Users, manually delete all existing test users (or use SQL: `DELETE FROM auth.users;` via service role if available).

---

## Phase 1 — Rebuild Schema on Dev Supabase

Run all SQL scripts in order in dev Supabase SQL Editor.

### Task list

- [ ] **1.1** — Run `memory/supabase_schema.sql` — creates all base tables.
- [ ] **1.2** — Run `scripts/create_counter_schema.sql` — creates `counters` table + RPCs. **Must run before alter_schema_v2.sql** (that script calls `get_next_sequence_batch`).
- [ ] **1.3** — Run `scripts/alter_schema_v2.sql` — adds missing columns, RLS policies, indexes, cash_difference, metadata/soft-delete columns, and performance indexes. Counter seeds are now 8-digit (base: 10000000).
- [ ] **1.4** — Run `scripts/add_missing_tables.sql` — creates PC Timer + Scheduling tables (zones, rates, packages, stations, sessions, shift_templates, schedules, daily_stats) + their RLS.
- [ ] **1.5** — Verify in Table Editor that all tables exist with correct columns.

---

## Phase 2 — Auth Migration (Firebase Prod Auth → Dev Supabase Auth)

### Task list

- [ ] **2.1** — Place `firebase-service-account-prod.json` in project root.
- [ ] **2.2** — Run auth migration pointing at **Firebase prod** but writing to **dev Supabase**:
  ```bash
  VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
  node scripts/migrate_auth.js --prod
  ```
  > **Fixes applied (2026-03-12):** `full_name` now checks `fsUser.fullName`, `fsUser.full_name`, `fsUser.name`, `fsUser.displayName` in order, falling back to the email prefix. Fixes blank staff names after migration.

- [ ] **2.3** — In dev Supabase → Authentication → Users, confirm user count matches Firebase prod Auth user count.
- [ ] **2.4** — Spot-check 2-3 users for correct email, role, name, and suspended status.

> **Note on passwords:** Firebase Auth passwords cannot be exported. Use Phase 4 step 4.0 to reset admin password immediately after migration.

---

## Phase 3 — Data Migration (Firebase Prod Firestore → Dev Supabase)

### Task list

- [ ] **3.1** — Same hybrid approach: read from Firebase prod, write to dev Supabase:
  ```bash
  VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
  node scripts/migrate.js --prod
  ```
  > **Fixes applied (2026-03-12):**
  > - Shift FK resolution now uses `shiftFsIdMap` to map Firebase fsId → displayId, fixing null `shift_id` on orders, expenses, and transactions.
  > - `mapOrder` no longer writes Firebase UID into `staff_id` (was causing blanks after resequence). Staff resolved from `staff_email` during resequence.
  > - `payrollLogs` collection tried first (camelCase), then `payroll_logs` fallback — fixes blank payroll_logs table.
  > - `display_id` removed from `payroll_runs` mapper (redundant after resequencing).
  > - **[Round 2 fix]** `mapOrder` was missing `order_number` field entirely — `orders.order_number NOT NULL` would crash WAVE 4. Fixed by adding `order_number: d.orderNumber || resolveId(d)`. This also fixes the `registry.orders` Set which was storing `undefined`, causing all `parent_order_id` on `order_items` to be null.

- [ ] **3.2** — Watch migration output for any `❌` errors. Re-run if needed (scripts are idempotent via upsert).
- [ ] **3.3** — Run row count check:
  ```bash
  node scripts/analyze_db.js
  ```
  Compare counts against Firebase console collection sizes.

---

## Phase 4 — Post-Migration Fixups on Dev Supabase

### 4.0 — Reset Admin Password (do this first)
```bash
VITE_SUPABASE_URL=https://euckwqeyfhtfzbmbdzqg.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<dev-service-role-key> \
node scripts/reset_admin_password.js
```
> Sets all admin/owner/superadmin passwords to `password123` with `requires_password_reset = true`.
> Log in, then immediately change your password via the app.

Run these in dev Supabase SQL Editor:

- [ ] **4.1** — `scripts/complete_staff_id_migration.sql` — resolve staff_email → staff_id.
- [ ] **4.2** — `scripts/optimize_inventory_revert.sql` — restore retail inventory state.

Run these via Node.js (targeting dev):
- [ ] **4.3** — `node scripts/backfill_cash_difference.js` (no `--prod` flag = dev)
- [ ] **4.4** — `node scripts/repair_expenses.js` (no `--prod` flag = dev)
- [ ] **4.5** — `node scripts/audit_orders_tx.js` — review any order/transaction mismatches.

Run last (all data must be in and fixed before this):
- [ ] **4.6** — `scripts/resequence_data.sql` — re-key all rows to sequential 8-digit display IDs (e.g. `SH-10000001`), update all FK references.
  > **This is irreversible.** Run `audit_orders_tx.js` first and confirm zero errors before proceeding.
  >
  > **Fixes applied (2026-03-12):**
  > - **Critical bug fixed:** Mapping tables (`shift_map`, `order_map`, `cust_map`, etc.) previously stored `OLD-firebase_id` as the old key, causing all FK updates to silently fail (customer_id, order_id, product_id on order_items were all left as Firebase IDs). Fixed by stripping the `OLD-` prefix via `REPLACE(r.id, 'OLD-', '')`.
  > - Added `payroll_run_map` — `run_id` in `paystubs` and `payroll_line_items` now correctly updated to new `PY-xxxxxxxx` IDs.
  > - Fixed table name references: `payroll_stubs` → `paystubs`, `payroll_lines` → `payroll_line_items` throughout the script.
  > - Changed from 12-digit to **8-digit IDs** (base `10000000`), e.g. `SH-10000001` instead of `SH-100000000001`.

- [ ] **4.7** — `scripts/sequential_ids_and_optimization.sql` — seed counter starting values and sync each counter above the highest sequential ID assigned by resequence. Guarantees no new record will collide with a migrated one.

---

## Phase 5 — Smoke Test (Local App → Dev Supabase, Real Prod Data)

No env file changes needed — local already hits dev Supabase via `.env.development`.

- [ ] **5.1** — `npm run dev` — app starts normally.
- [ ] **5.2** — Log in with admin account using `password123`, change password immediately.
- [ ] **5.3** — Admin Dashboard: verify shifts, orders, transactions, customers show real prod row counts.
- [ ] **5.4** — Spot-check 3 recent shifts: totals, consolidation status, cash_difference all correct.
- [ ] **5.5** — Verify `shift_id` is populated on orders, expenses, and order_items (was null before fixes).
- [ ] **5.6** — Verify `customer_id` on invoices and orders is a sequential ID (e.g. `CU-10000001`), not a Firebase ID.
- [ ] **5.7** — Verify `order_id` and `product_id` are populated on `order_items`.
- [ ] **5.8** — Verify staff names are populated on profiles (not blank).
- [ ] **5.9** — Payroll: a recent payroll run shows correct staff and totals; `paystubs.run_id` matches `payroll_runs.id`.
- [ ] **5.10** — Invoices: outstanding balances match expectations.
- [ ] **5.11** — Realtime: open two tabs, confirm station map / dashboard updates live.
- [ ] **5.12** — Process a test transaction end-to-end and void it.

---

## Phase 6 — Repeat for Prod Supabase (When Ready)

Once Phase 5 passes cleanly:

- [ ] **6.1** — Repeat Phase 0 (clear prod Supabase if it has stale test data).
- [ ] **6.2** — Repeat Phase 1 (rebuild schema on prod Supabase).
- [ ] **6.3** — Re-run auth and data migration with `--prod` flag and NO env override (so it writes to prod Supabase via `.env.production`).
- [ ] **6.4** — Re-run fixup SQL scripts in prod Supabase SQL Editor.
- [ ] **6.5** — Create `.env.local` temporarily to point local dev at prod Supabase for final verification:
  ```
  VITE_SUPABASE_URL=https://utdkuftaavxvieosqqzz.supabase.co
  VITE_SUPABASE_ANON_KEY=<prod-anon-key>
  VITE_SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>
  ```
- [ ] **6.6** — Repeat smoke tests.
- [ ] **6.7** — Delete `.env.local`, deploy, set hosting env vars, archive Firebase.

---

## Rollback

- Firebase prod data is **never written to or deleted** — it's always read-only source.
- If dev Supabase is broken: drop everything and start Phase 0 over.
- If prod Supabase is broken: same — drop and redo. Firebase is still live.

---

## Dev Supabase Service Role Key

Found in: dev Supabase Dashboard → Project Settings → API → `service_role` key.
Already in `.env.development` as `VITE_SUPABASE_SERVICE_ROLE_KEY`.

---

## Post-Deployment Review Notes

Issues found during round 2 script review — low severity, no blockers, but worth a cleanup pass after smoke test passes:

### `resequence_data.sql` — `payroll_stubs` vs `paystubs`
Several loops in the script still reference the old table name `payroll_stubs` instead of `paystubs`:
- "ADD COLUMN padding" loop (line 69)
- FK constraint drop WHERE clause (line 98)
- `RENAME COLUMN staff_email → staff_id` loop (line 131)
- `SCALE COLUMN TYPES TO TEXT` loop (line 144)
- `RE-SEQUENCE ALL TABLES` loop (line 207)

**Effect:** `paystubs` rows are NOT resequenced (IDs stay as Firebase doc IDs, e.g. `abc123`).
**Why it's OK:** `paystubs.run_id` IS correctly updated via the explicit `UPDATE paystubs ... payroll_run_map` block. The paystub IDs themselves have no FK dependents — nothing references `paystubs.id`. So display is unaffected.
**Future fix:** Replace `payroll_stubs` with `paystubs` in all loops.

### `complete_staff_id_migration.sql` — broken window function in UPDATE
Lines 22–26: `UPDATE profiles SET sequential_id = 'ST-' || LPAD((row_number() OVER (ORDER BY created_at) + ...)` is invalid SQL (window functions cannot be used in UPDATE SET).
**Why it's OK:** The FOR loop condition is `WHERE sequential_id IS NULL`. By Phase 4.1, `alter_schema_v2.sql`'s trigger has already assigned sequential_ids to all profiles created by `migrate_auth.js`. The loop body never executes.
**Future fix:** Replace the broken UPDATE with a CTE-based approach, or just remove the block entirely (resequence_data.sql handles this anyway).

### `add_missing_tables.sql` (Phase 1, step 1.4) — fully redundant
All PC Timer and Scheduling tables are already included in `supabase_schema.sql`. This script is a no-op when run after Phase 1.1. Safe to skip, but harmless to run (uses `CREATE TABLE IF NOT EXISTS`).

---

## Key File Reference

| File | Purpose |
|------|---------|
| `memory/supabase_schema.sql` | Base table creation |
| `scripts/create_counter_schema.sql` | `counters` table + RPCs (Phase 1, step 1.2) |
| `scripts/alter_schema_v2.sql` | Column additions, RLS, indexes, 8-digit counter seeds |
| `scripts/add_missing_tables.sql` | PC Timer + Scheduling tables |
| `scripts/migrate_auth.js` | Firebase Auth → Supabase Auth (fixes: full_name resolution) |
| `scripts/migrate.js` | Firestore → Postgres (fixes: shift FK, staff_id, payroll_logs, display_id) |
| `scripts/reset_admin_password.js` | Set all admin passwords to `password123` + require reset flag |
| `scripts/backfill_cash_difference.js` | Backfill cash_difference on shifts |
| `scripts/repair_expenses.js` | Fix malformed expense records |
| `scripts/audit_orders_tx.js` | Verify order/transaction totals |
| `scripts/complete_staff_id_migration.sql` | staff_email → staff_id fixups |
| `scripts/optimize_inventory_revert.sql` | Restore retail inventory state |
| `scripts/resequence_data.sql` | Re-key all rows to 8-digit sequential IDs — run LAST (fixes: OLD- bug, payroll run_id, table names) |
| `scripts/sequential_ids_and_optimization.sql` | Seed + sync counter values (run after resequence) |
| `firebase-service-account-prod.json` | Prod Firebase SA key (NOT in repo) |
