-- F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK -- PRE-FIX SNAPSHOT
-- Captured: 2026-06-01T12-18-46-292Z
-- prosecdef: false  proconfig: null
-- This is the EXACT live body before the up-migration. Forensic only;
-- the down-migration at 20260601_f_reroll_coupled_check_fix_down.sql
-- has the same body inline so rollback is repeatable without this file.

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(p_scope text, p_scope_id uuid, p_tenant_id uuid)
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
$function$
