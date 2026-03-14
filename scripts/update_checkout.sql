-- update_checkout.sql
-- Atomic update for orders including item additions, modifications, and soft-deletes.

CREATE OR REPLACE FUNCTION update_checkout(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id TEXT;
    v_cust_id TEXT;
    v_staff_id TEXT;
    v_shift_id TEXT;
    v_payment_method TEXT;
    v_timestamp TIMESTAMPTZ := NOW();
    v_item RECORD;
    v_new_items_count INT := 0;
    v_new_oi_prefix TEXT;
    v_new_oi_first_val BIGINT;
    v_new_oi_padding INT;
    v_idx INT := 0;
    v_result JSONB;
BEGIN
    v_order_id := p_payload->>'order_id';
    v_staff_id := p_payload->>'staff_id';
    v_shift_id := p_payload->>'shift_id';
    v_payment_method := p_payload->>'payment_method';

    -- 1. Sync Customer/Order Details
    IF p_payload->'customer_details' IS NOT NULL THEN
        UPDATE orders SET
            customer_name = COALESCE(p_payload->'customer_details'->>'customer_name', customer_name),
            customer_phone = COALESCE(p_payload->'customer_details'->>'customer_phone', customer_phone),
            customer_address = COALESCE(p_payload->'customer_details'->>'customer_address', customer_address),
            customer_tin = COALESCE(p_payload->'customer_details'->>'customer_tin', customer_tin),
            updated_at = v_timestamp
        WHERE id = v_order_id;
    END IF;

    -- 2. Sync Order Totals/Payment
    UPDATE orders SET
        status = COALESCE(p_payload->>'status', status),
        payment_method = COALESCE(p_payload->>'payment_method', payment_method),
        amount_tendered = COALESCE((p_payload->>'amount_tendered')::DECIMAL, amount_tendered),
        "change" = COALESCE((p_payload->>'change')::DECIMAL, "change"),
        subtotal = COALESCE((p_payload->>'subtotal')::DECIMAL, subtotal),
        total = COALESCE((p_payload->>'total')::DECIMAL, total),
        updated_at = v_timestamp
    WHERE id = v_order_id;

    -- 3. Calculate how many NEW items we need IDs for
    IF p_payload->'items' IS NOT NULL THEN
        SELECT count(*) INTO v_new_items_count 
        FROM jsonb_to_recordset(p_payload->'items') AS x(operation TEXT) 
        WHERE x.operation = 'INSERT';
    END IF;

    IF v_new_items_count > 0 THEN
        SELECT new_prefix, first_val, current_padding
        INTO v_new_oi_prefix, v_new_oi_first_val, v_new_oi_padding
        FROM get_next_sequence_batch('order_items', v_new_items_count);
    END IF;

    -- 4. Process Item Operations
    IF p_payload->'items' IS NOT NULL THEN
        v_idx := 0;
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_payload->'items') AS x(
            id TEXT, operation TEXT, name TEXT, price DECIMAL, quantity INT, amount DECIMAL, 
            is_deleted BOOLEAN, product_id TEXT, track_stock BOOLEAN
        ) LOOP
            
            CASE v_item.operation
                WHEN 'INSERT' THEN
                    INSERT INTO order_items (
                        id, parent_order_id, product_id, name, price, 
                        amount, quantity, staff_id, shift_id,
                        payment_method, is_deleted, timestamp, is_edited, edited_by, edit_reason
                    ) VALUES (
                        v_new_oi_prefix || '-' || LPAD((v_new_oi_first_val + v_idx)::text, v_new_oi_padding, '0'),
                        v_order_id,
                        v_item.product_id,
                        v_item.name,
                        v_item.price,
                        v_item.amount,
                        v_item.quantity,
                        v_staff_id,
                        v_shift_id,
                        v_payment_method,
                        FALSE,
                        v_timestamp,
                        TRUE,
                        p_payload->>'edited_by',
                        p_payload->>'edit_reason'
                    );
                    
                    -- Stock deduction for new items
                    IF v_item.product_id IS NOT NULL THEN
                         UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.product_id;
                    END IF;
                    
                    v_idx := v_idx + 1;

                WHEN 'UPDATE' THEN
                    -- Note: Simple update of price/qty. We don't handle stock re-calculation here 
                    -- for performance unless explicitly requested. POS обычно handle это via delta.
                    UPDATE order_items SET
                        name = COALESCE(v_item.name, name),
                        price = COALESCE(v_item.price, price),
                        quantity = COALESCE(v_item.quantity, quantity),
                        amount = COALESCE(v_item.amount, amount),
                        is_edited = TRUE,
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id;

                WHEN 'DELETE' THEN
                    -- Soft delete and RESTORE stock
                    UPDATE order_items SET 
                        is_deleted = TRUE,
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id 
                    RETURNING product_id, quantity INTO v_item.product_id, v_item.quantity;

                    IF v_item.product_id IS NOT NULL THEN
                        UPDATE products SET stock_count = stock_count + v_item.quantity WHERE id = v_item.product_id;
                    END IF;

                WHEN 'SET' THEN
                    -- Explicitly set properties like is_deleted (useful for restoration)
                    UPDATE order_items SET 
                        is_deleted = COALESCE(v_item.is_deleted, is_deleted),
                        edited_by = p_payload->>'edited_by',
                        edit_reason = p_payload->>'edit_reason',
                        updated_at = v_timestamp
                    WHERE id = v_item.id
                    RETURNING product_id, quantity INTO v_item.product_id, v_item.quantity;

                    -- If restoring from deleted, deduct stock again
                    IF v_item.is_deleted = FALSE AND v_item.product_id IS NOT NULL THEN
                        UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.product_id;
                    END IF;

                ELSE
                    -- Do nothing
            END CASE;
        END LOOP;
    END IF;

    v_result := jsonb_build_object(
        'id', v_order_id,
        'status', 'success'
    );

    RETURN v_result;
END;
$$;
