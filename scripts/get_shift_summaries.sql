-- Create a function to get shift summaries with pre-aggregated data
DROP FUNCTION IF EXISTS get_shift_summaries(timestamptz, timestamptz, integer, integer);
CREATE OR REPLACE FUNCTION get_shift_summaries(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    display_id TEXT,
    staff_id TEXT,
    staff_email TEXT,
    shift_period TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    pc_rental_total NUMERIC,
    system_total_stored NUMERIC,
    denominations JSONB,
    cash_sales NUMERIC,
    digital_sales NUMERIC,
    ar_sales NUMERIC,
    pc_non_cash_sales NUMERIC,
    ar_payments NUMERIC,
    expenses_total NUMERIC,
    service_sales_total NUMERIC,
    service_breakdown JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH shift_records AS (
        SELECT 
            s.id,
            s.display_id,
            s.staff_id,
            s.shift_period,
            s.start_time,
            s.end_time,
            s.pc_rental_total,
            s.system_total,
            s.denominations,
            p.email as staff_email
        FROM shifts s
        LEFT JOIN profiles p ON s.staff_id = p.staff_id
        WHERE (p_start_time IS NULL OR s.start_time >= p_start_time)
          AND (p_end_time IS NULL OR s.start_time <= p_end_time)
        ORDER BY s.start_time DESC
        LIMIT p_limit
        OFFSET p_offset
    ),
    item_aggregation AS (
        SELECT 
            oi.shift_id,
            -- Sales: Revenue/Service items only (exclude payments and expenses)
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.name)) NOT IN ('ar payment', 'paid debt', 'expenses', 'new debt') 
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as service_sales,
            -- AR Payments: "Paid Debt" or "AR Payment"
            SUM(CASE 
                WHEN oi.is_deleted = false AND TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt') THEN oi.amount 
                ELSE 0 
            END) as ar_payments,
            -- Digital Sales: Any sale or payment made via digital methods
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card') 
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                )
                THEN oi.amount 
                ELSE 0 
            END) as digital_sales,
            -- AR Sales: Items charged to account
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) = 'charge' 
                AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL) 
                THEN oi.amount 
                ELSE 0 
            END) as ar_sales,
            -- Cash Sales: Used for Expected Cash (Sales + AR Payments paid in Cash)
            SUM(CASE 
                WHEN oi.is_deleted = false 
                AND TRIM(LOWER(oi.payment_method)) NOT IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') 
                AND (
                    TRIM(LOWER(oi.name)) IN ('ar payment', 'paid debt')
                    OR (
                        TRIM(LOWER(oi.name)) NOT IN ('expenses', 'new debt') 
                        AND (LOWER(oi.financial_category) IN ('sale', 'debit', 'revenue', 'service') OR oi.financial_category IS NULL)
                    )
                )
                THEN oi.amount 
                ELSE 0 
            END) as cash_sales,
            -- Expenses from order_items
            SUM(CASE 
                WHEN oi.is_deleted = false AND TRIM(LOWER(oi.name)) IN ('expenses', 'new debt') THEN oi.amount 
                ELSE 0 
            END) as item_expenses,
            jsonb_object_agg(oi.name, (SELECT SUM(amount) FROM order_items oi2 WHERE oi2.shift_id = oi.shift_id AND oi2.name = oi.name AND oi2.is_deleted = false)) FILTER (WHERE oi.is_deleted = false) as breakdown
        FROM order_items oi
        WHERE oi.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY oi.shift_id
    ),
    pc_aggregation AS (
        SELECT 
            pt.shift_id,
            SUM(CASE 
                WHEN pt.is_deleted = false AND TRIM(LOWER(pt.payment_method)) IN ('gcash', 'maya', 'bank transfer', 'card', 'charge') THEN pt.amount 
                ELSE 0 
            END) as pc_non_cash
        FROM pc_transactions pt
        WHERE pt.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY pt.shift_id
    ),
    expense_aggregation AS (
        SELECT 
            e.shift_id,
            SUM(CASE WHEN e.is_deleted = false THEN e.amount ELSE 0 END) as expenses
        FROM expenses e
        WHERE e.shift_id IN (SELECT sr.id FROM shift_records sr)
        GROUP BY e.shift_id
    )
    SELECT 
        sr.id,
        sr.display_id,
        sr.staff_id,
        sr.staff_email,
        sr.shift_period,
        sr.start_time,
        sr.end_time,
        sr.pc_rental_total,
        sr.system_total,
        sr.denominations,
        COALESCE(ia.cash_sales, 0) as cash_sales,
        COALESCE(ia.digital_sales, 0) as digital_sales,
        COALESCE(ia.ar_sales, 0) as ar_sales,
        COALESCE(pa.pc_non_cash, 0) as pc_non_cash_sales, -- Use proper name from RETURNS TABLE
        COALESCE(ia.ar_payments, 0) as ar_payments,
        COALESCE(ea.expenses, 0) + COALESCE(ia.item_expenses, 0) as expenses_total, -- Sum both sources
        COALESCE(ia.service_sales, 0) as service_sales_total,
        COALESCE(ia.breakdown, '{}'::jsonb) as service_breakdown
    FROM shift_records sr
    LEFT JOIN item_aggregation ia ON sr.id = ia.shift_id
    LEFT JOIN pc_aggregation pa ON sr.id = pa.shift_id
    LEFT JOIN expense_aggregation ea ON sr.id = ea.shift_id
    ORDER BY sr.start_time DESC;
END;
$$;
