-- scripts/resolve-staff-ids.sql
-- Phase 4: Resolve raw email addresses → ST-xxxxxxxx staff_id from profiles.
-- Run AFTER post-import.sql (resequence must be done first so profiles have staff_id).
--
-- All staff_id columns were populated with raw emails during CSV import.
-- This script looks up each email in profiles.email → profiles.staff_id
-- and updates every affected table.
-- Rows where the email cannot be resolved are set to NULL.
--
-- NOTE: The FK is profiles.staff_id (ST-xxxxxxxx), NOT profiles.id (UUID).

-- =============================================================================
-- Build a quick lookup check: how many emails can be resolved?
-- =============================================================================
SELECT
    'profiles lookup' AS context,
    COUNT(DISTINCT email) AS distinct_emails,
    COUNT(DISTINCT staff_id) AS distinct_staff_ids
FROM profiles;

-- =============================================================================
-- shifts.staff_id
-- =============================================================================
UPDATE shifts s
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = s.staff_id
AND    s.staff_id LIKE '%@%';

-- Unresolvable → NULL
UPDATE shifts SET staff_id = NULL WHERE staff_id LIKE '%@%';

-- =============================================================================
-- app_status.staff_id
-- =============================================================================
UPDATE app_status a
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = a.staff_id
AND    a.staff_id LIKE '%@%';

UPDATE app_status SET staff_id = NULL WHERE staff_id LIKE '%@%';

-- =============================================================================
-- orders.staff_id  and  orders.deleted_by
-- =============================================================================
UPDATE orders o
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = o.staff_id
AND    o.staff_id LIKE '%@%';

UPDATE orders SET staff_id = NULL WHERE staff_id LIKE '%@%';

UPDATE orders o
SET    deleted_by = p.staff_id
FROM   profiles p
WHERE  p.email = o.deleted_by
AND    o.deleted_by LIKE '%@%';

UPDATE orders SET deleted_by = NULL WHERE deleted_by LIKE '%@%';

-- =============================================================================
-- order_items.staff_id
-- =============================================================================
UPDATE order_items oi
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = oi.staff_id
AND    oi.staff_id LIKE '%@%';

UPDATE order_items SET staff_id = NULL WHERE staff_id LIKE '%@%';

-- =============================================================================
-- expenses.staff_id
-- =============================================================================
UPDATE expenses e
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = e.staff_id
AND    e.staff_id LIKE '%@%';

UPDATE expenses SET staff_id = NULL WHERE staff_id LIKE '%@%';

-- =============================================================================
-- invoices.staff_id
-- =============================================================================
UPDATE invoices i
SET    staff_id = p.staff_id
FROM   profiles p
WHERE  p.email = i.staff_id
AND    i.staff_id LIKE '%@%';

UPDATE invoices SET staff_id = NULL WHERE staff_id LIKE '%@%';

-- NOTE: payroll_runs, payroll_line_items, paystubs are NOT imported — skip.

-- =============================================================================
-- VERIFY — all of these should return 0 rows
-- =============================================================================
SELECT 'shifts'              AS tbl, COUNT(*) AS remaining_emails FROM shifts             WHERE staff_id   LIKE '%@%'
UNION ALL
SELECT 'app_status',                  COUNT(*) FROM app_status          WHERE staff_id   LIKE '%@%'
UNION ALL
SELECT 'orders.staff_id',             COUNT(*) FROM orders              WHERE staff_id   LIKE '%@%'
UNION ALL
SELECT 'orders.deleted_by',           COUNT(*) FROM orders              WHERE deleted_by LIKE '%@%'
UNION ALL
SELECT 'order_items',                 COUNT(*) FROM order_items         WHERE staff_id   LIKE '%@%'
UNION ALL
SELECT 'expenses',                    COUNT(*) FROM expenses            WHERE staff_id   LIKE '%@%'
UNION ALL
SELECT 'invoices',                    COUNT(*) FROM invoices            WHERE staff_id   LIKE '%@%';
