-- supabase/migrations/20260504_r2_4b_drop_is_admin.sql
-- W-ROLES-DELEGATION R2.4b — drop is_admin column.
--
-- Prerequisite: R2.4a code migration must have shipped first.
-- After R2.4a, no code reads is_admin; this migration drops the column.
-- Defensive: if any code path still reads it, this migration fails next deploy.

BEGIN;

-- Verify no triggers/functions reference is_admin (defense in depth)
DO $$
DECLARE
  ref_count INT;
BEGIN
  SELECT COUNT(*) INTO ref_count
  FROM pg_proc
  WHERE prosrc ILIKE '%is_admin%'
    AND pronamespace = 'public'::regnamespace;
  
  IF ref_count > 0 THEN
    RAISE NOTICE 'WARN: % function(s) reference is_admin in source. Review before drop.', ref_count;
  END IF;
END $$;

-- Drop the column
ALTER TABLE agents DROP COLUMN IF EXISTS is_admin;

COMMIT;
