-- ============================================================================
-- FIX: Change payroll_lines.staff_id and payroll_stubs.staff_id to TEXT
-- ============================================================================
-- The shifts table stores staff_id as a sequential text ID (e.g. "ST-10000010"),
-- not a UUID. When a matching profile isn't found, we need to store the raw text.
-- This migration changes the column type from uuid to text.
-- ============================================================================

-- payroll_lines: staff_id uuid -> text
ALTER TABLE payroll_lines ALTER COLUMN staff_id TYPE text USING staff_id::text;

-- payroll_stubs: staff_id uuid -> text
ALTER TABLE payroll_stubs ALTER COLUMN staff_id TYPE text USING staff_id::text;

-- Done. Re-verify:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name IN ('payroll_lines', 'payroll_stubs') AND column_name = 'staff_id';
