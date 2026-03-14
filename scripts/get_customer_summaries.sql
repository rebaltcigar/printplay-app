-- Create a function to fetch lightweight customer summaries
CREATE OR REPLACE FUNCTION get_customer_summaries()
RETURNS TABLE (
    id TEXT,
    full_name TEXT,
    phone TEXT,
    outstanding_balance NUMERIC,
    total_orders INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.full_name,
        c.phone,
        COALESCE(c.outstanding_balance, 0) as outstanding_balance,
        COALESCE(c.total_orders, 0) as total_orders
    FROM customers c
    ORDER BY c.full_name ASC;
END;
$$;
