-- SQL Migration: Add biometric columns to profiles and ensure settings config exists

-- 1. Add biometric columns to profiles if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='biometric_id') THEN
        ALTER TABLE profiles ADD COLUMN biometric_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='biometric_registered_at') THEN
        ALTER TABLE profiles ADD COLUMN biometric_registered_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Ensure total_cash and total_digital exist in shifts (based on schema)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shifts' AND column_name='total_cash') THEN
        ALTER TABLE shifts ADD COLUMN total_cash DECIMAL(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shifts' AND column_name='total_digital') THEN
        ALTER TABLE shifts ADD COLUMN total_digital DECIMAL(12, 2) DEFAULT 0;
    END IF;
END $$;

-- 3. Ensure a 'config' row exists in settings table. 
-- If 'main' exists (from old schema), rename it to 'config'.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM settings WHERE id = 'main') AND NOT EXISTS (SELECT 1 FROM settings WHERE id = 'config') THEN
        UPDATE settings SET id = 'config' WHERE id = 'main';
    ELSIF NOT EXISTS (SELECT 1 FROM settings WHERE id = 'config') THEN
        INSERT INTO settings (id, store_name, logo_url, currency_symbol, tax_rate, receipt_footer)
        VALUES ('config', 'Kunek', '', '₱', 0, 'Thank you for your business!');
    END IF;
END $$;
