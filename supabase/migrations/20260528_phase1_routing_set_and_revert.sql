-- supabase/migrations/20260528_phase1_routing_set_and_revert.sql
--
-- W-TERRITORY-MASTER Phase 1: routing-set primitive + materialization +
-- revert of the v15 listing-level backfill.
--
-- Atomic. The apply-runner (scripts/apply-phase1-routing-set.js) wraps this
-- file in BEGIN/COMMIT, sets statement_timeout=0, captures snapshots
-- before, and runs smoke after. This file is the SQL artifact; the runner
-- is the control plane.
--
-- DO NOT RUN DIRECTLY. The apply-runner enforces required env vars
-- (DISABLE_STATEMENT_TIMEOUT=1, direct connection not pooler) and captures
-- rollback snapshots before applying.
--
-- Per CLAUDE.md:
--   * ASCII-only anchors. No em-dashes / smart-quotes / arrows.
--   * File is UTF-8 without BOM (the runner strips BOM defensively anyway).
--   * Verification ASSERTs use plpgsql ASSERT inside DO blocks; failure
--     raises an exception which causes the transaction to ROLLBACK.
--
-- Sections:
--   1. agent_property_access: relax slot constraint for distribution sets
--   2. mls_listings: add provenance columns + constraints + index
--   3. scope_specificity() helper
--   4. distribute_listings_at_geo(): property-type-aware, sticky, provenance
--   5. reroll_listings_at_floor(): inline pick, writes tenant_floor_pool.id
--   7.2. Pre-condition assert + Commercial pin (2 rows)
--   7.3. Revert condo + home cache to NULL
--   7.4. Re-materialize broadest -> most-specific (floor, muni, community)
--   V1-V8. Verification ASSERTs
-- =============================================================================


-- =============================================================================
-- 1. agent_property_access: relax slot constraint
-- =============================================================================

-- 1.1: Drop the over-restrictive per-(scope, geo) slot constraint.
DROP INDEX IF EXISTS public.uq_apa_active_slot;

-- 1.2: Replace with per-(agent, scope, geo) - same agent cannot double-up at
--      one (scope, geo); multiple agents CAN coexist (distribution-set primitive).
CREATE UNIQUE INDEX uq_apa_active_slot_per_agent
  ON public.agent_property_access
    (tenant_id, agent_id, scope,
     COALESCE(area_id,         '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(municipality_id, '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(community_id,    '00000000-0000-0000-0000-000000000000'::uuid),
     COALESCE(neighbourhood_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;


-- =============================================================================
-- 2. mls_listings: add provenance columns + constraints
-- =============================================================================

ALTER TABLE public.mls_listings
  ADD COLUMN IF NOT EXISTS assigned_scope     text,
  ADD COLUMN IF NOT EXISTS assigned_source_id uuid;

ALTER TABLE public.mls_listings
  ADD CONSTRAINT mls_listings_assigned_scope_check
  CHECK (assigned_scope IS NULL
         OR assigned_scope IN ('pin','building','community','municipality','area','floor'));

ALTER TABLE public.mls_listings
  ADD CONSTRAINT mls_listings_assigned_coupled_check
  CHECK ((assigned_agent_id IS NULL AND assigned_scope IS NULL)
         OR (assigned_agent_id IS NOT NULL AND assigned_scope IS NOT NULL))
  NOT VALID;

COMMENT ON COLUMN public.mls_listings.assigned_scope IS
  'v16: scope-level that produced assigned_agent_id. Sticky-precedence guard: a distribution at scope X overwrites only rows whose current scope is X-or-broader. Order: pin > building > community > municipality > area > floor.';

COMMENT ON COLUMN public.mls_listings.assigned_source_id IS
  'v16: id of the source row that produced the pick. scope IN (community,municipality,area) -> agent_property_access.id. scope=floor -> tenant_floor_pool.id. scope IN (pin,building) -> not yet wired in Phase 1.';

CREATE INDEX IF NOT EXISTS idx_mls_listings_assigned_scope
  ON public.mls_listings(assigned_scope)
  WHERE assigned_scope IS NOT NULL;


-- =============================================================================
-- 3. Helper: scope_specificity(text) -> int
-- =============================================================================

CREATE OR REPLACE FUNCTION public.scope_specificity(p_scope text)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_scope
    WHEN 'pin'          THEN 6
    WHEN 'building'     THEN 5
    WHEN 'community'    THEN 4
    WHEN 'municipality' THEN 3
    WHEN 'area'         THEN 2
    WHEN 'floor'        THEN 1
    ELSE 0
  END;
$$;


-- =============================================================================
-- 4. distribute_listings_at_geo: replace 3-arg form with 4-arg property-type-aware form
-- =============================================================================

-- 4.0: Drop the existing 3-arg overload. Re-verified safe: cold-start probe
-- found NO callers of this function outside the apply-runner (it is operator-
-- triggered only; the resolver chain does not invoke it).
DROP FUNCTION IF EXISTS public.distribute_listings_at_geo(text, uuid, uuid);

-- 4.1: New 4-arg signature. Hash-RR pick across apa rows at this (scope, geo,
-- tenant, property-type) tuple. Sticky-precedence guard: only touches rows
-- whose current assigned_scope is broader-than-this-call (or NULL). Writes
-- provenance (assigned_scope + assigned_source_id = apa.id).
CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(
  p_scope         text,
  p_scope_id      uuid,
  p_tenant_id     uuid,
  p_property_type text
) RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count             int := 0;
  v_total             int := 0;
  v_pt_filter         text;
  v_call_scope_level  int;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF p_scope NOT IN ('area','municipality','community') THEN RETURN 0; END IF;
  IF p_property_type NOT IN ('condo','home') THEN RETURN 0; END IF;

  v_pt_filter := CASE p_property_type
                   WHEN 'condo' THEN 'Residential Condo & Other'
                   WHEN 'home'  THEN 'Residential Freehold'
                 END;
  v_call_scope_level := public.scope_specificity(p_scope);

  -- Eligible apa rows for this (scope, geo, tenant, property-type).
  SELECT COUNT(*) INTO v_total
  FROM public.agent_property_access apa
  WHERE apa.scope = p_scope
    AND apa.tenant_id = p_tenant_id
    AND apa.is_active = true
    AND (
      (p_scope = 'area'         AND apa.area_id         = p_scope_id) OR
      (p_scope = 'municipality' AND apa.municipality_id = p_scope_id) OR
      (p_scope = 'community'    AND apa.community_id    = p_scope_id)
    )
    AND (
      (p_property_type = 'condo' AND apa.condo_access = true) OR
      (p_property_type = 'home'  AND apa.homes_access = true)
    );

  IF v_total = 0 THEN RETURN 0; END IF;

  WITH routing AS (
    SELECT apa.id AS apa_id,
           apa.agent_id,
           (ROW_NUMBER() OVER (ORDER BY apa.id) - 1) AS rn
    FROM public.agent_property_access apa
    WHERE apa.scope = p_scope
      AND apa.tenant_id = p_tenant_id
      AND apa.is_active = true
      AND (
        (p_scope = 'area'         AND apa.area_id         = p_scope_id) OR
        (p_scope = 'municipality' AND apa.municipality_id = p_scope_id) OR
        (p_scope = 'community'    AND apa.community_id    = p_scope_id)
      )
      AND (
        (p_property_type = 'condo' AND apa.condo_access = true) OR
        (p_property_type = 'home'  AND apa.homes_access = true)
      )
  ),
  picks AS (
    SELECT ml.id        AS listing_id,
           r.agent_id   AS new_agent,
           r.apa_id     AS new_source_id
    FROM public.mls_listings ml
    JOIN routing r
      ON r.rn = (abs(hashtext(ml.id::text)) % v_total)
    WHERE ml.property_type = v_pt_filter
      AND (ml.assigned_scope IS NULL
           OR public.scope_specificity(ml.assigned_scope) < v_call_scope_level)
      AND (
        (p_scope = 'area'         AND ml.area_id         = p_scope_id) OR
        (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
        (p_scope = 'community'    AND ml.community_id    = p_scope_id)
      )
  ),
  updated AS (
    UPDATE public.mls_listings ml
    SET assigned_agent_id  = picks.new_agent,
        assigned_scope     = p_scope,
        assigned_source_id = picks.new_source_id
    FROM picks
    WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;


-- =============================================================================
-- 5. reroll_listings_at_floor: inline pick, writes tenant_floor_pool.id
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reroll_listings_at_floor(
  p_tenant_id uuid,
  p_is_condo  boolean,
  p_is_home   boolean
) RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count     int := 0;
  v_total     int := 0;
  v_pt_filter text;
  v_pt_label  text;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF NOT (p_is_condo OR p_is_home) THEN RETURN 0; END IF;
  IF p_is_condo AND p_is_home THEN
    RAISE EXCEPTION 'reroll_listings_at_floor: call once per property type, not both at once';
  END IF;

  v_pt_filter := CASE WHEN p_is_condo THEN 'Residential Condo & Other'
                                       ELSE 'Residential Freehold' END;
  v_pt_label  := CASE WHEN p_is_condo THEN 'condo' ELSE 'home' END;

  -- Effective pool members for this property type (same filter as pick_floor_agent).
  SELECT COUNT(*) INTO v_total
  FROM public.tenant_floor_pool tfp
  JOIN public.agents a ON a.id = tfp.agent_id
  WHERE tfp.tenant_id = p_tenant_id
    AND tfp.is_active = true
    AND a.is_active = true
    AND a.is_selling = true
    AND (
      (p_is_condo = true AND tfp.condo_access = true) OR
      (p_is_home  = true AND tfp.homes_access = true)
    );

  IF v_total = 0 THEN
    INSERT INTO public.tenant_floor_alerts (tenant_id, property_type, listing_id, alert_type)
    VALUES (p_tenant_id, v_pt_label, NULL, 'empty_floor_pool');
    RETURN 0;
  END IF;

  -- Floor only fills uncached rows (assigned_scope IS NULL) - sticky guarantees
  -- it never overwrites a narrower scope.
  WITH eligible AS (
    SELECT tfp.id      AS tfp_id,
           tfp.agent_id,
           (ROW_NUMBER() OVER (ORDER BY tfp.agent_id) - 1) AS rn
    FROM public.tenant_floor_pool tfp
    JOIN public.agents a ON a.id = tfp.agent_id
    WHERE tfp.tenant_id = p_tenant_id
      AND tfp.is_active = true
      AND a.is_active = true
      AND a.is_selling = true
      AND (
        (p_is_condo = true AND tfp.condo_access = true) OR
        (p_is_home  = true AND tfp.homes_access = true)
      )
  ),
  picks AS (
    SELECT ml.id        AS listing_id,
           e.agent_id   AS new_agent,
           e.tfp_id     AS new_source_id
    FROM public.mls_listings ml
    JOIN eligible e
      ON e.rn = (abs(hashtext(ml.id::text)) % v_total)
    WHERE ml.assigned_scope IS NULL
      AND ml.property_type = v_pt_filter
  ),
  updated AS (
    UPDATE public.mls_listings ml
    SET assigned_agent_id  = picks.new_agent,
        assigned_scope     = 'floor',
        assigned_source_id = picks.new_source_id
    FROM picks
    WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;


-- =============================================================================
-- 7.2: Pre-condition assert + Commercial pin (Neo Smith @ Whitby muni)
-- =============================================================================

-- Pre-condition: exactly one apa row exists for Neo Smith @ Whitby muni.
-- If zero or more-than-one, the UPDATE below would silently mispick the source.
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM public.agent_property_access
    WHERE tenant_id       = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
      AND agent_id        = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid
      AND scope           = 'municipality'
      AND municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
      AND is_active = true
  ) = 1, 'Phase 1 §7.2 pre-condition: expected exactly 1 apa row for Neo Smith @ Whitby muni';
END $$;

-- Pin the 2 Commercial orphans: keep their current agent (Neo Smith), set
-- scope='municipality' and source_id to the exact Neo Smith muni apa.id.
UPDATE public.mls_listings
SET assigned_scope     = 'municipality',
    assigned_source_id = (
      SELECT id FROM public.agent_property_access
      WHERE tenant_id       = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
        AND agent_id        = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid
        AND scope           = 'municipality'
        AND municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
        AND is_active = true
    )
WHERE property_type = 'Commercial'
  AND assigned_agent_id IS NOT NULL;


-- =============================================================================
-- 7.3: Revert condo + home cache to NULL
-- =============================================================================

-- Commercial rows (pinned in 7.2) are explicitly excluded.
UPDATE public.mls_listings
SET assigned_agent_id  = NULL,
    assigned_scope     = NULL,
    assigned_source_id = NULL
WHERE assigned_agent_id IS NOT NULL
  AND property_type IN ('Residential Condo & Other','Residential Freehold');


-- =============================================================================
-- 7.4: Re-materialize broadest -> most-specific
--      (floor -> area -> municipality -> community)
-- =============================================================================

-- 7.4.A: Floor - WALLiam, once for condos, once for homes.
SELECT public.reroll_listings_at_floor(
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, true,  false);
SELECT public.reroll_listings_at_floor(
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, false, true);

-- 7.4.B: Area - zero area-scope apa rows today; no-op pass.

-- 7.4.C: Municipality - Whitby for WALLiam (Neo Smith primary).
SELECT public.distribute_listings_at_geo(
  'municipality', '70103aef-1b32-4939-9ff8-264e859a5587'::uuid,
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, 'condo');
SELECT public.distribute_listings_at_geo(
  'municipality', '70103aef-1b32-4939-9ff8-264e859a5587'::uuid,
  'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, 'home');

-- 7.4.D: Community - WALLiam's 11 community carves (King Shah primary).
DO $community_loop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT community_id FROM public.agent_property_access
    WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
      AND scope = 'community'
      AND is_active = true
      AND community_id IS NOT NULL
  LOOP
    PERFORM public.distribute_listings_at_geo(
      'community', r.community_id,
      'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, 'condo');
    PERFORM public.distribute_listings_at_geo(
      'community', r.community_id,
      'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid, 'home');
  END LOOP;
END $community_loop$;


-- =============================================================================
-- 7.5: Validate the coupled CHECK now that every row has scope populated.
--      Added NOT VALID in §2 so the migration's own writes are checked
--      without the constraint validating against the pre-population state.
-- =============================================================================
ALTER TABLE public.mls_listings
  VALIDATE CONSTRAINT mls_listings_assigned_coupled_check;


-- =============================================================================
-- VERIFICATION (V1-V8) - any ASSERT failure raises, transaction ROLLBACKs.
-- =============================================================================

-- V1: provenance columns + CHECK constraints exist.
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='mls_listings'
            AND column_name IN ('assigned_scope','assigned_source_id')) = 2,
    'V1a: expected 2 new mls_listings columns';
  ASSERT (SELECT COUNT(*) FROM pg_constraint
          WHERE conrelid='public.mls_listings'::regclass
            AND conname IN ('mls_listings_assigned_scope_check','mls_listings_assigned_coupled_check')) = 2,
    'V1b: expected both new CHECK constraints present';
END $$;

-- V2: slot-constraint swap completed.
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_indexes
                     WHERE schemaname='public' AND indexname='uq_apa_active_slot'),
    'V2a: old uq_apa_active_slot index still present (should be dropped)';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='uq_apa_active_slot_per_agent'),
    'V2b: new uq_apa_active_slot_per_agent index missing';
END $$;

-- V3: coupled-state invariant on mls_listings.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.mls_listings
   WHERE (assigned_agent_id IS NULL) <> (assigned_scope IS NULL);
  ASSERT v_n = 0, 'V3: ' || v_n || ' rows violate (assigned_agent_id NULL) <=> (assigned_scope NULL)';
END $$;

-- V7d (diagnostic): WALLiam floor pool covers both property types.
--      Runs BEFORE V4a so an empty pool for a property type produces a clear
--      message instead of V4a's cryptic "X rows still NULL" symptom.
DO $$
DECLARE v_condo_n bigint; v_home_n bigint;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE tfp.condo_access AND tfp.is_active AND a.is_active AND a.is_selling),
    COUNT(*) FILTER (WHERE tfp.homes_access AND tfp.is_active AND a.is_active AND a.is_selling)
  INTO v_condo_n, v_home_n
  FROM public.tenant_floor_pool tfp
  JOIN public.agents a ON a.id = tfp.agent_id
  WHERE tfp.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid;
  ASSERT v_condo_n > 0,
    'V7d: WALLiam floor pool has zero effective condo_access members - floor cannot cover condos';
  ASSERT v_home_n > 0,
    'V7d: WALLiam floor pool has zero effective homes_access members - floor cannot cover homes';
END $$;

-- V4a (PRIMARY): zero NULLs in condo+home after floor re-materialize.
--      Floor catches everything for these two property types; any residual
--      NULL is a bug.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.mls_listings
   WHERE assigned_agent_id IS NULL
     AND property_type IN ('Residential Condo & Other','Residential Freehold');
  ASSERT v_n = 0,
    'V4a (PRIMARY): ' || v_n || ' condo/home rows still NULL after floor re-materialize';
END $$;

-- V4b: relational invariant - no hardcoded count.
--      filled total = (all condo+home rows) + (commercial rows with agent NOT NULL).
--      Tests the model: every condo/home gets re-materialized; every
--      commercial with a pre-state agent is pinned; nothing else is touched.
DO $$
DECLARE v_filled bigint; v_condo_home bigint; v_commercial_filled bigint; v_expected bigint;
BEGIN
  SELECT COUNT(*) INTO v_filled FROM public.mls_listings
   WHERE assigned_agent_id IS NOT NULL;

  SELECT COUNT(*) INTO v_condo_home FROM public.mls_listings
   WHERE property_type IN ('Residential Condo & Other','Residential Freehold');

  SELECT COUNT(*) INTO v_commercial_filled FROM public.mls_listings
   WHERE property_type = 'Commercial' AND assigned_agent_id IS NOT NULL;

  v_expected := v_condo_home + v_commercial_filled;

  ASSERT v_filled = v_expected,
    'V4b relational invariant violated: filled=' || v_filled ||
    ', expected=(condo+home=' || v_condo_home ||
    ') + (commercial filled=' || v_commercial_filled ||
    ')=' || v_expected ||
    '. Mismatch of ' || (v_filled - v_expected) || '.';
END $$;

-- V4c: re-check coupled-state from the other direction (belt and suspenders).
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.mls_listings
   WHERE (assigned_agent_id IS NULL) <> (assigned_scope IS NULL);
  ASSERT v_n = 0, 'V4c: coupled-state invariant violated post-re-materialize';
END $$;

-- V5a: Whitby muni listings OUTSIDE community carves -> Neo Smith @ scope=municipality.
--      Vacuous against current data: King Shah's 11 community carves are
--      exhaustive of Whitby muni for condo/home listings (verified 2026-05-29),
--      so the target set is empty. V5a becomes load-bearing if the carve set
--      ever shrinks or new uncarved Whitby communities appear with listings.
--      When non-vacuous:
--        (a) every target-set row lands on Neo Smith @ scope='municipality'
--        (b) zero target-set rows landed on King Shah (wrong-direction precedence guard)
DO $$
DECLARE v_target bigint; v_match bigint; v_king_shah bigint;
BEGIN
  SELECT COUNT(*) INTO v_target FROM public.mls_listings ml
  WHERE ml.municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
    AND ml.property_type IN ('Residential Condo & Other','Residential Freehold')
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_property_access apa
      WHERE apa.tenant_id    = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
        AND apa.scope        = 'community'
        AND apa.is_active    = true
        AND apa.community_id IS NOT NULL
        AND apa.community_id = ml.community_id
    );

  IF v_target = 0 THEN
    RAISE NOTICE 'V5a vacuous: zero Whitby-muni-outside-carve condo/home listings in current data';
    RETURN;
  END IF;

  -- (a) positive boundary: every target-set row lands on Neo Smith @ scope='municipality'.
  SELECT COUNT(*) INTO v_match FROM public.mls_listings ml
  WHERE ml.municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
    AND ml.property_type IN ('Residential Condo & Other','Residential Freehold')
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_property_access apa
      WHERE apa.tenant_id    = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
        AND apa.scope        = 'community'
        AND apa.is_active    = true
        AND apa.community_id IS NOT NULL
        AND apa.community_id = ml.community_id
    )
    AND ml.assigned_agent_id = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid
    AND ml.assigned_scope    = 'municipality';
  ASSERT v_match = v_target,
    'V5a(a): target set has ' || v_target || ' rows but only ' || v_match || ' landed on Neo Smith @ scope=municipality';

  -- (b) negative boundary: zero target-set rows landed on King Shah.
  SELECT COUNT(*) INTO v_king_shah FROM public.mls_listings ml
  WHERE ml.municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'::uuid
    AND ml.property_type IN ('Residential Condo & Other','Residential Freehold')
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_property_access apa
      WHERE apa.tenant_id    = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
        AND apa.scope        = 'community'
        AND apa.is_active    = true
        AND apa.community_id IS NOT NULL
        AND apa.community_id = ml.community_id
    )
    AND ml.assigned_agent_id = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'::uuid;
  ASSERT v_king_shah = 0,
    'V5a(b): ' || v_king_shah || ' target-set rows landed on King Shah (community precedence wrongly captured a non-carved listing)';
END $$;

-- V5b: per-community correctness for King Shah's carves.
--      For each King Shah community apa row, every condo/home listing in
--      that community must route to King Shah at scope='community'.
--      Communities with zero condo/home listings pass vacuously (no
--      hardcoded count of 11). Uses IS DISTINCT FROM for NULL-safety.
DO $$
DECLARE r record; v_wrong bigint; v_total_wrong bigint := 0;
        v_first_bad_community uuid; v_first_bad_count bigint;
BEGIN
  FOR r IN
    SELECT community_id FROM public.agent_property_access
    WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid
      AND agent_id  = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'::uuid
      AND scope     = 'community'
      AND is_active = true
      AND community_id IS NOT NULL
  LOOP
    SELECT COUNT(*) INTO v_wrong FROM public.mls_listings ml
    WHERE ml.community_id = r.community_id
      AND ml.property_type IN ('Residential Condo & Other','Residential Freehold')
      AND (ml.assigned_agent_id IS DISTINCT FROM 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'::uuid
           OR ml.assigned_scope IS DISTINCT FROM 'community');
    IF v_wrong > 0 THEN
      v_total_wrong := v_total_wrong + v_wrong;
      IF v_first_bad_community IS NULL THEN
        v_first_bad_community := r.community_id;
        v_first_bad_count := v_wrong;
      END IF;
    END IF;
  END LOOP;

  ASSERT v_total_wrong = 0,
    'V5b: ' || v_total_wrong ||
    ' condo/home rows across King Shah carved communities have wrong agent or wrong scope.' ||
    ' First offending community=' || v_first_bad_community ||
    ' (' || v_first_bad_count || ' bad rows).';
END $$;

-- V5c: every commercial row with an agent has correct provenance.
--      Counts what is there; no hardcoded count of 2. Vacuously passes if no
--      commercials are filled (which would mean §7.2 had nothing to pin).
--      Asserts (scope='municipality' AND source_id NOT NULL) for all filled
--      commercial rows.
DO $$
DECLARE v_filled bigint; v_wrong bigint;
        v_first_bad_id uuid; v_first_bad_scope text; v_first_bad_source uuid;
BEGIN
  SELECT COUNT(*) INTO v_filled FROM public.mls_listings
   WHERE property_type = 'Commercial' AND assigned_agent_id IS NOT NULL;

  SELECT COUNT(*) INTO v_wrong FROM public.mls_listings
   WHERE property_type = 'Commercial'
     AND assigned_agent_id IS NOT NULL
     AND (assigned_scope IS DISTINCT FROM 'municipality'
          OR assigned_source_id IS NULL);

  IF v_wrong > 0 THEN
    SELECT id, assigned_scope, assigned_source_id
      INTO v_first_bad_id, v_first_bad_scope, v_first_bad_source
      FROM public.mls_listings
      WHERE property_type = 'Commercial'
        AND assigned_agent_id IS NOT NULL
        AND (assigned_scope IS DISTINCT FROM 'municipality'
             OR assigned_source_id IS NULL)
      LIMIT 1;
  END IF;

  ASSERT v_wrong = 0,
    'V5c: ' || v_wrong || ' of ' || v_filled ||
    ' filled Commercial rows have wrong scope or NULL source_id' ||
    ' (expected scope=municipality + non-null source_id).' ||
    ' First offending listing=' || v_first_bad_id ||
    ' scope=' || COALESCE(v_first_bad_scope, '(null)') ||
    ' source=' || COALESCE(v_first_bad_source::text, '(null)') || '.';
END $$;

-- V6: cross-tenant isolation. Vacuous against aily until aily has routing
--     (see F-AILY-CROSS-TENANT-SMOKE-DEFERRED).
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.mls_listings ml
  JOIN public.agents a ON a.id = ml.assigned_agent_id
  WHERE a.tenant_id NOT IN (
    'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid,  -- WALLiam
    'e2619717-6401-4159-8d4c-d5f87651c8d6'::uuid   -- aily
  ) AND a.tenant_id IS NOT NULL;
  ASSERT v_n = 0, 'V6: cross-tenant leak - ' || v_n || ' listings routed to an unexpected tenant';
END $$;

-- V7: scope distribution sanity.
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM public.mls_listings WHERE assigned_scope = 'floor') > 1200000,
    'V7a: floor-scope count below expected lower bound (1,200,000)';
  ASSERT (SELECT COUNT(*) FROM public.mls_listings WHERE assigned_scope = 'community') > 0,
    'V7b: zero community-scope rows after re-materialize';
  ASSERT (SELECT COUNT(*) FROM public.mls_listings WHERE assigned_scope = 'municipality') > 0,
    'V7c: zero municipality-scope rows after re-materialize';
END $$;

-- V8: no empty_floor_pool alerts fired during this transaction.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.tenant_floor_alerts
   WHERE alert_type = 'empty_floor_pool'
     AND created_at > now() - interval '1 hour';
  ASSERT v_n = 0, 'V8: ' || v_n || ' empty_floor_pool alerts fired during the migration window';
END $$;

-- End of Phase 1 SQL. The apply-runner COMMITs if execution reached here
-- without raising; otherwise ROLLBACKs on the propagated exception.
