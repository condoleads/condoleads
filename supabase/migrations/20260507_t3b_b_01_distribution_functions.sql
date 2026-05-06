-- supabase/migrations/20260507_t3b_b_01_distribution_functions.sql
-- W-TERRITORY/T3b-B — distribution + re-roll + re-resolve PL/pgSQL functions.
--
-- Functions:
--   1. distribute_geo_to_children(parent_scope, parent_id, child_scope, tenant_id)
--      Event 1: pick primaries at child geos from parent's routing set.
--      Per OD-3: skips children that already have a primary (defaults fill vacuum).
--      Valid pairs (per actual schema FKs):
--        area -> municipality (via municipalities.area_id)
--        area -> neighbourhood (via neighbourhoods.area_id, NULLABLE)
--        municipality -> community (via communities.municipality_id)
--      No community -> neighbourhood (neighbourhoods point to area, not community).
--
--   2. distribute_listings_at_geo(scope, scope_id, tenant_id)
--      Event 2: cache assigned_agent_id on UNCACHED mls_listings in geo.
--      Uses T3a's pick_routing_agent (hash by listing_id, equal-share T2a).
--      Scopes: area, municipality, community (mls_listings has no neighbourhood_id).
--
--   3. reroll_listings_at_geo(scope, scope_id, tenant_id)
--      Force-recompute cache for ALL listings in geo (overrides existing).
--      Used when routing set changes (T3b-C trigger fires this).
--
--   4. reresolve_listing(listing_id, tenant_id)
--      Single-listing recompute via resolve_agent_for_context.
--      Used when scope shrinks and a listing falls out of cached agent's territory.
--
-- Audit strategy (V1):
--   * apa changes (Event 1) -> territory_assignment_changes (change_type='primary_set')
--   * mls_listings.assigned_agent_id changes -> NO audit row (lead_ownership_changes
--     requires lead_id NOT NULL; listings cache changes are not lead reassignments).
--     Documented gap: a listing_assignment_changes audit table is a future addition.
--
-- Tenant scope:
--   distribute_listings_at_geo + reroll + reresolve operate on mls_listings
--   (tenant-agnostic). Tenant arg gates the routing set lookup inside
--   pick_routing_agent. Multi-tenant cache contention (two tenants both routing
--   same listing) is a known V1 gap; documented in tracker.
--
-- Race safety: distribute_geo_to_children wraps INSERT in BEGIN/EXCEPTION block
--   to swallow unique_violation from the partial unique indexes (uniq_apa_primary_*).
--   If a concurrent transaction beats this one, we skip the child silently.
--
-- Idempotency: CREATE OR REPLACE for all 4 functions. Safe to re-run.
--
-- Rollback:
--   DROP FUNCTION public.distribute_geo_to_children(text, uuid, text, uuid);
--   DROP FUNCTION public.distribute_listings_at_geo(text, uuid, uuid);
--   DROP FUNCTION public.reroll_listings_at_geo(text, uuid, uuid);
--   DROP FUNCTION public.reresolve_listing(uuid, uuid);
--
-- VERIFICATION (separate blocks after apply):
--   Block A: 4 functions present with correct pronargs
--   Block B (optional smoke): preview Whitby community distribution
--   Block C (optional smoke): execute Whitby community distribution

BEGIN;

-- ─── distribute_geo_to_children ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.distribute_geo_to_children(
  p_parent_scope text,
  p_parent_id uuid,
  p_child_scope text,
  p_tenant_id uuid
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agents uuid[];
  v_n_agents int;
  v_inserted int := 0;
  v_pick uuid;
  v_i int := 0;
  v_child_id uuid;
BEGIN
  IF p_parent_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Validate parent -> child pair (per actual schema FKs)
  IF NOT (
    (p_parent_scope = 'area' AND p_child_scope IN ('municipality', 'neighbourhood')) OR
    (p_parent_scope = 'municipality' AND p_child_scope = 'community')
  ) THEN
    RAISE EXCEPTION 'Invalid parent->child distribution pair: % -> %. Valid: area->municipality, area->neighbourhood, municipality->community.',
      p_parent_scope, p_child_scope;
  END IF;

  -- Get parent's routing set, shuffled for random tiebreak
  SELECT array_agg(agent_id ORDER BY random())
  INTO v_agents
  FROM agent_property_access
  WHERE scope = p_parent_scope
    AND tenant_id = p_tenant_id
    AND is_active = true
    AND (
      (p_parent_scope = 'area' AND area_id = p_parent_id) OR
      (p_parent_scope = 'municipality' AND municipality_id = p_parent_id)
    );

  IF v_agents IS NULL OR cardinality(v_agents) = 0 THEN
    RETURN 0;
  END IF;
  v_n_agents := cardinality(v_agents);

  -- Iterate children (shuffled) at the requested child scope
  FOR v_child_id IN
    SELECT id FROM (
      SELECT id FROM municipalities WHERE area_id = p_parent_id AND p_child_scope = 'municipality'
      UNION ALL
      SELECT id FROM communities WHERE municipality_id = p_parent_id AND p_child_scope = 'community'
      UNION ALL
      SELECT id FROM neighbourhoods WHERE area_id = p_parent_id AND p_child_scope = 'neighbourhood'
    ) sub
    ORDER BY random()
  LOOP
    -- Skip if child already has a primary (OD-3: defaults fill vacuum, no reshuffling)
    IF EXISTS (
      SELECT 1 FROM agent_property_access
      WHERE scope = p_child_scope
        AND tenant_id = p_tenant_id
        AND is_primary = true
        AND is_active = true
        AND (
          (p_child_scope = 'municipality' AND municipality_id = v_child_id) OR
          (p_child_scope = 'community' AND community_id = v_child_id) OR
          (p_child_scope = 'neighbourhood' AND neighbourhood_id = v_child_id)
        )
    ) THEN
      CONTINUE;
    END IF;

    -- Round-robin pick from shuffled set
    v_pick := v_agents[(v_i % v_n_agents) + 1];

    -- Insert primary apa row + audit, race-safe via unique_violation handler
    BEGIN
      INSERT INTO agent_property_access (
        tenant_id, agent_id, scope,
        area_id, municipality_id, community_id, neighbourhood_id,
        is_primary, is_active
      ) VALUES (
        p_tenant_id, v_pick, p_child_scope,
        NULL,
        CASE WHEN p_child_scope = 'municipality' THEN v_child_id END,
        CASE WHEN p_child_scope = 'community' THEN v_child_id END,
        CASE WHEN p_child_scope = 'neighbourhood' THEN v_child_id END,
        true, true
      );

      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type,
        before_state, after_state, notes
      ) VALUES (
        p_tenant_id, v_pick, p_child_scope, v_child_id, 'primary_set',
        jsonb_build_object('primary', null),
        jsonb_build_object(
          'primary', v_pick,
          'source', 'distribute_geo_to_children',
          'parent_scope', p_parent_scope,
          'parent_id', p_parent_id
        ),
        format('Auto-distributed primary for %s %s from %s %s routing set',
               p_child_scope, v_child_id, p_parent_scope, p_parent_id)
      );

      v_inserted := v_inserted + 1;
      v_i := v_i + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Another transaction claimed this child's primary OR (agent_id, community_id)
      -- pair already exists. Skip silently.
      NULL;
    END;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- ─── distribute_listings_at_geo ─────────────────────────────────────────────
-- Fills assigned_agent_id cache for UNCACHED listings (NULL cache only).
CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_pick uuid;
  v_listing_id uuid;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    -- mls_listings has no neighbourhood_id; can't distribute at that level
    RETURN 0;
  END IF;

  FOR v_listing_id IN
    SELECT id FROM mls_listings
    WHERE assigned_agent_id IS NULL
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  LOOP
    v_pick := pick_routing_agent(p_scope, p_scope_id, p_tenant_id, v_listing_id);

    IF v_pick IS NOT NULL THEN
      UPDATE mls_listings SET assigned_agent_id = v_pick WHERE id = v_listing_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ─── reroll_listings_at_geo ─────────────────────────────────────────────────
-- Forces re-pick on ALL listings in geo (overrides existing cache).
CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_pick uuid;
  rec record;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT id, assigned_agent_id
    FROM mls_listings
    WHERE (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    )
  LOOP
    v_pick := pick_routing_agent(p_scope, p_scope_id, p_tenant_id, rec.id);

    IF v_pick IS DISTINCT FROM rec.assigned_agent_id THEN
      UPDATE mls_listings SET assigned_agent_id = v_pick WHERE id = rec.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ─── reresolve_listing ──────────────────────────────────────────────────────
-- Single-listing recompute. Used when scope shrinks and a listing falls out
-- of its previous owner's territory.
CREATE OR REPLACE FUNCTION public.reresolve_listing(
  p_listing_id uuid,
  p_tenant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_listing record;
  v_new_agent uuid;
BEGIN
  IF p_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT area_id, municipality_id, community_id, assigned_agent_id
  INTO v_listing
  FROM mls_listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve via routing resolver. Pass NULL for neighbourhood (mls_listings has none)
  -- and NULL for building (building cache is out of T3b-B scope).
  v_new_agent := resolve_agent_for_context(
    p_listing_id,
    NULL,                      -- p_building_id
    NULL,                      -- p_neighbourhood_id
    v_listing.community_id,
    v_listing.municipality_id,
    v_listing.area_id,
    NULL,                      -- p_user_id
    p_tenant_id
  );

  IF v_new_agent IS DISTINCT FROM v_listing.assigned_agent_id THEN
    UPDATE mls_listings SET assigned_agent_id = v_new_agent WHERE id = p_listing_id;
  END IF;

  RETURN v_new_agent;
END;
$function$;

COMMIT;
