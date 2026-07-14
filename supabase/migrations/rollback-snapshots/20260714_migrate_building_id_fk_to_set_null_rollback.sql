-- Rollback for 20260714_migrate_building_id_fk_to_set_null.sql
-- Restores ON DELETE CASCADE behaviour on mls_listings.building_id.
--
-- WARNING: after applying this rollback, deleting a building will destroy its listings.
-- Use only if the SET NULL migration causes an unexpected problem and needs to be reverted.

BEGIN;

ALTER TABLE public.mls_listings
  DROP CONSTRAINT mls_listings_building_id_fkey;

ALTER TABLE public.mls_listings
  ADD CONSTRAINT mls_listings_building_id_fkey
    FOREIGN KEY (building_id) REFERENCES buildings(id)
    ON DELETE CASCADE;

COMMIT;
