-- supabase/migrations/20260506_t2a_02_apa_is_primary.sql
-- W-TERRITORY/T2a step 2 of 4 — is_primary + 4 partial unique indexes + backfill.
--
-- DESIGN (W-TERRITORY OD-5 — display vs routing two-layer model):
--   `is_primary` flags which row of the routing set is the public-page face.
--   Exactly one is_primary=true allowed per (scope, scope_target, tenant_id),
--   enforced via partial unique indexes. Schema uses separate scope_id columns
--   per scope (area_id / municipality_id / community_id / neighbourhood_id),
--   so we ship 4 partial unique indexes — one per scope — instead of one
--   composite index over a synthetic scope_target_id.
--
-- BACKFILL:
--   For each unique (scope, scope_target_id, tenant_id) group, the earliest
--   row by created_at is marked is_primary=true (deterministic by-design).
--   With 1 existing row today, this is mechanical. Algorithm scales to any
--   future state.
--
-- IDEMPOTENCY:
--   ADD COLUMN guarded by information_schema check (DO block).
--   Backfill UPDATE is no-op on subsequent runs (only flips rows where false).
--   CREATE UNIQUE INDEX uses IF NOT EXISTS.
--
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS uniq_apa_primary_area;
--   DROP INDEX IF EXISTS uniq_apa_primary_muni;
--   DROP INDEX IF EXISTS uniq_apa_primary_community;
--   DROP INDEX IF EXISTS uniq_apa_primary_neighbourhood;
--   ALTER TABLE agent_property_access DROP COLUMN is_primary;
--
-- VERIFICATION (run after apply):
--   -- 1. Column exists with correct shape
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='agent_property_access'
--     AND column_name='is_primary';
--   -- Expected: boolean, NO, false
--
--   -- 2. All 4 partial unique indexes exist
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='agent_property_access'
--     AND indexname LIKE 'uniq_apa_primary%'
--   ORDER BY indexname;
--   -- Expected: 4 rows (area, muni, community, neighbourhood)
--
--   -- 3. Backfill landed (every group has exactly 1 primary)
--   SELECT scope,
--          COUNT(*) AS total_rows,
--          COUNT(*) FILTER (WHERE is_primary) AS primary_rows
--   FROM agent_property_access GROUP BY scope;
--   -- Expected: each row has primary_rows >= 1; index would block > 1 per group

BEGIN;

-- Step 1: add the column (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='agent_property_access'
      AND column_name='is_primary'
  ) THEN
    EXECUTE 'ALTER TABLE agent_property_access
             ADD COLUMN is_primary boolean NOT NULL DEFAULT false';
  END IF;
END $$;

-- Step 2: backfill — earliest row per (scope, scope_target, tenant_id) becomes primary.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        scope,
        CASE scope
          WHEN 'area'          THEN area_id
          WHEN 'municipality'  THEN municipality_id
          WHEN 'community'     THEN community_id
          WHEN 'neighbourhood' THEN neighbourhood_id
        END,
        tenant_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM agent_property_access
)
UPDATE agent_property_access apa
SET is_primary = true
FROM ranked
WHERE apa.id = ranked.id
  AND ranked.rn = 1
  AND apa.is_primary = false;  -- idempotent: don't re-flip already-primary rows

-- Step 3: partial unique indexes — one per scope.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_area
  ON agent_property_access (area_id, tenant_id)
  WHERE is_primary = true AND scope = 'area' AND area_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_muni
  ON agent_property_access (municipality_id, tenant_id)
  WHERE is_primary = true AND scope = 'municipality' AND municipality_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_community
  ON agent_property_access (community_id, tenant_id)
  WHERE is_primary = true AND scope = 'community' AND community_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_neighbourhood
  ON agent_property_access (neighbourhood_id, tenant_id)
  WHERE is_primary = true AND scope = 'neighbourhood' AND neighbourhood_id IS NOT NULL;

COMMIT;
