-- Patch protect_building_id() to allow the FK's SET NULL cascade through,
-- while preserving accident-protection against direct user UPDATEs.
--
-- Context:
-- - mls_listings_building_id_fkey was migrated CASCADE → SET NULL in
--   20260714_migrate_building_id_fk_to_set_null.sql.
-- - The existing trigger silently reverts non-NULL → NULL on building_id.
--   This is the desired behavior for a direct `UPDATE mls_listings SET
--   building_id = NULL`, but it also blocks the FK's internal SET NULL
--   cascade when a parent building is DELETEd.
-- - The cascade UPDATE fires the trigger, gets reverted, and the FK check
--   then finds a dangling reference and raises 23503 foreign_key_violation,
--   rolling back the whole DELETE.
--
-- Fix: skip the revert when pg_trigger_depth() > 1.
--
-- Trigger depths on mls_listings today:
--   - Direct user `UPDATE mls_listings SET building_id=NULL`:
--       user stmt (depth 0) → protect_building_id fires (depth 1)
--   - FK SET NULL cascade from `DELETE FROM buildings`:
--       user stmt (depth 0) → FK's AFTER-DELETE trigger on buildings fires
--       (depth 1) → that trigger issues internal UPDATE on mls_listings →
--       protect_building_id fires (depth 2)
--
-- So `pg_trigger_depth() > 1` fires TRUE only in the cascade case,
-- preserving revert behavior for direct user statements.
--
-- This session audited every other trigger function in the DB and confirmed
-- NONE updates mls_listings.building_id, so the only path producing depth > 1
-- for this trigger today is the FK's own SET NULL cascade.
--
-- An earlier draft of this patch used `pg_trigger_depth() > 0` and was
-- observed empirically to allow direct user UPDATE nulls through (because
-- inside protect_building_id during a direct UPDATE, depth is already 1).
-- The `> 1` threshold was validated end-to-end in the same session.
--
-- If a future trigger is added that legitimately updates
-- mls_listings.building_id, that author must audit whether they want it to
-- bypass this protection.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_building_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- FK SET NULL cascade fires this trigger at depth 2 (user stmt → FK's
  -- AFTER-DELETE trigger on buildings → internal UPDATE on mls_listings →
  -- this trigger). Direct user UPDATE fires at depth 1. Allow the cascade
  -- through; revert direct nulls.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.building_id IS NOT NULL AND NEW.building_id IS NULL THEN
    NEW.building_id = OLD.building_id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
