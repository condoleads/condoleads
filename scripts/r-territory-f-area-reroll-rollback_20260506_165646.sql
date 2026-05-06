-- Rollback snapshot for F-AREA-REROLL fix
-- Captured: 2026-05-06T20:56:47.912Z
-- To rollback: paste this entire file into the Supabase SQL editor or pipe through pg.

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(p_scope text, p_scope_id uuid, p_tenant_id uuid)
 RETURNS integer
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
$function$
;

CREATE OR REPLACE FUNCTION public.distribute_listings_at_geo(p_scope text, p_scope_id uuid, p_tenant_id uuid)
 RETURNS integer
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
$function$
;
