-- Counter schema: table + RPCs required by the app and by alter_schema_v2.sql
-- Run this FIRST in Phase 1 (before alter_schema_v2.sql).
-- Does NOT seed counter values — that is handled by sequential_ids_and_optimization.sql
-- which runs LAST (after all data is migrated and resequenced).

-- 1. Counters table
CREATE TABLE IF NOT EXISTS counters (
    id TEXT PRIMARY KEY,
    current_value BIGINT DEFAULT 0,
    prefix TEXT,
    padding INTEGER DEFAULT 12,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters_all" ON counters;
CREATE POLICY "counters_all" ON counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Atomic sequential ID generator (SECURITY DEFINER bypasses RLS on counters)
DROP FUNCTION IF EXISTS get_next_sequence_batch(text, integer);
CREATE OR REPLACE FUNCTION get_next_sequence_batch(p_counter_id TEXT, p_count INT DEFAULT 1)
RETURNS TABLE (new_prefix TEXT, first_val BIGINT, current_padding INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT;
    v_current BIGINT;
    v_padding INTEGER;
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

-- 3. Atomic batch inventory deduction (used by checkout)
CREATE OR REPLACE FUNCTION batch_decrement_stock(p_items JSONB)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty DECIMAL)
    LOOP
        UPDATE products
        SET stock_count = stock_count - v_item.qty
        WHERE id = v_item.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Atomic batch inventory restock (used by order void/revert)
CREATE OR REPLACE FUNCTION batch_increment_stock(p_items JSONB)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, qty DECIMAL)
    LOOP
        UPDATE products
        SET stock_count = stock_count + v_item.qty
        WHERE id = v_item.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
