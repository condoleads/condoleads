-- Snapshot BEFORE UNIT 34 Fix 2 STEP 3 (pick_routing_agent_for_type ORDER BY).
-- Restore via: psql -f <this file>

CREATE OR REPLACE FUNCTION public.pick_routing_agent_for_type(p_scope text, p_scope_id uuid, p_tenant_id uuid, p_is_condo boolean, p_is_home boolean)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- Find the is_primary card at this scope that also has the right
  -- property-type access flag. Returns NULL if no matching card.
  SELECT apa.agent_id INTO v_agent_id
  FROM agent_property_access apa
  WHERE apa.scope = p_scope
    AND apa.tenant_id = p_tenant_id
    AND apa.is_primary = true
    AND apa.is_active = true
    AND (
      (p_scope = 'area' AND apa.area_id = p_scope_id) OR
      (p_scope = 'municipality' AND apa.municipality_id = p_scope_id) OR
      (p_scope = 'community' AND apa.community_id = p_scope_id) OR
      (p_scope = 'neighbourhood' AND apa.neighbourhood_id = p_scope_id)
    )
    AND (
      (p_is_condo = true AND apa.condo_access = true) OR
      (p_is_home  = true AND apa.homes_access = true)
    )
  LIMIT 1;

  RETURN v_agent_id;
END;
$function$
;
