-- Create 'assets' bucket if it doesn't exist (Supabase Storage)
-- Note: Bucket creation is usually done via API/Dashboard, but RLS is SQL.
-- This script focuses on the RLS policies for the 'assets' bucket.

-- 1. Ensure the bucket is public
-- UPDATE storage.buckets SET public = true WHERE id = 'assets';

-- 1. Allow public read access to 'assets' bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Access' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'assets' );
    END IF;
END $$;

-- 2. Allow authenticated users to upload to 'assets' bucket (Admin Uploads)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Upload' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'assets' AND auth.role() = 'authenticated' );
    END IF;
END $$;

-- 3. Allow authenticated users to update objects in 'assets' bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Update' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Authenticated Update" ON storage.objects FOR UPDATE USING ( bucket_id = 'assets' AND auth.role() = 'authenticated' );
    END IF;
END $$;

-- 4. Allow authenticated users to delete objects in 'assets' bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Delete' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Authenticated Delete" ON storage.objects FOR DELETE USING ( bucket_id = 'assets' AND auth.role() = 'authenticated' );
    END IF;
END $$;
