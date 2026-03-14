-- perform_checkout.sql
-- Consolidates multiple DB calls into a single atomic transaction.
-- Handles: Customer creation, Order generation, Item insertion, Stock deduction, and Invoice creation.

CREATE OR REPLACE FUNCTION perform_checkout(p_payload JSONB)
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
    v_invoice_id TEXT;
    v_item RECORD;
    v_inv_item RECORD;
    v_items_count INT;
    v_oi_ids TEXT[];
    v_oi_first_val BIGINT;
    v_oi_prefix TEXT;
    v_oi_padding INT;
    v_timestamp TIMESTAMPTZ := NOW();
    v_result JSONB;
BEGIN
    -- 1. Extract Shared Context
    v_staff_id := p_payload->>'staff_id';
    v_shift_id := p_payload->>'shift_id';
    v_payment_method := p_payload->>'payment_method';

    -- 2. Resolve/Create Customer
    IF (p_payload->'customer'->>'isNew')::BOOLEAN THEN
        -- Generate CU- ID
        SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
        INTO v_cust_id
        FROM get_next_sequence_batch('customers', 1);

        INSERT INTO customers (id, full_name, created_at)
        VALUES (v_cust_id, p_payload->'customer'->>'fullName', v_timestamp);
    ELSE
        v_cust_id := p_payload->'customer'->>'id';
    END IF;

    -- 3. Generate Order ID (OR-)
    SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
    INTO v_order_id
    FROM get_next_sequence_batch('orders', 1);

    -- 4. Insert Order
    INSERT INTO orders (
        id, order_number, customer_id, 
        customer_name, customer_phone, customer_address, customer_tin,
        staff_id, staff_name, shift_id,
        subtotal, discount, total, amount_tendered, "change", payment_method,
        payment_details, invoice_status, status, timestamp, is_deleted
    ) VALUES (
        v_order_id,
        v_order_id,
        v_cust_id,
        p_payload->'customer'->>'fullName',
        p_payload->'customer'->>'phone',
        p_payload->'customer'->>'address',
        p_payload->'customer'->>'tin',
        v_staff_id,
        p_payload->>'staff_name',
        v_shift_id,
        (p_payload->>'subtotal')::DECIMAL,
        COALESCE(p_payload->'discount', '{}'::jsonb),
        (p_payload->>'total')::DECIMAL,
        (p_payload->>'amount_tendered')::DECIMAL,
        (p_payload->>'change')::DECIMAL,
        v_payment_method,
        p_payload->'payment_details',
        CASE WHEN v_payment_method IN ('Charge', 'Pay Later') THEN 'UNPAID' ELSE 'PAID' END,
        'completed',
        v_timestamp,
        FALSE
    );

    -- 5. Process Order Items
    v_items_count := jsonb_array_length(p_payload->'items');
    
    -- Batch Get OI- IDs
    SELECT new_prefix, first_val, current_padding
    INTO v_oi_prefix, v_oi_first_val, v_oi_padding
    FROM get_next_sequence_batch('order_items', v_items_count);

    FOR i IN 0..(v_items_count - 1) LOOP
        v_item := NULL; -- Reset
        SELECT * INTO v_item FROM jsonb_to_record(p_payload->'items'->i) AS x(
            serviceId TEXT, name TEXT, price DECIMAL, costPrice DECIMAL, quantity INT,
            category TEXT, note TEXT, consumables JSONB, trackStock BOOLEAN
        );

        -- Insert Line Item
        INSERT INTO order_items (
            id, parent_order_id, product_id, name, price, cost_price,
            amount, quantity, staff_id, shift_id, customer_id,
            payment_method, category, financial_category,
            invoice_status, is_deleted, timestamp, metadata
        ) VALUES (
            v_oi_prefix || '-' || LPAD((v_oi_first_val + i)::text, v_oi_padding, '0'),
            v_order_id,
            v_item.serviceId,
            v_item.name,
            v_item.price,
            v_item.costPrice,
            v_item.price * v_item.quantity,
            v_item.quantity,
            v_staff_id,
            v_shift_id,
            v_cust_id,
            v_payment_method,
            COALESCE(v_item.category, 'Revenue'),
            'Revenue',
            CASE WHEN v_payment_method IN ('Charge', 'Pay Later') THEN 'UNPAID' ELSE 'PAID' END,
            FALSE,
            v_timestamp,
            jsonb_build_object(
                'note', v_item.note,
                'consumables', v_item.consumables,
                'paymentDetails', p_payload->'payment_details'
            )
        );

        -- Inventory Deduction (Main Item)
        IF v_item.trackStock AND v_item.serviceId IS NOT NULL THEN
            UPDATE products SET stock_count = stock_count - v_item.quantity WHERE id = v_item.serviceId;
        END IF;

        -- Inventory Deduction (Consumables)
        IF v_item.consumables IS NOT NULL AND jsonb_array_length(v_item.consumables) > 0 THEN
            FOR v_inv_item IN SELECT * FROM jsonb_to_recordset(v_item.consumables) AS y(itemId TEXT, qty DECIMAL) LOOP
                UPDATE products SET stock_count = stock_count - (v_inv_item.qty * v_item.quantity) WHERE id = v_inv_item.itemId;
            END LOOP;
        END IF;
    END LOOP;

    -- 6. Create Invoice if Charge
    IF v_payment_method = 'Charge' THEN
        SELECT (new_prefix || '-' || LPAD(first_val::text, current_padding, '0'))
        INTO v_invoice_id
        FROM get_next_sequence_batch('invoices', 1);

        INSERT INTO invoices (
            id, invoice_number, customer_id, subtotal, total, 
            amount_paid, balance, status, due_date, 
            shift_id, staff_id, created_at, items
        ) VALUES (
            v_invoice_id,
            v_invoice_id,
            v_cust_id,
            (p_payload->>'total')::DECIMAL,
            (p_payload->>'total')::DECIMAL,
            0,
            (p_payload->>'total')::DECIMAL,
            'unpaid',
            (p_payload->>'due_date')::TIMESTAMPTZ,
            v_shift_id,
            v_staff_id,
            v_timestamp,
            p_payload->'items' -- Store items snapshot in invoice too as per current invoiceService.js
        );
    END IF;

    -- Return the order id and number
    v_result := jsonb_build_object(
        'id', v_order_id,
        'order_number', v_order_id,
        'customer_id', v_cust_id
    );

    RETURN v_result;
END;
$$;
