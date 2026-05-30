-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF SECDEF FIX
-- DOWN-migration.
--
-- Date:        2026-05-30
-- Pairs with:  20260530_phase_lifecycle_landing_3_event_4_async_handoff_secdef_fix.sql
--
-- WHAT THIS DOES:
--   ALTER FUNCTION handle_agent_deactivate() SECURITY INVOKER
--   (and DROP the locked search_path setting).
--
-- WHAT YOU GET BACK:
--   The state immediately after the prior async-handoff migration
--   committed -- WHICH IS THE KNOWN-BROKEN STATE per
--   F-EVENT-4-ASYNC-PERMISSION-DENIED. Under SECURITY INVOKER, the
--   trigger's INSERT into territory_reroll_queue fails when fired by
--   service_role (the admin route's calling role) because service_role
--   has zero grants on the queue.
--
--   THIS DOWN IS "REVERT THIS FIX," NOT "RETURN TO GOOD."
--   Do not run unless you have a follow-up plan to grant service_role
--   privileges on territory_reroll_queue OR to gate the admin route
--   through a different role/connection.
--
-- WHY THE DOWN EXISTS:
--   Completeness. The fix is a one-line ALTER; the down is one line
--   the other way. If a downstream issue surfaces that we wrongly trace
--   to the DEFINER flip, the down lets us isolate the change. But the
--   DEFINER flip itself is the same posture as Landing 1's pick_floor_agent
--   and Landing 2's reresolve_listings_in_set, both reviewed and shipped.
-- ============================================================================

ALTER FUNCTION public.handle_agent_deactivate()
  SECURITY INVOKER
  RESET search_path;

-- ============================================================================
-- VERIFICATION (post-ALTER)
-- ============================================================================

DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='handle_agent_deactivate';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: handle_agent_deactivate not found';
  END IF;
  IF v_secdef IS TRUE THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: handle_agent_deactivate.prosecdef still TRUE after revert';
  END IF;
  IF v_proconfig IS NOT NULL
     AND v_proconfig::text ILIKE '%search_path%'
  THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: handle_agent_deactivate.proconfig still has search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'DOWN V1 PASS: handle_agent_deactivate reverted to SECURITY INVOKER, search_path cleared.';
  RAISE WARNING 'DOWN: the production deactivation path under service_role is now BROKEN again (F-EVENT-4-ASYNC-PERMISSION-DENIED).';
END $$;
