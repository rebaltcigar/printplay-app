-- migration: resequence_data.sql
-- Description: Universal transition to 12-digit sequential Primary Keys across all core tables.
-- Handles configuration (Stations, Zones, Rates) and transactions (Orders, Invoices, Logs, Payroll).

-- [!] IMPORTANT: Back up your database before running this script.

DO $$ 
DECLARE 
    temp_row RECORD;
    idx BIGINT;
    r RECORD;
    new_id TEXT;
    prefix_val TEXT;
    v_counter_id TEXT;
    p RECORD;
    v_start_offset BIGINT := 10000000; -- 8-digit base: 10000000–99999999
    v_sort_col TEXT;
BEGIN
    -- 0. INITIALIZE COUNTERS
    CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        current_value BIGINT DEFAULT 10000000,
        prefix TEXT,
        padding INTEGER DEFAULT 8,
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Standardize counters table columns if needed
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='counters' AND column_name='table_name') THEN
        ALTER TABLE counters RENAME COLUMN table_name TO id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='counters' AND column_name='current_val') THEN
        ALTER TABLE counters RENAME COLUMN current_val TO current_value;
    END IF;

    -- Upsert all required counters
    -- Numeric-only tables have empty prefix, others have 2-character prefix
    INSERT INTO counters (id, current_value, prefix, padding) VALUES
        ('shifts',          v_start_offset, 'SH', 8),
        ('profiles',        v_start_offset, 'ST', 8),
        ('orders',          v_start_offset, 'OR', 8),
        ('transactions',    v_start_offset, 'TX', 8),
        ('invoices',        v_start_offset, 'IV', 8),
        ('expenses',        v_start_offset, 'EX', 8),
        ('pc_transactions', v_start_offset, 'PX', 8),
        ('sessions',        v_start_offset, 'SN', 8),
        ('payroll_runs',    v_start_offset, 'PY', 8),
        ('customers',       v_start_offset, 'CU', 8),
        ('drawer_logs',     v_start_offset, '',   8),
        ('paystubs',        v_start_offset, 'PS', 8),
        ('products',        v_start_offset, 'PR', 8),
        ('rates',           v_start_offset, '',   8),
        ('schedules',       v_start_offset, '',   8),
        ('shift_templates', v_start_offset, '',   8),
        ('stations',        v_start_offset, '',   8),
        ('zones',           v_start_offset, '',   8),
        ('station_logs',    v_start_offset, '',   8)
    ON CONFLICT (id) DO UPDATE SET 
        prefix = EXCLUDED.prefix, 
        padding = EXCLUDED.padding;

    -- Add padding column to tables if missing
    FOR temp_row IN (
        SELECT unnest(ARRAY[
            'shifts', 'profiles', 'orders', 'order_items', 'invoices', 
            'expenses', 'pc_transactions', 'sessions', 'payroll_runs', 
            'customers', 'drawer_logs', 'payroll_stubs', 'products', 
            'rates', 'schedules', 'shift_templates', 'stations', 
            'zones', 'station_logs'
        ]) as tname
    ) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = temp_row.tname) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS padding INTEGER DEFAULT 8', temp_row.tname);
        END IF;
    END LOOP;

    -- 1. DROP ALL FOREIGN KEY CONSTRAINTS (DYNAMIC)
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (
            -- Tables we are changing (incoming references to these tables should be dropped)
            ccu.table_name IN (
                'shifts', 'profiles', 'orders', 'order_items', 'invoices', 
                'expenses', 'pc_transactions', 'sessions', 'payroll_runs', 
                'customers', 'drawer_logs', 'payroll_stubs', 'products', 
                'rates', 'schedules', 'shift_templates', 'stations', 
                'zones', 'station_logs'
            )
            OR 
            -- Tables we are mutating (outgoing references from these tables should be dropped)
            -- [!] Exclude 'profiles' here to preserve auth.users link
            tc.table_name IN (
                'shifts', 'orders', 'order_items', 'invoices', 
                'expenses', 'pc_transactions', 'sessions', 'payroll_runs', 
                'customers', 'drawer_logs', 'payroll_stubs', 'products', 
                'rates', 'schedules', 'shift_templates', 'stations', 
                'zones', 'station_logs'
            )
        )
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
    END LOOP;

    -- 2. STANDARDIZE COLUMN NAMES
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='parent_order_id') THEN
        ALTER TABLE order_items RENAME COLUMN parent_order_id TO order_id;
    END IF;

    -- Standardize staff_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='staff_email') THEN
        ALTER TABLE sessions RENAME COLUMN staff_email TO staff_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drawer_logs' AND column_name='staff_email') THEN
        ALTER TABLE drawer_logs RENAME COLUMN staff_email TO staff_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='staff_email') THEN
        ALTER TABLE orders RENAME COLUMN staff_email TO staff_id;
    END IF;

    FOR temp_row IN (SELECT unnest(ARRAY['order_items', 'expenses', 'pc_transactions', 'invoices', 'inventory_logs', 'payroll_runs', 'payroll_lines', 'payroll_stubs']) as tname) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_email') THEN
            EXECUTE format('ALTER TABLE %I RENAME COLUMN staff_email TO staff_id', temp_row.tname);
        END IF;
    END LOOP;

    -- 3. SCALE COLUMN TYPES TO TEXT
    FOR temp_row IN (
        SELECT unnest(ARRAY[
            'shifts', 'orders', 'order_items', 'invoices', 
            'expenses', 'pc_transactions', 'sessions', 'payroll_runs', 
            'customers', 'drawer_logs', 'payroll_stubs', 'products', 
            'rates', 'schedules', 'shift_templates', 'stations', 
            'zones', 'station_logs', 'payroll_lines'
        ]) as tname
    ) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = temp_row.tname) THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN id TYPE TEXT', temp_row.tname);
        END IF;
    END LOOP;

    -- Scale FK columns
    FOR temp_row IN (
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE column_name IN (
            'shift_id', 'customer_id', 'order_id', 'staff_id', 
            'created_by', 'run_id', 'parent_service_id', 'zone_id', 
            'rate_id', 'station_id', 'session_id'
        )
        AND table_name IN (
            'orders', 'order_items', 'expenses', 'pc_transactions', 'sessions', 
            'invoices', 'payroll_runs', 'schedules', 'payroll_line_shifts', 
            'payroll_stubs', 'station_logs', 'stations', 'zones', 'products', 'inventory_logs'
        )
    ) LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT', temp_row.table_name, temp_row.column_name);
    END LOOP;

    -- 4. CREATE MAPPING TABLES
    CREATE TEMP TABLE shift_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE order_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE cust_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE sess_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE prod_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE zone_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE rate_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE stat_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE tpl_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE profile_map (old_id TEXT, new_id TEXT);
    CREATE TEMP TABLE payroll_run_map (old_id TEXT, new_id TEXT);

    -- 5. RE-SEQUENCE PROFILES (BASE FOR ALL STAFF REFERENCES)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sequential_id') THEN
        ALTER TABLE profiles ADD COLUMN sequential_id TEXT;
    END IF;

    v_sort_col := 'id';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'created_at') THEN v_sort_col := 'created_at'; END IF;
    
    idx := v_start_offset + 1;
    FOR p IN EXECUTE format('SELECT id FROM profiles ORDER BY %I ASC', v_sort_col) LOOP
        new_id := 'ST-' || LPAD(idx::text, 8, '0');
        UPDATE profiles SET sequential_id = new_id WHERE id = p.id;
        INSERT INTO profile_map VALUES (p.id::text, new_id);
        idx := idx + 1;
    END LOOP;
    UPDATE counters SET current_value = idx - 1 WHERE id = 'profiles';

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_sequential_id_key') THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_sequential_id_key UNIQUE (sequential_id);
    END IF;

    -- 6. RE-SEQUENCE ALL TABLES
    FOR temp_row IN (
        SELECT unnest(ARRAY[
            'shifts', 'customers', 'orders', 'products', 'rates', 
            'shift_templates', 'stations', 'zones', 'sessions', 
            'drawer_logs', 'payroll_stubs', 'payroll_runs', 
            'order_items', 'expenses', 'pc_transactions', 'invoices', 
            'station_logs', 'schedules'
        ]) as tname
    ) LOOP
        v_counter_id := temp_row.tname;
        IF temp_row.tname = 'order_items' THEN v_counter_id := 'transactions'; END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = temp_row.tname) THEN
            -- [!] AVOID COLLISIONS: Prefix all IDs to avoid unique constraint violations during re-sequencing
            EXECUTE format('UPDATE %I SET id = ''OLD-'' || id', temp_row.tname);
            
            SELECT prefix INTO prefix_val FROM counters WHERE id = v_counter_id;
            
            v_sort_col := 'id';
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = temp_row.tname AND column_name = 'timestamp') THEN v_sort_col := 'timestamp';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = temp_row.tname AND column_name = 'created_at') THEN v_sort_col := 'created_at';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = temp_row.tname AND column_name = 'start_time') THEN v_sort_col := 'start_time';
            END IF;

            idx := v_start_offset + 1;
            FOR r IN EXECUTE format('SELECT id FROM %I ORDER BY %I ASC', temp_row.tname, v_sort_col) LOOP
                new_id := CASE WHEN prefix_val = '' THEN LPAD(idx::text, 8, '0') ELSE prefix_val || '-' || LPAD(idx::text, 8, '0') END;
                
                -- Capture for mapping
                -- NOTE: r.id has been prefixed with 'OLD-' above, so strip it to get the original ID
                --       so that FK columns in other tables (which still hold the original ID) can match.
                CASE temp_row.tname
                    WHEN 'shifts' THEN INSERT INTO shift_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'orders' THEN INSERT INTO order_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'customers' THEN INSERT INTO cust_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'sessions' THEN INSERT INTO sess_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'products' THEN INSERT INTO prod_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'zones' THEN INSERT INTO zone_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'rates' THEN INSERT INTO rate_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'stations' THEN INSERT INTO stat_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'shift_templates' THEN INSERT INTO tpl_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    WHEN 'payroll_runs' THEN INSERT INTO payroll_run_map VALUES (REPLACE(r.id, 'OLD-', ''), new_id);
                    ELSE -- No specific map needed
                END CASE;

                EXECUTE format('UPDATE %I SET id = %L WHERE id = %L', temp_row.tname, new_id, r.id);
                idx := idx + 1;
            END LOOP;
            UPDATE counters SET current_value = idx - 1 WHERE id = v_counter_id;
        END IF;
    END LOOP;

    -- 7. UPDATE DISTRIBUTED REFERENCES
    -- Profiles (Staff) References
    FOR temp_row IN (SELECT table_name, column_name FROM information_schema.columns WHERE column_name IN ('staff_id', 'created_by') AND table_name IN ('orders', 'order_items', 'expenses', 'pc_transactions', 'sessions', 'invoices', 'inventory_logs', 'payroll_runs', 'payroll_line_items', 'paystubs', 'station_logs', 'drawer_logs')) LOOP
        EXECUTE format('UPDATE %I s SET %I = m.new_id FROM profile_map m WHERE s.%I = m.old_id', temp_row.table_name, temp_row.column_name, temp_row.column_name);
        -- Also handle email-based refs (staff_email stored in staff_id column after rename)
        EXECUTE format('UPDATE %I s SET %I = p.sequential_id FROM profiles p WHERE s.%I = p.email', temp_row.table_name, temp_row.column_name, temp_row.column_name);
    END LOOP;

    -- Payroll Run References (run_id in paystubs and payroll_line_items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'paystubs') THEN
        UPDATE paystubs s SET run_id = m.new_id FROM payroll_run_map m WHERE s.run_id = m.old_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_line_items') THEN
        UPDATE payroll_line_items s SET run_id = m.new_id FROM payroll_run_map m WHERE s.run_id = m.old_id;
    END IF;

    -- Shift References
    FOR temp_row IN (SELECT table_name FROM information_schema.columns WHERE column_name = 'shift_id' AND table_name != 'shifts') LOOP
        EXECUTE format('UPDATE %I s SET shift_id = m.new_id FROM shift_map m WHERE s.shift_id = m.old_id', temp_row.table_name);
    END LOOP;

    -- Order References
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        UPDATE order_items s SET order_id = m.new_id FROM order_map m WHERE s.order_id = m.old_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        UPDATE invoices s SET order_id = m.new_id FROM order_map m WHERE s.order_id = m.old_id;
    END IF;

    -- Customer References
    FOR temp_row IN (SELECT table_name FROM information_schema.columns WHERE column_name = 'customer_id' AND table_name != 'customers') LOOP
        EXECUTE format('UPDATE %I s SET customer_id = m.new_id FROM cust_map m WHERE s.customer_id = m.old_id', temp_row.table_name);
    END LOOP;

    -- Product Self-Reference (Variants)
    UPDATE products s SET parent_service_id = m.new_id FROM prod_map m WHERE s.parent_service_id = m.old_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_logs') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='product_id') THEN
            UPDATE inventory_logs s SET product_id = m.new_id FROM prod_map m WHERE s.product_id = m.old_id;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='item_id') THEN
            UPDATE inventory_logs s SET item_id = m.new_id FROM prod_map m WHERE s.item_id = m.old_id;
        END IF;
    END IF;

    -- PC System References
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stations') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zones') THEN
            UPDATE stations s SET zone_id = m.new_id FROM zone_map m WHERE s.zone_id = m.old_id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rates') THEN
            UPDATE stations s SET rate_id = m.new_id FROM rate_map m WHERE s.rate_id = m.old_id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
            UPDATE stations s SET current_session_id = m.new_id FROM sess_map m WHERE s.current_session_id = m.old_id;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zones') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rates') THEN
            UPDATE zones s SET rate_id = m.new_id FROM rate_map m WHERE s.rate_id = m.old_id;
        END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'station_logs') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stations') THEN
            UPDATE station_logs s SET station_id = m.new_id FROM stat_map m WHERE s.station_id = m.old_id;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
            UPDATE station_logs s SET session_id = m.new_id FROM sess_map m WHERE s.session_id = m.old_id;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stations') THEN
            UPDATE sessions s SET station_id = m.new_id FROM stat_map m WHERE s.station_id = m.old_id;
        END IF;
    END IF;

    -- [!] INTEGRITY CLEANUP: Clear orphans & 'unknown' staff
    FOR temp_row IN (SELECT unnest(ARRAY['orders', 'order_items', 'expenses', 'pc_transactions', 'sessions', 'invoices', 'inventory_logs', 'payroll_runs', 'payroll_line_items', 'paystubs', 'schedules', 'station_logs', 'drawer_logs', 'products', 'zones', 'stations']) as tname) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = temp_row.tname) THEN
            -- Staff Cleanup
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_id') THEN
                EXECUTE format('UPDATE %I SET staff_id = NULL WHERE staff_id NOT IN (SELECT sequential_id FROM profiles) AND staff_id IS NOT NULL', temp_row.tname);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='created_by') THEN
                EXECUTE format('UPDATE %I SET created_by = NULL WHERE created_by NOT IN (SELECT sequential_id FROM profiles) AND created_by IS NOT NULL', temp_row.tname);
            END IF;
            -- Shift Cleanup
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='shift_id') THEN
                EXECUTE format('DELETE FROM %I WHERE shift_id NOT IN (SELECT id FROM shifts) AND shift_id IS NOT NULL', temp_row.tname);
            END IF;
            -- Order Cleanup
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='order_id') THEN
                EXECUTE format('DELETE FROM %I WHERE order_id NOT IN (SELECT id FROM orders) AND order_id IS NOT NULL', temp_row.tname);
            END IF;
            -- Product Self-Reference Cleanup
            IF temp_row.tname = 'products' THEN
                UPDATE products SET parent_service_id = NULL WHERE parent_service_id NOT IN (SELECT id FROM products) AND parent_service_id IS NOT NULL;
            END IF;
            -- Rate Cleanup (Orphan rates in Zones/Stations)
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='rate_id') THEN
                EXECUTE format('UPDATE %I SET rate_id = NULL WHERE rate_id NOT IN (SELECT id FROM rates) AND rate_id IS NOT NULL', temp_row.tname);
            END IF;
            -- Zone Cleanup (Orphan zones in Stations)
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='zone_id') THEN
                EXECUTE format('UPDATE %I SET zone_id = NULL WHERE zone_id NOT IN (SELECT id FROM zones) AND zone_id IS NOT NULL', temp_row.tname);
            END IF;
            -- Station Cleanup (Orphan stations in Logs/Sessions)
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='station_id') THEN
                EXECUTE format('UPDATE %I SET station_id = NULL WHERE station_id NOT IN (SELECT id FROM stations) AND station_id IS NOT NULL', temp_row.tname);
            END IF;
        END IF;
    END LOOP;

    -- 8. RECREATE FOREIGN KEY CONSTRAINTS
    -- Core
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN
            ALTER TABLE orders ADD CONSTRAINT orders_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'staff_id') THEN
            ALTER TABLE orders ADD CONSTRAINT orders_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES profiles(sequential_id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
            ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
        END IF;
    END IF;
    
    -- Staff
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'staff_id') THEN
            ALTER TABLE sessions ADD CONSTRAINT sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES profiles(sequential_id);
        END IF;
    END IF;
    
    -- Products
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE products ADD CONSTRAINT products_parent_service_id_fkey FOREIGN KEY (parent_service_id) REFERENCES products(id);
    END IF;
    
    -- PC Management
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zones') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rates') THEN
            ALTER TABLE zones ADD CONSTRAINT zones_rate_id_fkey FOREIGN KEY (rate_id) REFERENCES rates(id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stations') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zones') THEN
            ALTER TABLE stations ADD CONSTRAINT stations_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES zones(id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rates') THEN
            ALTER TABLE stations ADD CONSTRAINT stations_rate_id_fkey FOREIGN KEY (rate_id) REFERENCES rates(id);
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'station_logs') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stations') THEN
            ALTER TABLE station_logs ADD CONSTRAINT station_logs_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
            ALTER TABLE station_logs ADD CONSTRAINT station_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id);
        END IF;
    END IF;

    -- DROP maps
    DROP TABLE shift_map; DROP TABLE order_map; DROP TABLE cust_map; DROP TABLE sess_map;
    DROP TABLE prod_map; DROP TABLE zone_map; DROP TABLE rate_map; DROP TABLE stat_map;
    DROP TABLE tpl_map; DROP TABLE profile_map; DROP TABLE payroll_run_map;

END $$;
