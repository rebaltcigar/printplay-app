-- Create a function to fetch all required data for POS initialization in one call
CREATE OR REPLACE FUNCTION get_pos_init_data()
RETURNS TABLE (
    app_status JSONB,
    active_shift JSONB,
    recent_transactions JSONB,
    stations JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status JSONB;
    v_active_shift_id TEXT;
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

    RETURN QUERY
    SELECT 
        v_status as app_status,
        
        -- Active Shift Details
        (SELECT jsonb_build_object(
            'id', s.id,
            'display_id', s.display_id,
            'staff_id', s.staff_id,
            'staff_email', p.email,
            'start_time', s.start_time,
            'pc_rental_total', s.pc_rental_total
        ) FROM shifts s 
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE s.id = v_active_shift_id) as active_shift,
        
        -- Recent Transactions (Order Items only for POS feed)
        (SELECT jsonb_agg(tx) FROM (
            SELECT 
                oi.id,
                oi.name as item,
                oi.amount,
                oi.quantity,
                oi.timestamp,
                oi.payment_method,
                oi.is_deleted,
                o.order_number,
                o.customer_name
            FROM order_items oi
            LEFT JOIN orders o ON oi.parent_order_id = o.id
            WHERE (v_active_shift_id IS NULL OR oi.shift_id = v_active_shift_id)
            ORDER BY oi.timestamp DESC
            LIMIT 20
        ) tx) as recent_transactions,
        
        -- Station List
        (SELECT jsonb_agg(st) FROM (
            SELECT id, agent_email, is_online, status, current_session_id
            FROM stations
            ORDER BY id ASC
        ) st) as stations;
END;
$$;
