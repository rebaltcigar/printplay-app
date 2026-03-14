-- Create a function to fetch consolidated analytics data for a date range
CREATE OR REPLACE FUNCTION get_analytics_data(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    transactions JSONB,
    shifts JSONB,
    invoices JSONB,
    earliest_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Combined Transactions (Order Items + Pc Transactions + Expenses)
        (SELECT jsonb_agg(tx) FROM (
            SELECT 
                oi.id, 
                oi.name as item, 
                oi.price, 
                oi.quantity, 
                oi.amount as total, 
                oi.timestamp, 
                oi.financial_category as "financialCategory", 
                oi.is_deleted as "isDeleted", 
                oi.product_id as "serviceId", 
                oi.staff_id, 
                oi.shift_id,
                'pos' as source
            FROM order_items oi
            WHERE oi.timestamp BETWEEN p_start_time AND p_end_time
            
            UNION ALL

            SELECT 
                pt.id, 
                pt.type as item, 
                pt.amount as price, 
                1 as quantity, 
                pt.amount as total, 
                pt.timestamp, 
                pt.financial_category as "financialCategory", 
                pt.is_deleted as "isDeleted", 
                'pc-rental' as "serviceId", 
                pt.staff_id, 
                pt.shift_id,
                'pc' as source
            FROM pc_transactions pt
            WHERE pt.timestamp BETWEEN p_start_time AND p_end_time
            
            UNION ALL
            
            SELECT 
                e.id, 
                'Expenses' as item, 
                e.amount / NULLIF(e.quantity, 0) as price, 
                e.quantity, 
                e.amount as total, 
                e.timestamp, 
                e.financial_category as "financialCategory", 
                e.is_deleted as "isDeleted", 
                NULL as "serviceId", 
                e.staff_id, 
                e.shift_id,
                'expense' as source
            FROM expenses e
            WHERE e.timestamp BETWEEN p_start_time AND p_end_time
        ) tx) as transactions,
        
        -- Shift History
        (SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'startTime', s.start_time,
            'endTime', s.end_time,
            'pcRentalTotal', s.pc_rental_total,
            'staff_id', s.staff_id,
            'staff_email', p.email
        )) FROM shifts s 
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE s.start_time BETWEEN p_start_time AND p_end_time) as shifts,
        
        -- Invoices
        (SELECT jsonb_agg(inv) FROM (
            SELECT 
                i.id, 
                i.created_at as "createdAt", 
                i.id as "invoiceNumber", 
                i.amount_paid as "amountPaid", 
                i.total,
                i.balance,
                i.status,
                i.customer_id,
                c.full_name as "customerName"
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.created_at BETWEEN p_start_time AND p_end_time
        ) inv) as invoices,
        
        -- Earliest Date
        (SELECT MIN(timestamp) FROM order_items) as earliest_date;
END;
$$;
