-- Script: bootstrap_profiles.sql
-- Description: Ensures all auth.users have a corresponding public.profiles entry with a sequential_id.
-- This is critical for the staff_id migration to succeed.

INSERT INTO public.profiles (id, email, full_name, role, sequential_id)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', email), 
    COALESCE((raw_user_meta_data->>'role')::user_role, 'staff'::user_role),
    'ST-' || LPAD(nextval('profiles_seq')::text, 12, '0') -- Assuming profiles_seq exists or we use a different approach
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- If profiles_seq doesn't exist, we can use a simpler approach for now
-- Let's check if we need to create the sequence or use the one from resequence_data.sql logic
