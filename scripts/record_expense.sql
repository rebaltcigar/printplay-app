-- Create a function to record an expense atomically
CREATE OR REPLACE FUNCTION record_expense(
    p_expense_type TEXT,
    p_amount NUMERIC,
    p_quantity NUMERIC,
    p_staff_id TEXT,
    p_shift_id TEXT,
    p_category TEXT, -- 'OPEX' or 'CAPEX'
    p_notes TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id TEXT;
BEGIN
    -- Generate sequential ID
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_new_id
    FROM get_next_sequence_batch('expenses', 1);

    INSERT INTO expenses (
        id,
        expense_type,
        amount,
        quantity,
        staff_id,
        shift_id,
        financial_category,
        notes,
        metadata,
        timestamp,
        is_deleted
    ) VALUES (
        v_new_id,
        p_expense_type,
        p_amount,
        p_quantity,
        p_staff_id,
        p_shift_id,
        p_category,
        p_notes,
        p_metadata,
        NOW(),
        false
    );

    RETURN v_new_id;
END;
$$;
