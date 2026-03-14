-- scripts/sync-counters.sql
-- Phase 5: Set counter current_value to max sequential number in use + 1.
-- Run AFTER post-import.sql (IDs must be resequenced first).
-- This prevents new records from colliding with migrated data.

-- =============================================================================
-- Show current state before update
-- =============================================================================
SELECT id, current_value, prefix FROM counters ORDER BY id;

-- =============================================================================
-- Update each counter to max(used sequential number) + 1
-- COALESCE(max, 10000000) means: if no rows exist, start from 10000001
-- =============================================================================

-- shifts  (SH-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM shifts WHERE id LIKE 'SH-%'
),  updated_at = NOW()
WHERE id = 'shifts';

-- orders  (OR-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM orders WHERE id LIKE 'OR-%'
),  updated_at = NOW()
WHERE id = 'orders';

-- expenses  (EX-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM expenses WHERE id LIKE 'EX-%'
),  updated_at = NOW()
WHERE id = 'expenses';

-- customers  (CU-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM customers WHERE id LIKE 'CU-%'
),  updated_at = NOW()
WHERE id = 'customers';

-- invoices  (IV-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM invoices WHERE id LIKE 'IV-%'
),  updated_at = NOW()
WHERE id = 'invoices';

-- products  (PR-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM products WHERE id LIKE 'PR-%'
),  updated_at = NOW()
WHERE id = 'products';

-- order_items  (OI-xxxxxxxx)
-- NOTE: migrated rows are now OI-prefixed. The 'transactions' counter (TX-) is
-- kept for backward compatibility with POS code that still calls generateBatchIds("transactions","TX").
-- A future code change should migrate callers to "order_items"/"OI".
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM order_items WHERE id LIKE 'OI-%'
),  updated_at = NOW()
WHERE id = 'order_items';

-- transactions counter (TX-) — keep for POS code that still generates TX-prefixed IDs.
-- Sync from original TX-prefixed rows that may remain before full code migration.
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM order_items WHERE id LIKE 'TX-%'
),  updated_at = NOW()
WHERE id = 'transactions';

-- profiles  (ST-xxxxxxxx)
UPDATE counters
SET current_value = (
    SELECT COALESCE(MAX(CAST(SPLIT_PART(staff_id, '-', 2) AS BIGINT)), 10000000) + 1
    FROM profiles WHERE staff_id LIKE 'ST-%'
),  updated_at = NOW()
WHERE id = 'profiles';

-- payroll_runs  (PY-xxxxxxxx) — table is empty post-migration; reset to floor.
-- Keeps counter ready for new payroll runs created at runtime.
UPDATE counters
SET current_value = 10000000,
    updated_at = NOW()
WHERE id = 'payroll_runs';

-- =============================================================================
-- VERIFY — current_value should be above max imported sequential number
-- =============================================================================
SELECT
    c.id,
    c.current_value,
    c.prefix,
    CASE c.id
        WHEN 'shifts'        THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM shifts        WHERE id LIKE 'SH-%')
        WHEN 'orders'        THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM orders        WHERE id LIKE 'OR-%')
        WHEN 'expenses'      THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM expenses      WHERE id LIKE 'EX-%')
        WHEN 'customers'     THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM customers     WHERE id LIKE 'CU-%')
        WHEN 'invoices'      THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM invoices      WHERE id LIKE 'IV-%')
        WHEN 'products'      THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM products      WHERE id LIKE 'PR-%')
        WHEN 'order_items'   THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM order_items   WHERE id LIKE 'OI-%')
        WHEN 'transactions'  THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM order_items   WHERE id LIKE 'TX-%')
        WHEN 'profiles'      THEN (SELECT MAX(CAST(SPLIT_PART(staff_id, '-', 2) AS BIGINT)) FROM profiles WHERE staff_id LIKE 'ST-%')
        ELSE NULL
    END AS max_used,
    CASE
        WHEN c.current_value > COALESCE(
            CASE c.id
                WHEN 'shifts'       THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM shifts WHERE id LIKE 'SH-%')
                WHEN 'orders'       THEN (SELECT MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)) FROM orders WHERE id LIKE 'OR-%')
                ELSE 10000000
            END, 0)
        THEN 'OK'
        ELSE 'NEEDS REVIEW'
    END AS status
FROM counters c
ORDER BY id;
