-- W-LEADS-EMAIL T2g — resolve_agent_for_context RPC tenant-leak fix
-- Fixes:
--   F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER (MAJOR)
--   F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK (MAJOR)
--
-- T0-F captured the original body. This migration replaces it with the same
-- 10-tier waterfall, but P1/P2/P8 now JOIN agents and filter by p_tenant_id.
--
-- NULL-tolerance preserved: when p_tenant_id IS NULL, the cross-tenant filter
-- is bypassed (matches legacy caller behavior, e.g. estimator/session route
-- per F-ESTIMATOR-SESSION-MISSING-TENANT-ID-IN-RESOLVER-CALL). T6c fixes that
-- caller; once all callers pass p_tenant_id, the NULL branch becomes
-- unreachable and could be tightened in a future migration.
--
-- CREATE OR REPLACE is atomic — in-flight queries calling the function get
-- the new version on next call. No data changes; rollback is a re-CREATE
-- with the original body (saved in scripts/...rollback.sql).

BEGIN;

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
$function$;

COMMIT;