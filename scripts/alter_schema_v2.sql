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
