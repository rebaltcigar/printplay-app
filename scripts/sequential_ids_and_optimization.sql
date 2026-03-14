-- Seed counter starting values and sync them above the highest existing sequential ID.
-- Run LAST in Phase 4 — after all data is migrated AND after resequence_data.sql has run.
-- resequence_data.sql assigns sequential IDs to every row and updates counters as it goes,
-- so this script's sync block is a safety net to guarantee no counter is below its table's max.

-- 1. Ensure all required counters exist with correct prefix/padding
--    ON CONFLICT only updates prefix and padding — never lowers current_value.
INSERT INTO counters (id, current_value, prefix, padding)
VALUES
    ('shifts',          10000000, 'SH', 8),
    ('orders',          10000000, 'OR', 8),
    ('transactions',    10000000, 'TX', 8),
    ('expenses',        10000000, 'EX', 8),
    ('customers',       10000000, 'CU', 8),
    ('pc_transactions', 10000000, 'PX', 8),
    ('invoices',        10000000, 'IV', 8),
    ('payroll_runs',    10000000, 'PY', 8),
    ('profiles',        10000000, 'ST', 8),
    ('sessions',        10000000, 'SN', 8)
ON CONFLICT (id) DO UPDATE SET
    prefix  = EXCLUDED.prefix,
    padding = EXCLUDED.padding;

-- 2. Sync each counter so it is never lower than the highest existing sequential ID.
--    This prevents duplicate-ID errors if any rows were inserted outside the counter flow.
DO $$
DECLARE
    max_seq BIGINT;
    cur     BIGINT;
    rec     RECORD;
BEGIN
    FOR rec IN
        SELECT id AS ctr_id, prefix AS ctr_prefix
        FROM counters
        WHERE id IN (
            'shifts', 'orders', 'expenses', 'customers',
            'pc_transactions', 'invoices', 'payroll_runs', 'sessions'
        )
    LOOP
        EXECUTE format(
            $q$SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 0)
               FROM %I
               WHERE id ~ ('^' || %L || '-[0-9]+$')$q$,
            rec.ctr_id, rec.ctr_prefix
        ) INTO max_seq;

        SELECT current_value INTO cur FROM counters WHERE id = rec.ctr_id;

        IF max_seq > cur THEN
            UPDATE counters SET current_value = max_seq WHERE id = rec.ctr_id;
            RAISE NOTICE 'Counter % synced: % → %', rec.ctr_id, cur, max_seq;
        END IF;
    END LOOP;

    -- order_items uses 'transactions' counter but table is 'order_items'
    SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS BIGINT)), 0)
    INTO max_seq
    FROM order_items
    WHERE id ~ '^TX-[0-9]+$';

    SELECT current_value INTO cur FROM counters WHERE id = 'transactions';
    IF max_seq > cur THEN
        UPDATE counters SET current_value = max_seq WHERE id = 'transactions';
        RAISE NOTICE 'Counter transactions synced: % → %', cur, max_seq;
    END IF;

    -- profiles uses sequential_id column, not id
    SELECT COALESCE(MAX(CAST(SPLIT_PART(sequential_id, '-', 2) AS BIGINT)), 0)
    INTO max_seq
    FROM profiles
    WHERE sequential_id ~ '^ST-[0-9]+$';

    SELECT current_value INTO cur FROM counters WHERE id = 'profiles';
    IF max_seq > cur THEN
        UPDATE counters SET current_value = max_seq WHERE id = 'profiles';
        RAISE NOTICE 'Counter profiles synced: % → %', cur, max_seq;
    END IF;
END $$;
