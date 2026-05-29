-- supabase/migrations/20260528_phase1_down.sql
--
-- W-TERRITORY-MASTER Phase 1 DOWN migration.
--
-- Authored and reviewed BEFORE the Phase 1 up-migration applies, per GAP-3.
-- Use this when a regression surfaces AFTER the up-migration COMMITs (when
-- transactional rollback no longer applies).
--
-- OPERATOR RUNBOOK
--   This down-migration has TWO operator-side steps that the apply-runner
--   does NOT yet automate (write apply-phase1-down.js if/when needed):
--
--   STEP 1: Restore the two captured function bodies (the runner saved
--   them under supabase/migrations/rollback-snapshots/). Substitute
--   <TS> with the actual timestamp the runner reported on apply.
--
--     psql "$DATABASE_URL" -f supabase/migrations/rollback-snapshots/_phase1_distribute_listings_at_geo_<TS>.sql
--     psql "$DATABASE_URL" -f supabase/migrations/rollback-snapshots/_phase1_reroll_listings_at_floor_<TS>.sql
--
--   After STEP 1: both the OLD 3-arg distribute_listings_at_geo and the
--   NEW 4-arg form coexist (Postgres overloading). The OLD reroll body
--   replaces the NEW one in place (same signature).
--
--   STEP 2: Run this file:
--     psql "$DATABASE_URL" -f supabase/migrations/20260528_phase1_down.sql
--
--   STEP 3 (OPTIONAL - hard cache restore): see D.6 below.
--
-- =============================================================================

BEGIN;
SET LOCAL statement_timeout = 0;


-- =============================================================================
-- D.2: Drop the new 4-arg distribute_listings_at_geo overload.
-- After STEP 1 restored the OLD 3-arg form, this leaves only the OLD function.
-- =============================================================================

DROP FUNCTION IF EXISTS public.distribute_listings_at_geo(text, uuid, uuid, text);


-- =============================================================================
-- D.3: Drop the helper.
-- =============================================================================

DROP FUNCTION IF EXISTS public.scope_specificity(text);


-- =============================================================================
-- D.4: Drop provenance columns + constraints + index from mls_listings.
-- =============================================================================

DROP INDEX IF EXISTS public.idx_mls_listings_assigned_scope;

ALTER TABLE public.mls_listings DROP CONSTRAINT IF EXISTS mls_listings_assigned_coupled_check;
ALTER TABLE public.mls_listings DROP CONSTRAINT IF EXISTS mls_listings_assigned_scope_check;

ALTER TABLE public.mls_listings DROP COLUMN IF EXISTS assigned_source_id;
ALTER TABLE public.mls_listings DROP COLUMN IF EXISTS assigned_scope;


-- =============================================================================
-- D.5: Restore the old slot constraint.
--      Pre-check: refuses to silently destroy data - if multi-agent
--      (scope, geo) rows exist (Phase 1 may have added some), the operator
--      must explicitly delete or deactivate them first.
-- =============================================================================

DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM (
    SELECT tenant_id, scope,
           COALESCE(area_id::text,'')         || '|' ||
           COALESCE(municipality_id::text,'') || '|' ||
           COALESCE(community_id::text,'')    || '|' ||
           COALESCE(neighbourhood_id::text,'') AS geo_key
    FROM public.agent_property_access
    WHERE is_active = true
    GROUP BY tenant_id, scope, geo_key
    HAVING COUNT(DISTINCT agent_id) > 1
  ) sub;
  ASSERT v_n = 0,
    'D.5 pre-check: ' || v_n || ' multi-agent (scope, geo) rows present. Manually delete or set is_active=false on the extras before re-creating uq_apa_active_slot. Down-migration ABORTED.';
END $$;

DROP INDEX IF EXISTS public.uq_apa_active_slot_per_agent;
CREATE UNIQUE INDEX uq_apa_active_slot
  ON public.agent_property_access
    (tenant_id, scope,
     COALESCE(area_id,         '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(municipality_id, '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(community_id,    '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(neighbourhood_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;


-- =============================================================================
-- D.6: mls_listings cache restoration policy.
--
-- DEFAULT: leave assigned_agent_id at its post-Phase-1 (v16-correct) values.
-- Phase 2 reader-wiring has not shipped by the time a Phase 1 down-migration
-- would run, so the cache is correct-but-unread. No behavior regression from
-- leaving it.
--
-- HARD RESTORE (NOT RUN BY DEFAULT): if a byte-exact pre-Phase-1 state is
-- required (e.g., a diff test against the pre-Phase-1 baseline), restore
-- assigned_agent_id from the side table the apply-runner captured. Replace
-- <SNAPSHOT_TABLE> with the actual name the runner reported.
--
--   UPDATE public.mls_listings ml
--   SET assigned_agent_id = snap.assigned_agent_id
--   FROM public.<SNAPSHOT_TABLE> snap
--   WHERE ml.id = snap.id;
--   UPDATE public.mls_listings ml
--   SET assigned_agent_id = NULL
--   WHERE NOT EXISTS (SELECT 1 FROM public.<SNAPSHOT_TABLE> snap WHERE snap.id = ml.id)
--     AND ml.assigned_agent_id IS NOT NULL;
--
-- NOTE: by this point D.4 has already dropped assigned_scope and
-- assigned_source_id, so only assigned_agent_id can be restored. The
-- snapshot table itself was captured BEFORE Phase 1's column additions and
-- only contains (id, assigned_agent_id) - that is the irreversible loss
-- this down-migration accepts.
-- =============================================================================


COMMIT;
