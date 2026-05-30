-- ============================================================================
-- F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-RISK -- DOWN migration.
--
-- Date:        2026-05-30
-- Pairs with:  20260530_f_apa_secdef_sweep.sql
-- Apply via:   node scripts/apply-f-apa-secdef-sweep-down.js
--
-- WHAT THIS DOES:
--   ALTER FUNCTION handle_apa_{insert,update,delete}() SECURITY INVOKER
--   + RESET search_path.
--
-- WHAT YOU GET BACK:
--   The known-latent-broken-under-service_role state. The INVOKER body
--   writes to territory_reroll_queue (postgres-only grants), so any caller
--   under SET LOCAL ROLE service_role attempting an INSERT/UPDATE/DELETE
--   on agent_property_access will hit `permission denied for table
--   territory_reroll_queue` and the APA mutation will roll back.
--
--   THIS DOWN IS "REVERT THIS FIX," NOT "RETURN TO GOOD."
--   Today no production path mutates APA via service_role (all 7 use
--   pg-direct as postgres), so reverting is safe today -- but only as
--   long as no admin route is added that writes APA via supabase-js.
--
-- WHY THE DOWN EXISTS:
--   Completeness + symmetry with Event 4 Step C's down pattern. The fix
--   is a 3-line ALTER; the revert is 3 lines the other way. No body
--   restoration needed -- the function bodies are unchanged throughout
--   the up + down lifecycle.
-- ============================================================================

ALTER FUNCTION public.handle_apa_insert()
  SECURITY INVOKER
  RESET search_path;

ALTER FUNCTION public.handle_apa_update()
  SECURITY INVOKER
  RESET search_path;

ALTER FUNCTION public.handle_apa_delete()
  SECURITY INVOKER
  RESET search_path;

-- ============================================================================
-- VERIFICATION (post-ALTER)
-- ============================================================================

DO $$
DECLARE
  v_fn   text;
  v_secdef boolean;
  v_proconfig text[];
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['handle_apa_insert','handle_apa_update','handle_apa_delete']
  LOOP
    SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_fn;
    IF v_secdef IS NULL THEN
      RAISE EXCEPTION 'DOWN V1 FAIL: % not found', v_fn;
    END IF;
    IF v_secdef IS TRUE THEN
      RAISE EXCEPTION 'DOWN V1 FAIL: %.prosecdef still TRUE after revert', v_fn;
    END IF;
    IF v_proconfig IS NOT NULL AND v_proconfig::text ILIKE '%search_path%' THEN
      RAISE EXCEPTION 'DOWN V1 FAIL: %.proconfig still has search_path. Got: %', v_fn, v_proconfig;
    END IF;
  END LOOP;
  RAISE NOTICE 'DOWN V1 PASS: handle_apa_insert/update/delete reverted to SECURITY INVOKER, search_path cleared.';
  RAISE WARNING 'DOWN: agent_property_access mutations under service_role will again raise permission-denied (F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-RISK is REOPEN). Safe today because no production path uses service_role for APA writes, but the landmine is back.';
END $$;
