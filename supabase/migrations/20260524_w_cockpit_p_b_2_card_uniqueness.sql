-- supabase/migrations/20260524_w_cockpit_p_b_2_card_uniqueness.sql
-- W-COCKPIT P-B-2 Commit 1: enforce one-card-per-slot territory model.
--
-- Rationale: Shah's locked model is "cards = defaults + assignments, one
-- card per slot, one agent per card." Schema today allows multiple rows
-- on the same slot, which makes the UI lie. Three UNIQUE indexes enforce
-- the model at the DB level so race conditions + drift can't break it.
--
-- Pre-flight verified clean (zero existing duplicates, 2026-05-24).
--
-- A. agent_property_access -- one active card per (tenant, scope, geo-slot).
--    Partial index on is_active=true allows soft-deleted history rows to
--    remain. Slot key includes all four geo FKs since exactly one is
--    non-null per scope; the index treats NULLs as distinct which is the
--    correct semantic here (a muni-scope card with municipality_id=X is
--    a different slot from a community-scope card with community_id=X).
CREATE UNIQUE INDEX IF NOT EXISTS uq_apa_active_slot
  ON public.agent_property_access (
    tenant_id,
    scope,
    COALESCE(area_id,          '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(municipality_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(community_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(neighbourhood_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_active = true;

COMMENT ON INDEX public.uq_apa_active_slot IS
  'W-COCKPIT P-B-2: one active card per (tenant, scope, geo). NULL UUIDs coalesced to sentinel so partial-unique works across all scope values.';

-- B. agent_geo_buildings -- one card per (building, agent).
--    Allows multi-agent-per-building (operator may legitimately have two
--    agents marketing the same tower) but prevents same-agent-twice drift.
--    Resolver returns first-match-by-id today; multi-agent case surfaces
--    in Ops as a conflict for operator decision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agb_building_agent
  ON public.agent_geo_buildings (building_id, agent_id);

COMMENT ON INDEX public.uq_agb_building_agent IS
  'W-COCKPIT P-B-2: prevent same-agent-twice on same building. Multi-agent per building still allowed but surfaces as Ops conflict.';

-- C. agent_listing_assignments -- one card per listing.
--    Listing pin is the most-specific level; deepest-card-wins means
--    a listing has exactly one assigned agent. No multi-pin semantics.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ala_listing
  ON public.agent_listing_assignments (listing_id);

COMMENT ON INDEX public.uq_ala_listing IS
  'W-COCKPIT P-B-2: one card per listing. Listing pin is the deepest cascade level; cannot have two cards for one listing.';