# Firebase Migration Inventory (Exhaustive)

This document lists ALL identified Firebase collections, subcollections, and storage buckets based on `firestore.rules` and codebase audit.

## 1. Core Data Collections

| Collection | Description | Migration Strategy |
| :--- | :--- | :--- |
| `users` | Staff & Admin accounts | Supabase Auth + `profiles` table |
| `settings` | Config (`settings/config`) | `settings` table (JSONB or rows) |
| `app_status` | Current state (`app_status/current_shift`) | `app_status` table |
| `counters` | Sequential ID counters | Postgres Sequences |
| `stats_daily` | Aggregated analytics data | `daily_stats` table |

## 2. Sales & POS

| Collection | Description | Migration Strategy |
| :--- | :--- | :--- |
| `services` | Product/Service Catalog | `products` table |
| `orders` | POS Orders | `orders` table |
| `transactions` | Financial events (Sales/Expenses) | `transactions` table |
| `transactions/{id}/editHistory` | Audit trail for transactions | `transaction_history` table |
| `invoices` | Accounts Receivable (Charge to Account) | `invoices` table |
| `drawer_logs` | Cash drawer activity audit | `drawer_logs` table |
| `inventory_logs` | Stock adjustment audit | `inventory_logs` table |
| `customers` | CRM / Member data | `customers` table |

## 3. Operations & Payroll

| Collection | Description | Migration Strategy |
| :--- | :--- | :--- |
| `shifts` | Staff shift records | `shifts` table |
| `payroll_logs` | Time clock (In/Out) | `time_clock_logs` table |
| `schedules` | Staff rosters | `schedules` table |
| `shiftTemplates` | Pre-defined shift windows | `shift_templates` table |
| `payPeriods` | Defined payroll periods | `pay_periods` table |
| `paySchedules` | Frequency/Rules for pay | `pay_schedules` table |
| `payrollRuns` | Processed payroll batches | `payroll_runs` table |
| `payrollRuns/{id}/lines` | Per-staff line items | `payroll_line_items` table |
| `payrollRuns/{id}/lines/{id}/shifts` | Linked shifts for a line item | `payroll_line_shifts` (junction) |
| `payrollRuns/{id}/paystubs` | Generated paystub metadata | `paystubs` table |
| `expenses` | Legacy expense records | Merge into `transactions` or archive |

## 4. PC Timer (Kunek Agent)

| Collection | Description | Migration Strategy |
| :--- | :--- | :--- |
| `zones` | PC Areas (VIP, Regular, etc.) | `zones` table |
| `rates` | Pricing models | `rates` table |
| `packages` | Time-based bundles | `packages` table |
| `stations` | Physical PC units state | `stations` table (Realtime) |
| `sessions` | Active/Past PC sessions | `sessions` table (Realtime) |
| `station_logs` | PC usage audit trail | `station_logs` table |

## 5. Storage (Firebase Storage)

| Path | Description | Migration Strategy |
| :--- | :--- | :--- |
| `logos/` | Store branding images | Supabase Storage `branding` bucket |
| `qrcodes/` | Payment method QR codes | Supabase Storage `payments` bucket |
