-- ALTER script to add missing columns from Firestore schema that were omitted in v2.0
-- Run this in your Supabase SQL Editor

-- 1. Updates to shifts
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS services_total DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_ar DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cash DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_digital DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ar_payments_total DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS denominations JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_consolidated_at TIMESTAMPTZ;

-- Rename total_gcash → total_digital (safe: only runs if old column still exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shifts' AND column_name = 'total_gcash') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shifts' AND column_name = 'total_digital') THEN
      ALTER TABLE shifts RENAME COLUMN total_gcash TO total_digital;
    ELSE
      -- Both exist: migrate data then drop legacy column
      UPDATE shifts SET total_digital = COALESCE(total_digital, 0) + COALESCE(total_gcash, 0) WHERE total_gcash > 0;
      ALTER TABLE shifts DROP COLUMN total_gcash;
    END IF;
  END IF;
END $$;

-- 2. Updates to order_items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id),
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS invoice_status TEXT,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS added_by_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'Verified';

-- 3. Updates to pc_transactions
ALTER TABLE pc_transactions
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash',
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'Verified';

-- 4. Updates to expenses (staff_id replaces staff_email in post-migration code)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS staff_id TEXT;

-- 5. Updates to customers (columns used by CustomerForm)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS tin TEXT;

-- 5. RLS policies for tables missing write access
-- shift_templates: allow authenticated users to read/write (admin-managed config table)
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_templates_select" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_insert" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_update" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_delete" ON shift_templates;
CREATE POLICY "shift_templates_select" ON shift_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_templates_insert" ON shift_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shift_templates_update" ON shift_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "shift_templates_delete" ON shift_templates FOR DELETE TO authenticated USING (true);

-- schedules: allow authenticated users to read/write
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (true);

-- 5. Updates to app_status
ALTER TABLE app_status
ADD COLUMN IF NOT EXISTS staff_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Drop staff_id FK constraints so sequential_id or UUID can be stored freely
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;
ALTER TABLE app_status DROP CONSTRAINT IF EXISTS app_status_staff_id_fkey;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_staff_id_fkey;

-- Auto-assign sequential_id to new profiles (fixes FK violations for accounts created post-migration)
CREATE OR REPLACE FUNCTION assign_profile_sequential_id()
RETURNS TRIGGER AS $$
DECLARE v_new_id TEXT;
BEGIN
  IF NEW.sequential_id IS NULL OR NEW.sequential_id = '' THEN
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_new_id
    FROM get_next_sequence_batch('profiles', 1);
    NEW.sequential_id := v_new_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_sequential_id ON profiles;
CREATE TRIGGER trg_profile_sequential_id
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION assign_profile_sequential_id();

-- Backfill any existing profiles still missing sequential_id
DO $$
DECLARE r RECORD; v_new_id TEXT;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE sequential_id IS NULL OR sequential_id = '' LOOP
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_new_id
    FROM get_next_sequence_batch('profiles', 1);
    UPDATE profiles SET sequential_id = v_new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 6. Ensure counters table is accessible and RPC has correct permissions
-- RLS on counters without policies causes silent UPDATE failures (returns NULL → bad IDs)
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters_all" ON counters;
CREATE POLICY "counters_all" ON counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Recreate RPC with SECURITY DEFINER so it always bypasses RLS
DROP FUNCTION IF EXISTS get_next_sequence_batch(text, integer);
CREATE OR REPLACE FUNCTION get_next_sequence_batch(p_counter_id TEXT, p_count INT DEFAULT 1)
RETURNS TABLE (new_prefix TEXT, first_val BIGINT, current_padding INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT;
    v_current BIGINT;
    v_padding INTEGER;
BEGIN
    UPDATE counters
    SET current_value = current_value + p_count,
        updated_at = NOW()
    WHERE id = p_counter_id
    RETURNING prefix, current_value - p_count + 1, padding
    INTO v_prefix, v_current, v_padding;

    RETURN QUERY SELECT v_prefix, v_current, v_padding;
END;
$$;

-- Ensure all required sequence counters exist (safe to re-run)
-- This prevents the null-ID bug when the counters table is missing rows.
INSERT INTO counters (id, current_value, prefix, padding)
VALUES
    ('shifts',        100000000000, 'SH', 12),
    ('orders',        100000000000, 'OR', 12),
    ('transactions',  100000000000, 'TX', 12),
    ('expenses',      100000000000, 'EX', 12),
    ('customers',     100000000000, 'CU', 12),
    ('pc_transactions',100000000000,'PX', 12),
    ('invoices',      100000000000, 'IV', 12),
    ('payroll_runs',  100000000000, 'PY', 12),
    ('profiles',      100000000000, 'ST', 12)
ON CONFLICT (id) DO NOTHING;

-- Sync each counter so it is never lower than the highest existing sequential ID
-- (prevents 409 conflicts after manual inserts or partial migrations)
DO $$
DECLARE
  max_seq BIGINT; cur BIGINT;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id AS ctr_id, prefix AS ctr_prefix FROM counters
    WHERE id IN ('shifts','orders','expenses','customers','pc_transactions','invoices','payroll_runs')
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
    END IF;
  END LOOP;
END $$;

-- 7. Realtime publication — idempotent, skips tables already in the publication
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders','order_items','pc_transactions','expenses','shifts',
    'settings','profiles','products','customers','invoices',
    'app_status','payroll_runs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
