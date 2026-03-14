-- Migration: Complete staff_email to staff_id rename for missed tables
-- Follows the pattern in resequence_data.sql

DO $$ 
DECLARE
    temp_row RECORD;
BEGIN
    -- 1. BOOTSTRAP PROFILES (Ensure all users have a profile and a sequential_id)
    -- This handles the case where profiles table is empty or missing entries for auth.users
    INSERT INTO public.profiles (id, email, full_name, role)
    SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email), 'staff'::user_role
    FROM auth.users
    WHERE id NOT IN (SELECT id FROM public.profiles)
    ON CONFLICT (id) DO NOTHING;

    -- Ensure sequential_id column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sequential_id') THEN
        ALTER TABLE profiles ADD COLUMN sequential_id TEXT;
    END IF;

    -- Populate missing sequential_ids for profiles
    FOR temp_row IN (SELECT id FROM profiles WHERE sequential_id IS NULL OR sequential_id = '') LOOP
        UPDATE profiles 
        SET sequential_id = 'ST-' || LPAD((row_number() OVER (ORDER BY created_at) + 100000000000)::text, 12, '0')
        WHERE id = temp_row.id;
    END LOOP;

    -- 2. ENSURE staff_id COLUMN EXISTS AND staff_email IS MIGRATED
    FOR temp_row IN (SELECT unnest(ARRAY['shifts', 'app_status', 'payroll_logs', 'schedules']) as tname) LOOP
        -- Case A: staff_email exists but staff_id does NOT exist -> Rename
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_email') 
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_id') THEN
            EXECUTE format('ALTER TABLE %I RENAME COLUMN staff_email TO staff_id', temp_row.tname);
        
        -- Case B: Both columns exist -> Copy values from email to id (mapped to profiles) then drop email
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_email') 
              AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=temp_row.tname AND column_name='staff_id') THEN
            
            -- First, update staff_id from staff_email where staff_id is empty or looks like an email
            EXECUTE format('UPDATE %I s SET staff_id = p.sequential_id FROM profiles p WHERE s.staff_email = p.email AND (s.staff_id IS NULL OR s.staff_id LIKE ''%%@%%'' OR s.staff_id = '''')', temp_row.tname);
            
            -- Then drop the redundant staff_email column
            EXECUTE format('ALTER TABLE %I DROP COLUMN staff_email', temp_row.tname);
        END IF;

        -- Ensure any existing staff_id that are emails are converted to sequential_id
        EXECUTE format('UPDATE %I s SET staff_id = p.sequential_id FROM profiles p WHERE s.staff_id = p.email', temp_row.tname);
    END LOOP;

    -- 3. CLEANUP (Set invalid refs to NULL if they don't exist in profiles)
    -- This MUST happen before adding FK constraints.
    FOR temp_row IN (SELECT unnest(ARRAY['shifts', 'app_status', 'payroll_logs', 'schedules']) as tname) LOOP
        -- Nullify anything that isn't a valid sequential_id
        EXECUTE format('UPDATE %I SET staff_id = NULL WHERE (staff_id = '''' OR staff_id IS NULL OR staff_id NOT IN (SELECT sequential_id FROM profiles))', temp_row.tname);
    END LOOP;

    -- 4. ADD FOREIGN KEY CONSTRAINTS (Standardize to profiles.sequential_id)
    -- shifts
    ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES profiles(sequential_id);
    END IF;

    -- app_status
    ALTER TABLE app_status DROP CONSTRAINT IF EXISTS app_status_staff_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_status') THEN
        ALTER TABLE app_status ADD CONSTRAINT app_status_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES profiles(sequential_id);
    END IF;

    -- schedules
    ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_staff_id_fkey;

END $$;
