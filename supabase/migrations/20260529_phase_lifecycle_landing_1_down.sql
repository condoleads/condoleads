-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 1 - DOWN migration
-- Reverts pick_floor_agent SECURITY DEFINER -> INVOKER.
--
-- Date:        2026-05-29
-- Pairs with:  20260529_phase_lifecycle_landing_1_floor_pool_grant_fix.sql
-- Apply via:   psql -f (no runner - operator-driven manual revert)
--
-- WHEN TO USE THIS:
--   If after Landing 1 ships, an unforeseen regression surfaces in production
--   where the SECURITY DEFINER posture is suspected (e.g. an unintended
--   privilege escalation through a yet-to-be-found code path that calls
--   pick_floor_agent in a context we hadn't audited).
--
-- WHAT YOU LOSE:
--   F-FLOOR-POOL-PERMISSION-DENIED returns. Every cache-miss code path
--   through resolve_agent_for_context that reaches the floor branch under
--   service_role will fail with "permission denied for table tenant_floor_pool"
--   again. Operationally this means:
--     - New listings without resolve-at-insert -> 500 on assign-user-agent
--     - Any cross-tenant cache-miss that happens to reach the floor branch
--     - Reconcile job (P-LIFECYCLE Landing 3) cannot run server-side
--
-- The rollback-snapshot at supabase/migrations/rollback-snapshots/
-- _phase-lifecycle-landing-1_pick_floor_agent_<ts>.sql preserves the EXACT
-- function definition (body + flags) from before Landing 1 ran. If anything
-- worse than a flag-swap is needed, restore from that snapshot via psql -f.
-- ============================================================================

-- 1. Revert SECURITY DEFINER -> SECURITY INVOKER and clear the search_path lock.
ALTER FUNCTION public.pick_floor_agent(uuid, uuid, boolean, boolean)
  SECURITY INVOKER
  RESET search_path;

-- 2. Restore the pre-Landing-1 comment (the v15 comment from the original
--    migration 20260527_p_floor_schema_and_resolver.sql line 209). This is the
--    text the function had immediately before Landing 1.
COMMENT ON FUNCTION public.pick_floor_agent(uuid, uuid, boolean, boolean) IS
  'W-TERRITORY-MASTER P-FLOOR (D2b/D5b/D11): hash-RR pick from the eligible
   tenant_floor_pool slice for one listing''s property type. Returns NULL only
   when (a) tenant_id or listing_id is NULL, (b) neither condo nor home flag is
   set, or (c) the eligible slice is empty (writes a tenant_floor_alerts row).
   Honors property-type filter via tfp.condo_access + tfp.homes_access plus
   the agent active/selling filter; deterministic by listing_id.';

-- ============================================================================
-- VERIFICATION (inside the same transaction if wrapped - operator's choice)
-- ============================================================================

DO $$
DECLARE
  v_secdef boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pick_floor_agent';

  IF v_secdef IS TRUE THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: prosecdef still TRUE after revert';
  END IF;
  IF v_proconfig IS NOT NULL THEN
    RAISE EXCEPTION 'DOWN V2 FAIL: proconfig not cleared after RESET search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'DOWN V1+V2 PASS: pick_floor_agent reverted to SECURITY INVOKER, search_path cleared';
END $$;

-- Note: we deliberately do NOT re-run the V4 service_role probe here. After
-- revert, that probe would FAIL with permission denied - confirming the revert
-- took, but emitting a confusing failure path. The pg_proc flag check above
-- is sufficient proof of the revert.
