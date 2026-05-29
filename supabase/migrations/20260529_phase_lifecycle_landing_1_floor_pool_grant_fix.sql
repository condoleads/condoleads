-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 1
-- Closes F-FLOOR-POOL-PERMISSION-DENIED via SECURITY DEFINER on pick_floor_agent.
--
-- Date:           2026-05-29
-- Author:         operator + Claude Code session
-- Preconditions:  phase-lifecycle-landing-1-precondition.txt (both PASS)
-- Apply via:      node scripts/apply-phase-lifecycle-landing-1.js
-- Down-migration: 20260529_phase_lifecycle_landing_1_down.sql
--
-- Problem:
--   tenant_floor_pool has table grants ONLY for postgres + an RLS policy that
--   keys off auth.uid(). When a Supabase service-role API route invokes
--   resolve_agent_for_context (SECURITY INVOKER), the resolver delegates the
--   floor branch to pick_floor_agent (also SECURITY INVOKER), which SELECTs
--   from tenant_floor_pool as the calling role. Service_role has no grant on
--   tenant_floor_pool -> "permission denied for table tenant_floor_pool".
--   This blocks the entire NULL-cache code path through the resolver.
--
-- Fix:
--   ALTER FUNCTION pick_floor_agent SECURITY DEFINER. Function body then runs
--   with the function owner's (postgres) privileges, bypassing the missing
--   grant + RLS for the duration of the body. Callers continue as INVOKER and
--   their auth contexts are unaffected.
--
-- Why this is safe (see phase-lifecycle-landing-1-precondition.txt):
--   - Both DB-side callers (reroll_listings_at_floor, resolve_agent_for_context)
--     are SECURITY INVOKER; their auth context is preserved.
--   - pick_floor_agent body does NOT reference auth.uid(), current_user,
--     session_user, or current_setting. It is purely parameter-driven.
--   - Zero application code calls pick_floor_agent directly. Only callable via
--     the two DB function callers above.
--   - resolve_agent_for_context enforces tenant scoping via p_tenant_id, and
--     EVERY application call-site (Phase 2 EDITs A/B/C/D, 7 files) passes
--     p_tenant_id from a validated request context (header, body, getCurrentTenantId).
--   - SECURITY DEFINER hygiene applied: explicit search_path locks the function
--     to public, pg_temp, mitigating search-path-injection attacks.
--
-- What this does NOT do:
--   - Does NOT grant service_role any table privilege on tenant_floor_pool.
--     Direct SELECTs from API code remain blocked (and should - they should go
--     through the resolver).
--   - Does NOT change pick_floor_agent's body or signature. Bytes-identical to
--     the function as it stands today; only the security flag + search_path change.
--   - Does NOT touch resolve_agent_for_context or any other function's flags.
-- ============================================================================

-- 1. Capture-before-change is performed by the apply-runner (writes
--    pg_get_functiondef(...) to rollback-snapshots/ pre-BEGIN). The migration
--    itself starts at the ALTER.

-- 2. Flip pick_floor_agent to SECURITY DEFINER with locked search_path.
ALTER FUNCTION public.pick_floor_agent(uuid, uuid, boolean, boolean)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

-- 3. Update the function comment to record the security model + caller contract.
COMMENT ON FUNCTION public.pick_floor_agent(uuid, uuid, boolean, boolean) IS
  'W-TERRITORY-MASTER P-FLOOR (v15) / P-LIFECYCLE Landing 1 (v20+).
   Hash-RR floor picker over tenant_floor_pool, filtered by property type.

   SECURITY DEFINER (P-LIFECYCLE Landing 1, 2026-05-29): function body runs
   with owner (postgres) privileges so the SELECT on tenant_floor_pool succeeds
   under service_role API calls. search_path locked to public, pg_temp.

   Caller contract: p_tenant_id MUST come from a validated request context
   (request header, tenant-scoped body field, or middleware-derived tenant).
   Do NOT call this function with a user-supplied tenant_id. The two valid
   callers (reroll_listings_at_floor, resolve_agent_for_context) honor this
   contract; future callers must too.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- All assertions must pass or the transaction ROLLBACKs cleanly.
-- ============================================================================

-- V1: prosecdef flipped to true.
DO $$
DECLARE
  v_secdef boolean;
BEGIN
  SELECT prosecdef INTO v_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pick_floor_agent';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: pick_floor_agent not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V1 FAIL: pick_floor_agent.prosecdef is FALSE (expected TRUE)';
  END IF;
  RAISE NOTICE 'V1 PASS: pick_floor_agent.prosecdef = TRUE';
END $$;

-- V2: search_path is locked on the function (defensive against shadowed names).
DO $$
DECLARE
  v_proconfig text[];
BEGIN
  SELECT proconfig INTO v_proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pick_floor_agent';

  IF v_proconfig IS NULL OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'V2 FAIL: pick_floor_agent.proconfig does not include locked search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'V2 PASS: pick_floor_agent.proconfig = %', v_proconfig;
END $$;

-- V3: pick_floor_agent still returns the expected agent under postgres.
-- Uses the known FLOOR test listing (Neo Smith via Phase 2 EDIT D smoke S3).
DO $$
DECLARE
  v_agent uuid;
  v_expected uuid := 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid;
BEGIN
  SELECT public.pick_floor_agent(
    '68c88ce3-21e6-4189-8a43-ac86017a8f9d'::uuid,  -- known floor listing
    'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid,  -- WALLiam tenant
    true,   -- is_condo
    false   -- is_home
  ) INTO v_agent;

  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'V3 FAIL: pick_floor_agent returned NULL under postgres (expected Neo Smith)';
  END IF;
  IF v_agent <> v_expected THEN
    RAISE EXCEPTION 'V3 FAIL: pick_floor_agent returned % (expected % = Neo Smith)', v_agent, v_expected;
  END IF;
  RAISE NOTICE 'V3 PASS: pick_floor_agent(FLOOR, WALLiam, condo) -> Neo Smith (%)', v_agent;
END $$;

-- V4: THE FIX-PROOF. Call pick_floor_agent under SET LOCAL ROLE service_role.
-- Before ALTER: this would raise "permission denied for table tenant_floor_pool".
-- After ALTER (SECURITY DEFINER): the body runs as postgres and succeeds.
-- Pre-check: service_role must exist as a Postgres role. If not (e.g. running
-- against a non-Supabase DB), the migration ROLLBACKs with a clear message
-- rather than silent ambiguity about whether the fix is proved.
DO $$
DECLARE
  v_agent uuid;
  v_expected uuid := 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'V4 cannot run: service_role does not exist as a Postgres role on this DB. SECURITY DEFINER alter applied (V1-V3 verified) but service_role probe could not be performed - manual smoke required post-COMMIT.';
  END IF;

  SET LOCAL ROLE service_role;

  -- Even though we are service_role here, the SECURITY DEFINER on
  -- pick_floor_agent makes its body run as postgres.
  SELECT public.pick_floor_agent(
    '68c88ce3-21e6-4189-8a43-ac86017a8f9d'::uuid,
    'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid,
    true,
    false
  ) INTO v_agent;

  -- Reset role before any failure-path RAISE so the transaction context is clean.
  RESET ROLE;

  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'V4 FAIL (FIX-PROOF): pick_floor_agent returned NULL under service_role';
  END IF;
  IF v_agent <> v_expected THEN
    RAISE EXCEPTION 'V4 FAIL: pick_floor_agent returned % under service_role (expected %)', v_agent, v_expected;
  END IF;
  RAISE NOTICE 'V4 PASS (FIX-PROOF): pick_floor_agent under service_role -> Neo Smith (%). F-FLOOR-POOL-PERMISSION-DENIED is closed for this code path.', v_agent;
EXCEPTION WHEN OTHERS THEN
  -- Make absolutely sure ROLE is reset before re-raising.
  RESET ROLE;
  RAISE;
END $$;

-- V5: resolve_agent_for_context's floor branch now succeeds under service_role.
-- This is the end-to-end fix-proof: the actual call shape the API routes use.
-- Pre-check (same as V4): service_role must exist on this DB.
DO $$
DECLARE
  v_agent uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'V5 cannot run: service_role does not exist as a Postgres role on this DB. SECURITY DEFINER alter applied (V1-V3 verified) but service_role probe could not be performed - manual smoke required post-COMMIT.';
  END IF;

  SET LOCAL ROLE service_role;

  -- Same FLOOR listing, but called via the full resolver chain. With Phase 2
  -- cache populated (Phase 1's re-materialize set assigned_agent_id for this
  -- listing), the cache short-circuits this - BUT the route's cache-first
  -- preamble lives in TypeScript, not in the SQL function. The resolver itself
  -- always walks the geo chain. The geo chain for this listing terminates at
  -- the floor branch (no carve matches), which calls pick_floor_agent.
  SELECT public.resolve_agent_for_context(
    '68c88ce3-21e6-4189-8a43-ac86017a8f9d'::uuid,  -- p_listing_id
    NULL,                                          -- p_building_id
    NULL,                                          -- p_neighbourhood_id
    NULL,                                          -- p_community_id
    NULL,                                          -- p_municipality_id
    NULL,                                          -- p_area_id
    NULL,                                          -- p_user_id
    'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid   -- p_tenant_id (WALLiam)
  ) INTO v_agent;

  RESET ROLE;

  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'V5 FAIL: resolve_agent_for_context returned NULL under service_role for known floor listing';
  END IF;
  RAISE NOTICE 'V5 PASS: resolve_agent_for_context under service_role -> % for known floor listing', v_agent;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END $$;

-- End of migration body. All 5 V-asserts must pass for COMMIT.
