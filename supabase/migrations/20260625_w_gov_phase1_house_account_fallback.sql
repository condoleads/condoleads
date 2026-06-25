-- ============================================================================
-- W-TENANT-GOV-PHASE1 — house-account fallback INSIDE the RPC resolver.
-- 2026-06-25.
--
-- COMPANION TO: 20260625_w_gov_phase1_house_account_trigger.sql
--   That migration enforces the house-account INVARIANT (trigger validates the
--   selected agent at write-time).
--   This migration enforces the house-account FALLBACK (resolver returns the
--   house account when no specific assignment resolves at read-time).
--   Together they close the round-trip: a house account that's set is a house
--   account that actually receives unrouted traffic.
--
-- PROBLEM
--   lib/utils/tenant-resolver.ts:182 (resolveAgentForContext) wraps the RPC
--   and adds a default_agent_id fallback when the RPC returns NULL. But the
--   wrapper is bypassed by 6 callers that invoke supabase.rpc directly:
--     app/api/charlie/lead/route.ts:115          (LEAD CREATE)
--     app/api/charlie/appointment/route.ts:98
--     app/api/walliam/estimator/session/route.ts:98
--     app/api/walliam/contact/route.ts:98
--     app/api/walliam/charlie/session/route.ts:78
--     app/api/walliam/assign-user-agent/route.ts:137
--     lib/actions/leads.ts:99                    (LEAD ACTIONS)
--   On no territory/card match, the RPC returns NULL, the caller stores
--   agent_id=NULL, and the chain-email recipient resolver is called with
--   agentId=null. The house account never receives the lead.
--
-- FIX
--   Add a final fallback branch to resolve_agent_for_context: when nothing
--   else has resolved AND p_tenant_id is set AND the tenant has a
--   default_agent_id, route to that agent (with a defense-in-depth eligibility
--   re-check). Every caller — wrapper or raw RPC — gets the fallback.
--
-- CONTRACT CONSISTENCY WITH validate_house_account trigger
--   The trigger (20260625_w_gov_phase1_house_account_trigger.sql) validates
--   house-account candidates require: exists, tenant_id match, is_active=true,
--   role IN (agent, manager, area_manager, tenant_admin, admin). Notably
--   is_selling is NOT checked — a non-selling tenant_admin can be a valid
--   house account by design (Aily's seed admin 0b3fcbf7 is exactly this case).
--
--   The fallback branch below mirrors that contract: it checks is_active +
--   tenant_id, NOT is_selling. This intentionally differs from the rest of
--   the cascade (P1-P6 + P-FLOOR all require is_selling=true). The house
--   account is the explicit catch-all where the "must be selling" filter
--   does NOT apply.
--
-- BEHAVIOR DELTA (what changes)
--   BEFORE: RPC returns NULL when no specific assignment + no floor pool match.
--           Callers using the raw RPC get null. Lead saves with agent_id=NULL.
--   AFTER:  RPC returns tenants.default_agent_id when no other resolution.
--           Callers get the house account. Lead saves with agent_id=house_account.
--           Chain email goes to the house account + their hierarchy.
--
--   Callers that already used the TS wrapper saw this behavior already (the
--   wrapper had its own fallback at lib/utils/tenant-resolver.ts:222-228).
--   This migration aligns the raw-RPC callers with the wrapper-callers — no
--   wrapper-caller's behavior changes. Pure improvement for raw-RPC callers.
--
-- PHASE 2 EXTENSION
--   When agents.cards_opt_out lands (Phase 2), this fallback gets a 4th
--   condition (NOT cards_opt_out) added to the EXISTS check. Function
--   signature unchanged; safe CREATE OR REPLACE.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION. Safe to apply multiple times.
-- ============================================================================

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
  v_property_type text;
  v_is_condo boolean := false;
  v_is_home  boolean := false;
  v_default_agent_id uuid;
BEGIN
  -- Tenant restriction gate (tenant_property_access).
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

  -- Derive property type from listing if provided.
  IF p_listing_id IS NOT NULL THEN
    SELECT property_type INTO v_property_type
    FROM mls_listings WHERE id = p_listing_id;
    IF v_property_type = 'Residential Condo & Other' THEN
      v_is_condo := true;
    ELSIF v_property_type = 'Residential Freehold' THEN
      v_is_home := true;
    END IF;
  END IF;

  -- P1: Listing pin (firm).
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

  -- P2: Building pin (firm).
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

  -- P3: Neighbourhood, property-type-aware.
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

  -- P4: Community, property-type-aware.
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

  -- P5: Municipality, property-type-aware.
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

  -- P6: Area, property-type-aware.
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

  -- Page-level fallback (no listing_id): untyped picks.
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

  -- P-FLOOR (D3a): bounded hash-RR over tenant_floor_pool for the property type.
  IF p_listing_id IS NOT NULL AND p_tenant_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_floor_agent(p_listing_id, p_tenant_id, v_is_condo, v_is_home);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- ============================================================
  -- W-TENANT-GOV-PHASE1: house-account fallback (final catch-all).
  -- ============================================================
  -- Pairs with validate_house_account trigger (20260625) which enforces the
  -- INVARIANT at write-time. This branch enforces the FALLBACK at read-time.
  -- Contract: is_active + tenant_id match (NOT is_selling — the house account
  -- is allowed to be a non-selling tenant_admin per the trigger contract).
  IF p_tenant_id IS NOT NULL THEN
    SELECT default_agent_id INTO v_default_agent_id
    FROM tenants
    WHERE id = p_tenant_id;
    IF v_default_agent_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM agents
        WHERE id = v_default_agent_id
          AND tenant_id = p_tenant_id
          AND is_active = true
      ) THEN
        RETURN v_default_agent_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.resolve_agent_for_context IS
  'W-TENANT-GOV-PHASE1 (v14): canonical resolver. P1=listing pin, P2=building pin, P3-P6=apa cards property-type-aware (neighbourhood->community->municipality->area), page-level fallback untyped at each scope (no listing context), P-FLOOR=bounded hash-RR over tenant_floor_pool, P-HOUSE=tenants.default_agent_id (is_active + tenant match, NO is_selling filter — matches validate_house_account trigger contract). Returns NULL only when all branches fail (e.g. tenant has no default_agent_id, or the configured house account no longer satisfies the eligibility re-check).';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual via apply-runner snapshot, or in Studio if needed):
--   The apply-runner captures the prior CREATE FUNCTION definition as a
--   rollback snapshot before applying. To restore, re-execute the snapshot.
-- ============================================================================
