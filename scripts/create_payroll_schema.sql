-- ============================================================================
-- PAYROLL SYSTEM — COMPLETE SCHEMA REBUILD
-- ============================================================================
-- Branch: feature/payroll-process-update
-- Created: 2026-03-15
--
-- This script:
--   1. DROPS all existing payroll tables (no data migration)
--   2. CREATES the new payroll schema from scratch
--
-- Run this ONCE against your Supabase database.
-- ============================================================================

-- ─── STEP 1: DROP OLD TABLES ────────────────────────────────────────────────
-- Order matters: drop children before parents (FK constraints)

DROP TABLE IF EXISTS payroll_stubs CASCADE;
DROP TABLE IF EXISTS payroll_line_shifts CASCADE;
DROP TABLE IF EXISTS payroll_lines CASCADE;
DROP TABLE IF EXISTS payroll_runs CASCADE;
DROP TABLE IF EXISTS payroll_logs CASCADE;

-- ─── STEP 2: CREATE NEW TABLES ─────────────────────────────────────────────

-- ── payroll_runs ────────────────────────────────────────────────────────────
-- One record per payroll batch/run.
CREATE TABLE payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      text UNIQUE NOT NULL,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  pay_date        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'reviewed', 'approved', 'posted', 'voided')),
  totals          jsonb DEFAULT '{}'::jsonb,
  notes           text DEFAULT '',
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX idx_payroll_runs_period ON payroll_runs(period_start, period_end);

-- ── payroll_lines ───────────────────────────────────────────────────────────
-- One record per staff member per payroll run.
CREATE TABLE payroll_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id          uuid NOT NULL,
  staff_name        text NOT NULL,
  staff_email       text NOT NULL,
  rate              numeric NOT NULL DEFAULT 0,
  total_minutes     integer NOT NULL DEFAULT 0,
  total_hours       numeric GENERATED ALWAYS AS (ROUND(total_minutes / 60.0, 2)) STORED,
  gross             numeric NOT NULL DEFAULT 0,
  total_deductions  numeric NOT NULL DEFAULT 0,
  total_additions   numeric NOT NULL DEFAULT 0,
  net               numeric NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_payroll_lines_run ON payroll_lines(run_id);
CREATE INDEX idx_payroll_lines_staff ON payroll_lines(staff_id);

-- ── payroll_line_shifts ─────────────────────────────────────────────────────
-- Per-shift detail within a payroll line. Allows hour review/override.
CREATE TABLE payroll_line_shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id         uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id          uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  shift_id        text NOT NULL,            -- references shifts.id (text format like SH-xxx)
  original_start  timestamptz,
  original_end    timestamptz,              -- null if ongoing
  override_start  timestamptz,              -- null = use original
  override_end    timestamptz,              -- null = use original
  minutes_used    integer NOT NULL DEFAULT 0,
  excluded        boolean NOT NULL DEFAULT false,
  shortage        numeric NOT NULL DEFAULT 0,
  notes           text DEFAULT ''
);

CREATE INDEX idx_pls_line ON payroll_line_shifts(line_id);
CREATE INDEX idx_pls_run ON payroll_line_shifts(run_id);
CREATE INDEX idx_pls_shift ON payroll_line_shifts(shift_id);

-- ── payroll_deductions ──────────────────────────────────────────────────────
-- Itemized deductions per payroll line.
-- type: 'shortage' | 'advance' | 'manual' | 'other'
CREATE TABLE payroll_deductions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id       uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id        uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  type          text NOT NULL DEFAULT 'manual'
                  CHECK (type IN ('shortage', 'advance', 'manual', 'other')),
  label         text NOT NULL,
  amount        numeric NOT NULL DEFAULT 0,
  source_id     text,                       -- nullable — links to expense.id or shift.id
  auto_applied  boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_pd_line ON payroll_deductions(line_id);
CREATE INDEX idx_pd_run ON payroll_deductions(run_id);

-- ── payroll_additions ───────────────────────────────────────────────────────
-- Itemized additions/bonuses per payroll line.
-- type: 'bonus' | 'overtime' | 'allowance' | 'manual' | 'other'
CREATE TABLE payroll_additions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id       uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  run_id        uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  type          text NOT NULL DEFAULT 'manual'
                  CHECK (type IN ('bonus', 'overtime', 'allowance', 'manual', 'other')),
  label         text NOT NULL,
  amount        numeric NOT NULL DEFAULT 0,
  auto_applied  boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_pa_line ON payroll_additions(line_id);
CREATE INDEX idx_pa_run ON payroll_additions(run_id);

-- ── payroll_stubs ───────────────────────────────────────────────────────────
-- Generated pay slips — one per staff per posted run.
CREATE TABLE payroll_stubs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  line_id           uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  staff_id          uuid NOT NULL,
  staff_name        text NOT NULL,
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  pay_date          timestamptz NOT NULL,
  rate              numeric NOT NULL DEFAULT 0,
  total_hours       numeric NOT NULL DEFAULT 0,
  gross_pay         numeric NOT NULL DEFAULT 0,
  deductions        jsonb DEFAULT '[]'::jsonb,   -- [{type, label, amount}]
  additions         jsonb DEFAULT '[]'::jsonb,   -- [{type, label, amount}]
  total_deductions  numeric NOT NULL DEFAULT 0,
  total_additions   numeric NOT NULL DEFAULT 0,
  net_pay           numeric NOT NULL DEFAULT 0,
  shifts            jsonb DEFAULT '[]'::jsonb,   -- [{id, label, start, end, hours, pay}]
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_ps_run ON payroll_stubs(run_id);
CREATE INDEX idx_ps_staff ON payroll_stubs(staff_id);

-- ─── STEP 3: ENABLE RLS ────────────────────────────────────────────────────
-- Enable Row Level Security on all new tables.
-- Policies allow all operations for authenticated users (admin-only module).

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_line_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_additions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_stubs ENABLE ROW LEVEL SECURITY;

-- Broad admin access policies (payroll is admin-only)
CREATE POLICY "payroll_runs_all" ON payroll_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_lines_all" ON payroll_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_line_shifts_all" ON payroll_line_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_deductions_all" ON payroll_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_additions_all" ON payroll_additions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_stubs_all" ON payroll_stubs FOR ALL USING (true) WITH CHECK (true);

-- ─── DONE ───────────────────────────────────────────────────────────────────
-- Verify by running: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'payroll%';
