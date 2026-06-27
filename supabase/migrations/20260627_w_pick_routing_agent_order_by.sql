-- ============================================================================
-- W-TERRITORY-SMOKE UNIT 34 — Fix 2 STEP 3: deterministic tie-break insurance
-- on pick_routing_agent_for_type.
-- 2026-06-27.
--
-- THE BUG (UNIT 33 audit C1, narrow):
--   pick_routing_agent_for_type has a bare LIMIT 1 with no ORDER BY. The
--   existing 4 partial unique indexes (uniq_apa_primary_area/community/
--   muni/neighbourhood) already make this safe — at most one row matches
--   the WHERE clause per (scope, scope_id, tenant_id) where is_primary
--   AND is_active. So C1 cannot fire under current invariants.
--
-- WHY ADD ORDER BY ANYWAY:
--   Deterministic insurance: if a future migration ever drops or modifies
--   any of the 4 partial unique indexes (e.g. evolves the invariant), the
--   bare LIMIT 1 would silently start returning undefined-order results.
--   ORDER BY apa.created_at, apa.agent_id makes the choice stable
--   regardless of index state — the OLDEST card wins, with apa.agent_id
--   as a secondary deterministic tie-break (defensive; the unique index
--   already prevents same-created_at duplicates, but two rows of identical
--   created_at via batch INSERT could theoretically occur if invariants
--   slip).
--
-- BEHAVIOR DELTA:
--   Today (post-this migration): identical to today (LIMIT 1 unchanged
--   when at most one row matches — which is the only currently possible
--   state). The ORDER BY changes nothing observable.
--   Future (if invariants slip): the chosen card becomes deterministic
--   instead of undefined.
--
-- IDEMPOTENT: CREATE OR REPLACE.
--
-- ROLLBACK (paired down):
--   CREATE OR REPLACE FUNCTION public.pick_routing_agent_for_type(...)
--   ... (body without ORDER BY — apply-runner snapshot has the verbatim
--   prior body for restore).
-- ============================================================================

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
  -- W-TERRITORY-SMOKE UNIT 34 (2026-06-27): ORDER BY apa.created_at,
  -- apa.agent_id added as deterministic tie-break insurance. Under
  -- current DB invariants (uniq_apa_primary_{area,community,muni,
  -- neighbourhood} partial unique indexes) at most one row matches the
  -- WHERE clause, so this ORDER BY is a no-op today. It becomes
  -- load-bearing if a future migration relaxes those invariants.
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
  ORDER BY apa.created_at, apa.agent_id
  LIMIT 1;

  RETURN v_agent_id;
END;
$function$;
