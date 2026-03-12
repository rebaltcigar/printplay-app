-- 1. Counters Table for sequential IDs
CREATE TABLE IF NOT EXISTS counters (
    id TEXT PRIMARY KEY,
    current_value BIGINT DEFAULT 0,
    prefix TEXT,
    padding INTEGER DEFAULT 12,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize counters with new 12-digit requirements
INSERT INTO counters (id, current_value, prefix, padding) 
VALUES 
    ('orders', 100000000000, 'OR', 12),
    ('transactions', 100000000000, 'TX', 12),
    ('expenses', 100000000000, 'EX', 12),
    ('customers', 100000000000, 'CU', 12),
    ('pc_transactions', 100000000000, 'PX', 12),
    ('invoices', 100000000000, 'IV', 12),
    ('shifts', 100000000000, 'SH', 12),
    ('payroll_runs', 100000000000, 'PY', 12),
    ('profiles', 100000000000, 'ST', 12)
ON CONFLICT (id) DO UPDATE SET 
    prefix = EXCLUDED.prefix,
    padding = EXCLUDED.padding;

-- 2. RPC to get a batch of sequential IDs atomically
CREATE OR REPLACE FUNCTION get_next_sequence_batch(p_counter_id TEXT, p_count INT DEFAULT 1)
RETURNS TABLE (new_prefix TEXT, first_val BIGINT, current_padding INTEGER) AS $$
DECLARE
    v_prefix TEXT;
    v_current BIGINT;
    v_padding INTEGER;
BEGIN
    UPDATE counters 
    SET current_value = current_value + p_count,
        updated_at = NOW()
    WHERE id = p_counter_id
    RETURNING prefix, current_value - p_count + 1, padding INTO v_prefix, v_current, v_padding;
    
    RETURN QUERY SELECT v_prefix, v_current, v_padding;
END;
$$ LANGUAGE plpgsql;

-- 3. Optimized Batch Inventory Deduction RPC
-- This takes a JSONB array of {id, qty} and processes all in one transaction
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
