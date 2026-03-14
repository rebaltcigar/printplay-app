-- Migration: add cash_difference to shifts table
-- This stores the authoritative difference (onHand - expectedCash) at consolidation time.
-- NULL = not yet consolidated. Positive = overage. Negative = shortage.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS cash_difference NUMERIC;
