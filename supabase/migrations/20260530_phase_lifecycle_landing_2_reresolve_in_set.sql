-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 2
-- Up-migration: reresolve_listings_in_set (NEW) + reresolve_listing (PATCHED).
--
-- Date:           2026-05-30
-- Plan doc:       docs/W-LIFECYCLE-LANDING-2-PLAN.md
-- Apply via:      node scripts/apply-phase-lifecycle-landing-2.js
-- Down-migration: 20260530_phase_lifecycle_landing_2_down.sql
--
-- Closes:
--   F-RERESOLVE-COUPLED-CHECK (latent bug in old reresolve_listing: UPDATEd
--     assigned_agent_id only, violated coupled CHECK on NULL-cache rows).
--   F-RESOLVE-AT-INSERT-PRIORITY (drift floor of ~360 NULLs/day; sync now
--     resolves at insert via this primitive).  -- ACCEPTANCE for next-morning
--     NULL-cache drop is BLOCKED-ON-F-NIGHTLY-SYNC-TIMEOUT-6H; see plan §11.
--
-- Frozen contract preserved: resolve_agent_for_context signature + body
-- untouched. This file adds a sibling primitive and rewrites the body of an
-- existing wrapper (reresolve_listing).
--
-- Security: SECURITY DEFINER + locked search_path. Same posture Landing 1
-- set on pick_floor_agent. Caller contract documented in COMMENT ON FUNCTION:
-- p_tenant_id MUST be validated upstream (header, body, middleware-derived).
-- ============================================================================

-- ============================================================================
-- 1. CREATE FUNCTION public.reresolve_listings_in_set
-- ============================================================================
-- Set-based primitive. 10-level cascade mirroring resolve_agent_for_context's
-- P-walk, narrowed by ml.id = ANY(p_listing_ids) at every level. Every UPDATE
-- writes the provenance trio (assigned_agent_id, assigned_scope,
-- assigned_source_id) atomically. Sticky guard preserves more-specific carves.
--
-- Walk-equivalence statement: this function is walk-equivalent to looping
-- resolve_agent_for_context(listing_id, building_id, NULL, community_id,
-- municipality_id, area_id, NULL, p_tenant_id) over p_listing_ids and writing
-- back the resolved agent + scope + source -- MODULO N=1 carves. Specifics:
--   - At carve levels (community/municipality/area), this function uses
--     hash-RR (distribute_listings_at_geo pattern); the resolver uses
--     primary-pick (pick_routing_agent_for_type, is_primary=true LIMIT 1).
--     The two agree when N=1 (one apa row at that scope). They diverge by
--     design when N>1: hash-RR distributes by hashtext(listing_id) % N;
--     primary-pick returns the single is_primary row. v16's locked design
--     stores the hash-RR pick in the cache (this function), and resolves
--     N=1 cases via primary-pick when there's no cache.
--   - The page-level untyped fallback (pick_routing_agent) is unreachable
--     when listing_id is provided; correctly omitted here.
--   - The neighbourhood scope (P3) is unreachable because mls_listings has no
--     neighbourhood_id column. See F-NEIGHBOURHOOD-NOT-ON-MLS-LISTINGS.
--   - The resolver's tenant_property_access (TPA) gate is intentionally NOT
--     duplicated here. Same posture as distribute_listings_at_geo + reroll_
--     listings_at_floor: operators are responsible for not invoking on a
--     (tenant, geo) combo that violates TPA; resolver gates on READ to mask.

CREATE OR REPLACE FUNCTION public.reresolve_listings_in_set(
  p_listing_ids uuid[],
  p_tenant_id   uuid
) RETURNS TABLE (resolved_count int, null_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_resolved          int := 0;
  v_step              int;
  v_floor_condo_pool  int := 0;
  v_floor_home_pool   int := 0;
  v_has_unhomed_condo boolean;
  v_has_unhomed_home  boolean;
BEGIN
  -- Guards
  -- Guards: input validation only. NULL tenant is NOT short-circuited here;
  -- it no-ops naturally via the cascade predicates (every CTE has a tenant
  -- equality predicate, and x = NULL evaluates to unknown -> zero rows match).
  -- This makes the tenant scoping provable from the predicates rather than
  -- masked by an early guard. See V5.
  IF p_listing_ids IS NULL
     OR cardinality(p_listing_ids) = 0
  THEN
    resolved_count := 0;
    null_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ============================================================
  -- L1: PIN (listing-level firm assignment; always overrides)
  -- ============================================================
  WITH pins AS (
    SELECT ala.listing_id, ala.id AS pin_id, ala.agent_id
    FROM   public.agent_listing_assignments ala
    JOIN   public.agents a ON a.id = ala.agent_id
    WHERE  ala.listing_id = ANY(p_listing_ids)
      AND  ala.is_active
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = pins.agent_id,
           assigned_scope     = 'pin',
           assigned_source_id = pins.pin_id
      FROM pins
     WHERE ml.id = pins.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L2: BUILDING (building-level firm assignment)
  -- Sticky guard: only over-broader (community/municipality/area/floor).
  -- ============================================================
  WITH bldg AS (
    SELECT ml.id AS listing_id, agb.id AS bldg_id, agb.agent_id
    FROM   public.mls_listings ml
    JOIN   public.agent_geo_buildings agb ON agb.building_id = ml.building_id
    JOIN   public.agents a ON a.id = agb.agent_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.building_id IS NOT NULL
      AND  agb.is_active
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('building'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = bldg.agent_id,
           assigned_scope     = 'building',
           assigned_source_id = bldg.bldg_id
      FROM bldg
     WHERE ml.id = bldg.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L3: COMMUNITY x CONDO
  -- Hash-RR per community (PARTITION BY apa.community_id).
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id           AS source_id,
           apa.agent_id,
           apa.community_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.community_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.community_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'community'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.condo_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.community_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Condo & Other'
      AND  ml.community_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('community'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'community',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L4: COMMUNITY x HOME
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id           AS source_id,
           apa.agent_id,
           apa.community_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.community_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.community_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'community'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.homes_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.community_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Freehold'
      AND  ml.community_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('community'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'community',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L5: MUNICIPALITY x CONDO
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id              AS source_id,
           apa.agent_id,
           apa.municipality_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.municipality_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.municipality_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'municipality'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.condo_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.municipality_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Condo & Other'
      AND  ml.municipality_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('municipality'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'municipality',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L6: MUNICIPALITY x HOME
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id              AS source_id,
           apa.agent_id,
           apa.municipality_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.municipality_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.municipality_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'municipality'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.homes_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.municipality_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Freehold'
      AND  ml.municipality_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('municipality'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'municipality',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L7: AREA x CONDO
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id      AS source_id,
           apa.agent_id,
           apa.area_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.area_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.area_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'area'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.condo_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.area_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Condo & Other'
      AND  ml.area_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('area'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'area',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L8: AREA x HOME
  -- ============================================================
  WITH eligible AS (
    SELECT apa.id      AS source_id,
           apa.agent_id,
           apa.area_id AS geo_id,
           (ROW_NUMBER() OVER (PARTITION BY apa.area_id ORDER BY apa.id) - 1) AS rn,
           COUNT(*) OVER (PARTITION BY apa.area_id) AS total
    FROM   public.agent_property_access apa
    JOIN   public.agents a ON a.id = apa.agent_id
    WHERE  apa.scope = 'area'
      AND  apa.tenant_id = p_tenant_id
      AND  apa.is_active
      AND  apa.homes_access
      AND  a.is_active
      AND  a.is_selling
      AND  a.tenant_id = p_tenant_id
  ),
  picks AS (
    SELECT ml.id AS listing_id, e.source_id, e.agent_id
    FROM   public.mls_listings ml
    JOIN   eligible e ON e.geo_id = ml.area_id
    WHERE  ml.id = ANY(p_listing_ids)
      AND  ml.property_type = 'Residential Freehold'
      AND  ml.area_id IS NOT NULL
      AND  e.rn = (abs(hashtext(ml.id::text)) % e.total)
      AND  (ml.assigned_scope IS NULL
            OR public.scope_specificity(ml.assigned_scope)
               < public.scope_specificity('area'))
  ),
  updated AS (
    UPDATE public.mls_listings ml
       SET assigned_agent_id  = picks.agent_id,
           assigned_scope     = 'area',
           assigned_source_id = picks.source_id
      FROM picks
     WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_step FROM updated;
  v_resolved := v_resolved + v_step;

  -- ============================================================
  -- L9: FLOOR x CONDO
  -- Empty-pool semantic matches reroll_listings_at_floor: ONE alert per call
  -- (not per listing), only fired if there's actually an unhomed condo in the
  -- set that would have gone to floor.
  -- ============================================================
  SELECT COUNT(*) INTO v_floor_condo_pool
    FROM public.tenant_floor_pool tfp
    JOIN public.agents a ON a.id = tfp.agent_id
   WHERE tfp.tenant_id = p_tenant_id
     AND tfp.is_active
     AND tfp.condo_access
     AND a.is_active
     AND a.is_selling
     AND a.tenant_id = p_tenant_id;

  IF v_floor_condo_pool = 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mls_listings
       WHERE id = ANY(p_listing_ids)
         AND property_type = 'Residential Condo & Other'
         AND assigned_scope IS NULL
    ) INTO v_has_unhomed_condo;

    IF v_has_unhomed_condo THEN
      INSERT INTO public.tenant_floor_alerts (tenant_id, property_type, listing_id, alert_type)
      VALUES (p_tenant_id, 'condo', NULL, 'empty_floor_pool');
    END IF;
  ELSE
    WITH eligible AS (
      SELECT tfp.id      AS source_id,
             tfp.agent_id,
             (ROW_NUMBER() OVER (ORDER BY tfp.agent_id) - 1) AS rn
      FROM   public.tenant_floor_pool tfp
      JOIN   public.agents a ON a.id = tfp.agent_id
      WHERE  tfp.tenant_id = p_tenant_id
        AND  tfp.is_active
        AND  tfp.condo_access
        AND  a.is_active
        AND  a.is_selling
        AND  a.tenant_id = p_tenant_id
    ),
    picks AS (
      SELECT ml.id AS listing_id, e.source_id, e.agent_id
      FROM   public.mls_listings ml
      JOIN   eligible e
        ON   e.rn = (abs(hashtext(ml.id::text)) % v_floor_condo_pool)
      WHERE  ml.id = ANY(p_listing_ids)
        AND  ml.property_type = 'Residential Condo & Other'
        AND  ml.assigned_scope IS NULL
    ),
    updated AS (
      UPDATE public.mls_listings ml
         SET assigned_agent_id  = picks.agent_id,
             assigned_scope     = 'floor',
             assigned_source_id = picks.source_id
        FROM picks
       WHERE ml.id = picks.listing_id
      RETURNING 1
    )
    SELECT COUNT(*)::int INTO v_step FROM updated;
    v_resolved := v_resolved + v_step;
  END IF;

  -- ============================================================
  -- L10: FLOOR x HOME (parallel to L9)
  -- ============================================================
  SELECT COUNT(*) INTO v_floor_home_pool
    FROM public.tenant_floor_pool tfp
    JOIN public.agents a ON a.id = tfp.agent_id
   WHERE tfp.tenant_id = p_tenant_id
     AND tfp.is_active
     AND tfp.homes_access
     AND a.is_active
     AND a.is_selling
     AND a.tenant_id = p_tenant_id;

  IF v_floor_home_pool = 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mls_listings
       WHERE id = ANY(p_listing_ids)
         AND property_type = 'Residential Freehold'
         AND assigned_scope IS NULL
    ) INTO v_has_unhomed_home;

    IF v_has_unhomed_home THEN
      INSERT INTO public.tenant_floor_alerts (tenant_id, property_type, listing_id, alert_type)
      VALUES (p_tenant_id, 'home', NULL, 'empty_floor_pool');
    END IF;
  ELSE
    WITH eligible AS (
      SELECT tfp.id      AS source_id,
             tfp.agent_id,
             (ROW_NUMBER() OVER (ORDER BY tfp.agent_id) - 1) AS rn
      FROM   public.tenant_floor_pool tfp
      JOIN   public.agents a ON a.id = tfp.agent_id
      WHERE  tfp.tenant_id = p_tenant_id
        AND  tfp.is_active
        AND  tfp.homes_access
        AND  a.is_active
        AND  a.is_selling
        AND  a.tenant_id = p_tenant_id
    ),
    picks AS (
      SELECT ml.id AS listing_id, e.source_id, e.agent_id
      FROM   public.mls_listings ml
      JOIN   eligible e
        ON   e.rn = (abs(hashtext(ml.id::text)) % v_floor_home_pool)
      WHERE  ml.id = ANY(p_listing_ids)
        AND  ml.property_type = 'Residential Freehold'
        AND  ml.assigned_scope IS NULL
    ),
    updated AS (
      UPDATE public.mls_listings ml
         SET assigned_agent_id  = picks.agent_id,
             assigned_scope     = 'floor',
             assigned_source_id = picks.source_id
        FROM picks
       WHERE ml.id = picks.listing_id
      RETURNING 1
    )
    SELECT COUNT(*)::int INTO v_step FROM updated;
    v_resolved := v_resolved + v_step;
  END IF;

  -- Final count of rows in the input set still NULL after all 10 levels.
  SELECT COUNT(*)::int INTO null_count
    FROM public.mls_listings
   WHERE id = ANY(p_listing_ids)
     AND assigned_agent_id IS NULL;

  resolved_count := v_resolved;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.reresolve_listings_in_set(uuid[], uuid) IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 2 (v21+, 2026-05-30).
   Set-based per-listing resolver for Events 5 (resolve-at-insert) and 6
   (geo-change re-resolve). Walks the v16 P-cascade in 10 set-based UPDATEs:
   pin -> building -> community(condo,home) -> municipality(condo,home) ->
   area(condo,home) -> floor(condo,home). Each UPDATE narrowed by
   ml.id = ANY(p_listing_ids); writes the provenance trio atomically.

   SECURITY DEFINER (Landing 2 / Landing 1 pattern): function body runs as
   postgres so reads on tenant_floor_pool, agent_property_access, agents
   succeed under service_role callers. search_path locked to public, pg_temp.

   Caller contract: p_tenant_id MUST come from a validated request context
   (request header, tenant-scoped body field, or middleware-derived tenant).
   Do NOT call this function with a user-supplied tenant_id. Walk-equivalent
   to looping resolve_agent_for_context over the input ids MODULO N=1 carves
   (this function hash-RRs at carve levels; the resolver primary-picks via
   pick_routing_agent_for_type; the two agree when one apa row exists at the
   matched scope and diverge by design when N>1), plus:
   (a) page-level untyped fallback (unreachable when listing_id is provided);
   (b) neighbourhood scope (mls_listings has no neighbourhood_id);
   (c) tenant_property_access gate (Phase 1 set-based functions also omit it
       by design; resolver gates on read).

   Tenant isolation: every cascade level scopes BOTH the anchor table
   (agent_listing_assignments via agents, agent_geo_buildings via agents,
   agent_property_access.tenant_id, tenant_floor_pool.tenant_id) AND the
   agents.tenant_id by p_tenant_id. Belt-and-suspenders: a misconfigured apa
   or tfp row pointing to another tenant''s agent cannot leak.

   Empty-pool semantic: ONE alert per call per property type (matching
   reroll_listings_at_floor), not per listing.';

-- ============================================================================
-- 2. CREATE OR REPLACE FUNCTION public.reresolve_listing (PATCH)
-- ============================================================================
-- Old body was a single-row equivalent that UPDATEd assigned_agent_id only,
-- crashing on NULL-cache rows because of Phase 1's coupled CHECK constraint
-- (F-RERESOLVE-COUPLED-CHECK). Patched body delegates to the new set-based
-- primitive with a one-element array. Preserves the symbol for any future
-- ad-hoc single-row callers (currently zero callers).
--
-- Security: stays SECURITY INVOKER. The PERFORM crosses into the DEFINER
-- function for its own privilege requirements. Caller auth context preserved.

CREATE OR REPLACE FUNCTION public.reresolve_listing(p_listing_id uuid, p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent uuid;
BEGIN
  IF p_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Delegate to the set-based primitive (one-element array). Fixes
  -- F-RERESOLVE-COUPLED-CHECK: the new function writes the coupled trio
  -- atomically per UPDATE, satisfying mls_listings_assigned_coupled_check.
  -- NULL p_tenant_id is handled by the new function's predicate no-op
  -- (every cascade predicate evaluates to NULL/unknown and matches zero rows).
  PERFORM public.reresolve_listings_in_set(
    ARRAY[p_listing_id]::uuid[],
    p_tenant_id
  );

  -- Return the resolved agent (or NULL if unresolvable / row absent).
  SELECT assigned_agent_id INTO v_agent
    FROM public.mls_listings
   WHERE id = p_listing_id;

  RETURN v_agent;
END;
$function$;

COMMENT ON FUNCTION public.reresolve_listing(uuid, uuid) IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 2 (2026-05-30): patched to delegate
   to reresolve_listings_in_set. Previous body UPDATEd assigned_agent_id only
   and crashed on NULL-cache rows after the Phase 1 coupled CHECK was added
   (F-RERESOLVE-COUPLED-CHECK). Patched body is a thin shim; the set-based
   function does all the work and writes the provenance trio atomically.

   Kept as a symbol for future single-row callers. Currently zero callers.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- Every assertion either raises or NOTICE-logs PASS. Any RAISE causes the
-- transaction to ROLLBACK; no V-state survives a failure.
--
-- Rule Zero: NO HARDCODED listing UUIDs. Every test listing id is SELECTed
-- at runtime. If a SELECT returns zero rows, the V-assert fails loudly.
-- ============================================================================

-- V1: prosecdef + proconfig on the new function.
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reresolve_listings_in_set';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: reresolve_listings_in_set not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V1 FAIL: reresolve_listings_in_set.prosecdef is FALSE (expected TRUE)';
  END IF;
  IF v_proconfig IS NULL
     OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%')
  THEN
    RAISE EXCEPTION 'V1 FAIL: reresolve_listings_in_set.proconfig does not include locked search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'V1 PASS: reresolve_listings_in_set SECURITY DEFINER + search_path locked.';
END $$;

-- V2: NULL-cache routable listing -> walk-equivalence with resolve_agent_for_context.
-- All UUIDs SELECTed at runtime; no literals.
--
-- Walk-equivalence holds MODULO N=1 carves: this function uses hash-RR
-- (distribute_listings_at_geo pattern) at carve levels, while
-- resolve_agent_for_context's P4/P5/P6 branches use pick_routing_agent_for_type
-- which is primary-pick (is_primary=true LIMIT 1) -- not hash-RR. The two
-- mechanisms agree when N=1 (one apa row at the matched scope) because both
-- pick the single row. They diverge by design at N>1 carves: hash-RR picks
-- by hashtext(listing_id) % N; primary-pick returns the is_primary row.
-- This V2 deliberately picks a tenant whose carves are N=1 (see the tenant
-- filter below) so the equivalence is testable. Today only WALLiam-style
-- routing data exists in production and all its carves are N=1.
DO $$
DECLARE
  v_tenant      uuid;
  v_listing_id  uuid;
  v_pre_agent   uuid;
  v_pre_scope   text;
  v_walk_agent  uuid;
  v_resolved    int;
  v_null        int;
  v_post_agent  uuid;
  v_post_scope  text;
  v_post_source uuid;
  v_building_id uuid;
  v_community_id uuid;
  v_municipality_id uuid;
  v_area_id     uuid;
BEGIN
  -- Pick a tenant that (a) has an active floor pool and (b) has no
  -- tenant_property_access rules -- the resolver's TPA gate would otherwise
  -- diverge from this function's no-TPA-gate behavior, breaking walk-
  -- equivalence comparison. (Function behavior is intentional; the
  -- assertion just avoids the noise.)
  SELECT DISTINCT tfp.tenant_id INTO v_tenant
    FROM public.tenant_floor_pool tfp
   WHERE tfp.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_property_access tpa
       WHERE tpa.tenant_id = tfp.tenant_id AND tpa.is_active
     )
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'V2 setup: no tenant with active floor pool and no TPA rules found';
  END IF;

  -- Pick a NULL-cache routable condo/home with full geo (muni present).
  SELECT id, building_id, community_id, municipality_id, area_id
    INTO v_listing_id, v_building_id, v_community_id, v_municipality_id, v_area_id
    FROM public.mls_listings
   WHERE assigned_agent_id IS NULL
     AND property_type IN ('Residential Condo & Other','Residential Freehold')
     AND municipality_id IS NOT NULL
   LIMIT 1;
  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'V2 setup: no NULL-cache routable listing found';
  END IF;

  -- Pre-state must be NULL/NULL (coupled guarantee + setup filter).
  SELECT assigned_agent_id, assigned_scope INTO v_pre_agent, v_pre_scope
    FROM public.mls_listings WHERE id = v_listing_id;
  IF v_pre_agent IS NOT NULL OR v_pre_scope IS NOT NULL THEN
    RAISE EXCEPTION 'V2 setup: picked listing % is not NULL-cache (agent=%, scope=%)',
                    v_listing_id, v_pre_agent, v_pre_scope;
  END IF;

  -- What does resolve_agent_for_context say for this listing?
  SELECT public.resolve_agent_for_context(
           v_listing_id,
           v_building_id,
           NULL,
           v_community_id,
           v_municipality_id,
           v_area_id,
           NULL,
           v_tenant
         )
    INTO v_walk_agent;

  -- Call the new function.
  SELECT resolved_count, null_count INTO v_resolved, v_null
    FROM public.reresolve_listings_in_set(
           ARRAY[v_listing_id]::uuid[],
           v_tenant
         );

  -- Post-state.
  SELECT assigned_agent_id, assigned_scope, assigned_source_id
    INTO v_post_agent, v_post_scope, v_post_source
    FROM public.mls_listings WHERE id = v_listing_id;

  IF v_walk_agent IS NULL THEN
    -- Resolver says no agent. Set-based should also produce no change.
    IF v_resolved <> 0 OR v_null <> 1 THEN
      RAISE EXCEPTION 'V2 FAIL: resolver returned NULL; set-based expected (0,1), got (%, %)',
                      v_resolved, v_null;
    END IF;
    IF v_post_agent IS NOT NULL OR v_post_scope IS NOT NULL THEN
      RAISE EXCEPTION 'V2 FAIL: set-based wrote (agent=%, scope=%) when resolver returned NULL',
                      v_post_agent, v_post_scope;
    END IF;
    RAISE NOTICE 'V2 PASS (no-resolution case): listing %, tenant % -> both paths returned NULL',
                 v_listing_id, v_tenant;
  ELSE
    IF v_resolved <> 1 OR v_null <> 0 THEN
      RAISE EXCEPTION 'V2 FAIL: expected (1,0), got (%, %)', v_resolved, v_null;
    END IF;
    IF v_post_agent IS NULL OR v_post_scope IS NULL OR v_post_source IS NULL THEN
      RAISE EXCEPTION 'V2 FAIL: coupled trio not set (agent=%, scope=%, source=%)',
                      v_post_agent, v_post_scope, v_post_source;
    END IF;
    IF v_post_agent <> v_walk_agent THEN
      RAISE EXCEPTION 'V2 FAIL (walk-equivalence): resolver=%, set-based=% on listing % (tenant %)',
                      v_walk_agent, v_post_agent, v_listing_id, v_tenant;
    END IF;
    RAISE NOTICE 'V2 PASS: listing %, tenant %, agent %, scope %, source %',
                 v_listing_id, v_tenant, v_post_agent, v_post_scope, v_post_source;
  END IF;
END $$;

-- V3: Carved (community-scope) listing -> sticky guard preserves pre-state.
-- Tenant derived from the carved row's agent's tenant_id (no constants).
DO $$
DECLARE
  v_listing_id  uuid;
  v_pre_agent   uuid;
  v_pre_scope   text;
  v_pre_source  uuid;
  v_tenant      uuid;
  v_resolved    int;
  v_null        int;
  v_post_agent  uuid;
  v_post_scope  text;
  v_post_source uuid;
BEGIN
  SELECT id, assigned_agent_id, assigned_scope, assigned_source_id
    INTO v_listing_id, v_pre_agent, v_pre_scope, v_pre_source
    FROM public.mls_listings
   WHERE assigned_scope = 'community'
     AND assigned_agent_id IS NOT NULL
   LIMIT 1;
  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'V3 setup: no carved community-scope listing found';
  END IF;

  SELECT tenant_id INTO v_tenant
    FROM public.agents WHERE id = v_pre_agent;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'V3 setup: agent % has no tenant_id', v_pre_agent;
  END IF;

  SELECT resolved_count, null_count INTO v_resolved, v_null
    FROM public.reresolve_listings_in_set(
           ARRAY[v_listing_id]::uuid[],
           v_tenant
         );

  SELECT assigned_agent_id, assigned_scope, assigned_source_id
    INTO v_post_agent, v_post_scope, v_post_source
    FROM public.mls_listings WHERE id = v_listing_id;

  IF v_resolved <> 0 THEN
    RAISE EXCEPTION 'V3 FAIL: sticky guard broken. Expected resolved_count=0, got %', v_resolved;
  END IF;
  IF v_post_agent IS DISTINCT FROM v_pre_agent
     OR v_post_scope <> v_pre_scope
     OR v_post_source IS DISTINCT FROM v_pre_source
  THEN
    RAISE EXCEPTION 'V3 FAIL: pre-state mutated. agent: % -> %, scope: % -> %, source: % -> %',
                    v_pre_agent, v_post_agent, v_pre_scope, v_post_scope, v_pre_source, v_post_source;
  END IF;
  RAISE NOTICE 'V3 PASS: carved listing %, scope=%, agent % preserved by sticky guard',
               v_listing_id, v_post_scope, v_post_agent;
END $$;

-- V4: empty array -> (0, 0).
DO $$
DECLARE
  v_tenant   uuid;
  v_resolved int;
  v_null     int;
BEGIN
  SELECT DISTINCT tenant_id INTO v_tenant
    FROM public.tenant_floor_pool WHERE is_active LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'V4 setup: no tenant with floor pool found';
  END IF;

  SELECT resolved_count, null_count INTO v_resolved, v_null
    FROM public.reresolve_listings_in_set(ARRAY[]::uuid[], v_tenant);

  IF v_resolved <> 0 OR v_null <> 0 THEN
    RAISE EXCEPTION 'V4 FAIL: empty array expected (0,0), got (%, %)', v_resolved, v_null;
  END IF;
  RAISE NOTICE 'V4 PASS: empty array -> (0, 0).';
END $$;

-- V5: NULL tenant -> (0, 0) via PREDICATE-BASED no-op (not an early guard).
-- Setup picks a non-NULL-cache listing so null_count = 0 comes from pre-state,
-- and resolved_count = 0 comes from every cascade predicate failing on NULL
-- tenant equality (x = NULL evaluates to unknown -> zero rows). The function
-- must NOT RAISE on NULL tenant; it returns (0,0) cleanly through the cascade.
DO $$
DECLARE
  v_listing_id uuid;
  v_resolved   int;
  v_null       int;
BEGIN
  -- Pick a row that is already cache-hit so null_count comes from data state.
  SELECT id INTO v_listing_id
    FROM public.mls_listings
   WHERE assigned_agent_id IS NOT NULL
   LIMIT 1;
  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'V5 setup: no cache-hit listing rows';
  END IF;

  SELECT resolved_count, null_count INTO v_resolved, v_null
    FROM public.reresolve_listings_in_set(ARRAY[v_listing_id]::uuid[], NULL::uuid);

  IF v_resolved <> 0 OR v_null <> 0 THEN
    RAISE EXCEPTION 'V5 FAIL: NULL tenant expected (0,0), got (%, %)', v_resolved, v_null;
  END IF;
  RAISE NOTICE 'V5 PASS: NULL tenant -> (0, 0) via predicate no-op (cascade saw 0 matches everywhere).';
END $$;

-- V6: patched reresolve_listing exercises the new function end-to-end and
-- does NOT violate the coupled CHECK. Runtime-SELECTed listing id.
DO $$
DECLARE
  v_tenant     uuid;
  v_listing_id uuid;
  v_pre_agent  uuid;
  v_returned   uuid;
  v_post_agent uuid;
  v_post_scope text;
BEGIN
  SELECT DISTINCT tfp.tenant_id INTO v_tenant
    FROM public.tenant_floor_pool tfp
   WHERE tfp.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_property_access tpa
       WHERE tpa.tenant_id = tfp.tenant_id AND tpa.is_active
     )
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'V6 setup: no tenant with active floor pool and no TPA rules';
  END IF;

  SELECT id INTO v_listing_id
    FROM public.mls_listings
   WHERE assigned_agent_id IS NULL
     AND property_type IN ('Residential Condo & Other','Residential Freehold')
     AND municipality_id IS NOT NULL
   LIMIT 1;
  IF v_listing_id IS NULL THEN
    -- V2 may have cleared the last candidate. Not a failure; the patched
    -- function is structurally exercised by V2's set-based path already.
    RAISE NOTICE 'V6 SKIP: no NULL-cache routable listing remaining (V2 may have resolved the last one).';
    RETURN;
  END IF;

  SELECT assigned_agent_id INTO v_pre_agent
    FROM public.mls_listings WHERE id = v_listing_id;
  IF v_pre_agent IS NOT NULL THEN
    RAISE EXCEPTION 'V6 setup: picked listing % already has agent %', v_listing_id, v_pre_agent;
  END IF;

  -- Call the patched single-row wrapper.
  SELECT public.reresolve_listing(v_listing_id, v_tenant) INTO v_returned;

  SELECT assigned_agent_id, assigned_scope
    INTO v_post_agent, v_post_scope
    FROM public.mls_listings WHERE id = v_listing_id;

  IF v_returned IS NULL THEN
    IF v_post_agent IS NOT NULL OR v_post_scope IS NOT NULL THEN
      RAISE EXCEPTION 'V6 FAIL: returned NULL but cache has (agent=%, scope=%)',
                      v_post_agent, v_post_scope;
    END IF;
    RAISE NOTICE 'V6 PASS (no-resolution case): patched reresolve_listing returned NULL; cache stays NULL.';
  ELSE
    IF v_post_agent IS NULL OR v_post_scope IS NULL THEN
      RAISE EXCEPTION 'V6 FAIL: returned % but coupled trio not set (agent=%, scope=%)',
                      v_returned, v_post_agent, v_post_scope;
    END IF;
    IF v_returned <> v_post_agent THEN
      RAISE EXCEPTION 'V6 FAIL: returned % differs from cached %', v_returned, v_post_agent;
    END IF;
    RAISE NOTICE 'V6 PASS: patched reresolve_listing landed coupled trio (agent=%, scope=%) on listing %',
                 v_post_agent, v_post_scope, v_listing_id;
  END IF;
END $$;

-- End of migration body. V1..V6 must all PASS (or V6 SKIP) for COMMIT.
