-- Rollback snapshot for P-LIFECYCLE Landing 2
-- Captured: 2026-05-29T20:17:46.852Z
-- Function: public.reresolve_listing(uuid, uuid)
-- pre-state prosecdef: false
-- pre-state proconfig: <none>
--
-- To restore exact pre-state: psql -f this_file. (Note: this is the
-- broken body that crashes on NULL-cache rows via
-- mls_listings_assigned_coupled_check; see F-RERESOLVE-COUPLED-CHECK.)
-- Combined with 20260530_phase_lifecycle_landing_2_down.sql, this is
-- redundant; the down-migration is the supported path.

CREATE OR REPLACE FUNCTION public.reresolve_listing(p_listing_id uuid, p_tenant_id uuid)
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

  SELECT area_id, municipality_id, community_id, building_id, assigned_agent_id
  INTO v_listing
  FROM mls_listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve via routing resolver. Pass NULL for neighbourhood (mls_listings has none).
  -- P5.2b: building_id is now read from the listing and passed through so building-tier
  -- cards (resolver P2 branch) propagate to mls_listings.assigned_agent_id cache.
  v_new_agent := resolve_agent_for_context(
    p_listing_id,
    v_listing.building_id,     -- p_building_id (P5.2b: was NULL)
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
$function$

