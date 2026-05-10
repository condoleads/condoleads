-- W-LEADS-EMAIL T2g — manual rollback for resolve_agent_for_context.
-- Restores the original body (verbatim from T0-F probe 2026-05-10).
-- Idempotent — CREATE OR REPLACE is safe to run repeatedly.
--
-- WARNING: rolling back reintroduces F-RESOLVE-AGENT-P1-P2-MISSING-TENANT-FILTER
-- and F-RESOLVE-AGENT-P8-USER-PROFILES-CROSS-TENANT-LEAK. Only use for
-- emergency revert if T2g introduces a regression.

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

  IF p_listing_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_listing_assignments WHERE listing_id = p_listing_id;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_building_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_geo_buildings WHERE building_id = p_building_id;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_neighbourhood_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('neighbourhood', p_neighbourhood_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_community_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('community', p_community_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_municipality_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('municipality', p_municipality_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_agent_id := pick_routing_agent('area', p_area_id, p_tenant_id, p_listing_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM tenant_users
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND assigned_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM user_profiles
    WHERE id = p_user_id AND assigned_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_tenant_id IS NOT NULL THEN
    SELECT default_agent_id INTO v_agent_id FROM tenants
    WHERE id = p_tenant_id AND default_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

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