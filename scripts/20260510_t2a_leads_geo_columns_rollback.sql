-- W-LEADS-EMAIL T2a — manual rollback for typed origin geo columns
-- Drops in reverse order of creation. Safe to run if T2a needs to be undone.
-- Idempotent (uses IF EXISTS).

BEGIN;

DROP INDEX IF EXISTS idx_leads_neighbourhood_id;
DROP INDEX IF EXISTS idx_leads_community_id;
DROP INDEX IF EXISTS idx_leads_municipality_id;
DROP INDEX IF EXISTS idx_leads_area_id;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_neighbourhood_id_fkey;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_community_id_fkey;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_municipality_id_fkey;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_area_id_fkey;

ALTER TABLE leads DROP COLUMN IF EXISTS neighbourhood_id;
ALTER TABLE leads DROP COLUMN IF EXISTS community_id;
ALTER TABLE leads DROP COLUMN IF EXISTS municipality_id;
ALTER TABLE leads DROP COLUMN IF EXISTS area_id;

COMMIT;