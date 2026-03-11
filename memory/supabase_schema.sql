-- PrintPlay Supabase Schema (v2.1) - COMPREHENSIVE
-- Handles all 21 collections from Firestore
-- Last updated: 2026-03-11 — reflects Phase 2 ALTER columns and code-derived fields
-- NOTE: To get the live schema from Supabase:
--   Option A (CLI): supabase db dump --schema public > live_schema.sql
--   Option B (SQL Editor): SELECT table_name, column_name, data_type, column_default
--                          FROM information_schema.columns WHERE table_schema = 'public'
--                          ORDER BY table_name, ordinal_position;

-- 1. DROP EXISTING TABLES
-- Group E: Payroll
DROP TABLE IF EXISTS paystubs CASCADE;
DROP TABLE IF EXISTS payroll_line_items CASCADE;
DROP TABLE IF EXISTS payroll_runs CASCADE;
DROP TABLE IF EXISTS payroll_logs CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS shift_templates CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;

-- Group D: PC Timer
DROP TABLE IF EXISTS station_logs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS rates CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

-- Group C: Core Data
DROP TABLE IF EXISTS daily_stats CASCADE;
DROP TABLE IF EXISTS app_status CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- Group B: Customers
DROP TABLE IF EXISTS customers CASCADE;

-- Group A: Identity
DROP TABLE IF EXISTS profiles CASCADE;

-- Group: Financials & Sales
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS drawer_logs CASCADE;
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS pc_transactions CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 2. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'owner', 'staff');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. CORE TABLES

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role DEFAULT 'staff',
    pin_code TEXT,
    biometric_id TEXT,
    biometric_registered_at TEXT,
    is_clocked_in BOOLEAN DEFAULT FALSE,
    suspended BOOLEAN DEFAULT FALSE,
    requires_password_reset BOOLEAN DEFAULT FALSE,
    payroll_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customers (
    id TEXT PRIMARY KEY, 
    full_name TEXT NOT NULL,
    username TEXT,
    phone TEXT,
    address TEXT,
    lifetime_value DECIMAL(12, 2) DEFAULT 0,
    outstanding_balance DECIMAL(12, 2) DEFAULT 0,
    total_orders INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    store_name TEXT,
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    mobile TEXT,
    email TEXT,
    tin TEXT,
    currency_symbol TEXT DEFAULT '₱',
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    receipt_footer TEXT,
    show_tax_breakdown BOOLEAN DEFAULT FALSE,
    drawer_hotkey JSONB DEFAULT '{}',
    checkout_hotkey JSONB DEFAULT '{}',
    id_prefixes JSONB DEFAULT '{}',
    shift_duration_hours INT DEFAULT 12,
    shift_alert_minutes INT DEFAULT 30,
    schedule_posting_frequency TEXT DEFAULT 'weekly',
    pc_rental_enabled BOOLEAN DEFAULT FALSE,
    pc_rental_mode TEXT DEFAULT 'prepaid',
    pc_rental_service_id TEXT,
    invoice_due_days INT DEFAULT 30,
    payment_methods JSONB DEFAULT '{}',
    drawer_signal_type TEXT DEFAULT 'usb'
);

CREATE TABLE app_status (
    id TEXT PRIMARY KEY,
    active_shift_id TEXT,
    staff_email TEXT
);

CREATE TABLE daily_stats (
    date TEXT PRIMARY KEY,
    sales DECIMAL(12, 2) DEFAULT 0,
    expenses DECIMAL(12, 2) DEFAULT 0,
    tx_count INT DEFAULT 0,
    breakdown JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HR, ROSTER, & PAYROLL

CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    display_id TEXT,                          -- Phase 2 ALTER: human-readable shift ID
    staff_email TEXT NOT NULL,
    shift_period TEXT,
    notes TEXT,
    schedule_id TEXT,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    system_total DECIMAL(12, 2) DEFAULT 0,
    pc_rental_total DECIMAL(12, 2) DEFAULT 0,
    services_total DECIMAL(12, 2) DEFAULT 0,
    expenses_total DECIMAL(12, 2) DEFAULT 0,
    total_ar DECIMAL(12, 2) DEFAULT 0,
    total_cash DECIMAL(12, 2) DEFAULT 0,
    total_gcash DECIMAL(12, 2) DEFAULT 0,
    ar_payments_total DECIMAL(12, 2) DEFAULT 0,
    denominations JSONB DEFAULT '{}',
    last_consolidated_at TIMESTAMPTZ
);

CREATE TABLE shift_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_logs (
    id TEXT PRIMARY KEY,
    staff_id TEXT,
    staff_uid TEXT,
    staff_email TEXT,
    staff_name TEXT,
    shift_id TEXT,
    type TEXT,
    action TEXT,
    method TEXT,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_runs (
    id TEXT PRIMARY KEY,
    display_id TEXT UNIQUE,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    pay_date TIMESTAMPTZ,
    status TEXT DEFAULT 'draft',
    expense_mode TEXT,
    totals JSONB DEFAULT '{}',
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_line_items (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES payroll_runs(id) ON DELETE CASCADE,
    staff_id TEXT,
    staff_name TEXT,
    staff_email TEXT,
    role TEXT,
    base_pay DECIMAL(12, 2) DEFAULT 0,
    regular_hours DECIMAL(8, 2) DEFAULT 0,
    overtime_hours DECIMAL(8, 2) DEFAULT 0,
    total_pay DECIMAL(12, 2) DEFAULT 0,
    deductions JSONB DEFAULT '[]',
    additions JSONB DEFAULT '[]',
    shifts JSONB DEFAULT '[]',
    status TEXT DEFAULT 'pending'
);

CREATE TABLE paystubs (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES payroll_runs(id) ON DELETE CASCADE,
    staff_id TEXT,
    staff_email TEXT,
    paystub_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PC TIMER (KUNEK)

CREATE TABLE zones (
    id TEXT PRIMARY KEY, 
    name TEXT NOT NULL,
    color TEXT,
    sort_order INT DEFAULT 0,
    rate_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    rate_per_minute DECIMAL(12, 2) DEFAULT 0,
    minimum_minutes INT DEFAULT 0,
    rounding_policy TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    schedules JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    minutes INT NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    bonus_minutes INT DEFAULT 0,
    valid_days INT DEFAULT 0,
    rate_id TEXT REFERENCES rates(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stations (
    id TEXT PRIMARY KEY, 
    name TEXT NOT NULL,
    label TEXT,
    zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
    rate_id TEXT REFERENCES rates(id) ON DELETE SET NULL,
    mac_address TEXT,
    ip_address TEXT,
    specs JSONB DEFAULT '{}',
    agent_version TEXT,
    tamper_alert BOOLEAN DEFAULT FALSE,
    agent_email TEXT,
    agent_uid TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'available',
    current_session_id TEXT,
    command JSONB DEFAULT '{}',
    last_ping TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY, 
    station_id TEXT REFERENCES stations(id) ON DELETE CASCADE,
    station_name TEXT,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    type TEXT,
    rate_id TEXT,
    rate_snapshot JSONB DEFAULT '{}',
    package_id TEXT,
    package_snapshot JSONB DEFAULT '{}',
    minutes_allotted INT DEFAULT 0,
    minutes_used INT DEFAULT 0,
    minutes_paused INT DEFAULT 0,
    rate_per_minute_applied DECIMAL(12, 2),
    amount_charged DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,
    discount JSONB DEFAULT '{}',
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    discount_reason TEXT,
    payment_method TEXT,
    payment_details JSONB,
    staff_id TEXT,
    shift_id TEXT REFERENCES shifts(id),
    open_ended BOOLEAN DEFAULT FALSE,
    estimated_limit TIMESTAMPTZ,
    notes TEXT,
    status TEXT DEFAULT 'completed',
    paused_at TIMESTAMPTZ,
    resumed_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE station_logs (
    id TEXT PRIMARY KEY,
    station_id TEXT REFERENCES stations(id) ON DELETE CASCADE,
    session_id TEXT,
    event TEXT NOT NULL,
    severity TEXT,
    staff_id TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    staff_uid TEXT,
    staff_email TEXT NOT NULL,
    staff_name TEXT,
    date TEXT NOT NULL,
    shift_label TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    shift_id TEXT REFERENCES shifts(id),      -- Phase 2 ALTER: links schedule to actual shift
    covered_by_uid TEXT,
    covered_by_email TEXT,
    covered_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POS & INVENTORY

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,           -- 'service' | 'retail' (was Firestore 'type')
    financial_category TEXT, -- 'Sale' | 'Expense' (was Firestore 'category')
    parent_service_id TEXT,
    price DECIMAL(12, 2) DEFAULT 0,
    cost_price DECIMAL(12, 2) DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    admin_only BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    track_stock BOOLEAN DEFAULT FALSE,
    stock_count INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    -- Phase 2 ALTER: POS/variant columns
    has_variants BOOLEAN DEFAULT FALSE,
    pos_icon TEXT,
    price_type TEXT DEFAULT 'fixed',          -- 'fixed' | 'variable'
    pricing_note TEXT,
    consumables JSONB DEFAULT '[]',           -- [{ itemId, qty }]
    variant_group TEXT,
    pos_label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_tin TEXT,
    staff_id TEXT,
    staff_email TEXT,
    staff_name TEXT,
    shift_id TEXT REFERENCES shifts(id),
    subtotal DECIMAL(12, 2) NOT NULL,
    discount JSONB DEFAULT '{}',              -- { type, value, amount }
    total DECIMAL(12, 2) NOT NULL,
    amount_tendered DECIMAL(12, 2) DEFAULT 0,
    change DECIMAL(12, 2) DEFAULT 0,
    payment_method TEXT,
    payment_details JSONB DEFAULT '{}',
    invoice_status TEXT,
    status TEXT DEFAULT 'completed',
    items JSONB DEFAULT '[]',                 -- denormalized snapshot for receipts
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE order_items (
    id TEXT PRIMARY KEY, -- TX-prefixed display ID
    parent_order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    name TEXT,
    price DECIMAL(12, 2) DEFAULT 0,
    cost_price DECIMAL(12, 2) DEFAULT 0,
    amount DECIMAL(12, 2) NOT NULL,
    quantity INT DEFAULT 1,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    added_by_admin BOOLEAN DEFAULT FALSE,
    staff_email TEXT,
    shift_id TEXT REFERENCES shifts(id),
    financial_category TEXT,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    category TEXT,
    payment_method TEXT,
    invoice_status TEXT,
    reconciliation_status TEXT DEFAULT 'Verified',
    metadata JSONB DEFAULT '{}',              -- { note, parentServiceId, variantGroup, variantLabel, paymentDetails, consumables }
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE pc_transactions (
    id TEXT PRIMARY KEY, -- Use Firestore ID to avoid collisions
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    type TEXT NOT NULL,      
    category TEXT,           
    payment_method TEXT DEFAULT 'Cash',
    amount DECIMAL(12, 2) NOT NULL,
    staff_email TEXT,
    shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    financial_category TEXT,
    reconciliation_status TEXT DEFAULT 'Verified',
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    category TEXT,
    expense_type TEXT,
    item TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    quantity INT DEFAULT 1,
    staff_email TEXT,
    shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    financial_category TEXT,
    notes TEXT,                               -- Phase 2 ALTER: staff name / reason appended here
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    order_id TEXT,
    order_number TEXT,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_tin TEXT,
    items JSONB DEFAULT '[]',
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,
    balance DECIMAL(12, 2) DEFAULT 0,
    payments JSONB DEFAULT '[]',
    status TEXT DEFAULT 'UNPAID',
    due_date TIMESTAMPTZ,
    notes TEXT,
    shift_id TEXT REFERENCES shifts(id),
    staff_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_logs (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    item_name TEXT,
    qty_change INT NOT NULL,
    type TEXT,       -- 'Restock' | 'Sale' | 'Adjustment' | 'Damage' | 'Loss' | 'Correction'
    reason TEXT,
    cost DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    staff_email TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE drawer_logs (
    id TEXT PRIMARY KEY,
    staff_email TEXT,
    trigger_type TEXT,
    signal_type TEXT,
    success BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    device TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 7. FUNCTIONS

-- Atomic stock decrement — avoids read-then-write race condition in concurrent checkouts.
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id TEXT, p_qty INT)
RETURNS VOID AS $$
    UPDATE products SET stock_count = stock_count - p_qty WHERE id = p_product_id;
$$ LANGUAGE SQL;

-- 8. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_order_items_order_num ON order_items(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_customer_id ON pc_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_shift_id ON pc_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_sessions_station_id ON sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_order_items_timestamp ON order_items(timestamp);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_timestamp ON pc_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_payroll_logs_staff_id ON payroll_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_run_id ON payroll_line_items(run_id);
CREATE INDEX IF NOT EXISTS idx_station_logs_station_id ON station_logs(station_id);
