-- Migration: Add missing columns for Force End Shift and audit trail
-- Run this in your Supabase SQL Editor

-- 1. Add forced end metadata to shifts
ALTER TABLE shifts 
ADD COLUMN IF NOT EXISTS forced_end_by TEXT,
ADD COLUMN IF NOT EXISTS forced_end_reason TEXT;

-- 2. Add termination metadata to app_status
ALTER TABLE app_status 
ADD COLUMN IF NOT EXISTS ended_by TEXT,
ADD COLUMN IF NOT EXISTS staff_email TEXT;

-- 3. Add staff_id to shifts if missing (used for ownership tracking)
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS staff_id TEXT;
