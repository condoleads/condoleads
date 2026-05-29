-- Rollback snapshot of public.reroll_listings_at_floor captured at 2026-05-28T19-19-31-762Z
-- Restore by piping this file into psql against the same database.

-- reroll_listings_at_floor(uuid,boolean,boolean)
CREATE OR REPLACE FUNCTION public.reroll_listings_at_floor(p_tenant_id uuid, p_is_condo boolean, p_is_home boolean)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_property_type_filter text;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF NOT (p_is_condo OR p_is_home) THEN RETURN 0; END IF;

  v_property_type_filter := CASE
    WHEN p_is_condo THEN 'Residential Condo & Other'
    WHEN p_is_home  THEN 'Residential Freehold'
  END;

  -- Touch only assigned_agent_id IS NULL rows. Existing cascade
  -- assignments (12,547 today) are NOT clobbered.
  WITH picks AS (
    SELECT
      ml.id AS listing_id,
      pick_floor_agent(ml.id, p_tenant_id, p_is_condo, p_is_home) AS new_pick
    FROM mls_listings ml
    WHERE ml.assigned_agent_id IS NULL
      AND ml.property_type = v_property_type_filter
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
      AND picks.new_pick IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$
;
