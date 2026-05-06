-- supabase/migrations/20260507_t3_01_resolver_baseline.sql
-- W-TERRITORY/T3a step 1 of 2 — capture baseline of existing resolver functions.
--
-- Both functions exist in production DB but were never captured in any prior
-- migration. This file makes them part of migration history via CREATE OR
-- REPLACE so fresh DB setups (running all migrations in order) end up with
-- the same starting state we have in production. Idempotent against current
-- production: no behavioral change. Subsequent migration t3_02 replaces both.
--
-- VERIFICATION (separate block after apply):
--   SELECT proname, pronargs FROM pg_proc p
--   JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname='public'
--     AND proname IN ('resolve_agent_for_context','resolve_display_agent_for_context');
--   -- Expected: 2 rows, pronargs=7 each

BEGIN;

-- ─── resolve_agent_for_context (routing resolver, baseline) ──────────────────
CREATE OR REPLACE FUNCTION public.resolve_agent_for_context(
  p_listing_id uuid DEFAULT NULL::uuid,
  p_building_id uuid DEFAULT NULL::uuid,
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
  v_agent_id UUID;
  v_managed_id UUID;
  v_tenant_restricted BOOLEAN;
  v_tenant_ok BOOLEAN;
BEGIN
  IF p_tenant_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tenant_property_access
      WHERE tenant_id = p_tenant_id AND is_active = true
    ) INTO v_tenant_restricted;

    IF v_tenant_restricted THEN
      SELECT EXISTS (
        SELECT 1 FROM tenant_property_access
        WHERE tenant_id = p_tenant_id AND is_active = true
        AND (
          (area_id = p_area_id AND p_area_id IS NOT NULL) OR
          (municipality_id = p_municipality_id AND p_municipality_id IS NOT NULL) OR
          (community_id = p_community_id AND p_community_id IS NOT NULL)
        )
      ) INTO v_tenant_ok;
      IF NOT v_tenant_ok THEN RETURN NULL; END IF;
    END IF;
  END IF;

  -- P1: Listing-level assignment
  IF p_listing_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_listing_assignments WHERE listing_id = p_listing_id;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building-level assignment
  IF p_building_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_geo_buildings WHERE building_id = p_building_id;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P3: Community geo assignment
  IF p_community_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_property_access
    WHERE community_id = p_community_id AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY created_at ASC LIMIT 1;
    IF v_agent_id IS NOT NULL THEN
      SELECT id INTO v_managed_id FROM agents
      WHERE parent_id = v_agent_id
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      ORDER BY created_at ASC LIMIT 1;
      RETURN COALESCE(v_managed_id, v_agent_id);
    END IF;
  END IF;

  -- P4: Municipality geo assignment
  IF p_municipality_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_property_access
    WHERE municipality_id = p_municipality_id AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY created_at ASC LIMIT 1;
    IF v_agent_id IS NOT NULL THEN
      SELECT id INTO v_managed_id FROM agents
      WHERE parent_id = v_agent_id
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      ORDER BY created_at ASC LIMIT 1;
      RETURN COALESCE(v_managed_id, v_agent_id);
    END IF;
  END IF;

  -- P5: Area geo assignment
  IF p_area_id IS NOT NULL THEN
    SELECT agent_id INTO v_agent_id FROM agent_property_access
    WHERE area_id = p_area_id AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY created_at ASC LIMIT 1;
    IF v_agent_id IS NOT NULL THEN
      SELECT id INTO v_managed_id FROM agents
      WHERE parent_id = v_agent_id
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      ORDER BY created_at ASC LIMIT 1;
      RETURN COALESCE(v_managed_id, v_agent_id);
    END IF;
  END IF;

  -- P6: User's permanently assigned agent
  IF p_user_id IS NOT NULL THEN
    SELECT assigned_agent_id INTO v_agent_id FROM user_profiles
    WHERE id = p_user_id AND assigned_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P7: Tenant default agent
  IF p_tenant_id IS NOT NULL THEN
    SELECT default_agent_id INTO v_agent_id FROM tenants
    WHERE id = p_tenant_id AND default_agent_id IS NOT NULL;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P8: Any active agent in tenant (last resort)
  IF p_tenant_id IS NOT NULL THEN
    SELECT id INTO v_agent_id FROM agents
    WHERE tenant_id = p_tenant_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- ─── resolve_display_agent_for_context (display resolver, baseline) ──────────
CREATE OR REPLACE FUNCTION public.resolve_display_agent_for_context(
  p_listing_id uuid DEFAULT NULL::uuid,
  p_building_id uuid DEFAULT NULL::uuid,
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
  v_resolved_id uuid;
  v_selling_id uuid;
BEGIN
  v_resolved_id := resolve_agent_for_context(
    p_listing_id, p_building_id, p_community_id,
    p_municipality_id, p_area_id, p_user_id, p_tenant_id
  );
  IF v_resolved_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_selling_id FROM agents
  WHERE id = v_resolved_id AND is_selling = true AND is_active = true
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  IF v_selling_id IS NOT NULL THEN RETURN v_selling_id; END IF;

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
