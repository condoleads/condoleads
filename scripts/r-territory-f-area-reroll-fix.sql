-- scripts/r-territory-f-area-reroll-fix.sql
-- W-TERRITORY/F-AREA-REROLL-TIMEOUT — set-based reroll/distribute.
--
-- BEFORE: row-by-row loop in reroll_listings_at_geo + distribute_listings_at_geo.
-- For Whitby area (67,850 listings): 67,850 calls to pick_routing_agent (each
-- doing 2 internal SELECTs against agent_property_access) + 67,850 conditional
-- UPDATEs = ~200k SQL operations per call. Supabase statement_timeout cancels
-- mid-loop. Surfaced in T6 v8 Test 4.
--
-- AFTER: single set-based UPDATE per function. Routing set computed once in a
-- CTE; per-listing pick computed inline via hashtext modulo. Postgres plans
-- this as a hash join. Should complete in single-digit seconds even at 67k
-- rows.
--
-- Behavior preserved exactly:
--   - Same hash function: abs(hashtext(listing_id::text)) % routing_count
--   - Same scope filter: ('area', 'municipality', 'community')
--   - Same empty-routing handling (picks become NULL via NULLIF + LEFT JOIN)
--   - Same return value (count of rows actually changed)
--
-- Caller signature unchanged. Triggers in T3b-C call these unchanged.

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    -- mls_listings has no neighbourhood_id; can't reroll at that level
    RETURN 0;
  END IF;

  -- Compute routing set size once. v_total = 0 -> all picks become NULL
  -- (matches old behavior where pick_routing_agent returned NULL).
  SELECT COUNT(*) INTO v_total
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND tenant_id = p_tenant_id
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    );

  WITH routing AS (
    SELECT
      agent_id,
      (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
    FROM agent_property_access
    WHERE scope = p_scope
      AND is_active = true
      AND tenant_id = p_tenant_id
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  ),
  picks AS (
    SELECT
      ml.id AS listing_id,
      r.agent_id AS new_pick
    FROM mls_listings ml
    LEFT JOIN routing r
      ON v_total > 0
      AND r.rn = (abs(hashtext(ml.id::text)) % NULLIF(v_total, 0))
    WHERE (
      (p_scope = 'area' AND ml.area_id = p_scope_id) OR
      (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
      (p_scope = 'community' AND ml.community_id = p_scope_id)
    )
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
      AND ml.assigned_agent_id IS DISTINCT FROM picks.new_pick
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND tenant_id = p_tenant_id
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    );

  -- distribute only fills NULL rows. Empty routing set -> no-op.
  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  WITH routing AS (
    SELECT
      agent_id,
      (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
    FROM agent_property_access
    WHERE scope = p_scope
      AND is_active = true
      AND tenant_id = p_tenant_id
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  ),
  picks AS (
    SELECT
      ml.id AS listing_id,
      r.agent_id AS new_pick
    FROM mls_listings ml
    JOIN routing r
      ON r.rn = (abs(hashtext(ml.id::text)) % v_total)
    WHERE ml.assigned_agent_id IS NULL
      AND (
        (p_scope = 'area' AND ml.area_id = p_scope_id) OR
        (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
        (p_scope = 'community' AND ml.community_id = p_scope_id)
      )
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;
