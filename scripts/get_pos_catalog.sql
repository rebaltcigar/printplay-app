-- Create a function to fetch the POS catalog in a single call
CREATE OR REPLACE FUNCTION get_pos_catalog()
RETURNS TABLE (
    products JSONB,
    variants JSONB,
    expense_types JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Core Products (Active, not variants, not the Expenses category itself)
        (SELECT jsonb_agg(p) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id IS NULL 
              AND name != 'Expenses'
            ORDER BY sort_order ASC
        ) p) as products,
        
        -- Variants (Children of active products)
        (SELECT jsonb_agg(v) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id IS NOT NULL 
              AND parent_service_id != (SELECT id FROM products WHERE name = 'Expenses' LIMIT 1)
            ORDER BY sort_order ASC
        ) v) as variants,
        
        -- Expense Types (Children of 'Expenses')
        (SELECT jsonb_agg(e) FROM (
            SELECT * FROM products 
            WHERE active = true 
              AND parent_service_id = (SELECT id FROM products WHERE name = 'Expenses' LIMIT 1)
            ORDER BY name ASC
        ) e) as expense_types;
END;
$$;
