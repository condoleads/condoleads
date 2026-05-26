-- supabase/migrations/20260526_p2_resolver_strip.sql
-- W-TERRITORY-MASTER P2: strip resolver fallbacks + add property-type filter.
--
-- Implements W-TERRITORY-SPEC Rule 5 (no fallbacks for routing) and Rule 3
-- (property-type axis — condo_access / homes_access on every geo card).
--
-- Changes vs T0-1 baseline (20260524 migration):
--   1. resolve_agent_for_context: drops priorities P7 (user pin via tenant_users),
--      P8 (user pin via user_profiles), P9 (tenant default), P10 (hash-RR).
--      Walk is now strictly: listing pin -> building -> neighbourhood -> community
--      -> muni -> area -> NULL.
--   2. Property-type filter added at neighbourhood/community/muni/area tiers:
--      if listing is a condo (property_type = 'Residential Condo & Other')
--      require condo_access = true on the card; if home ('Residential Freehold')
--      require homes_access = true; 'Commercial' returns NULL.
--   3. pick_routing_agent: hash-RR branch removed. Returns is_primary card if any,
--      else NULL. No deterministic-first fallback.
--   4. resolve_display_agent_for_context: strips descendant walk, ancestor walk,
--      tenant default fallback, first-by-created_at. Returns routing resolver's
--      answer, or NULL.
--   5. New helper pick_routing_agent_for_type: extension that applies
--      property-type access flags.
--
-- Preserved:
--   - tenant_property_access top-level tenant restriction (not a fallback).
--   - is_selling AND is_active check at every priority (T0-1 Fix 2).
--   - resolver_health_check RPC (read-only diagnostic, unchanged).
--   - resolve_geo_primary (page-level is_primary picker, unchanged).

BEGIN;

-- ====================================================================
-- 1. pick_routing_agent — strip hash-RR
-- ====================================================================
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
  v_agent_id uuid;
BEGIN
  IF p_scope_id IS NULL THEN RETURN NULL; END IF;

  -- Return is_primary card if one exists at this scope.
  -- No hash-RR. No deterministic-first. No card => NULL.
  v_agent_id := resolve_geo_primary(p_scope, p_scope_id, p_tenant_id);
  RETURN v_agent_id;
END;
$function$;

-- ====================================================================
-- 2. pick_routing_agent_for_type — property-type-aware variant
-- ====================================================================
CREATE OR REPLACE FUNCTION public.pick_routing_agent_for_type(
  p_scope text,
  p_scope_id uuid,
  p_tenant_id uuid,
  p_is_condo boolean,
  p_is_home boolean
)
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
$function$;

-- ====================================================================
-- 3. resolve_agent_for_context — strip P7..P10, add property-type filter
-- ====================================================================
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
  IF p_listing_id IS NOT NULL THEN
    SELECT ala.agent_id INTO v_agent_id
    FROM agent_listing_assignments ala
    JOIN agents a ON a.id = ala.agent_id
    WHERE ala.listing_id = p_listing_id
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

-- ====================================================================
-- 4. resolve_display_agent_for_context — strip fallbacks
-- ====================================================================
CREATE OR REPLACE FUNCTION public.resolve_display_agent_for_context(
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
  v_resolved_id uuid;
BEGIN
  -- Display resolver is now a thin wrapper. The routing resolver does all
  -- the work (including property-type filter, selling+active check, geo walk).
  -- No descendant walk. No ancestor walk. No tenant default. No first-by-created_at.
  v_resolved_id := resolve_agent_for_context(
    p_listing_id, p_building_id, p_neighbourhood_id, p_community_id,
    p_municipality_id, p_area_id, p_user_id, p_tenant_id
  );

  RETURN v_resolved_id;
END;
$function$;

COMMENT ON FUNCTION public.resolve_agent_for_context IS
  'W-TERRITORY-MASTER P2: strict walk listing pin -> building -> neighbourhood -> community -> muni -> area -> NULL. Property-type filter on geo tiers. No fallbacks. NULL = unowned, handled by P4 feed.';

COMMENT ON FUNCTION public.resolve_display_agent_for_context IS
  'W-TERRITORY-MASTER P2: thin wrapper over resolve_agent_for_context. No fallbacks. NULL means no card matched — caller renders display fallback (general inquiry agent or no card).';

COMMENT ON FUNCTION public.pick_routing_agent IS
  'W-TERRITORY-MASTER P2: returns is_primary card at scope or NULL. No hash-RR.';

COMMENT ON FUNCTION public.pick_routing_agent_for_type IS
  'W-TERRITORY-MASTER P2: returns is_primary card at scope filtered by condo_access/homes_access. NULL if no matching card.';

COMMIT;