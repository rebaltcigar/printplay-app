-- ALTER script to add missing columns from Firestore schema that were omitted in v2.0
-- Run this in your Supabase SQL Editor

-- 1. Updates to shifts
ALTER TABLE shifts 
ADD COLUMN IF NOT EXISTS services_total DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_ar DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cash DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_gcash DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ar_payments_total DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS denominations JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_consolidated_at TIMESTAMPTZ;

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

-- 4. RLS policies for tables missing write access
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

-- 5. Realtime publication — run once per database
-- Enables postgres_changes events for all tables the app subscribes to.
-- Safe to run on existing DBs; ADD TABLE is idempotent if table is already in the publication.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE pc_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE app_status;
ALTER PUBLICATION supabase_realtime ADD TABLE payroll_runs;
