-- Migrate mls_listings.building_id FK from ON DELETE CASCADE to ON DELETE SET NULL.
--
-- Rationale: enable safe deletion of buildings without destroying their listings.
-- Before: DELETE FROM buildings WHERE id=X → CASCADE destroys all its mls_listings rows
--         + cascading media + property_rooms + open_houses + agent_listing_assignments.
--         A single phantom-building delete could destroy 250k+ related rows permanently.
-- After : DELETE FROM buildings WHERE id=X → child listings' building_id becomes NULL.
--         Listings remain intact. Row-count invariant preserved.
--
-- Schema change only, no data rows are touched.
--
-- Interaction with trigger_protect_building_id (BEFORE UPDATE on mls_listings):
-- The FK's SET NULL cascade issues an internal UPDATE on the child rows. The trigger's
-- revert branch (OLD.building_id NOT NULL AND NEW.building_id IS NULL → NEW=OLD) would
-- normally block that UPDATE. Behaviour after this migration is verified end-to-end via
-- scratch-building test in the same session as the migration.

BEGIN;

ALTER TABLE public.mls_listings
  DROP CONSTRAINT mls_listings_building_id_fkey;

ALTER TABLE public.mls_listings
  ADD CONSTRAINT mls_listings_building_id_fkey
    FOREIGN KEY (building_id) REFERENCES buildings(id)
    ON DELETE SET NULL;

COMMIT;
