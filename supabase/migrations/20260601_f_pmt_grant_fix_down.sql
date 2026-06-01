-- ============================================================================
-- F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT -- DOWN-MIGRATION.
-- Reverts: REVOKE SELECT ON public.platform_manager_tenants FROM service_role.
--
-- Date:           2026-06-01
-- Pair:           20260601_f_pmt_grant_fix.sql (up)
-- Apply via:      node scripts/apply-f-pmt-grant-fix-down.js (mirror of up runner)
--
-- HONESTY NOTE:
--   Revoking restores the silent-drop behavior (Layer-5 errors 42501 ->
--   the bundled code edit at lead-email-recipients.ts:208 captures the error
--   and logs it via console.error). The error is no longer SILENT after the
--   code edit lands; rolling back the GRANT just restores the underlying
--   "service_role cannot read platform_manager_tenants" state. The
--   companion code change must ALSO be reverted (via `git revert` on the
--   commit, or a manual re-edit) for full state symmetry.
-- ============================================================================

REVOKE SELECT ON public.platform_manager_tenants FROM service_role;

-- ============================================================================
-- DOWN-VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT COUNT(*)::int INTO v_n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name   = 'platform_manager_tenants'
     AND grantee      = 'service_role'
     AND privilege_type = 'SELECT';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'DOWN-V1 FAIL: service_role SELECT grant still present (count=%)', v_n;
  END IF;
  RAISE NOTICE 'DOWN-V1 PASS: service_role SELECT grant on platform_manager_tenants removed.';
END $$;

-- Optional sanity: under SET LOCAL ROLE service_role, SELECT should error
-- 42501 again. Tx-isolated.
DO $$
DECLARE
  v_caught boolean := false;
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM 1 FROM public.platform_manager_tenants LIMIT 1;
    RESET ROLE;
    -- If we reach this point, the revoke did not take effect.
    RAISE EXCEPTION 'DOWN-V2 FAIL: service_role SELECT succeeded after REVOKE (expected 42501)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      v_caught := true;
    WHEN OTHERS THEN
      RESET ROLE;
      RAISE EXCEPTION 'DOWN-V2 FAIL: unexpected SQLSTATE % - %', SQLSTATE, SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'DOWN-V2 FAIL: expected insufficient_privilege but did not catch it';
  END IF;
  RAISE NOTICE 'DOWN-V2 PASS: service_role SELECT on platform_manager_tenants 42501 (revoke confirmed).';
END $$;
