-- Create a function to fetch combined transactions across multiple tables
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
