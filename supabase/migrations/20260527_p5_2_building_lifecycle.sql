-- supabase/migrations/20260527_p5_2_building_lifecycle.sql
-- W-TERRITORY-MASTER P5.2: building-tier lifecycle (is_active + audit + reroll).
--
-- Mirrors the P5 listing-pin migration pattern, applied to agent_geo_buildings.
-- Single transaction; verified by scripts/r-w-territory-master-p5-2-deploy.js.
--
-- Steps:
--   1. Drop redundant unique constraint + index on (building_id) alone
--      (replaced by partial unique on active rows).
--   2. Add lifecycle columns (is_active, deactivated_at, deactivated_by, assigned_reason).
--   3. Partial unique index on (building_id) WHERE is_active = true.
--   4. Extend territory_assignment_changes.change_type CHECK to add
--      'building_assigned', 'building_unassigned', 'building_reactivated'.
--   5. New helper: reresolve_building(building_id, tenant_id). Iterates over
--      mls_listings with that building_id, calls reresolve_listing per row.
--   6. Trigger function handle_building_card_change: audit + reroll on
--      INSERT/UPDATE/DELETE. Mirrors handle_listing_pin_change with
--      'building_*' change_types and scope='building'.
--   7. AFTER trigger on agent_geo_buildings.
--   8. Patch resolve_agent_for_context P2 building branch: add
--      `AND agb.is_active = true` so soft-deleted cards never route.
--
-- Pre-existing 9 building cards on WALLiam stay valid: is_active defaults to true.

BEGIN;

-- ============================================================================
-- 1. Drop redundant uniqueness on (building_id) alone.
--    Keep uq_agb_building_agent (building_id, agent_id) for now — it doesn't
--    conflict with the partial unique below; the partial unique enforces
--    "one ACTIVE card per building" while uq_agb_building_agent prevents
--    duplicate (building, agent) pairs in any state.
-- ============================================================================
ALTER TABLE agent_geo_buildings
  DROP CONSTRAINT agent_geo_buildings_building_id_key;

-- ============================================================================
-- 2. Lifecycle columns.
-- ============================================================================
ALTER TABLE agent_geo_buildings
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES agents(id),
  ADD COLUMN assigned_reason text;

-- ============================================================================
-- 3. Partial unique index: one ACTIVE card per building.
-- ============================================================================
CREATE UNIQUE INDEX uq_agb_building_active
  ON agent_geo_buildings(building_id)
  WHERE is_active = true;

-- ============================================================================
-- 4. Extend audit CHECK.
-- ============================================================================
ALTER TABLE territory_assignment_changes
  DROP CONSTRAINT territory_assignment_changes_change_type_check;
ALTER TABLE territory_assignment_changes
  ADD CONSTRAINT territory_assignment_changes_change_type_check
  CHECK (change_type = ANY (ARRAY[
    'assignment_granted'::text,
    'assignment_revoked'::text,
    'primary_set'::text,
    'primary_unset'::text,
    'percentage_set'::text,
    'percentage_changed'::text,
    'scope_widened'::text,
    'scope_narrowed'::text,
    'pin_added'::text,
    'pin_removed'::text,
    'pin_reactivated'::text,
    'access_toggle_changed'::text,
    'building_assigned'::text,
    'building_unassigned'::text,
    'building_reactivated'::text
  ]));

-- ============================================================================
-- 5. reresolve_building helper.
--    Iterates over mls_listings with the given building_id and calls
--    reresolve_listing for each. Reroll happens for every listing whose cache
--    state may have changed because of a card lifecycle event.
-- ============================================================================
CREATE OR REPLACE FUNCTION reresolve_building(p_building_id uuid, p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_listing_id IN
    SELECT id FROM mls_listings WHERE building_id = p_building_id
  LOOP
    PERFORM reresolve_listing(v_listing_id, p_tenant_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 6. handle_building_card_change trigger function.
--    Mirrors handle_listing_pin_change with building-specific change_types.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_building_card_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_change_type text;
  v_before jsonb;
  v_after jsonb;
  v_affected_building_id uuid;
  v_acting_user uuid;
BEGIN
  -- Recursion guard.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve tenant from agent.
  SELECT tenant_id INTO v_tenant_id
  FROM agents
  WHERE id = COALESCE(NEW.agent_id, OLD.agent_id);

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'handle_building_card_change: cannot resolve tenant_id for agent %',
      COALESCE(NEW.agent_id, OLD.agent_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_change_type := 'building_assigned';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_affected_building_id := NEW.building_id;
    v_acting_user := NEW.assigned_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_affected_building_id := NEW.building_id;
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_change_type := 'building_unassigned';
      v_acting_user := NEW.deactivated_by;
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      v_change_type := 'building_reactivated';
      v_acting_user := NEW.assigned_by;
    ELSE
      v_change_type := NULL;
      v_acting_user := NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'building_unassigned';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_affected_building_id := OLD.building_id;
    v_acting_user := OLD.assigned_by;
  END IF;

  -- Audit row.
  IF v_change_type IS NOT NULL THEN
    INSERT INTO territory_assignment_changes(
      tenant_id, agent_id, scope, scope_id,
      change_type, before_state, after_state,
      changed_by, notes
    ) VALUES (
      v_tenant_id,
      COALESCE(NEW.agent_id, OLD.agent_id),
      'building',
      v_affected_building_id,
      v_change_type,
      v_before,
      v_after,
      v_acting_user,
      COALESCE(NEW.assigned_reason, OLD.assigned_reason)
    );
  END IF;

  -- Reroll all listings under this building.
  PERFORM reresolve_building(v_affected_building_id, v_tenant_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_building_card_change ON agent_geo_buildings;
CREATE TRIGGER trg_building_card_change
  AFTER INSERT OR UPDATE OR DELETE ON agent_geo_buildings
  FOR EACH ROW
  EXECUTE FUNCTION handle_building_card_change();

-- ============================================================================
-- 7. Patch resolve_agent_for_context P2 (building) branch.
--    Add `AND agb.is_active = true` so soft-deleted cards never route.
--    All other lines unchanged (verified by deploy runner's diff check).
-- ============================================================================
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
  v_property_type text;
  v_is_condo boolean := false;
  v_is_home  boolean := false;
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
    SELECT property_type INTO v_property_type
    FROM mls_listings WHERE id = p_listing_id;
    IF v_property_type = 'Residential Condo & Other' THEN
      v_is_condo := true;
    ELSIF v_property_type = 'Residential Freehold' THEN
      v_is_home := true;
    END IF;
  END IF;

  -- P1: Listing pin (firm). P5: is_active filter added so soft-deleted pins never route.
  IF p_listing_id IS NOT NULL THEN
    SELECT ala.agent_id INTO v_agent_id
    FROM agent_listing_assignments ala
    JOIN agents a ON a.id = ala.agent_id
    WHERE ala.listing_id = p_listing_id
      AND ala.is_active = true
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building pin (firm). P5.2: is_active filter added so soft-deleted cards never route.
  IF p_building_id IS NOT NULL THEN
    SELECT agb.agent_id INTO v_agent_id
    FROM agent_geo_buildings agb
    JOIN agents a ON a.id = agb.agent_id
    WHERE agb.building_id = p_building_id
      AND agb.is_active = true
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  IF p_neighbourhood_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'neighbourhood', p_neighbourhood_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  IF p_community_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'community', p_community_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  IF p_municipality_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'municipality', p_municipality_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  IF p_area_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'area', p_area_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  IF p_listing_id IS NULL THEN
    IF p_neighbourhood_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('neighbourhood', p_neighbourhood_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_community_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('community', p_community_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_municipality_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('municipality', p_municipality_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_area_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('area', p_area_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

COMMIT;