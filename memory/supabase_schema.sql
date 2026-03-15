-- PrintPlay Supabase Schema (v3.2)
-- Last updated: 2026-03-15
--
-- Changes from v3.0:
--   - invoices: removed order_id and order_number (invoices are not directly tied to orders)
--
-- Changes from v2.1:
--   - profiles: removed pin_code, is_clocked_in; renamed sequential_id → staff_id
--   - All tables: staff_email → staff_id (FK → profiles.staff_id, added post-migration)
--   - Redundant denormalized columns removed:
--       staff_name removed from schedules, payroll_logs, payroll_line_items
--       customer_name removed from order_items, pc_transactions
--       customer_name/email/phone/address/tin removed from invoices
--       staff_email removed from payroll_line_items, paystubs, orders, expenses
--   - schedules: removed covered_by_email, covered_by_name; renamed covered_by_uid → covered_by_id
--   - payroll_logs: staff_uid kept (remove post-migration)
--   - schedules: staff_uid kept (remove post-migration)
--   - drawer_logs: renamed staff_email → staff_id; table kept but data NOT imported
--   - pay_periods, pay_schedules: TBD (Firebase collections appear empty)
--
-- NOTE: staff_id FK constraints (→ profiles.staff_id) are added post-migration
--       once all sequential IDs are assigned. Not enforced in this base schema.
--
-- NOTE: orders — denormalized customer_name, customer_phone, customer_address,
--       customer_tin, staff_name columns are still present. Decision on whether
--       to keep or drop them is deferred. Use customer_id / staff_id FKs when possible.
--
-- NOTE: To get the live schema from Supabase:
--   Option A (CLI): supabase db dump --schema public > live_schema.sql
--   Option B (SQL Editor): SELECT table_name, column_name, data_type, column_default
--                          FROM information_schema.columns WHERE table_schema = 'public'
--                          ORDER BY table_name, ordinal_position;

-- =============================================================================
-- 1. DROP EXISTING TABLES (dependency order)
-- =============================================================================

DROP TABLE IF EXISTS paystubs CASCADE;
DROP TABLE IF EXISTS payroll_line_items CASCADE;
DROP TABLE IF EXISTS payroll_runs CASCADE;
DROP TABLE IF EXISTS payroll_logs CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS shift_templates CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;

DROP TABLE IF EXISTS station_logs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS rates CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

DROP TABLE IF EXISTS daily_stats CASCADE;
DROP TABLE IF EXISTS app_status CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS drawer_logs CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS pc_transactions CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

DROP TABLE IF EXISTS counters CASCADE;

-- =============================================================================
-- 2. EXTENSIONS & ENUMS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'owner', 'staff');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- 3. GROUP A — IDENTITY
-- =============================================================================

CREATE TABLE profiles (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                   TEXT UNIQUE NOT NULL,
    full_name               TEXT,
    role                    user_role DEFAULT 'staff',
    -- pin_code removed (unused in app)
    -- is_clocked_in removed (unused in app — clock state tracked via shifts)
    suspended               BOOLEAN DEFAULT FALSE,
    requires_password_reset BOOLEAN DEFAULT FALSE,
    payroll_config          JSONB DEFAULT '{}',           -- { defaultRate, rate_history: [{rate, effective_from}] }
    staff_id                TEXT UNIQUE,                  -- Sequential ID e.g. ST-10000001 (renamed from sequential_id)
                                                          -- Auto-assigned on insert via trigger
    biometric_id            TEXT,                         -- for Windows Hello / WebAuthn
    biometric_registered_at TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE counters (
    id              TEXT PRIMARY KEY,                     -- e.g. 'shifts', 'orders', 'profiles'
    current_value   BIGINT DEFAULT 0,
    prefix          TEXT,                                 -- e.g. 'SH', 'OR', 'ST'
    padding         INTEGER DEFAULT 8,                    -- seeded at 8-digit base: 10000000
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. GROUP B — CUSTOMERS
-- =============================================================================

CREATE TABLE customers (
    id                  TEXT PRIMARY KEY,                 -- Firebase doc ID → sequential CU-xxxxxxxx after resequence
    full_name           TEXT NOT NULL,
    username            TEXT,
    phone               TEXT,                             -- not in Firebase export; NULL on import
    address             TEXT,                             -- not in Firebase export; NULL on import
    email               TEXT,                             -- not in Firebase export; NULL on import
    tin                 TEXT,                             -- not in Firebase export; NULL on import
    lifetime_value      DECIMAL(12, 2) DEFAULT 0,         -- computed post-migration: sum of orders.total
    outstanding_balance DECIMAL(12, 2) DEFAULT 0,         -- computed post-migration: sum of invoices.balance
    total_orders        INT DEFAULT 0,                    -- computed post-migration: count of orders
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 5. GROUP C — CORE CONFIG
-- =============================================================================

CREATE TABLE settings (
    id                          TEXT PRIMARY KEY,         -- singleton row 'config' (renamed from 'main')
    store_name                  TEXT,
    logo_url                    TEXT,
    address                     TEXT,
    phone                       TEXT,
    mobile                      TEXT,
    email                       TEXT,
    tin                         TEXT,
    currency_symbol             TEXT DEFAULT '₱',
    tax_rate                    DECIMAL(5, 2) DEFAULT 0,
    receipt_footer              TEXT,
    show_tax_breakdown          BOOLEAN DEFAULT FALSE,
    drawer_hotkey               JSONB DEFAULT '{}',       -- { code, altKey, display }
    checkout_hotkey             JSONB DEFAULT '{}',       -- { code, key, display }
    id_prefixes                 JSONB DEFAULT '{}',       -- { shifts, expenses, transactions, payroll }
    shift_duration_hours        INT DEFAULT 12,
    shift_alert_minutes         INT DEFAULT 30,
    schedule_posting_frequency  TEXT DEFAULT 'weekly',
    pc_rental_enabled           BOOLEAN DEFAULT FALSE,
    pc_rental_mode              TEXT DEFAULT 'prepaid',
    pc_rental_service_id        TEXT,
    invoice_due_days            INT DEFAULT 30,
    payment_methods             JSONB DEFAULT '{}',       -- { cash, charge, card, gcash, maya, banks }
    drawer_signal_type          TEXT DEFAULT 'usb'        -- not in Firebase export; default 'usb'
);

CREATE TABLE app_status (
    id              TEXT PRIMARY KEY,                     -- singleton 'current_shift'
    active_shift_id TEXT,
    staff_id        TEXT,                                 -- FK → profiles.staff_id (post-migration; from staffEmail)
    staff_email     TEXT,
    ended_by        TEXT,
    updated_at      TIMESTAMPTZ
);

CREATE TABLE daily_stats (
    date        TEXT PRIMARY KEY,                         -- format YYYY-MM-DD
    sales       DECIMAL(12, 2) DEFAULT 0,
    expenses    DECIMAL(12, 2) DEFAULT 0,
    tx_count    INT DEFAULT 0,
    breakdown   JSONB DEFAULT '{}',                       -- not in Firebase export; default {}
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. GROUP D — HR, SCHEDULING & PAYROLL
-- =============================================================================

CREATE TABLE shifts (
    id                      TEXT PRIMARY KEY,             -- sequential SH-xxxxxxxx after resequence
    display_id              TEXT,
    staff_id                TEXT,                         -- FK → profiles.staff_id (post-migration; from staffEmail)
    shift_period            TEXT,
    notes                   TEXT,
    schedule_id             TEXT,
    start_time              TIMESTAMPTZ DEFAULT NOW(),
    end_time                TIMESTAMPTZ,
    system_total            DECIMAL(12, 2) DEFAULT 0,
    pc_rental_total         DECIMAL(12, 2) DEFAULT 0,
    services_total          DECIMAL(12, 2) DEFAULT 0,
    expenses_total          DECIMAL(12, 2) DEFAULT 0,
    total_ar                DECIMAL(12, 2) DEFAULT 0,     -- AR created this shift (pay-later sales)
    total_cash              DECIMAL(12, 2) DEFAULT 0,
    total_digital           DECIMAL(12, 2) DEFAULT 0,     -- renamed from total_gcash (Firebase: totalGcash)
    ar_payments_total       DECIMAL(12, 2) DEFAULT 0,     -- AR collected this shift (payments on old receivables)
    denominations           JSONB DEFAULT '{}',           -- reassembled from ~20 flattened CSV keys
    last_consolidated_at    TIMESTAMPTZ,
    cash_difference         NUMERIC,                      -- not in Firebase export; NULL on import, backfill post-migration
    forced_end_by           TEXT,
    forced_end_reason       TEXT
    -- discarded from Firebase: payrollRunId, status (endedBy re-added as forced_end_by)
);

CREATE TABLE shift_templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    start_time  TEXT,                                     -- stored as string e.g. "08:00"
    end_time    TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    disabled    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE schedules (
    -- Firebase collection was empty; table created for new data only
    id              TEXT PRIMARY KEY,
    staff_id        TEXT,                                 -- FK → profiles.staff_id
    date            TEXT NOT NULL,
    shift_label     TEXT NOT NULL,
    start_time      TEXT,
    end_time        TEXT,
    status          TEXT DEFAULT 'scheduled',
    notes           TEXT,
    shift_id        TEXT REFERENCES shifts(id),
    covered_by_id   TEXT,                                 -- FK → profiles.staff_id (renamed from covered_by_uid)
    -- covered_by_email removed (get from profiles)
    -- covered_by_name removed (get from profiles)
    -- staff_name removed (get from profiles)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_logs (
    -- Firebase collection was empty; table created for new data only
    id          TEXT PRIMARY KEY,
    staff_id    TEXT,                                     -- FK → profiles.staff_id (post-migration; merged from staff_email)
    staff_uid   TEXT,                                     -- Firebase UID (legacy; remove post-migration)
    -- staff_name removed (get from profiles)
    shift_id    TEXT,
    type        TEXT,
    action      TEXT,
    method      TEXT,
    clock_in    TIMESTAMPTZ,
    clock_out   TIMESTAMPTZ,
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      TEXT UNIQUE NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  pay_date        TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'reviewed', 'approved', 'posted', 'voided')),
  totals          JSONB DEFAULT '{}'::JSONB,
  notes           TEXT DEFAULT '',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id          TEXT NOT NULL,
  staff_name        TEXT NOT NULL,
  staff_email       TEXT NOT NULL,
  rate              NUMERIC NOT NULL DEFAULT 0,
  total_minutes     INTEGER NOT NULL DEFAULT 0,
  total_hours       NUMERIC GENERATED ALWAYS AS (ROUND(total_minutes / 60.0, 2)) STORED,
  gross             NUMERIC NOT NULL DEFAULT 0,
  total_deductions  NUMERIC NOT NULL DEFAULT 0,
  total_additions   NUMERIC NOT NULL DEFAULT 0,
  net               NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_line_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id         UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  shift_id        TEXT NOT NULL,            -- references shifts.id (text format like SH-xxx)
  original_start  TIMESTAMPTZ,
  original_end    TIMESTAMPTZ,              -- null if ongoing
  override_start  TIMESTAMPTZ,              -- null = use original
  override_end    TIMESTAMPTZ,              -- null = use original
  minutes_used    INTEGER NOT NULL DEFAULT 0,
  excluded        BOOLEAN NOT NULL DEFAULT FALSE,
  shortage        NUMERIC NOT NULL DEFAULT 0,
  notes           TEXT DEFAULT ''
);

CREATE TABLE payroll_deductions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id       UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (type IN ('shortage', 'advance', 'manual', 'other')),
  label         TEXT NOT NULL,
  amount        NUMERIC NOT NULL DEFAULT 0,
  source_id     TEXT,                       -- nullable — links to expense.id or shift.id
  auto_applied  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_additions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id       UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (type IN ('bonus', 'overtime', 'allowance', 'manual', 'other')),
  label         TEXT NOT NULL,
  amount        NUMERIC NOT NULL DEFAULT 0,
  auto_applied  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_stubs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  line_id           UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  staff_id          TEXT NOT NULL,
  staff_name        TEXT NOT NULL,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  pay_date          TIMESTAMPTZ NOT NULL,
  rate              NUMERIC NOT NULL DEFAULT 0,
  total_hours       NUMERIC NOT NULL DEFAULT 0,
  gross_pay         NUMERIC NOT NULL DEFAULT 0,
  deductions        JSONB DEFAULT '[]'::JSONB,   -- [{type, label, amount}]
  additions         JSONB DEFAULT '[]'::JSONB,   -- [{type, label, amount}]
  total_deductions  NUMERIC NOT NULL DEFAULT 0,
  total_additions   NUMERIC NOT NULL DEFAULT 0,
  net_pay           NUMERIC NOT NULL DEFAULT 0,
  shifts            JSONB DEFAULT '[]'::JSONB,   -- [{id, label, start, end, hours, pay}]
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 7. GROUP E — PC TIMER (KUNEK)
-- All tables in this group are new — no Firebase source data.
-- Populated at runtime after launch.
-- =============================================================================

CREATE TABLE zones (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    sort_order  INT DEFAULT 0,
    rate_id     TEXT,                                     -- soft reference to rates(id)
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rates (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    type                TEXT,
    rate_per_minute     DECIMAL(12, 2) DEFAULT 0,
    minimum_minutes     INT DEFAULT 0,
    rounding_policy     TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    schedules           JSONB DEFAULT '[]',               -- time-based rate schedules
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE packages (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    minutes         INT NOT NULL,
    price           DECIMAL(12, 2) NOT NULL,
    bonus_minutes   INT DEFAULT 0,
    valid_days      INT DEFAULT 0,
    rate_id         TEXT REFERENCES rates(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stations (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    label               TEXT,
    zone_id             TEXT REFERENCES zones(id) ON DELETE SET NULL,
    rate_id             TEXT REFERENCES rates(id) ON DELETE SET NULL,
    mac_address         TEXT,
    ip_address          TEXT,
    specs               JSONB DEFAULT '{}',
    agent_version       TEXT,
    tamper_alert        BOOLEAN DEFAULT FALSE,
    agent_email         TEXT,
    agent_uid           TEXT,
    is_online           BOOLEAN DEFAULT FALSE,
    is_locked           BOOLEAN DEFAULT TRUE,
    status              TEXT DEFAULT 'available',
    current_session_id  TEXT,
    command             JSONB DEFAULT '{}',
    last_ping           TIMESTAMPTZ,
    provisioned_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id                      TEXT PRIMARY KEY,
    station_id              TEXT REFERENCES stations(id) ON DELETE CASCADE,
    -- station_name removed (derive from stations via station_id)
    customer_id             TEXT REFERENCES customers(id),
    -- customer_name removed (derive from customers via customer_id)
    type                    TEXT,
    rate_id                 TEXT,
    rate_snapshot           JSONB DEFAULT '{}',           -- rate at time of session
    package_id              TEXT,
    package_snapshot        JSONB DEFAULT '{}',           -- package at time of session
    minutes_allotted        INT DEFAULT 0,
    minutes_used            INT DEFAULT 0,
    minutes_paused          INT DEFAULT 0,
    rate_per_minute_applied DECIMAL(12, 2),
    amount_charged          DECIMAL(12, 2) DEFAULT 0,
    amount_paid             DECIMAL(12, 2) DEFAULT 0,
    discount                JSONB DEFAULT '{}',
    discount_amount         DECIMAL(12, 2) DEFAULT 0,
    discount_reason         TEXT,
    payment_method          TEXT,
    payment_details         JSONB,
    staff_id                TEXT,                         -- FK → profiles.staff_id
    shift_id                TEXT REFERENCES shifts(id),
    open_ended              BOOLEAN DEFAULT FALSE,
    estimated_limit         TIMESTAMPTZ,
    notes                   TEXT,
    status                  TEXT DEFAULT 'completed',
    paused_at               TIMESTAMPTZ,
    resumed_at              TIMESTAMPTZ,
    last_heartbeat_at       TIMESTAMPTZ,
    start_time              TIMESTAMPTZ,
    end_time                TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE station_logs (
    id          TEXT PRIMARY KEY,
    station_id  TEXT REFERENCES stations(id) ON DELETE CASCADE,
    session_id  TEXT,
    event       TEXT NOT NULL,
    severity    TEXT,
    staff_id    TEXT,                                     -- FK → profiles.staff_id
    metadata    JSONB DEFAULT '{}',
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. GROUP F — POS & FINANCIALS
-- =============================================================================

CREATE TABLE products (
    id                  TEXT PRIMARY KEY,                 -- Firebase doc ID → sequential PR-xxxxxxxx after resequence
    name                TEXT NOT NULL,                    -- from Firebase: serviceName
    category            TEXT,                             -- from Firebase: type ('service' | 'retail')
    financial_category  TEXT,                             -- from Firebase: category ('Sale' | 'Expense')
                                                          -- NOTE: Firebase field names are swapped vs schema
    parent_service_id   TEXT,
    price               DECIMAL(12, 2) DEFAULT 0,
    cost_price          DECIMAL(12, 2) DEFAULT 0,
    active              BOOLEAN DEFAULT TRUE,
    admin_only          BOOLEAN DEFAULT FALSE,
    sort_order          INT DEFAULT 0,
    track_stock         BOOLEAN DEFAULT FALSE,
    stock_count         INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    has_variants        BOOLEAN DEFAULT FALSE,
    pos_icon            TEXT,
    price_type          TEXT DEFAULT 'fixed',             -- 'fixed' | 'variable'
    pricing_note        TEXT,
    consumables         JSONB DEFAULT '[]',               -- not in Firebase export; default []
    variant_group       TEXT,
    pos_label           TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),        -- from Firebase: lastUpdated (best proxy)
    updated_at          TIMESTAMPTZ DEFAULT NOW()         -- from Firebase: lastUpdated
);

CREATE TABLE orders (
    id               TEXT PRIMARY KEY,                    -- sequential OR-xxxxxxxx after resequence
    order_number     TEXT UNIQUE NOT NULL,
    customer_id      TEXT REFERENCES customers(id),
    -- NOTE: customer_name, customer_address, customer_tin NOT imported (use customer_id FK).
    -- customer_phone retained for legacy display; customer_name/address/tin skipped during import.
    customer_name    TEXT,                                -- NOT imported; derive from customers FK
    customer_phone   TEXT,
    customer_address TEXT,                               -- NOT imported; derive from customers FK
    customer_tin     TEXT,                               -- NOT imported; derive from customers FK
    staff_id         TEXT,                                -- FK → profiles.staff_id (post-migration; from staffId or staffEmail)
    -- staff_email removed
    staff_name       TEXT,
    shift_id         TEXT REFERENCES shifts(id),
    subtotal         DECIMAL(12, 2) NOT NULL,
    discount         JSONB DEFAULT '{}',                  -- { type, value, amount }
    total            DECIMAL(12, 2) NOT NULL,
    amount_tendered  DECIMAL(12, 2) DEFAULT 0,
    change           DECIMAL(12, 2) DEFAULT 0,
    payment_method   TEXT,
    payment_details  JSONB DEFAULT '{}',                  -- { refNumber, phone, bankId, bankName }
    invoice_status   TEXT,
    status           TEXT DEFAULT 'completed',
    items            JSONB DEFAULT '[]',                  -- denormalized snapshot
    is_deleted       BOOLEAN DEFAULT FALSE,
    deleted_by       TEXT,                                -- FK → profiles.staff_id (post-migration)
    timestamp        TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
    -- discarded from Firebase: editReason, editedBy, isEdited, lastUpdatedAt, deleteReason, deletedAt, staffEmail
);

CREATE TABLE order_items (
    id                      TEXT PRIMARY KEY,             -- Firebase TX-prefixed → sequential OI-xxxxxxxx after resequence
    parent_order_id         TEXT REFERENCES orders(id) ON DELETE CASCADE,  -- resolved from orderNumber
    product_id              TEXT REFERENCES products(id), -- soft ref; from Firebase: serviceId
    name                    TEXT,                         -- from Firebase: item
    price                   DECIMAL(12, 2) DEFAULT 0,
    cost_price              DECIMAL(12, 2) DEFAULT 0,     -- from Firebase: costPrice or unitCost
    amount                  DECIMAL(12, 2) NOT NULL,      -- from Firebase: total
    quantity                INT DEFAULT 1,
    is_deleted              BOOLEAN DEFAULT FALSE,
    is_edited               BOOLEAN DEFAULT FALSE,
    added_by_admin          BOOLEAN DEFAULT FALSE,
    staff_id                TEXT,                         -- FK → profiles.staff_id (post-migration; from staffEmail)
    shift_id                TEXT REFERENCES shifts(id),
    financial_category      TEXT,
    customer_id             TEXT REFERENCES customers(id),
    -- customer_name removed (get from customers table)
    category                TEXT,
    payment_method          TEXT,
    invoice_status          TEXT,
    reconciliation_status   TEXT DEFAULT 'Verified',
    metadata                JSONB DEFAULT '{}',           -- { note, parentServiceId, variantGroup, variantLabel,
                                                          --   paymentDetails, consumables }
    timestamp               TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ                   -- from Firebase: lastUpdatedAt
);

CREATE TABLE pc_transactions (
    -- No Firebase data — table is empty on migration.
    -- Populated at runtime by PC Timer (Kunek) sessions.
    id                      TEXT PRIMARY KEY,             -- PX-prefixed
    customer_id             TEXT REFERENCES customers(id),
    -- customer_name removed (get from customers table)
    type                    TEXT NOT NULL,
    category                TEXT,
    payment_method          TEXT DEFAULT 'Cash',
    amount                  DECIMAL(12, 2) NOT NULL,
    staff_id                TEXT,                         -- FK → profiles.staff_id
    shift_id                TEXT REFERENCES shifts(id) ON DELETE SET NULL,
    is_deleted              BOOLEAN DEFAULT FALSE,
    financial_category      TEXT,
    reconciliation_status   TEXT DEFAULT 'Verified',
    metadata                JSONB DEFAULT '{}',
    timestamp               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
    id                  TEXT PRIMARY KEY,                 -- EX-prefixed after resequence
    category            TEXT,
    expense_type        TEXT,
    item                TEXT NOT NULL,                    -- WILL BE DROPPED post-migration (ALTER TABLE expenses DROP COLUMN item)
    amount              DECIMAL(12, 2) NOT NULL,          -- from Firebase: total
    quantity            INT DEFAULT 1,
    staff_id            TEXT,                             -- FK → profiles.staff_id (post-migration; from expenseStaffEmail or staffEmail)
    -- staff_email removed
    shift_id            TEXT REFERENCES shifts(id) ON DELETE SET NULL,
    is_deleted          BOOLEAN DEFAULT FALSE,
    financial_category  TEXT,
    notes               TEXT,                             -- from Firebase: notes or note
    metadata            JSONB DEFAULT '{}',               -- { payrollRunId, source, extras }
    timestamp           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
    id              TEXT PRIMARY KEY,                     -- IV-prefixed after resequence
    invoice_number  TEXT UNIQUE NOT NULL,               -- WILL BE DROPPED post-migration (ALTER TABLE invoices DROP COLUMN invoice_number)
    -- order_id removed (invoices are not directly tied to orders)
    -- order_number removed
    customer_id     TEXT REFERENCES customers(id),
    -- customer_name/email/phone removed (get from customers table)
    items           JSONB DEFAULT '[]',
    subtotal        DECIMAL(12, 2) DEFAULT 0,
    tax_amount      DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total           DECIMAL(12, 2) DEFAULT 0,
    amount_paid     DECIMAL(12, 2) DEFAULT 0,
    balance         DECIMAL(12, 2) DEFAULT 0,
    payments        JSONB DEFAULT '[]',
    status          TEXT DEFAULT 'UNPAID',
    due_date        TIMESTAMPTZ,
    notes           TEXT,
    shift_id        TEXT REFERENCES shifts(id),
    staff_id        TEXT,                                 -- FK → profiles.staff_id (post-migration; from staffEmail)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_logs (
    -- Firebase collection was empty; table created for new data only
    id          TEXT PRIMARY KEY,
    item_id     TEXT REFERENCES products(id) ON DELETE SET NULL,
    item_name   TEXT,
    qty_change  INT NOT NULL,                             -- negative = deduction
    type        TEXT,                                     -- Restock | Sale | Adjustment | Damage | Loss | Correction
    reason      TEXT,
    cost        DECIMAL(12, 2),
    total_cost  DECIMAL(12, 2),
    staff_email TEXT,                                     -- kept as-is (log table, low priority for migration)
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE drawer_logs (
    -- Table kept for structure. Data NOT imported from Firebase (7,061 rows discarded).
    id              TEXT PRIMARY KEY,
    staff_id        TEXT,                                 -- FK → profiles.staff_id (renamed from staff_email)
    trigger_type    TEXT,
    signal_type     TEXT,
    success         BOOLEAN DEFAULT FALSE,
    error_message   TEXT,
    device          TEXT,
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 9. FUNCTIONS
-- =============================================================================

-- Atomic stock decrement — avoids read-then-write race condition in concurrent checkouts
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id TEXT, p_qty INT)
RETURNS VOID AS $$
    UPDATE products SET stock_count = stock_count - p_qty WHERE id = p_product_id;
$$ LANGUAGE SQL;

-- Atomic batch inventory deduction (used by checkout)
CREATE OR REPLACE FUNCTION batch_decrement_stock(p_items JSONB)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty DECIMAL)
    LOOP
        UPDATE products SET stock_count = stock_count - v_item.qty WHERE id = v_item.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Atomic batch inventory restock (used by order void/revert)
CREATE OR REPLACE FUNCTION batch_increment_stock(p_items JSONB)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty DECIMAL)
    LOOP
        UPDATE products SET stock_count = stock_count + v_item.qty WHERE id = v_item.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Unified Checkout Logic (reduces round-trips)
CREATE OR REPLACE FUNCTION perform_checkout(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id TEXT;
    v_cust_id TEXT;
    v_staff_id TEXT;
    v_shift_id TEXT;
    v_payment_method TEXT;
    v_invoice_id TEXT;
    v_item RECORD;
    v_inv_item RECORD;
    v_items_count INT;
    v_oi_ids TEXT[];
    v_oi_first_val BIGINT;
    v_oi_prefix TEXT;
    v_oi_padding INT;
    v_timestamp TIMESTAMPTZ := NOW();
    v_result JSONB;
BEGIN
    -- 1. Extract Shared Context
    v_staff_id := p_payload->>'staff_id';
    v_shift_id := p_payload->>'shift_id';
    v_payment_method := p_payload->>'payment_method';

    -- 2. Resolve/Create Customer
    IF (p_payload->'customer'->>'isNew')::BOOLEAN THEN
        -- Generate CU- ID
        SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
        INTO v_cust_id
        FROM get_next_sequence_batch('customers', 1);

        INSERT INTO customers (id, full_name, created_at)
        VALUES (v_cust_id, p_payload->'customer'->>'fullName', v_timestamp);
    ELSE
        v_cust_id := p_payload->'customer'->>'id';
    END IF;

    -- 3. Generate Order ID (OR-)
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_order_id
    FROM get_next_sequence_batch('orders', 1);

    -- 4. Insert Order
    INSERT INTO orders (
        id, order_number, customer_id, 
        customer_name, customer_phone, customer_address, customer_tin,
        staff_id, staff_name, shift_id,
        subtotal, discount, total, amount_tendered, "change", payment_method,
        payment_details, invoice_status, status, timestamp, is_deleted
    ) VALUES (
        v_order_id,
        v_order_id,
        v_cust_id,
        p_payload->'customer'->>'fullName',
        p_payload->'customer'->>'phone',
        p_payload->'customer'->>'address',
        p_payload->'customer'->>'tin',
        v_staff_id,
        p_payload->>'staff_name',
        v_shift_id,
        (p_payload->>'subtotal')::DECIMAL,
        COALESCE(p_payload->'discount', '{}'::jsonb),
        (p_payload->>'total')::DECIMAL,
        (p_payload->>'amount_tendered')::DECIMAL,
        (p_payload->>'change')::DECIMAL,
        v_payment_method,
        p_payload->'payment_details',
        CASE WHEN v_payment_method IN ('Charge', 'Pay Later') THEN 'UNPAID' ELSE 'PAID' END,
        'completed',
        v_timestamp,
        FALSE
    );

    -- 5. Process Order Items
    v_items_count := jsonb_array_length(p_payload->'items');
    
    -- Batch Get OI- IDs
    SELECT new_prefix, first_val, current_padding
    INTO v_oi_prefix, v_oi_first_val, v_oi_padding
    FROM get_next_sequence_batch('order_items', v_items_count);

    FOR i IN 0..(v_items_count - 1) LOOP
        v_item := NULL; -- Reset
        SELECT * INTO v_item FROM jsonb_to_record(p_payload->'items'->i) AS x(
            serviceId TEXT, name TEXT, price DECIMAL, costPrice DECIMAL, quantity INT,
            category TEXT, note TEXT, consumables JSONB, trackStock BOOLEAN
        );

        -- Insert Line Item
        INSERT INTO order_items (
            id, parent_order_id, product_id, name, price, cost_price,
            amount, quantity, staff_id, shift_id, customer_id,
            payment_method, category, financial_category,
            invoice_status, is_deleted, timestamp, metadata
        ) VALUES (
            v_oi_prefix || '-' || LPAD((v_oi_first_val + i)::text, v_oi_padding, '0'),
            v_order_id,
            v_item.serviceId,
            v_item.name,
            v_item.price,
            v_item.costPrice,
            v_item.price * v_item.quantity,
            v_item.quantity,
            v_staff_id,
            v_shift_id,
            v_cust_id,
            v_payment_method,
            COALESCE(v_item.category, 'Revenue'),
            'Revenue',
            CASE WHEN v_payment_method IN ('Charge', 'Pay Later') THEN 'UNPAID' ELSE 'PAID' END,
            FALSE,
            v_timestamp,
            jsonb_build_object(
                'note', v_item.note,
                'consumables', v_item.consumables,
                'paymentDetails', p_payload->'payment_details'
            )
        );

        -- Inventory Deduction (Main Item)
        IF v_item.trackStock AND v_item.serviceId IS NOT NULL THEN
            UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.serviceId;
        END IF;

        -- Inventory Deduction (Consumables)
        IF v_item.consumables IS NOT NULL AND jsonb_array_length(v_item.consumables) > 0 THEN
            FOR v_inv_item IN SELECT * FROM jsonb_to_recordset(v_item.consumables) AS y(itemId TEXT, qty DECIMAL) LOOP
                UPDATE products SET stock_count = stock_count - (v_inv_item.qty * v_item.quantity) WHERE id = v_inv_item.itemId;
            END LOOP;
        END IF;
    END LOOP;

    -- 6. Create Invoice if Charge
    IF v_payment_method = 'Charge' THEN
        SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
        INTO v_invoice_id
        FROM get_next_sequence_batch('invoices', 1);

        INSERT INTO invoices (
            id, invoice_number, customer_id, subtotal, total, 
            amount_paid, balance, status, due_date, 
            shift_id, staff_id, created_at, items
        ) VALUES (
            v_invoice_id,
            v_invoice_id,
            v_cust_id,
            (p_payload->>'total')::DECIMAL,
            (p_payload->>'total')::DECIMAL,
            0,
            (p_payload->>'total')::DECIMAL,
            'unpaid',
            (p_payload->>'due_date')::TIMESTAMPTZ,
            v_shift_id,
            v_staff_id,
            v_timestamp,
            p_payload->'items'
        );
    END IF;

    -- Return the order id and number
    v_result := jsonb_build_object(
        'id', v_order_id,
        'order_number', v_order_id,
        'customer_id', v_cust_id
    );

    RETURN v_result;
END;
$$;

-- Atomic update for orders including item additions, modifications, and soft-deletes.
CREATE OR REPLACE FUNCTION update_checkout(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id TEXT;
    v_cust_id TEXT;
    v_staff_id TEXT;
    v_shift_id TEXT;
    v_payment_method TEXT;
    v_timestamp TIMESTAMPTZ := NOW();
    v_item RECORD;
    v_new_items_count INT := 0;
    v_new_oi_prefix TEXT;
    v_new_oi_first_val BIGINT;
    v_new_oi_padding INT;
    v_idx INT := 0;
    v_result JSONB;
BEGIN
    v_order_id := p_payload->>'order_id';
    v_staff_id := p_payload->>'staff_id';
    v_shift_id := p_payload->>'shift_id';
    v_payment_method := p_payload->>'payment_method';

    -- 1. Sync Customer/Order Details
    IF p_payload->'customer_details' IS NOT NULL THEN
        UPDATE orders SET
            customer_name = COALESCE(p_payload->'customer_details'->>'customer_name', customer_name),
            customer_phone = COALESCE(p_payload->'customer_details'->>'customer_phone', customer_phone),
            customer_address = COALESCE(p_payload->'customer_details'->>'customer_address', customer_address),
            customer_tin = COALESCE(p_payload->'customer_details'->>'customer_tin', customer_tin),
            updated_at = v_timestamp
        WHERE id = v_order_id;
    END IF;

    -- 2. Sync Order Totals/Payment
    UPDATE orders SET
        status = COALESCE(p_payload->>'status', status),
        payment_method = COALESCE(p_payload->>'payment_method', payment_method),
        amount_tendered = COALESCE((p_payload->>'amount_tendered')::DECIMAL, amount_tendered),
        "change" = COALESCE((p_payload->>'change')::DECIMAL, "change"),
        subtotal = COALESCE((p_payload->>'subtotal')::DECIMAL, subtotal),
        total = COALESCE((p_payload->>'total')::DECIMAL, total),
        updated_at = v_timestamp
    WHERE id = v_order_id;

    -- 3. Calculate how many NEW items we need IDs for
    IF p_payload->'items' IS NOT NULL THEN
        SELECT count(*) INTO v_new_items_count 
        FROM jsonb_to_recordset(p_payload->'items') AS x(operation TEXT) 
        WHERE x.operation = 'INSERT';
    END IF;

    IF v_new_items_count > 0 THEN
        SELECT new_prefix, first_val, current_padding
        INTO v_new_oi_prefix, v_new_oi_first_val, v_new_oi_padding
        FROM get_next_sequence_batch('order_items', v_new_items_count);
    END IF;

    -- 4. Process Item Operations
    IF p_payload->'items' IS NOT NULL THEN
        v_idx := 0;
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_payload->'items') AS x(
            id TEXT, operation TEXT, name TEXT, price DECIMAL, quantity INT, amount DECIMAL, 
            is_deleted BOOLEAN, product_id TEXT, track_stock BOOLEAN
        ) LOOP
            
            CASE v_item.operation
                WHEN 'INSERT' THEN
                    INSERT INTO order_items (
                        id, parent_order_id, product_id, name, price, 
                        amount, quantity, staff_id, shift_id,
                        payment_method, is_deleted, timestamp, is_edited, edited_by, edit_reason
                    ) VALUES (
                        v_new_oi_prefix || '-' || LPAD((v_new_oi_first_val + v_idx)::text, v_new_oi_padding, '0'),
                        v_order_id,
                        v_item.product_id,
                        v_item.name,
                        v_item.price,
                        v_item.amount,
                        v_item.quantity,
                        v_staff_id,
                        v_shift_id,
                        v_payment_method,
                        FALSE,
                        v_timestamp,
                        TRUE,
                        p_payload->>'edited_by',
                        p_payload->>'edit_reason'
                    );
                    
                    -- Stock deduction for new items
                    IF v_item.product_id IS NOT NULL THEN
                         UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.product_id;
                    END IF;
                    
                    v_idx := v_idx + 1;

                WHEN 'UPDATE' THEN
                    UPDATE order_items SET
                        name = COALESCE(v_item.name, name),
                        price = COALESCE(v_item.price, price),
                        quantity = COALESCE(v_item.quantity, quantity),
                        amount = COALESCE(v_item.amount, amount),
                        is_edited = TRUE,
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id;

                WHEN 'DELETE' THEN
                    UPDATE order_items SET 
                        is_deleted = TRUE,
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id 
                    RETURNING product_id, quantity INTO v_item.product_id, v_item.quantity;

                    IF v_item.product_id IS NOT NULL THEN
                        UPDATE products SET stock_count = stock_count + v_item.quantity WHERE id = v_item.product_id;
                    END IF;

                WHEN 'SET' THEN
                    UPDATE order_items SET 
                        is_deleted = COALESCE(v_item.is_deleted, is_deleted),
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id
                    RETURNING product_id, quantity INTO v_item.product_id, v_item.quantity;

                    IF v_item.is_deleted = FALSE AND v_item.product_id IS NOT NULL THEN
                        UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.product_id;
                    END IF;

                ELSE
                    -- Do nothing
            END CASE;
        END LOOP;
    END IF;

    v_result := jsonb_build_object(
        'id', v_order_id,
        'status', 'success'
    );

    RETURN v_result;
END;
$$;

-- Pre-aggregated shift financial summaries
DROP FUNCTION IF EXISTS get_shift_summaries(timestamptz, timestamptz, integer, integer);
CREATE OR REPLACE FUNCTION get_shift_summaries(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    display_id TEXT,
    staff_id TEXT,
    staff_email TEXT,
    shift_period TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    pc_rental_total NUMERIC,
    system_total_stored NUMERIC,
    denominations JSONB,
    cash_sales NUMERIC,
    digital_sales NUMERIC,
    ar_sales NUMERIC,
    pc_non_cash_sales NUMERIC,
    ar_payments NUMERIC,
    expenses_total NUMERIC,
    service_sales_total NUMERIC,
    service_breakdown JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH shift_records AS (
        SELECT 
            s.id,
            s.display_id,
            s.staff_id,
            s.shift_period,
            s.start_time,
            s.end_time,
            s.pc_rental_total,
            s.system_total,
            s.denominations,
            p.email as staff_email
        FROM shifts s
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE (p_start_time IS NULL OR s.start_time >= p_start_time)
          AND (p_end_time IS NULL OR s.start_time <= p_end_time)
        ORDER BY s.start_time DESC
        LIMIT p_limit
        OFFSET p_offset
    ),
    item_aggregation AS (
        SELECT 
            oi.shift_id,
            -- Sales: Revenue/Service items only (exclude payments and expenses)
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.name)) NOT IN ('ar payment', 'paid debt', 'expenses', 'new debt') 
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as service_sales,
            -- AR Payments: "Paid Debt" or "AR Payment"
            SUM(CASE 
                WHEN oi.is_deleted = false AND TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt') THEN oi.amount 
                ELSE 0 
            END) as ar_payments,
            -- Digital Sales: Any sale or payment made via digital methods
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card') 
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                )
                THEN oi.amount 
                ELSE 0 
            END) as digital_sales,
            -- AR Sales: Items charged to account
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) = 'charge' 
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as ar_sales,
            -- Cash Sales: Used for Expected Cash (Sales + AR Payments paid in Cash)
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) NOT IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') 
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (
                        TRIM(LOWER(oi.name)) NOT IN ('expenses', 'new debt') 
                        AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                    )
                )
                THEN oi.amount 
                ELSE 0 
            END) as cash_sales,
            -- Expenses from order_items
            SUM(CASE 
                WHEN oi.is_deleted = false AND TRIM(LOWER(oi.name)) IN ('expenses', 'new debt') THEN oi.amount 
                ELSE 0 
            END) as item_expenses,
            jsonb_object_agg(oi.name, (SELECT SUM(amount) FROM order_items oi2 WHERE oi2.shift_id = oi.shift_id AND oi2.name = oi.name AND oi2.is_deleted = false)) FILTER (WHERE oi.is_deleted = false) as breakdown
        FROM order_items oi
        WHERE oi.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY oi.shift_id
    ),
    pc_aggregation AS (
        SELECT 
            pt.shift_id,
            SUM(CASE 
                WHEN pt.is_deleted = false AND TRIM(LOWER(pt.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') THEN pt.amount 
                ELSE 0 
            END) as pc_non_cash
        FROM pc_transactions pt
        WHERE pt.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY pt.shift_id
    ),
    expense_aggregation AS (
        SELECT 
            e.shift_id,
            SUM(CASE WHEN e.is_deleted = false THEN e.amount ELSE 0 END) as expenses
        FROM expenses e
        WHERE e.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY e.shift_id
    )
    SELECT 
        sr.id,
        sr.display_id,
        sr.staff_id,
        sr.staff_email,
        sr.shift_period,
        sr.start_time,
        sr.end_time,
        sr.pc_rental_total,
        sr.system_total,
        sr.denominations,
        COALESCE(ia.cash_sales, 0) as cash_sales,
        COALESCE(ia.digital_sales, 0) as digital_sales,
        COALESCE(ia.ar_sales, 0) as ar_sales,
        COALESCE(pa.pc_non_cash, 0) as pc_non_cash_sales, -- Use proper name from RETURNS TABLE
        COALESCE(ia.ar_payments, 0) as ar_payments,
        COALESCE(ea.expenses, 0) + COALESCE(ia.item_expenses, 0) as expenses_total, -- Sum both sources
        COALESCE(ia.service_sales, 0) as service_sales_total,
        COALESCE(ia.breakdown, '{}'::jsonb) as service_breakdown
    FROM shift_records sr
    LEFT JOIN item_aggregation ia ON sr.id = ia.shift_id
    LEFT JOIN pc_aggregation pa ON sr.id = pa.shift_id
    LEFT JOIN expense_aggregation ea ON sr.id = ea.shift_id
    ORDER BY sr.start_time DESC;
END;
$$;

-- Unified products, variants, and expense types for POS
CREATE OR REPLACE FUNCTION get_pos_catalog()
RETURNS TABLE (
    products JSONB,
    variants JSONB,
    expense_types JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Core Products (Active, not variants, not the Expenses category itself)
        (SELECT jsonb_agg(p) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id IS NULL 
              AND name != 'Expenses'
            ORDER BY sort_order ASC
        ) p) as products,
        
        -- Variants (Children of active products)
        (SELECT jsonb_agg(v) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id IS NOT NULL 
              AND parent_service_id != (SELECT id FROM products WHERE name = 'Expenses' LIMIT 1)
            ORDER BY sort_order ASC
        ) v) as variants,
        
        -- Expense Types (Children of 'Expenses')
        (SELECT jsonb_agg(e) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id = (SELECT id FROM products WHERE name = 'Expenses' LIMIT 1)
            ORDER BY name ASC
        ) e) as expense_types;
END;
$$;

-- Atomic expense creation with ID generation
CREATE OR REPLACE FUNCTION record_expense(
    p_expense_type TEXT,
    p_amount NUMERIC,
    p_quantity NUMERIC,
    p_staff_id TEXT,
    p_shift_id TEXT,
    p_category TEXT, -- 'OPEX' or 'CAPEX'
    p_notes TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id TEXT;
BEGIN
    -- Generate sequential ID
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_new_id
    FROM get_next_sequence_batch('expenses', 1);

    INSERT INTO expenses (
        id,
        expense_type,
        amount,
        quantity,
        staff_id,
        shift_id,
        financial_category,
        notes,
        metadata,
        timestamp,
        is_deleted
    ) VALUES (
        v_new_id,
        p_expense_type,
        p_amount,
        p_quantity,
        p_staff_id,
        p_shift_id,
        p_category,
        p_notes,
        p_metadata,
        NOW(),
        false
    );

    RETURN v_new_id;
END;
$$;

-- Unified transaction pager
CREATE OR REPLACE FUNCTION get_combined_transactions(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_staff_id TEXT DEFAULT NULL,
    p_shift_id TEXT DEFAULT NULL,
    p_show_deleted BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id TEXT,
    tx_timestamp TIMESTAMPTZ,
    item TEXT,
    amount NUMERIC,
    quantity NUMERIC,
    payment_method TEXT,
    customer_name TEXT,
    staff_id TEXT,
    shift_id TEXT,
    source TEXT,
    is_deleted BOOLEAN,
    is_edited BOOLEAN,
    order_number TEXT,
    expense_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH combined AS (
        -- Order Items (POS)
        SELECT 
            oi.id,
            oi.timestamp as tx_timestamp,
            oi.name as item,
            oi.amount,
            oi.quantity::NUMERIC,
            oi.payment_method,
            o.customer_name,
            oi.staff_id,
            oi.shift_id,
            'pos' as source,
            oi.is_deleted,
            oi.is_edited,
            o.order_number,
            NULL as expense_type
        FROM order_items oi
        LEFT JOIN orders o ON oi.parent_order_id = o.id
        WHERE oi.timestamp BETWEEN p_start_time AND p_end_time
          AND (p_staff_id IS NULL OR oi.staff_id = p_staff_id)
          AND (p_shift_id IS NULL OR oi.shift_id = p_shift_id)
          AND (p_show_deleted OR oi.is_deleted = false)

        UNION ALL

        -- PC Transactions
        SELECT 
            pt.id,
            pt.timestamp as tx_timestamp,
            pt.type as item,
            pt.amount,
            1::NUMERIC as quantity,
            pt.payment_method,
            'Walk-in' as customer_name,
            pt.staff_id,
            pt.shift_id,
            'pc' as source,
            pt.is_deleted,
            false as is_edited,
            NULL as order_number,
            NULL as expense_type
        FROM pc_transactions pt
        WHERE pt.timestamp BETWEEN p_start_time AND p_end_time
          AND (p_staff_id IS NULL OR pt.staff_id = p_staff_id)
          AND (p_shift_id IS NULL OR pt.shift_id = p_shift_id)
          AND (p_show_deleted OR pt.is_deleted = false)

        UNION ALL

        -- Expenses
        SELECT 
            e.id,
            e.timestamp as tx_timestamp,
            'Expenses' as item,
            e.amount,
            e.quantity::NUMERIC,
            'Cash' as payment_method,
            NULL as customer_name,
            e.staff_id,
            e.shift_id,
            'expense' as source,
            e.is_deleted,
            false as is_edited,
            NULL as order_number,
            e.expense_type
        FROM expenses e
        WHERE e.timestamp BETWEEN p_start_time AND p_end_time
          AND (p_staff_id IS NULL OR e.staff_id = p_staff_id)
          AND (p_shift_id IS NULL OR e.shift_id = p_shift_id)
          AND (p_show_deleted OR e.is_deleted = false)
    )
    SELECT * FROM combined
    ORDER BY tx_timestamp DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Lightweight customer list
CREATE OR REPLACE FUNCTION get_customer_summaries()
RETURNS TABLE (id TEXT, full_name TEXT, phone TEXT, outstanding_balance NUMERIC, total_orders INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY SELECT c.id, c.full_name, c.phone, COALESCE(c.outstanding_balance, 0), COALESCE(c.total_orders, 0)
    FROM customers c ORDER BY c.full_name ASC;
END; $$;

-- POS Instant Boot package
CREATE OR REPLACE FUNCTION get_pos_init_data()
RETURNS TABLE (app_status JSONB, active_shift JSONB, recent_transactions JSONB, stations JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_status JSONB; v_active_shift_id TEXT;
BEGIN
    -- Get current shift status
    SELECT jsonb_build_object(
        'id', s.id,
        'active_shift_id', s.active_shift_id,
        'staff_id', s.staff_id,
        'staff_email', p.email
    ) INTO v_status
    FROM app_status s
    LEFT JOIN profiles p ON s.staff_id = p.staff_id
    WHERE s.id = 'current_shift';

    v_active_shift_id := (v_status->>'active_shift_id');
    RETURN QUERY SELECT v_status,
        (SELECT jsonb_build_object(
            'id', s.id, 'display_id', s.display_id, 'staff_id', s.staff_id, 'staff_email', p.email,
            'start_time', s.start_time, 'pc_rental_total', s.pc_rental_total
        ) FROM shifts s LEFT JOIN profiles p ON s.staff_id = p.staff_id WHERE s.id = v_active_shift_id) as active_shift,
        (SELECT jsonb_agg(tx) FROM (SELECT oi.id, oi.name as item, oi.amount, oi.quantity, oi.timestamp, oi.payment_method, oi.is_deleted, o.order_number, o.customer_name FROM order_items oi LEFT JOIN orders o ON oi.parent_order_id = o.id WHERE (v_active_shift_id IS NULL OR oi.shift_id = v_active_shift_id) ORDER BY oi.timestamp DESC LIMIT 20) tx),
        (SELECT jsonb_agg(st) FROM (SELECT id, agent_email, is_online, status, current_session_id FROM stations ORDER BY id ASC) st);
END; $$;

-- Analytics consolidated range caller
CREATE OR REPLACE FUNCTION get_analytics_data(p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ)
RETURNS TABLE (transactions JSONB, shifts JSONB, invoices JSONB, earliest_date TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY SELECT 
        -- Combined Transactions (Order Items + Pc Transactions + Expenses)
        (SELECT jsonb_agg(tx) FROM (
            SELECT 
                oi.id, 
                oi.name as item, 
                oi.price, 
                oi.quantity, 
                oi.amount as total, 
                oi.timestamp, 
                oi.financial_category as "financialCategory", 
                oi.is_deleted as "isDeleted", 
                oi.product_id as "serviceId", 
                oi.staff_id, 
                oi.shift_id,
                'pos' as source
            FROM order_items oi
            WHERE oi.timestamp BETWEEN p_start_time AND p_end_time
            
            UNION ALL

            SELECT 
                pt.id, 
                pt.type as item, 
                pt.amount as price, 
                1 as quantity, 
                pt.amount as total, 
                pt.timestamp, 
                pt.financial_category as "financialCategory", 
                pt.is_deleted as "isDeleted", 
                'pc-rental' as "serviceId", 
                pt.staff_id, 
                pt.shift_id,
                'pc' as source
            FROM pc_transactions pt
            WHERE pt.timestamp BETWEEN p_start_time AND p_end_time
            
            UNION ALL
            
            SELECT 
                e.id, 
                'Expenses' as item, 
                e.amount / NULLIF(e.quantity, 0) as price, 
                e.quantity, 
                e.amount as total, 
                e.timestamp, 
                e.financial_category as "financialCategory", 
                e.is_deleted as "isDeleted", 
                NULL as "serviceId", 
                e.staff_id, 
                e.shift_id,
                'expense' as source
            FROM expenses e
            WHERE e.timestamp BETWEEN p_start_time AND p_end_time
        ) tx) as transactions,
        
        -- Shift History
        (SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'startTime', s.start_time,
            'endTime', s.end_time,
            'pcRentalTotal', s.pc_rental_total,
            'staff_id', s.staff_id,
            'staff_email', p.email
        )) FROM shifts s 
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE s.start_time BETWEEN p_start_time AND p_end_time) as shifts,
        
        -- Invoices
        (SELECT jsonb_agg(inv) FROM (
            SELECT 
                i.id, 
                i.created_at as "createdAt", 
                i.id as "invoiceNumber", 
                i.amount_paid as "amountPaid", 
                i.total,
                i.balance,
                i.status,
                i.customer_id,
                c.full_name as "customerName"
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.created_at BETWEEN p_start_time AND p_end_time
        ) inv) as invoices,
        
        -- Earliest Date
        (SELECT MIN(timestamp) FROM order_items) as earliest_date;
END; $$;

-- Create a function to get shift summaries with pre-aggregated data
DROP FUNCTION IF EXISTS get_shift_summaries(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION get_shift_summaries(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    display_id TEXT,
    staff_id TEXT,
    staff_email TEXT,
    shift_period TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    pc_rental_total NUMERIC,
    system_total_stored NUMERIC,
    denominations JSONB,
    cash_sales NUMERIC,
    digital_sales NUMERIC,
    ar_sales NUMERIC,
    pc_non_cash_sales NUMERIC,
    ar_payments NUMERIC,
    expenses_total NUMERIC,
    service_sales_total NUMERIC,
    service_breakdown JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH shift_records AS (
        SELECT 
            s.id,
            s.display_id,
            s.staff_id,
            s.shift_period,
            s.start_time,
            s.end_time,
            s.pc_rental_total,
            s.system_total,
            s.denominations,
            p.email as staff_email
        FROM shifts s
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE (p_start_time IS NULL OR s.start_time >= p_start_time)
          AND (p_end_time IS NULL OR s.start_time <= p_end_time)
        ORDER BY s.start_time DESC
        LIMIT p_limit
        OFFSET p_offset
    ),
    item_aggregation AS (
        SELECT 
            oi.shift_id,
            -- Sales: Revenue/Service items only (exclude payments, expenses, AND PC rental)
            SUM(CASE 
                WHEN oi.is_deleted = FALSE 
                AND TRIM(LOWER(oi.name)) NOT IN ('ar payment', 'paid debt', 'expenses', 'new debt', 'pc rental') 
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as service_sales,
            -- AR Payments: "Paid Debt" or "AR Payment"
            SUM(CASE 
                WHEN oi.is_deleted = FALSE AND TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt') THEN oi.amount 
                ELSE 0 
            END) as ar_payments,
            -- Digital Sales: Any sale or payment made via digital methods (exclude PC rental)
            SUM(CASE 
                WHEN oi.is_deleted = FALSE 
                AND TRIM(LOWER(oi.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card') 
                AND TRIM(LOWER(oi.name)) != 'pc rental'
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                )
                THEN oi.amount 
                ELSE 0 
            END) as digital_sales,
            -- AR Sales: Items charged to account (exclude PC rental)
            SUM(CASE 
                WHEN oi.is_deleted = FALSE 
                AND TRIM(LOWER(oi.payment_method)) = 'charge' 
                AND TRIM(LOWER(oi.name)) != 'pc rental'
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as ar_sales,
            -- Cash Sales: Used for Expected Cash (Sales + AR Payments paid in Cash, exclude PC rental)
            SUM(CASE 
                WHEN oi.is_deleted = FALSE 
                AND TRIM(LOWER(oi.payment_method)) NOT IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') 
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (
                        TRIM(LOWER(oi.name)) NOT IN ('expenses', 'new debt', 'pc rental') 
                        AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                    )
                )
                THEN oi.amount 
                ELSE 0 
            END) as cash_sales,
            -- PC Rental non-cash from order_items (digital/charge payments for PC Rental logged as order_items)
            SUM(CASE 
                WHEN oi.is_deleted = FALSE 
                AND TRIM(LOWER(oi.name)) = 'pc rental'
                AND TRIM(LOWER(oi.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card', 'charge')
                THEN oi.amount 
                ELSE 0 
            END) as pc_oi_non_cash,
            -- Expenses from order_items
            SUM(CASE 
                WHEN oi.is_deleted = FALSE AND TRIM(LOWER(oi.name)) IN ('expenses', 'new debt') THEN oi.amount 
                ELSE 0 
            END) as item_expenses,
            jsonb_object_agg(oi.name, (SELECT SUM(amount) FROM order_items oi2 WHERE oi2.shift_id = oi.shift_id AND oi2.name = oi.name AND oi2.is_deleted = FALSE)) FILTER (WHERE oi.is_deleted = FALSE) as breakdown
        FROM order_items oi
        WHERE oi.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY oi.shift_id
    ),
    pc_aggregation AS (
        SELECT 
            pt.shift_id,
            SUM(CASE 
                WHEN pt.is_deleted = FALSE AND TRIM(LOWER(pt.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') THEN pt.amount 
                ELSE 0 
            END) as pc_non_cash
        FROM pc_transactions pt
        WHERE pt.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY pt.shift_id
    ),
    expense_aggregation AS (
        SELECT 
            e.shift_id,
            SUM(CASE WHEN e.is_deleted = FALSE THEN e.amount ELSE 0 END) as expenses
        FROM expenses e
        WHERE e.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY e.shift_id
    )
    SELECT 
        sr.id,
        sr.display_id,
        sr.staff_id,
        sr.staff_email,
        sr.shift_period,
        sr.start_time,
        sr.end_time,
        sr.pc_rental_total,
        sr.system_total,
        sr.denominations,
        COALESCE(ia.cash_sales, 0) as cash_sales,
        COALESCE(ia.digital_sales, 0) as digital_sales,
        COALESCE(ia.ar_sales, 0) as ar_sales,
        COALESCE(pa.pc_non_cash, 0) + COALESCE(ia.pc_oi_non_cash, 0) as pc_non_cash_sales,
        COALESCE(ia.ar_payments, 0) as ar_payments,
        COALESCE(ea.expenses, 0) + COALESCE(ia.item_expenses, 0) as expenses_total,
        COALESCE(ia.service_sales, 0) as service_sales_total,
        COALESCE(ia.breakdown, '{}'::JSONB) as service_breakdown
    FROM shift_records sr
    LEFT JOIN item_aggregation ia ON sr.id = ia.shift_id
    LEFT JOIN pc_aggregation pa ON sr.id = pa.shift_id
    LEFT JOIN expense_aggregation ea ON sr.id = ea.shift_id
    ORDER BY sr.start_time DESC;
END;
$$;

-- Atomic sequential ID generator (SECURITY DEFINER bypasses RLS on counters)
DROP FUNCTION IF EXISTS get_next_sequence_batch(text, integer);
CREATE OR REPLACE FUNCTION get_next_sequence_batch(p_counter_id TEXT, p_count INT DEFAULT 1)
RETURNS TABLE (new_prefix TEXT, first_val BIGINT, current_padding INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix    TEXT;
    v_current   BIGINT;
    v_padding   INTEGER;
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

-- Auto-assign staff_id to new profiles on insert
CREATE OR REPLACE FUNCTION assign_profile_staff_id()
RETURNS TRIGGER AS $$
DECLARE v_new_id TEXT;
BEGIN
    IF NEW.staff_id IS NULL OR NEW.staff_id = '' THEN
        SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
        INTO v_new_id
        FROM get_next_sequence_batch('profiles', 1);
        NEW.staff_id := v_new_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_staff_id ON profiles;
CREATE TRIGGER trg_profile_staff_id
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION assign_profile_staff_id();

-- =============================================================================
-- 10. PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_id         ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shift_id            ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id       ON order_items(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_shift_id       ON order_items(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_items_timestamp      ON order_items(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_customer   ON pc_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_shift_id   ON pc_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_timestamp  ON pc_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id          ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_timestamp         ON expenses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_station_id        ON sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time          ON shifts(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_staff ON payroll_lines(staff_id);
CREATE INDEX IF NOT EXISTS idx_pls_line ON payroll_line_shifts(line_id);
CREATE INDEX IF NOT EXISTS idx_pls_run ON payroll_line_shifts(run_id);
CREATE INDEX IF NOT EXISTS idx_pls_shift ON payroll_line_shifts(shift_id);
CREATE INDEX IF NOT EXISTS idx_pd_line ON payroll_deductions(line_id);
CREATE INDEX IF NOT EXISTS idx_pd_run ON payroll_deductions(run_id);
CREATE INDEX IF NOT EXISTS idx_pa_line ON payroll_additions(line_id);
CREATE INDEX IF NOT EXISTS idx_pa_run ON payroll_additions(run_id);
CREATE INDEX IF NOT EXISTS idx_ps_run ON payroll_stubs(run_id);
CREATE INDEX IF NOT EXISTS idx_ps_staff ON payroll_stubs(staff_id);
CREATE INDEX IF NOT EXISTS idx_station_logs_station_id    ON station_logs(station_id);
CREATE INDEX IF NOT EXISTS idx_products_category          ON products(category);

-- =============================================================================
-- 11. ROW LEVEL SECURITY
--
-- Strategy: all authenticated users get full access to all tables.
-- Role-based access control (admin vs staff vs owner) is enforced at the
-- application layer. RLS here exists to block unauthenticated/anon access only.
-- Service role (used by migration scripts) bypasses RLS entirely.
-- =============================================================================

-- Helper macro: one-liner full-access policy per table.
-- Pattern: ALTER … ENABLE; DROP old policies; CREATE single ALL policy.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all" ON profiles;
CREATE POLICY "profiles_all" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters_all" ON counters;
CREATE POLICY "counters_all" ON counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_all" ON customers;
CREATE POLICY "customers_all" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_all" ON settings;
CREATE POLICY "settings_all" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE app_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_status_all" ON app_status;
CREATE POLICY "app_status_all" ON app_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_stats_all" ON daily_stats;
CREATE POLICY "daily_stats_all" ON daily_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shifts_all" ON shifts;
CREATE POLICY "shifts_all" ON shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_templates_all" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_select" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_insert" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_update" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_delete" ON shift_templates;
CREATE POLICY "shift_templates_all" ON shift_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_all" ON schedules;
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;
CREATE POLICY "schedules_all" ON schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_logs_all" ON payroll_logs;
CREATE POLICY "payroll_logs_all" ON payroll_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_runs_all" ON payroll_runs;
CREATE POLICY "payroll_runs_all" ON payroll_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_lines_all" ON payroll_lines;
CREATE POLICY "payroll_lines_all" ON payroll_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_line_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_line_shifts_all" ON payroll_line_shifts;
CREATE POLICY "payroll_line_shifts_all" ON payroll_line_shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_deductions_all" ON payroll_deductions;
CREATE POLICY "payroll_deductions_all" ON payroll_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_additions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_additions_all" ON payroll_additions;
CREATE POLICY "payroll_additions_all" ON payroll_additions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payroll_stubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_stubs_all" ON payroll_stubs;
CREATE POLICY "payroll_stubs_all" ON payroll_stubs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zones_all" ON zones;
CREATE POLICY "zones_all" ON zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rates_all" ON rates;
CREATE POLICY "rates_all" ON rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "packages_all" ON packages;
CREATE POLICY "packages_all" ON packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stations_all" ON stations;
CREATE POLICY "stations_all" ON stations FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_all" ON sessions;
CREATE POLICY "sessions_all" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE station_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "station_logs_all" ON station_logs;
CREATE POLICY "station_logs_all" ON station_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_all" ON orders;
CREATE POLICY "orders_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_all" ON order_items;
CREATE POLICY "order_items_all" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE pc_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_transactions_all" ON pc_transactions;
CREATE POLICY "pc_transactions_all" ON pc_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_all" ON expenses;
CREATE POLICY "expenses_all" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_all" ON invoices;
CREATE POLICY "invoices_all" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_logs_all" ON inventory_logs;
CREATE POLICY "inventory_logs_all" ON inventory_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE drawer_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drawer_logs_all" ON drawer_logs;
CREATE POLICY "drawer_logs_all" ON drawer_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Assets Storage Bucket (Admin Uploads)
-- Policies on storage.objects for the 'assets' bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'assets' );

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'assets' AND auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update" ON storage.objects FOR UPDATE USING ( bucket_id = 'assets' AND auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete" ON storage.objects FOR DELETE USING ( bucket_id = 'assets' AND auth.role() = 'authenticated' );

-- =============================================================================
-- 12. REALTIME PUBLICATION
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'orders', 'order_items', 'pc_transactions', 'expenses', 'shifts',
        'settings', 'profiles', 'products', 'customers', 'invoices',
        'app_status', 'payroll_runs', 'payroll_lines', 'payroll_stubs'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 13. COUNTER SEEDS
-- Set current_value post-migration to max sequential number seen in imported data + 1.
-- These seeds are the floor values only — migration script will update them.
-- =============================================================================

INSERT INTO counters (id, current_value, prefix, padding)
VALUES
    ('shifts',          10000000, 'SH', 8),
    ('orders',          10000000, 'OR', 8),
    ('transactions',    10000000, 'TX', 8),
    ('order_items',     10000000, 'OI', 8),
    ('products',        10000000, 'PR', 8),
    ('expenses',        10000000, 'EX', 8),
    ('customers',       10000000, 'CU', 8),
    ('pc_transactions', 10000000, 'PX', 8),
    ('invoices',        10000000, 'IV', 8),
    ('payroll_runs',    10000000, 'PY', 8),
    ('profiles',        10000000, 'ST', 8)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 14. MANDATORY APP SEEDS
-- Initial rows for singleton tables required for app startup.
-- =============================================================================

INSERT INTO settings (id, store_name, logo_url, currency_symbol, tax_rate, receipt_footer)
VALUES ('config', 'Kunek', '', '₱', 0, 'Thank you for your business!')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_status (id)
VALUES ('current_shift')
ON CONFLICT (id) DO NOTHING;
