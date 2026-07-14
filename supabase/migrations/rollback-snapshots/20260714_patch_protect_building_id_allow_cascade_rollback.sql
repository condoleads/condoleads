-- Rollback for 20260714_patch_protect_building_id_allow_cascade.sql
-- Restores the original protect_building_id() body (no pg_trigger_depth() guard).
--
-- WARNING: after applying this rollback, the FK's SET NULL cascade will
-- again be blocked by the trigger's revert, producing 23503 errors on
-- any DELETE of a building that has listings. Use only if the patch
-- causes an unexpected problem.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_building_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.building_id IS NOT NULL AND NEW.building_id IS NULL THEN
    NEW.building_id = OLD.building_id;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
