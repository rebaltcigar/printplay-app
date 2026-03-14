# Firebase → Supabase Migration Source Map
**Schema version:** v3.1
**Last updated:** 2026-03-14 (revised post-review)
**Source data:** Firebase Firestore export via `scripts/export-to-csv.mjs`
**Export location:** `./exports/`

---

## Data Sources

All migration data comes exclusively from the CSV exports. No live Firebase reads during migration.

| CSV File | Rows | Target Table(s) |
|---|---|---|
| `users.csv` | 12 | `profiles` |
| `customers.csv` | 38 | `customers` |
| `settings.csv` | 1 | `settings` |
| `app_status.csv` | 1 | `app_status` |
| `stats_daily.csv` | 234 | `daily_stats` |
| `shifts.csv` | 584 | `shifts` |
| `shiftTemplates.csv` | 3 | `shift_templates` |
| `payrollRuns.csv` | 27 | **NOT IMPORTED** — payroll tables start blank |
| `payrollRuns__lines.csv` | 103 | **NOT IMPORTED** — payroll tables start blank |
| `payrollRuns__paystubs.csv` | 83 | **NOT IMPORTED** — payroll tables start blank |
| `services.csv` | 25 | `products` |
| `orders.csv` | 1,362 | `orders` |
| `transactions.csv` (TX prefix) | ~4,935 | `order_items` |
| `transactions.csv` (EXP prefix + legacy) | ~810 | `expenses` |
| `invoices.csv` | 12 | `invoices` |
| `counters.csv` | — | **IGNORED** — resequenced from scratch |
| `drawer_logs.csv` | 7,061 | **NOT IMPORTED** |
| `inventory_logs.csv` | 0 | empty |
| `payroll_logs` (Firebase) | 0 | empty |
| `schedules` (Firebase) | 0 | empty |

---

## Tables with No Firebase Data (New / Runtime)

These tables are created empty and populated after launch:

- `zones` — defined by admin
- `rates` — defined by admin
- `packages` — defined by admin
- `stations` — provisioned by agent software
- `sessions` — generated at runtime (PC Timer)
- `station_logs` — generated at runtime
- `pc_transactions` — generated at runtime (PC Timer); confirmed **zero rows** from Firebase
- `schedules` — Firebase collection was empty
- `payroll_logs` — Firebase collection was empty
- `inventory_logs` — Firebase collection was empty

---

## transactions.csv Split Logic

The `transactions` Firestore collection held mixed record types. Split by `displayId` prefix:

| Filter | Count | Target |
|---|---|---|
| `displayId` starts with `TX` | ~4,935 | `order_items` |
| `displayId` starts with `EXP` OR `expenseType` is non-empty | ~810 | `expenses` |
| `displayId` empty AND `expenseType` empty | ~50 | **DISCARD** (Firestore artifacts) |
| `TXN` prefix | 0 | `pc_transactions` — confirmed empty |

---

## Key Field Transformations

### Naming
- All camelCase Firebase fields → snake_case Supabase columns
- `staffEmail` → `staff_id` (post-migration, after email-to-staff_id resolution)
- `totalGcash` → `total_digital` (shifts table)
- Firebase `type` → `products.category` ('service'/'retail')
- Firebase `category` → `products.financial_category` ('Sale'/'Expense') — **names are swapped**

### ID Resequencing
IDs are reassigned during migration using the sequential counter system.
**Counter floor: first assigned ID is `10000000`** (loop starts at 10000000, not 10000001).

| Table | Old Format | New Format | Counter Key |
|---|---|---|---|
| `shifts` | Firebase doc ID | `SH-xxxxxxxx` | `shifts` |
| `orders` | Firebase doc ID | `OR-xxxxxxxx` | `orders` |
| `expenses` | Firebase doc ID | `EX-xxxxxxxx` | `expenses` |
| `customers` | Firebase doc ID | `CU-xxxxxxxx` | `customers` |
| `invoices` | Firebase doc ID | `IV-xxxxxxxx` | `invoices` |
| `products` | Firebase doc ID | `PR-xxxxxxxx` | `products` |
| `order_items` | Firebase TX-prefixed | `OI-xxxxxxxx` | `order_items` |
| `profiles` | Firebase UID | `staff_id` auto-assigned by trigger | `profiles` |

Counter `current_value` must be updated post-migration to `max(sequential number used) + 1`.

> **Code note:** POS code currently generates TX-prefixed IDs for `order_items` via the `transactions` counter (`checkoutService.js`, `invoiceService.js`, `EndSessionDialog.jsx`, etc.). A separate code change is needed to switch these callers to the `order_items`/`OI` counter.

### JSONB Reassembly
These fields are flattened in the CSV and must be reassembled:

| Table | Column | Source Keys |
|---|---|---|
| `settings` | `drawer_hotkey` | `drawerHotkey.code`, `.altKey`, `.display` |
| `settings` | `checkout_hotkey` | `checkoutHotkey.code`, `.key`, `.display` |
| `settings` | `id_prefixes` | `idPrefixes.shifts`, `.expenses`, `.transactions`, `.payroll` |
| `settings` | `payment_methods` | `paymentMethods.cash.*`, `.charge.*`, `.card.*`, `.gcash.*`, `.maya.*`, `.banks` |
| `shifts` | `denominations` | All `denominations.*` keys (~20 variants from different naming eras) |
| `orders` | `discount` | `discount.type`, `.value`, `.amount` |
| `orders` | `payment_details` | `paymentDetails.refNumber`, `.phone`, `.bankId`, `.bankName` |
| `payroll_runs` | `totals` | `totals.staffCount`, `.minutes`, `.gross`, `.advances`, `.shortages`, `.otherDeductions`, `.net`, `.additions` |
| `paystubs` | `paystub_data` | All remaining fields: `periodStart`, `periodEnd`, `payDate`, `shifts`, `deductionItems`, `additionItems`, `totalHours`, `grossPay`, `totalDeductions`, `totalAdditions`, `netPay`, `createdBy` |
| `order_items` | `metadata` | `note`, `parentServiceId`, `variantGroup`, `variantLabel`, `paymentDetails.*`, `consumables` |
| `expenses` | `metadata` | `payrollRunId`, `source`, extras |

### Staff ID Resolution (Post-Migration)
These columns store `staffEmail` from Firebase and must be resolved to `profiles.staff_id` (`ST-xxxxxxxx`) after all profiles are imported.
**Important:** the FK target is `profiles.staff_id` (the sequential `ST-xxxxxxxx` column), NOT `profiles.id` (the UUID).

- `shifts.staff_id`
- `app_status.staff_id`
- `orders.staff_id`, `deleted_by`
- `order_items.staff_id`
- `expenses.staff_id`
- `invoices.staff_id`

Payroll tables (`payroll_runs`, `payroll_line_items`, `paystubs`) are NOT imported — no staff_id resolution needed for them.

---

## Table-by-Table Notes

### `profiles` ← `users.csv`
- `id` maps to Firebase UID which must match `auth.users.id` — auth accounts must be created first
- `staff_id` is auto-assigned by the `trg_profile_staff_id` trigger on insert
- `payroll_config` assembled from `payroll.defaultRate` + `payroll.rateHistory`
- `biometric_id` and `biometric_registered_at` are kept
- Discard: `deleted`

### `counters` ← Schema seeds only
- Firebase `counters.csv` is ignored entirely
- Seeds are the floor; migration script sets `current_value` to max used + 1 per counter

### `customers` ← `customers.csv`
- `phone`, `address`, `email`, `tin` are **not in the export** — will be NULL
- `lifetime_value`, `outstanding_balance`, `total_orders` are **computed post-migration**
- Discard: `createdBy`

### `settings` ← `settings.csv`
- `id` is `'config'` (singleton row)
- `drawer_signal_type` is not in the export — default `'usb'`
- All hotkey and payment method fields need reassembly from flattened CSV columns

### `shifts` ← `shifts.csv`
- `cash_difference` is not in the export — keep NULL, backfill post-migration
- `total_digital` comes from Firebase field `totalGcash` (renamed)
- `denominations` CSV has ~20 key variants across naming eras — normalize into one object
- Discard: `payrollRunId`, `endedBy`, `status`

### `payroll_runs`, `payroll_line_items`, `paystubs`
- **NOT IMPORTED** — all payroll tables start blank.
- Payroll will start fresh after go-live; historical payroll data is not migrated.
- The `payroll_runs` counter is reset to floor (`10000000`) in sync-counters.sql.

### `products` ← `services.csv`
- Firebase `type` → schema `category` ('service'/'retail')
- Firebase `category` → schema `financial_category` ('Sale'/'Expense')
- The field names are **swapped** between Firebase and schema
- `consumables` not in export — default `[]`
- `created_at` / `updated_at` use Firebase `lastUpdated` as best available proxy
- IDs resequenced to `PR-xxxxxxxx` in post-import.sql
- FK updates during resequence: `products.parent_service_id` (self-FK) + `order_items.product_id`

### `orders` ← `orders.csv`
- `customer_name`, `customer_address`, `customer_tin` — **NOT imported** (use `customer_id` FK)
- `customer_phone` and `staff_name` — imported as-is
- `staff_id` source: use Firebase `staffId` if set, otherwise fall back to `staffEmail`
- Discard: `editReason`, `editedBy`, `isEdited`, `lastUpdatedAt`, `deleteReason`, `deletedAt`, `staffEmail`

### `order_items` ← `transactions.csv` (TX prefix)
- `parent_order_id` requires resolving `orderNumber` → `orders.id`
- `product_id` from Firebase `serviceId` — soft ref; updated to `PR-xxxxxxxx` when products are resequenced
- `cost_price` from Firebase `costPrice` or `unitCost` (whichever is present)
- Extra fields packed into `metadata`: `note`, `parentServiceId`, `variantGroup`, `variantLabel`, `paymentDetails.*`, `consumables`
- IDs resequenced from `TX-xxxxxxxx` → `OI-xxxxxxxx` in post-import.sql (no FK dependents)

### `expenses` ← `transactions.csv` (EXP prefix + legacy)
- Legacy rows (no EXP prefix): include if `expenseType` is non-empty
- ~50 rows with empty `displayId` AND empty `expenseType` → discard (Firestore artifacts)
- `staff_id` source: Firebase `expenseStaffEmail` preferred, fall back to `staffEmail`
- `category` — valid values are **`OPEX`** and **`CAPEX`**. Import as-is from Firebase `category` field; verify post-import that all values match.
- `item` column — imported (schema has `NOT NULL`); **will be dropped post-migration**: `ALTER TABLE expenses DROP COLUMN item;`
- Extra fields packed into `metadata`: `payrollRunId`, `source`

### `invoices` ← `invoices.csv`
- `order_id` removed — invoices are not directly tied to orders
- `order_number` removed
- `customer_name`, `customerEmail`, `customerPhone` discarded — use `customer_id` FK
- `invoice_number` — imported; **will be dropped post-migration**: `ALTER TABLE invoices DROP COLUMN invoice_number;`
- All 12 rows import cleanly

### `schedules`
- Firebase collection was empty — nothing to import
- Schema has `staff_uid` removed; only `staff_id` (→ `profiles.staff_id`) is kept

### `sessions`
- Runtime-generated by PC Timer — not imported
- Schema removes `station_name` (derive via `station_id` FK) and `customer_name` (derive via `customer_id` FK)

### `drawer_logs`
- Table structure kept in schema for new data
- All 7,061 Firebase rows are **discarded** — not imported

---

## Post-Migration Checklist

1. Import auth users to `auth.users` first (required for `profiles.id` FK)
2. Import all tables in dependency order (see DROP order in schema as reverse guide)
3. Resequence IDs: customers, shifts, orders, invoices, expenses, products, order_items
4. Resolve `staffEmail` → `profiles.staff_id` (ST-xxxxxxxx) across all affected tables
5. Update counter `current_value` for each counter to `max(used value) + 1`
6. Compute and backfill `customers.lifetime_value`, `outstanding_balance`, `total_orders`
7. Backfill `shifts.cash_difference`
8. Drop legacy columns:
   - `ALTER TABLE expenses DROP COLUMN item;`
   - `ALTER TABLE invoices DROP COLUMN invoice_number;`
9. Verify `expenses.category` values are all `OPEX` or `CAPEX`
10. Code change (separate task): update POS callers from `transactions`/`TX` to `order_items`/`OI` counter
