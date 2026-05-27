-- W-TERRITORY-MASTER P5.2b
-- Fix: reresolve_listing must read mls_listings.building_id and pass it to
-- resolve_agent_for_context. Without this, building-tier cards (P2 branch in
-- the resolver) never propagate to mls_listings.assigned_agent_id cache.
--
-- Verified via probe-resolver-signature.js + probe-other-callers-v2.js:
--   - resolve_agent_for_context oid 24991106, 8 uuid args
--   - reresolve_listing is the only caller passing NULL for p_building_id
--   - resolve_display_agent_for_context passes p_building_id through correctly (no patch needed)
--
-- Diff vs current body (oid 25001189):
--   1. SELECT line: add building_id to column list
--   2. Resolver call: NULL  -- p_building_id  ->  v_listing.building_id  -- p_building_id (P5.2b)
--   3. Stale comment removed: "building cache is out of T3b-B scope" no longer true
-- Everything else byte-identical.

BEGIN;

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
$function$;

COMMIT;