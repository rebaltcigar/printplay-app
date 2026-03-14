-- 3. Optimized Batch Inventory Restoration RPC
-- This takes a JSONB array of {id, qty} and increments stock in one transaction
-- Useful for voiding/reverting orders efficiently.
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
