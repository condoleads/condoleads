-- Snapshot of resolver functions at 2026-05-25T09:09:52.780Z
-- Use this to roll back T0-1 if needed.

-- --- resolve_agent_for_context ---
CREATE OR REPLACE FUNCTION public.resolve_agent_for_context(p_listing_id uuid DEFAULT NULL::uuid, p_building_id uuid DEFAULT NULL::uuid, p_neighbourhood_id uuid DEFAULT NULL::uuid, p_community_id uuid DEFAULT NULL::uuid, p_municipality_id uuid DEFAULT NULL::uuid, p_area_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Tenant-restriction check (preserved from baseline).
  IF p_tenant_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM tenant_property_access WHERE tenant_id = p_tenant_id AND is_active = true) THEN
      IF NOT EXISTS (
        SELECT 1 FROM tenant_property_access
        WHERE tenant_id = p_tenant_id AND is_active = true
        AND (
          (area_id = p_area_id AND p_area_id IS NOT NULL) OR
          (municipality_id = p_municipality_id AND p_municipality_id IS NOT NULL) OR
          (community_id = p_community_id AND p_community_id IS NOT NULL)
        )
      ) THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- P1: Listing pin (firm). T2g fix: cross-tenant filter via agents JOIN.
  IF p_listing_id IS NOT NULL THEN
    SELECT ala.agent_id INTO v_agent_id
    FROM agent_listing_assignments ala
    JOIN agents a ON a.id = ala.agent_id
    WHERE ala.listing_id = p_listing_id
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building pin (firm). T2g fix: cross-tenant filter via agents JOIN.
  IF p_building_id IS NOT NULL THEN
    SELECT agb.agent_id INTO v_agent_id
    FROM agent_geo_buildings agb
    JOIN agents a ON a.id = agb.agent_id
    WHERE agb.building_id = p_building_id
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P3: Neighbourhood routing set.
  IF p_neighbourhood_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('neighbourhood', p_neighbourhood_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P4: Community routing set.
  IF p_community_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('community', p_community_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P5: Municipality routing set.
  IF p_municipality_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('municipality', p_municipality_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P6: Area routing set.
  IF p_area_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('area', p_area_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P7: User-level assignment via tenant_users (modern path). Already tenant-filtered.
  IF p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM tenant_users
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND assigned_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P8: User-level assignment via user_profiles. T2g fix: cross-tenant filter via agents JOIN.
  IF p_user_id IS NOT NULL THEN
    SELECT up.assigned_agent_id INTO v_agent_id
    FROM user_profiles up
    JOIN agents a ON a.id = up.assigned_agent_id
    WHERE up.id = p_user_id
      AND up.assigned_agent_id IS NOT NULL
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P9: Tenant default agent.
  IF p_tenant_id IS NOT NULL THEN
    SELECT default_agent_id INTO v_agent_id FROM tenants
    WHERE id = p_tenant_id AND default_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P10: Any active agent in tenant (last resort).
  IF p_tenant_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents
    WHERE tenant_id = p_tenant_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  RETURN NULL;
END;
$function$
;

-- --- resolve_display_agent_for_context ---
CREATE OR REPLACE FUNCTION public.resolve_display_agent_for_context(p_listing_id uuid DEFAULT NULL::uuid, p_building_id uuid DEFAULT NULL::uuid, p_neighbourhood_id uuid DEFAULT NULL::uuid, p_community_id uuid DEFAULT NULL::uuid, p_municipality_id uuid DEFAULT NULL::uuid, p_area_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_primary_id uuid;
  v_resolved_id uuid;
  v_selling_id uuid;
BEGIN
  -- Step 1: Try is_primary at the most-specific geo level present.
  IF p_neighbourhood_id IS NOT NULL THEN
    v_primary_id := resolve_geo_primary('neighbourhood', p_neighbourhood_id, p_tenant_id);
  END IF;
  IF v_primary_id IS NULL AND p_community_id IS NOT NULL THEN
    v_primary_id := resolve_geo_primary('community', p_community_id, p_tenant_id);
  END IF;
  IF v_primary_id IS NULL AND p_municipality_id IS NOT NULL THEN
    v_primary_id := resolve_geo_primary('municipality', p_municipality_id, p_tenant_id);
  END IF;
  IF v_primary_id IS NULL AND p_area_id IS NOT NULL THEN
    v_primary_id := resolve_geo_primary('area', p_area_id, p_tenant_id);
  END IF;

  -- Step 2: If primary is selling, return it.
  IF v_primary_id IS NOT NULL THEN
    SELECT id INTO v_selling_id FROM agents
    WHERE id = v_primary_id AND is_selling = true AND is_active = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;
  END IF;

  -- Step 3: Fall through to routing resolver, then walk for selling-capable agent.
  v_resolved_id := resolve_agent_for_context(
    p_listing_id, p_building_id, p_neighbourhood_id, p_community_id,
    p_municipality_id, p_area_id, p_user_id, p_tenant_id
  );
  IF v_resolved_id IS NULL THEN RETURN NULL; END IF;

  -- If routing-resolved agent is selling, return it.
  SELECT id INTO v_selling_id FROM agents
  WHERE id = v_resolved_id AND is_selling = true AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;

  -- Walk descendants for any selling agent.
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, tenant_id, is_selling, is_active, 1 AS depth
    FROM agents WHERE parent_id = v_resolved_id
    UNION ALL
    SELECT a.id, a.parent_id, a.tenant_id, a.is_selling, a.is_active, d.depth + 1
    FROM agents a JOIN descendants d ON a.parent_id = d.id WHERE d.depth < 10
  )
  SELECT id INTO v_selling_id FROM descendants
  WHERE is_selling = true AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY depth ASC LIMIT 1;
  IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;

  -- Walk ancestors.
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, tenant_id, is_selling, is_active, 1 AS depth
    FROM agents WHERE id = v_resolved_id
    UNION ALL
    SELECT a.id, a.parent_id, a.tenant_id, a.is_selling, a.is_active, an.depth + 1
    FROM agents a JOIN ancestors an ON a.id = an.parent_id WHERE an.depth < 10
  )
  SELECT id INTO v_selling_id FROM ancestors
  WHERE is_selling = true AND is_active = true AND id != v_resolved_id
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY depth ASC LIMIT 1;
  IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;

  -- Tenant default if selling.
  IF p_tenant_id IS NOT NULL THEN
    SELECT a.id INTO v_selling_id FROM tenants t
    JOIN agents a ON a.id = t.default_agent_id
    WHERE t.id = p_tenant_id AND a.is_selling = true AND a.is_active = true;
    IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;

    SELECT id INTO v_selling_id FROM agents
    WHERE tenant_id = p_tenant_id AND is_selling = true AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
    RETURN v_selling_id;
  END IF;

  RETURN NULL;
END;
$function$
;

-- --- pick_routing_agent ---
CREATE OR REPLACE FUNCTION public.pick_routing_agent(p_scope text, p_scope_id uuid, p_tenant_id uuid, p_listing_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int;
  v_pick_index int;
  v_agent_id uuid;
BEGIN
  IF p_scope_id IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_count
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id) OR
      (p_scope = 'neighbourhood' AND neighbourhood_id = p_scope_id)
    );

  IF v_count = 0 THEN RETURN NULL; END IF;

  IF p_listing_id IS NOT NULL THEN
    -- Hash-distribute by listing_id for equal-share routing.
    v_pick_index := abs(hashtext(p_listing_id::text)) % v_count;
    SELECT agent_id INTO v_agent_id FROM (
      SELECT agent_id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
      FROM agent_property_access
      WHERE scope = p_scope
        AND is_active = true
        AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        AND (
          (p_scope = 'area' AND area_id = p_scope_id) OR
          (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
          (p_scope = 'community' AND community_id = p_scope_id) OR
          (p_scope = 'neighbourhood' AND neighbourhood_id = p_scope_id)
        )
    ) routing
    WHERE rn = v_pick_index;
  ELSE
    -- Page-level routing — return primary.
    v_agent_id := resolve_geo_primary(p_scope, p_scope_id, p_tenant_id);
    IF v_agent_id IS NULL THEN
      -- Defensive fallback: earliest by created_at if no primary marked.
      SELECT agent_id INTO v_agent_id FROM agent_property_access
      WHERE scope = p_scope
        AND is_active = true
        AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        AND (
          (p_scope = 'area' AND area_id = p_scope_id) OR
          (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
          (p_scope = 'community' AND community_id = p_scope_id) OR
          (p_scope = 'neighbourhood' AND neighbourhood_id = p_scope_id)
        )
      ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  RETURN v_agent_id;
END;
$function$
;

-- --- resolve_geo_primary ---
CREATE OR REPLACE FUNCTION public.resolve_geo_primary(p_scope text, p_scope_id uuid, p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN RETURN NULL; END IF;

  SELECT agent_id INTO v_agent_id
  FROM agent_property_access
  WHERE scope = p_scope
    AND tenant_id = p_tenant_id
    AND is_primary = true
    AND is_active = true
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id) OR
      (p_scope = 'neighbourhood' AND neighbourhood_id = p_scope_id)
    )
  LIMIT 1;

  RETURN v_agent_id;
END;
$function$
;

