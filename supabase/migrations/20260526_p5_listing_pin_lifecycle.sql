-- supabase/migrations/20260526_p5_listing_pin_lifecycle.sql
-- W-TERRITORY-MASTER P5: Single-listing pins lifecycle + resolver patch.
--
-- Applies in a single transaction. Verified by scripts/r-w-territory-master-p5-deploy.js
-- which probes pre-state, applies, then verifies post-state before COMMIT.
--
-- Step list:
--   1. Drop duplicate / soon-to-be-replaced uniqueness on listing_id
--   2. Add lifecycle columns (is_active, deactivated_at, deactivated_by, pin_reason)
--   3. Partial unique index on (listing_id) WHERE is_active = true
--   4. Extend territory_assignment_changes.change_type CHECK to include 'pin_reactivated'
--   5. Trigger function handle_listing_pin_change + AFTER trigger
--   6. Patch resolve_agent_for_context P1 branch: AND ala.is_active = true

BEGIN;

-- ============================================================================
-- 1. Drop redundant uniqueness on listing_id
-- ============================================================================
ALTER TABLE agent_listing_assignments
  DROP CONSTRAINT agent_listing_assignments_listing_id_key;
DROP INDEX IF EXISTS uq_ala_listing;

-- ============================================================================
-- 2. Add lifecycle columns
-- ============================================================================
ALTER TABLE agent_listing_assignments
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES agents(id),
  ADD COLUMN pin_reason text;

-- ============================================================================
-- 3. Partial unique: one active pin per listing
-- ============================================================================
CREATE UNIQUE INDEX uq_ala_listing_active
  ON agent_listing_assignments(listing_id)
  WHERE is_active = true;

-- ============================================================================
-- 4. Extend audit table CHECK to allow 'pin_reactivated'
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
    'access_toggle_changed'::text
  ]));

-- ============================================================================
-- 5. Trigger function + AFTER trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_listing_pin_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_change_type text;
  v_before jsonb;
  v_after jsonb;
  v_affected_listing_id uuid;
  v_acting_user uuid;
BEGIN
  -- Resolve tenant from agent (multi-tenant safety). Agent.tenant_id is the
  -- canonical owner; pins inherit tenant from the agent they pin to.
  SELECT tenant_id INTO v_tenant_id
  FROM agents
  WHERE id = COALESCE(NEW.agent_id, OLD.agent_id);

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'handle_listing_pin_change: cannot resolve tenant_id for agent %',
      COALESCE(NEW.agent_id, OLD.agent_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_change_type := 'pin_added';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_affected_listing_id := NEW.listing_id;
    v_acting_user := NEW.assigned_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_affected_listing_id := NEW.listing_id;
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_change_type := 'pin_removed';
      v_acting_user := NEW.deactivated_by;
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      v_change_type := 'pin_reactivated';
      v_acting_user := NEW.assigned_by;
    ELSE
      -- No lifecycle transition. Still reroll downstream, but don't write audit.
      v_change_type := NULL;
      v_acting_user := NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'pin_removed';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_affected_listing_id := OLD.listing_id;
    v_acting_user := OLD.assigned_by;
  END IF;

  IF v_change_type IS NOT NULL THEN
    INSERT INTO territory_assignment_changes(
      tenant_id, agent_id, scope, scope_id,
      change_type, before_state, after_state,
      changed_by, notes
    ) VALUES (
      v_tenant_id,
      COALESCE(NEW.agent_id, OLD.agent_id),
      'listing',
      v_affected_listing_id,
      v_change_type,
      v_before,
      v_after,
      v_acting_user,
      COALESCE(NEW.pin_reason, OLD.pin_reason)
    );
  END IF;

  -- Always reroll the affected listing (cache consistency).
  -- reresolve_listing is the per-listing helper shipped in W-TERRITORY T3b.
  PERFORM reresolve_listing(v_affected_listing_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_pin_change ON agent_listing_assignments;
CREATE TRIGGER trg_listing_pin_change
  AFTER INSERT OR UPDATE OR DELETE ON agent_listing_assignments
  FOR EACH ROW
  EXECUTE FUNCTION handle_listing_pin_change();

-- ============================================================================
-- 6. Patch resolve_agent_for_context: P1 branch must filter is_active = true
--
-- This is the EXACT function body captured from production via
-- scripts/probe-resolve-agent-for-context.js (run 2026-05-26), with ONE LINE
-- inserted at the P1 listing-pin branch:
--
--     AND ala.is_active = true
--
-- Position: after `WHERE ala.listing_id = p_listing_id`, before
-- `AND a.is_active = true AND a.is_selling = true`. No other line changes.
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
  -- Tenant-restriction check (preserved from T0-1 baseline).
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

  -- Derive property type from listing if provided. Used to filter cards by
  -- condo_access / homes_access at every geo tier below.
  -- 'Residential Condo & Other'   => condo
  -- 'Residential Freehold'        => home
  -- 'Commercial' or other         => no geo-tier match; only pin/building win
  IF p_listing_id IS NOT NULL THEN
    SELECT property_type INTO v_property_type
    FROM mls_listings WHERE id = p_listing_id;
    IF v_property_type = 'Residential Condo & Other' THEN
      v_is_condo := true;
    ELSIF v_property_type = 'Residential Freehold' THEN
      v_is_home := true;
    END IF;
  END IF;

  -- P1: Listing pin (firm). No property-type filter — the pin is explicit.
  -- P5: is_active filter added so soft-deleted pins never route.
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

  -- P2: Building pin (firm). Buildings always condo by nature; no property-type filter.
  IF p_building_id IS NOT NULL THEN
    SELECT agb.agent_id INTO v_agent_id
    FROM agent_geo_buildings agb
    JOIN agents a ON a.id = agb.agent_id
    WHERE agb.building_id = p_building_id
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P3: Neighbourhood — with property-type filter.
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

  -- P4: Community — with property-type filter.
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

  -- P5: Municipality — with property-type filter.
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

  -- P6: Area — with property-type filter.
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

  -- Page-level fallback (no listing_id): use untyped pick_routing_agent
  -- at the most-specific geo present. Returns is_primary card if any.
  -- This is NOT a routing fallback — it's the page-level display path.
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

  -- No card matched. Lead becomes unowned. P4's unowned-lead feed catches it.
  -- No hash-RR. No tenant default. No user pin lookup. No descendant walk.
  RETURN NULL;
END;
$function$;

COMMIT;