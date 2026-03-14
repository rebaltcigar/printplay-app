-- scripts/post-import.sql
-- Phase 3: Resequence IDs and update all FK references.
-- Run in dev Supabase SQL Editor AFTER import-from-csv.mjs completes.
--
-- Tables resequenced:
--   customers    → CU-xxxxxxxx
--   shifts       → SH-xxxxxxxx  (FK: orders, order_items, expenses, invoices, app_status)
--   orders       → OR-xxxxxxxx  (FK: order_items.parent_order_id)
--   invoices     → IV-xxxxxxxx
--   expenses     → EX-xxxxxxxx
--   products     → PR-xxxxxxxx  (FK: products.parent_service_id, order_items.product_id)
--   order_items  → OI-xxxxxxxx  (no external FK dependents)
--
-- Counter floor: first assigned ID is 10000000.
--
-- Strategy: session_replication_role = 'replica' bypasses FK constraint checks
-- for the duration of this session, letting us update PKs and FKs freely.

SET session_replication_role = 'replica';

-- =============================================================================
-- 1. CUSTOMERS → CU-xxxxxxxx
--    Referenced by: orders.customer_id, order_items.customer_id,
--                   invoices.customer_id, sessions.customer_id
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM customers ORDER BY created_at ASC NULLS LAST, id ASC LOOP
        new_id := 'CU-' || LPAD(counter::TEXT, 8, '0');

        UPDATE order_items  SET customer_id = new_id WHERE customer_id = r.id;
        UPDATE orders       SET customer_id = new_id WHERE customer_id = r.id;
        UPDATE invoices     SET customer_id = new_id WHERE customer_id = r.id;
        UPDATE sessions     SET customer_id = new_id WHERE customer_id = r.id;
        UPDATE customers    SET id          = new_id WHERE id          = r.id;

        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'customers resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 2. SHIFTS → SH-xxxxxxxx
--    Referenced by: orders.shift_id, order_items.shift_id, expenses.shift_id,
--                   invoices.shift_id, app_status.active_shift_id,
--                   sessions.shift_id, schedules.shift_id
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM shifts ORDER BY start_time ASC NULLS LAST, id ASC LOOP
        new_id := 'SH-' || LPAD(counter::TEXT, 8, '0');

        UPDATE orders       SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE order_items  SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE expenses     SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE invoices     SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE app_status   SET active_shift_id   = new_id WHERE active_shift_id   = r.id;
        UPDATE sessions     SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE schedules    SET shift_id          = new_id WHERE shift_id          = r.id;
        UPDATE shifts       SET id               = new_id WHERE id               = r.id;

        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'shifts resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 3. ORDERS → OR-xxxxxxxx
--    Referenced by: order_items.parent_order_id
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM orders ORDER BY timestamp ASC NULLS LAST, id ASC LOOP
        new_id := 'OR-' || LPAD(counter::TEXT, 8, '0');

        UPDATE order_items SET parent_order_id = new_id WHERE parent_order_id = r.id;
        UPDATE orders      SET id             = new_id WHERE id             = r.id;

        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'orders resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 4. INVOICES → IV-xxxxxxxx
--    No external FK dependents.
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM invoices ORDER BY created_at ASC NULLS LAST, id ASC LOOP
        new_id := 'IV-' || LPAD(counter::TEXT, 8, '0');
        UPDATE invoices SET id = new_id WHERE id = r.id;
        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'invoices resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 5. EXPENSES → EX-xxxxxxxx
--    No external FK dependents.
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM expenses ORDER BY timestamp ASC NULLS LAST, id ASC LOOP
        new_id := 'EX-' || LPAD(counter::TEXT, 8, '0');
        UPDATE expenses SET id = new_id WHERE id = r.id;
        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'expenses resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 6. PRODUCTS → PR-xxxxxxxx
--    Referenced by: products.parent_service_id (self-FK), order_items.product_id
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    -- Sort by parent_service_id ASC NULLS FIRST so parents get IDs before children,
    -- then by id ASC as tiebreaker. This lets us update parent_service_id correctly.
    FOR r IN SELECT id FROM products ORDER BY parent_service_id ASC NULLS FIRST, id ASC LOOP
        new_id := 'PR-' || LPAD(counter::TEXT, 8, '0');

        -- Update child rows that reference this product as their parent
        UPDATE products     SET parent_service_id = new_id WHERE parent_service_id = r.id;
        -- Update order_items FK
        UPDATE order_items  SET product_id        = new_id WHERE product_id        = r.id;
        -- Update the product itself
        UPDATE products     SET id               = new_id WHERE id               = r.id;

        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'products resequenced: % rows', counter - 10000000;
END $$;

-- =============================================================================
-- 7. ORDER_ITEMS → OI-xxxxxxxx
--    No external FK dependents.
-- =============================================================================
DO $$
DECLARE
    r       RECORD;
    new_id  TEXT;
    counter BIGINT := 10000000;
BEGIN
    FOR r IN SELECT id FROM order_items ORDER BY timestamp ASC NULLS LAST, id ASC LOOP
        new_id := 'OI-' || LPAD(counter::TEXT, 8, '0');
        UPDATE order_items SET id = new_id WHERE id = r.id;
        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'order_items resequenced: % rows', counter - 10000000;
END $$;

-- Restore FK enforcement
SET session_replication_role = 'origin';

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT 'customers'   AS tbl, COUNT(*) FILTER (WHERE id LIKE 'CU-%') AS ok, COUNT(*) FILTER (WHERE id NOT LIKE 'CU-%') AS bad FROM customers
UNION ALL
SELECT 'shifts',     COUNT(*) FILTER (WHERE id LIKE 'SH-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'SH-%') FROM shifts
UNION ALL
SELECT 'orders',     COUNT(*) FILTER (WHERE id LIKE 'OR-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'OR-%') FROM orders
UNION ALL
SELECT 'invoices',   COUNT(*) FILTER (WHERE id LIKE 'IV-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'IV-%') FROM invoices
UNION ALL
SELECT 'expenses',   COUNT(*) FILTER (WHERE id LIKE 'EX-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'EX-%') FROM expenses
UNION ALL
SELECT 'products',   COUNT(*) FILTER (WHERE id LIKE 'PR-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'PR-%') FROM products
UNION ALL
SELECT 'order_items',COUNT(*) FILTER (WHERE id LIKE 'OI-%'), COUNT(*) FILTER (WHERE id NOT LIKE 'OI-%') FROM order_items;
