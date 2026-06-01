-- ============================================================================
-- F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT -- P1 FIX 3 of 3.
-- Up: GRANT SELECT ON public.platform_manager_tenants TO service_role.
--
-- Date:           2026-06-01
-- Recon:          f-pmt-grant-recon.md
--                 cv-pmt-grant-recon-output.txt
-- Apply via:      node scripts/apply-f-pmt-grant-fix.js
-- Down-migration: 20260601_f_pmt_grant_fix_down.sql
-- Smoke harness:  scripts/smoke-f-pmt-grant-fix.js
-- Bundled code:   lib/admin-homes/lead-email-recipients.ts (Layer-5 error capture)
--
-- BACKGROUND:
--   getLeadEmailRecipients() Layer-5 reads public.platform_manager_tenants via
--   supabase-js with the service_role key. service_role has zero grants on
--   this table (grants[postgres]: full RWX; grants[service_role]: NONE). The
--   read therefore errors `42501 -- permission denied for table
--   platform_manager_tenants` (verified live in
--   cv-pmt-grant-recon-output.txt §7). supabase-js receives an { error }
--   object; the Layer-5 destructure at lead-email-recipients.ts:208 captures
--   only { data } (pre-fix), so the error is silently swallowed and
--   assignedAdminIds falls through to []. Layer-5 BCC recipients are dropped
--   without an operator-visible signal -- a v27 false-green-via-silent-soft-
--   fail incident waiting for the first platform_manager_tenants row.
--
--   Currently invisible because the table has 0 rows DB-wide today; any
--   future INSERT into platform_manager_tenants would be effectively muted
--   under service_role -- the bug becomes live the moment the first manager-
--   platform assignment lands.
--
-- WHY A BARE GRANT IS SUFFICIENT (the (a)-vs-(b) determination):
--   service_role.rolbypassrls = TRUE (probe §1). PostgreSQL bypasses RLS for
--   any role with that flag, regardless of the table's relrowsecurity /
--   relforcerowsecurity settings. platform_manager_tenants has
--   relrowsecurity=true but relforcerowsecurity=false, with two auth.uid()-
--   keyed policies that evaluate empty server-side -- but service_role never
--   even reaches the RLS layer. The 42501 is at the GRANT layer; granting
--   SELECT closes the gate.
--
--   This is the minimum-surface fix: no SECURITY DEFINER helper added, no
--   policy rewrite, no caller refactor. The Layer-5 .from('platform_manager_
--   tenants').select('platform_admin_id').eq('tenant_id', tenantId) call
--   keeps its exact shape post-grant. Only the grant + the bundled error-
--   capture change.
--
-- BUNDLED CODE FIX (v27 lesson):
--   lib/admin-homes/lead-email-recipients.ts:208 -- destructure { data, error }
--   and console.error if error. Mirrors the Layer-6 capture style at L233
--   (which throws AdminPlatformUnreachable because Layer-6 is unconditional).
--   Layer-5 is graceful fall-through: log, do NOT throw. This makes the
--   silent soft-fail visible if any FUTURE failure mode hits the Layer-5
--   read (different env, schema reload, transient PostgREST issue). With
--   the grant in place today, this path produces no errors; the capture
--   is a defense-in-depth guard.
--
-- SCOPE LIMITS:
--   This commit grants SELECT ONLY -- no INSERT/UPDATE/DELETE. If a future
--   admin route adds a UI for managing platform_manager_tenants via
--   supabase-js, that commit should add the corresponding grants then.
--   Pure read-path fix for the Layer-5 production caller.
--
--   The 3 sibling grant-wall tables (tenant_floor_pool, tenant_floor_alerts,
--   territory_reroll_queue) ALSO error 42501 under service_role today, but
--   their production callers are routed via pg-direct (as postgres) or
--   through SECURITY DEFINER chains -- no production code path is broken.
--   This migration deliberately does NOT touch them. T5 in the smoke
--   regression-checks that the siblings STILL error 42501 (proves scope
--   was not accidentally widened).
--
-- MULTI-TENANT REVIEW (HARD GATE -- attached at end of file).
-- ============================================================================

-- ============================================================================
-- THE GRANT
-- ============================================================================
GRANT SELECT ON public.platform_manager_tenants TO service_role;

-- ============================================================================
-- VERIFICATION (in-tx; outer apply-runner BEGIN/COMMIT; any RAISE -> ROLLBACK)
-- ============================================================================

-- V1: information_schema.role_table_grants shows service_role has SELECT.
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
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V1 FAIL: service_role SELECT grant on platform_manager_tenants count=% (expected 1)', v_n;
  END IF;
  RAISE NOTICE 'V1 PASS: service_role has SELECT on platform_manager_tenants.';
END $$;

-- V2: under SET LOCAL ROLE service_role, SELECT no longer errors 42501.
-- Tx-isolated via PL/pgSQL BEGIN/EXCEPTION sub-tx; RESET ROLE before exit.
DO $$
DECLARE
  v_n int;
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    -- This SELECT would have errored 42501 pre-grant. Post-grant, it must
    -- return a count (>= 0). The query itself is the assertion -- if 42501
    -- still fires here, this DO block RAISEs and the outer migration tx
    -- rolls back.
    SELECT COUNT(*)::int INTO v_n FROM public.platform_manager_tenants;
    RESET ROLE;
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      RAISE EXCEPTION 'V2 FAIL: service_role SELECT on platform_manager_tenants raised %: %', SQLSTATE, SQLERRM;
  END;
  RAISE NOTICE 'V2 PASS: service_role SELECT on platform_manager_tenants returned % rows (no 42501).', v_n;
END $$;

-- V3: REGRESSION CHECK -- siblings (tenant_floor_pool, tenant_floor_alerts,
-- territory_reroll_queue) STILL error 42501 under service_role. Proves this
-- migration did not accidentally widen scope. Same v25 lesson about post-
-- COMMIT role-switches applies: the role-switch is confined to one
-- statement, RESET ROLE immediately after, no reads on restricted tables
-- outside the role-switch window.
DO $$
DECLARE
  v_sibling text;
  v_ok       boolean;
  v_pass_cnt int := 0;
BEGIN
  FOREACH v_sibling IN ARRAY ARRAY['tenant_floor_pool','tenant_floor_alerts','territory_reroll_queue']
  LOOP
    v_ok := false;
    BEGIN
      SET LOCAL ROLE service_role;
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', v_sibling);
      RESET ROLE;
      -- If we reach this point, the SELECT succeeded under service_role --
      -- which means the GRANT scope WAS widened. Fail loudly.
      RAISE EXCEPTION 'V3 FAIL: service_role SELECT on % SUCCEEDED (expected 42501) -- scope was accidentally widened', v_sibling;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RESET ROLE;
        v_ok := true;
        v_pass_cnt := v_pass_cnt + 1;
      WHEN OTHERS THEN
        RESET ROLE;
        RAISE EXCEPTION 'V3 FAIL: unexpected SQLSTATE % on % under service_role -- %', SQLSTATE, v_sibling, SQLERRM;
    END;
  END LOOP;
  IF v_pass_cnt <> 3 THEN
    RAISE EXCEPTION 'V3 FAIL: expected 3 siblings to still 42501, got %', v_pass_cnt;
  END IF;
  RAISE NOTICE 'V3 PASS: all 3 sibling grant-wall tables still 42501 under service_role (scope not widened).';
END $$;

-- End of in-tx verification. V1..V3 must all PASS for COMMIT.

-- ============================================================================
-- MULTI-TENANT REVIEW (HARD GATE) -- attached per CLAUDE.md ruleset
-- ============================================================================
-- Grant: GRANT SELECT ON public.platform_manager_tenants TO service_role.
-- Date: 2026-06-01.
--
-- WHAT THE TABLE HOLDS:
--   platform_manager_tenants is a JOIN TABLE mapping platform_admin_id ->
--   tenant_id (with granted_at + granted_by). It does NOT hold tenant
--   business data, agent data, listing data, or any user PII. It is a
--   tenant-to-platform-admin assignment table, used by Layer-5 of the
--   email fan-out to identify "which platform-admin users should BCC on
--   leads for tenant X."
--
-- IS THE GRANT TENANT-NEUTRAL?
--   YES. The grant is table-level SELECT -- it does not change row-level
--   filtering. The Layer-5 caller queries with `.eq('tenant_id', tenantId)`
--   where tenantId is the tenant scope of the current lead. service_role
--   gets read access to the WHOLE table at the GRANT layer; the caller is
--   responsible for tenant scoping at the QUERY layer (and does, via the
--   .eq filter).
--
-- CROSS-TENANT EXPOSURE ANALYSIS:
--   Pre-grant: service_role errors 42501 -> Layer-5 silently returns [];
--              no platform_manager_tenants data is exposed (broken).
--   Post-grant: service_role can SELECT all rows of platform_manager_tenants
--               if it queries WITHOUT a tenant_id filter. service_role is
--               already used DB-wide for cross-tenant operations (mls_listings
--               reads, agents reads, leads writes, etc.); access to the
--               manager-platform mapping is consistent with that posture.
--   Real-world callers (today): one -- getLeadEmailRecipients Layer-5, which
--               filters by tenant_id correctly.
--   Future callers: any new caller must follow the same tenant-scoping
--               discipline as every other service_role query in this codebase.
--               This is the standing rule (CLAUDE.md "Multi-tenant at scale"),
--               not a new requirement introduced by this grant.
--
-- SAME POSTURE AS EXISTING service_role GRANTS:
--   service_role already has full RWX on mls_listings (1.3M rows), agents,
--   leads, tenants, platform_admins, communities, etc. Those tables hold
--   far more tenant-sensitive data than this assignment join table.
--   Granting SELECT on platform_manager_tenants does NOT change the
--   service_role's overall blast radius -- it just unblocks one more table
--   it should always have been able to read for the documented call path.
--
-- WHY service_role SHOULD HAVE ALWAYS HAD THIS GRANT:
--   The 6-layer email recipient fan-out at lib/admin-homes/lead-email-
--   recipients.ts is invoked via createServiceClient (service_role-backed).
--   Layers 2/3/4 (manager/area_manager/tenant_admin) read agents + leads
--   tables -- both granted to service_role. Layer 6 (admin platforms) reads
--   platform_admins -- granted to service_role. Layer 5 was the lone gap:
--   platform_manager_tenants was never granted. Adding the grant aligns
--   the table with the 4 other tables in the same code path.
--
-- POLICY POSTURE -- UNCHANGED:
--   platform_manager_tenants has 2 RLS policies keyed on auth.uid() (for
--   admin-tier platform_admins via the web UI). Those policies REMAIN.
--   service_role bypasses them via rolbypassrls=true; admin-tier sessions
--   continue to use them. No change to the human-facing access path.
--
-- CONCLUSION:
--   Tenant isolation is preserved. The grant is a CORRECTION of a
--   service_role permission gap -- the same kind of class as the v25
--   F-FLOOR-POOL-PERMISSION-DENIED finding (which was fixed by SECURITY
--   DEFINER because the call path required postgres-effective-role for
--   writes; here a pure SELECT grant suffices because reads are gated
--   purely by the grant + BYPASSRLS combination).
-- ============================================================================
