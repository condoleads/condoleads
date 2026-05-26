-- supabase/migrations/20260526_p3_area_auto_distribute.sql
-- W-TERRITORY-MASTER P3: area auto-distribution engine.
--
-- Implements W-TERRITORY-SPEC Rule 1:
--   M areas distributed across N active selling agents.
--   If M >= N: every agent gets at least one area; leftovers round-robin.
--   If M <  N: first M agents (by created_at ASC) get one area each;
--               remaining N-M agents are unassigned (no card).
--   Skip any area that already has an active area-scope card on the tenant.
--
-- RPC: auto_distribute_areas(p_tenant_id uuid, p_area_ids uuid[])
--   - p_area_ids is REQUIRED and explicit. No silent default. The system does
--     not guess which areas a tenant operates in.
--   - Returns JSONB: { distributed: [...], skipped: [...], unassigned_agents: [...] }
--   - Idempotent: re-running with the same inputs is a no-op (existing slots skipped).
--
-- Cards created with: scope='area', is_primary=true, is_active=true,
--                     condo_access=true, homes_access=true.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_distribute_areas(
  p_tenant_id uuid,
  p_area_ids uuid[]
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_ids uuid[];
  v_n_agents int;
  v_n_areas int;
  v_distributed jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_unassigned_agents jsonb := '[]'::jsonb;
  v_agent_id uuid;
  v_area_id uuid;
  v_agent_idx int;
  v_inserted_id uuid;
  v_already_held uuid;
BEGIN
  -- Input validation
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'auto_distribute_areas: p_tenant_id is required';
  END IF;
  IF p_area_ids IS NULL OR array_length(p_area_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'auto_distribute_areas: p_area_ids must contain at least one area';
  END IF;

  v_n_areas := array_length(p_area_ids, 1);

  -- Verify every area exists
  PERFORM 1 FROM treb_areas
   WHERE id = ANY(p_area_ids)
  HAVING COUNT(*) = v_n_areas;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auto_distribute_areas: one or more p_area_ids do not exist in treb_areas';
  END IF;

  -- Verify tenant exists
  PERFORM 1 FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auto_distribute_areas: tenant % not found', p_tenant_id;
  END IF;

  -- Get active selling agents in deterministic order
  SELECT array_agg(id ORDER BY created_at ASC, id ASC)
  INTO v_agent_ids
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND is_active = true
    AND is_selling = true;

  IF v_agent_ids IS NULL OR array_length(v_agent_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'auto_distribute_areas: no active selling agents for tenant %', p_tenant_id;
  END IF;
  v_n_agents := array_length(v_agent_ids, 1);

  -- ===== Distribution loop =====
  -- For each area in input order, pick agent at index (i % n_agents).
  -- If M < N, only the first M agents receive areas; remaining agents
  -- enter unassigned bucket.
  FOR i IN 1..v_n_areas LOOP
    v_area_id := p_area_ids[i];

    -- Check if this area already has an active area-scope card on this tenant.
    SELECT agent_id INTO v_already_held
    FROM agent_property_access
    WHERE tenant_id = p_tenant_id
      AND scope = 'area'
      AND area_id = v_area_id
      AND is_active = true
    LIMIT 1;

    IF v_already_held IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'area_id', v_area_id,
        'reason', 'already_has_card',
        'held_by_agent_id', v_already_held
      );
      CONTINUE;
    END IF;

    -- Pick agent for this area: round-robin by area index (1-based -> 0-based mod).
    v_agent_idx := ((i - 1) % v_n_agents) + 1;  -- 1-based array index
    v_agent_id := v_agent_ids[v_agent_idx];

    -- Insert the area card
    INSERT INTO agent_property_access (
      agent_id,
      tenant_id,
      scope,
      area_id,
      condo_access,
      homes_access,
      buildings_access,
      is_primary,
      is_active
    ) VALUES (
      v_agent_id,
      p_tenant_id,
      'area',
      v_area_id,
      true,
      true,
      false,
      true,
      true
    )
    RETURNING id INTO v_inserted_id;

    v_distributed := v_distributed || jsonb_build_object(
      'area_id', v_area_id,
      'agent_id', v_agent_id,
      'card_id', v_inserted_id
    );
  END LOOP;

  -- ===== Identify unassigned agents =====
  -- Agents who received no area in this run (M < N case OR all their would-be
  -- slots were already taken).
  FOR v_agent_idx IN 1..v_n_agents LOOP
    v_agent_id := v_agent_ids[v_agent_idx];
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_distributed) d
      WHERE (d->>'agent_id')::uuid = v_agent_id
    ) AND NOT EXISTS (
      SELECT 1 FROM agent_property_access
      WHERE tenant_id = p_tenant_id
        AND agent_id = v_agent_id
        AND is_active = true
    ) THEN
      v_unassigned_agents := v_unassigned_agents || jsonb_build_object(
        'agent_id', v_agent_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'n_agents', v_n_agents,
    'n_areas_requested', v_n_areas,
    'n_distributed', jsonb_array_length(v_distributed),
    'n_skipped', jsonb_array_length(v_skipped),
    'distributed', v_distributed,
    'skipped', v_skipped,
    'unassigned_agents', v_unassigned_agents
  );
END;
$function$;

COMMENT ON FUNCTION public.auto_distribute_areas IS
  'W-TERRITORY-MASTER P3: distribute M areas across N active selling agents (Rule 1). Round-robin by created_at order. Idempotent — skips areas with existing active cards. Returns JSONB report.';

COMMIT;