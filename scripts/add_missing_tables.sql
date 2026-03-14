-- Migration: Create missing tables for PC Timer + Scheduling features
-- Safe to run on existing databases — uses CREATE TABLE IF NOT EXISTS
-- Run this in your Supabase SQL Editor

-- ─── PC TIMER TABLES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INT DEFAULT 0,
    rate_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rates (
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

CREATE TABLE IF NOT EXISTS packages (
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

CREATE TABLE IF NOT EXISTS stations (
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

CREATE TABLE IF NOT EXISTS sessions (
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

CREATE TABLE IF NOT EXISTS station_logs (
    id TEXT PRIMARY KEY,
    station_id TEXT REFERENCES stations(id) ON DELETE CASCADE,
    session_id TEXT,
    event TEXT NOT NULL,
    severity TEXT,
    staff_id TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SCHEDULING TABLES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shift_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedules (
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
    shift_id TEXT REFERENCES shifts(id),
    covered_by_uid TEXT,
    covered_by_email TEXT,
    covered_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ANALYTICS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    sales DECIMAL(12, 2) DEFAULT 0,
    expenses DECIMAL(12, 2) DEFAULT 0,
    tx_count INT DEFAULT 0,
    breakdown JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS POLICIES ───────────────────────────────────────────────────────────

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zones_select" ON zones;
DROP POLICY IF EXISTS "zones_insert" ON zones;
DROP POLICY IF EXISTS "zones_update" ON zones;
DROP POLICY IF EXISTS "zones_delete" ON zones;
CREATE POLICY "zones_select" ON zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "zones_insert" ON zones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "zones_update" ON zones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "zones_delete" ON zones FOR DELETE TO authenticated USING (true);

ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rates_select" ON rates;
DROP POLICY IF EXISTS "rates_insert" ON rates;
DROP POLICY IF EXISTS "rates_update" ON rates;
DROP POLICY IF EXISTS "rates_delete" ON rates;
CREATE POLICY "rates_select" ON rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "rates_insert" ON rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rates_update" ON rates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "rates_delete" ON rates FOR DELETE TO authenticated USING (true);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "packages_select" ON packages;
DROP POLICY IF EXISTS "packages_insert" ON packages;
DROP POLICY IF EXISTS "packages_update" ON packages;
DROP POLICY IF EXISTS "packages_delete" ON packages;
CREATE POLICY "packages_select" ON packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "packages_insert" ON packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "packages_update" ON packages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "packages_delete" ON packages FOR DELETE TO authenticated USING (true);

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stations_select" ON stations;
DROP POLICY IF EXISTS "stations_insert" ON stations;
DROP POLICY IF EXISTS "stations_update" ON stations;
DROP POLICY IF EXISTS "stations_delete" ON stations;
CREATE POLICY "stations_select" ON stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "stations_insert" ON stations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "stations_update" ON stations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "stations_delete" ON stations FOR DELETE TO authenticated USING (true);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_select" ON sessions;
DROP POLICY IF EXISTS "sessions_insert" ON sessions;
DROP POLICY IF EXISTS "sessions_update" ON sessions;
DROP POLICY IF EXISTS "sessions_delete" ON sessions;
CREATE POLICY "sessions_select" ON sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sessions_insert" ON sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sessions_update" ON sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sessions_delete" ON sessions FOR DELETE TO authenticated USING (true);

ALTER TABLE station_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "station_logs_select" ON station_logs;
DROP POLICY IF EXISTS "station_logs_insert" ON station_logs;
CREATE POLICY "station_logs_select" ON station_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "station_logs_insert" ON station_logs FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_templates_select" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_insert" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_update" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_delete" ON shift_templates;
CREATE POLICY "shift_templates_select" ON shift_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_templates_insert" ON shift_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shift_templates_update" ON shift_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "shift_templates_delete" ON shift_templates FOR DELETE TO authenticated USING (true);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (true);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_stats_select" ON daily_stats;
DROP POLICY IF EXISTS "daily_stats_insert" ON daily_stats;
DROP POLICY IF EXISTS "daily_stats_update" ON daily_stats;
CREATE POLICY "daily_stats_select" ON daily_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "daily_stats_insert" ON daily_stats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "daily_stats_update" ON daily_stats FOR UPDATE TO authenticated USING (true);

-- ─── REALTIME PUBLICATION ───────────────────────────────────────────────────
-- Add new tables to realtime (safe, idempotent)
ALTER PUBLICATION supabase_realtime ADD TABLE zones;
ALTER PUBLICATION supabase_realtime ADD TABLE rates;
ALTER PUBLICATION supabase_realtime ADD TABLE packages;
ALTER PUBLICATION supabase_realtime ADD TABLE stations;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_templates;
