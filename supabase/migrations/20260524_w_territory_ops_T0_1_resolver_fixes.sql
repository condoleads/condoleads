
-- supabase/migrations/20260524_w_territory_ops_T0_1_resolver_fixes.sql
-- W-TERRITORY-OPS T0-1: resolver fixes + health check RPC.
--
-- Fix 1 (F-HASH-RR-NOT-IMPLEMENTED): rewrite P10 last-resort fallback from
--   "oldest agent by created_at" to hash-RR across selling+active agents.
--   When p_listing_id is provided -> hash by listing_id for equal distribution.
--   When no p_listing_id (page-level) -> deterministic first by id ASC.
--
-- Fix 2 (F-NON-SELLING-PRIMARY-SILENT-FAILOVER): at every priority level that
--   returns an agent_id (P1-P9), verify the agent is is_active AND is_selling.
--   If not, fall through to next priority level. Previously only the display
--   resolver did this masking; the routing resolver returned dead agents.
--
-- New RPC resolver_health_check(p_tenant_id): returns per-tenant routing
--   health summary in one query for the future Health view (T1-2).
--
-- Rollback: snapshot of pre-T0-1 bodies in
--   supabase/migrations/rollback-snapshots/_w-territory-ops-T0-1-resolver-snapshot_<ts>.sql
--   Replay that snapshot's CREATE OR REPLACE statements to revert.

BEGIN;

-- ─── Fix 1 + Fix 2: rewrite resolve_agent_for_context ──────────────────
CREATE OR REPLACE FUNCTION public.resolve_agent_for_context(
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
  v_selling_count int;
  v_pick_index int;
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

  -- P1: Listing pin (firm). Fix 2: only return if agent is selling+active.
  IF p_listing_id IS NOT NULL THEN
    SELECT ala.agent_id INTO v_agent_id
    FROM agent_listing_assignments ala
    JOIN agents a ON a.id = ala.agent_id
    WHERE ala.listing_id = p_listing_id
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building pin (firm). Fix 2.
  IF p_building_id IS NOT NULL THEN
    SELECT agb.agent_id INTO v_agent_id
    FROM agent_geo_buildings agb
    JOIN agents a ON a.id = agb.agent_id
    WHERE agb.building_id = p_building_id
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P3: Neighbourhood routing set. Fix 2: pick_routing_agent already returns
  -- card holder; verify selling+active here before returning.
  IF p_neighbourhood_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('neighbourhood', p_neighbourhood_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P4: Community routing set.
  IF p_community_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('community', p_community_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P5: Municipality routing set.
  IF p_municipality_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('municipality', p_municipality_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P6: Area routing set.
  IF p_area_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('area', p_area_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P7: User-level assignment via tenant_users. Fix 2.
  IF p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL THEN
    SELECT tu.assigned_agent_id INTO v_agent_id
    FROM tenant_users tu
    JOIN agents a ON a.id = tu.assigned_agent_id
    WHERE tu.user_id = p_user_id
      AND tu.tenant_id = p_tenant_id
      AND tu.assigned_agent_id IS NOT NULL
      AND a.is_active = true AND a.is_selling = true;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P8: User-level assignment via user_profiles. Fix 2.
  IF p_user_id IS NOT NULL THEN
    SELECT up.assigned_agent_id INTO v_agent_id
    FROM user_profiles up
    JOIN agents a ON a.id = up.assigned_agent_id
    WHERE up.id = p_user_id
      AND up.assigned_agent_id IS NOT NULL
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P9: Tenant default agent. Fix 2: must be selling+active.
  IF p_tenant_id IS NOT NULL THEN
    SELECT t.default_agent_id INTO v_agent_id
    FROM tenants t
    JOIN agents a ON a.id = t.default_agent_id
    WHERE t.id = p_tenant_id
      AND t.default_agent_id IS NOT NULL
      AND a.is_active = true AND a.is_selling = true;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P10: Hash-RR last resort. Fix 1 (F-HASH-RR-NOT-IMPLEMENTED).
  -- Pick from selling+active agents in tenant. With p_listing_id: hash by id
  -- for equal distribution. Without (page-level): deterministic first.
  IF p_tenant_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_selling_count
    FROM agents
    WHERE tenant_id = p_tenant_id AND is_active = true AND is_selling = true;

    IF v_selling_count = 0 THEN
      RETURN NULL;
    END IF;

    IF p_listing_id IS NOT NULL THEN
      v_pick_index := abs(hashtext(p_listing_id::text)) % v_selling_count;
      SELECT agent_id INTO v_agent_id FROM (
        SELECT id AS agent_id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
        FROM agents
        WHERE tenant_id = p_tenant_id AND is_active = true AND is_selling = true
      ) ranked
      WHERE rn = v_pick_index;
    ELSE
      -- Page-level: deterministic first selling agent.
      SELECT id INTO v_agent_id FROM agents
      WHERE tenant_id = p_tenant_id AND is_active = true AND is_selling = true
      ORDER BY id ASC LIMIT 1;
    END IF;

    RETURN v_agent_id;
  END IF;

  RETURN NULL;
END;
$function$;


-- ─── New RPC: resolver_health_check ────────────────────────────────────
-- Returns a JSON object with per-tenant routing health metrics.
-- Used by the Health view (T1-2) to surface problems in one query.
CREATE OR REPLACE FUNCTION public.resolver_health_check(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_result jsonb;
  v_selling_count int;
  v_active_count int;
  v_default_id uuid;
  v_default_is_selling boolean;
  v_default_is_active boolean;
  v_default_name text;
  v_total_cards int;
  v_phantom_cards int;
  v_stale_agent_cards int;
  v_orphan_buildings int;
BEGIN
  -- Selling + active agent counts.
  SELECT
    COUNT(*) FILTER (WHERE is_selling = true AND is_active = true),
    COUNT(*) FILTER (WHERE is_active = true)
  INTO v_selling_count, v_active_count
  FROM agents WHERE tenant_id = p_tenant_id;

  -- Tenant default agent status.
  SELECT t.default_agent_id, a.is_selling, a.is_active, a.full_name
  INTO v_default_id, v_default_is_selling, v_default_is_active, v_default_name
  FROM tenants t
  LEFT JOIN agents a ON a.id = t.default_agent_id
  WHERE t.id = p_tenant_id;

  -- Card counts.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE condo_access = false AND homes_access = false AND buildings_access = false
    )
  INTO v_total_cards, v_phantom_cards
  FROM agent_property_access
  WHERE tenant_id = p_tenant_id AND is_active = true;

  -- Cards referencing non-selling or non-active agents.
  SELECT COUNT(*) INTO v_stale_agent_cards
  FROM agent_property_access apa
  JOIN agents a ON a.id = apa.agent_id
  WHERE apa.tenant_id = p_tenant_id
    AND apa.is_active = true
    AND (a.is_active = false OR a.is_selling = false);

  -- Orphan buildings: building cards where the building's muni has no apa card
  -- for this tenant. (A building card creates routing for that one building but
  -- the surrounding muni still cascades to the tenant default.)
  SELECT COUNT(*) INTO v_orphan_buildings
  FROM agent_geo_buildings agb
  JOIN agents a ON a.id = agb.agent_id AND a.tenant_id = p_tenant_id
  JOIN buildings b ON b.id = agb.building_id
  JOIN communities co ON co.id = b.community_id
  WHERE NOT EXISTS (
    SELECT 1 FROM agent_property_access apa
    WHERE apa.tenant_id = p_tenant_id
      AND apa.is_active = true
      AND apa.scope = 'municipality'
      AND apa.municipality_id = co.municipality_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM agent_property_access apa
    JOIN municipalities m ON m.id = co.municipality_id
    WHERE apa.tenant_id = p_tenant_id
      AND apa.is_active = true
      AND apa.scope = 'area'
      AND apa.area_id = m.area_id
  );

  v_result := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'selling_agent_count', v_selling_count,
    'active_agent_count', v_active_count,
    'tenant_default', CASE WHEN v_default_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'agent_id', v_default_id,
        'agent_name', v_default_name,
        'is_selling', v_default_is_selling,
        'is_active', v_default_is_active,
        'is_healthy', (v_default_is_selling AND v_default_is_active)
      )
    END,
    'total_active_cards', v_total_cards,
    'phantom_cards', v_phantom_cards,
    'stale_agent_cards', v_stale_agent_cards,
    'orphan_buildings', v_orphan_buildings,
    'disaster_state', (v_selling_count = 0),
    'health_grade', CASE
      WHEN v_selling_count = 0 THEN 'critical'
      WHEN v_default_id IS NOT NULL AND NOT v_default_is_selling THEN 'critical'
      WHEN v_stale_agent_cards > 0 THEN 'warning'
      WHEN v_phantom_cards > 0 OR v_orphan_buildings > 0 THEN 'caution'
      ELSE 'healthy'
    END
  );

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.resolver_health_check(uuid) IS
  'W-TERRITORY-OPS T0-1: per-tenant routing health summary. Used by Health view (T1-2).';

COMMIT;