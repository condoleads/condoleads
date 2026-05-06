-- supabase/migrations/20260507_t3_02_resolvers_v2.sql
-- W-TERRITORY/T3a step 2 of 2 — refactored resolvers per OD-5 + locked spec.
--
-- BEHAVIOR CHANGES vs t3_01 baseline:
--   resolve_agent_for_context (routing):
--     * NEW PARAM: p_neighbourhood_id (between p_building_id and p_community_id)
--     * NEW LEVEL P3: neighbourhood resolution
--     * REMOVED: 'managed child auto-substitution' at geo levels — contradicts spec
--     * NEW PRIORITY: tenant_users.assigned_agent_id (modern user override) before
--       user_profiles.assigned_agent_id (legacy back-compat)
--     * Multi-agent geo levels: hash-distribute by listing_id when present;
--       otherwise return is_primary row (drives page-level lead routing)
--
--   resolve_display_agent_for_context (display):
--     * NEW: calls resolve_geo_primary first to find is_primary row at most-specific level
--     * If primary is_selling=true, returns it
--     * Otherwise falls through to existing routing-then-walk-tree-for-selling logic
--
-- NEW HELPER FUNCTIONS:
--   resolve_geo_primary(scope, scope_id, tenant_id) RETURNS uuid
--     — returns is_primary=true row for the geo unit (NULL if none)
--   pick_routing_agent(scope, scope_id, tenant_id, listing_id) RETURNS uuid
--     — geo-level agent picker; hash-distributes if listing_id, else returns primary
--
-- IDEMPOTENCY: DROP FUNCTION IF EXISTS for both old (7-param) and new (8-param)
-- signatures, then CREATE. Helpers use CREATE OR REPLACE.
--
-- ROLLBACK: re-apply 20260507_t3_01_resolver_baseline.sql.
--
-- VERIFICATION (separate blocks after apply):
--   Block A: SELECT proname, pronargs FROM pg_proc p
--            JOIN pg_namespace n ON p.pronamespace=n.oid
--            WHERE n.nspname='public'
--              AND proname IN ('resolve_agent_for_context','resolve_display_agent_for_context',
--                              'resolve_geo_primary','pick_routing_agent');
--            -- Expected: 4 rows. resolvers pronargs=8, geo_primary=3, pick_routing=4.
--   Block B: SELECT resolve_geo_primary('municipality', '<muni-uuid>', '<tenant-uuid>');
--   Block C: SELECT resolve_agent_for_context(NULL,NULL,NULL,NULL,'<muni-uuid>',NULL,NULL,'<tenant-uuid>');
--   Block D: SELECT resolve_display_agent_for_context(NULL,NULL,NULL,NULL,'<muni-uuid>',NULL,NULL,'<tenant-uuid>');

BEGIN;

-- ─── Drop old + new signatures (idempotent) ──────────────────────────────────
DROP FUNCTION IF EXISTS public.resolve_agent_for_context(uuid, uuid, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.resolve_agent_for_context(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.resolve_display_agent_for_context(uuid, uuid, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.resolve_display_agent_for_context(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);

-- ─── Helper: resolve_geo_primary ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_geo_primary(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
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
$function$;

-- ─── Helper: pick_routing_agent ─────────────────────────────────────────────
-- For multi-agent geo levels: deterministic hash-pick by listing_id (equal-share),
-- or is_primary row when no listing context (page-level lead routing).
CREATE OR REPLACE FUNCTION public.pick_routing_agent(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid,
  p_listing_id uuid
)
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
$function$;

-- ─── resolve_agent_for_context v2 (routing) ─────────────────────────────────
CREATE FUNCTION public.resolve_agent_for_context(
  p_listing_id uuid DEFAULT NULL::uuid,
  p_building_id uuid DEFAULT NULL::uuid,
  p_neighbourhood_id uuid DEFAULT NULL::uuid,
  p_community_id uuid DEFAULT NULL::uuid,
  p_municipality_id uuid DEFAULT NULL::uuid,
  p_area_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid
)
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

  -- P1: Listing pin (firm).
  IF p_listing_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_listing_assignments WHERE listing_id = p_listing_id;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building pin (firm).
  IF p_building_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_geo_buildings WHERE building_id = p_building_id;
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

  -- P7: User-level assignment via tenant_users (modern path).
  IF p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM tenant_users
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND assigned_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P8: User-level assignment via user_profiles (legacy back-compat).
  IF p_user_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM user_profiles
    WHERE id = p_user_id AND assigned_agent_id IS NOT NULL;
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
$function$;

-- ─── resolve_display_agent_for_context v2 (display) ─────────────────────────
CREATE FUNCTION public.resolve_display_agent_for_context(
  p_listing_id uuid DEFAULT NULL::uuid,
  p_building_id uuid DEFAULT NULL::uuid,
  p_neighbourhood_id uuid DEFAULT NULL::uuid,
  p_community_id uuid DEFAULT NULL::uuid,
  p_municipality_id uuid DEFAULT NULL::uuid,
  p_area_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid
)
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
$function$;

COMMIT;
