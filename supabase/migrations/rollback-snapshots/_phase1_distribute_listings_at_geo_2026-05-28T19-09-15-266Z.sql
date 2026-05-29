-- Rollback snapshot of public.distribute_listings_at_geo captured at 2026-05-28T19-09-15-266Z
-- Restore by piping this file into psql against the same database.

-- distribute_listings_at_geo(text,uuid,uuid)
CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(p_scope text, p_scope_id uuid, p_tenant_id uuid)
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
$function$
;
