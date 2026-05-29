-- Rollback snapshot for P-LIFECYCLE Landing 1
-- Captured: 2026-05-29T16:35:26.033Z
-- Function: public.pick_floor_agent(uuid, uuid, boolean, boolean)
-- pre-state prosecdef: false
-- pre-state proconfig: <none>
--
-- To restore exact pre-state: psql -f this_file.
-- (Combined with 20260529_phase_lifecycle_landing_1_down.sql, this is
--  redundant — the down-migration is the supported path.)

CREATE OR REPLACE FUNCTION public.pick_floor_agent(p_listing_id uuid, p_tenant_id uuid, p_is_condo boolean, p_is_home boolean)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
  v_total int;
BEGIN
  -- Guard: need a tenant and a listing-id-for-hashing.
  IF p_tenant_id IS NULL OR p_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guard: at least one property-type flag must be requested.
  IF NOT (p_is_condo OR p_is_home) THEN
    RETURN NULL;
  END IF;

  -- Count eligible pool members for this property type.
  SELECT COUNT(*) INTO v_total
  FROM public.tenant_floor_pool tfp
  JOIN public.agents a ON a.id = tfp.agent_id
  WHERE tfp.tenant_id = p_tenant_id
    AND tfp.is_active = true
    AND a.is_active = true
    AND a.is_selling = true
    AND (
      (p_is_condo = true AND tfp.condo_access = true) OR
      (p_is_home  = true AND tfp.homes_access = true)
    );

  -- Empty pool for this property type: write alert, return NULL.
  IF v_total = 0 THEN
    INSERT INTO public.tenant_floor_alerts (
      tenant_id, property_type, listing_id, alert_type
    ) VALUES (
      p_tenant_id,
      CASE WHEN p_is_condo THEN 'condo' ELSE 'home' END,
      p_listing_id,
      'empty_floor_pool'
    );
    RETURN NULL;
  END IF;

  -- Hash-RR pick from eligible pool, deterministic by listing_id.
  WITH eligible AS (
    SELECT tfp.agent_id,
           (ROW_NUMBER() OVER (ORDER BY tfp.agent_id) - 1) AS rn
    FROM public.tenant_floor_pool tfp
    JOIN public.agents a ON a.id = tfp.agent_id
    WHERE tfp.tenant_id = p_tenant_id
      AND tfp.is_active = true
      AND a.is_active = true
      AND a.is_selling = true
      AND (
        (p_is_condo = true AND tfp.condo_access = true) OR
        (p_is_home  = true AND tfp.homes_access = true)
      )
  )
  SELECT agent_id INTO v_agent_id
  FROM eligible
  WHERE rn = (abs(hashtext(p_listing_id::text)) % v_total);

  RETURN v_agent_id;
END;
$function$

