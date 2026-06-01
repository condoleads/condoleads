-- ============================================================================
-- F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK -- P1 FIX 2 of 3 (rent-comp was 1/3).
-- Up: CREATE OR REPLACE reroll_listings_at_geo with two-step
--     "NULL the trio first, then delegate" body. SECURITY DEFINER + locked
--     search_path. Signature (text, uuid, uuid) RETURNS int UNCHANGED.
--
-- Date:           2026-06-01
-- Recon:          f-reroll-coupled-check-recon.md
--                 cv-reroll-coupled-check-recon-output.txt
-- Apply via:      node scripts/apply-f-reroll-coupled-check-fix.js
-- Down-migration: 20260601_f_reroll_coupled_check_fix_down.sql
-- Smoke harness:  scripts/smoke-f-reroll-coupled-check-fix.js
--
-- BACKGROUND:
--   The live body of reroll_listings_at_geo wrote `assigned_agent_id` only,
--   leaving `assigned_scope` and `assigned_source_id` untouched. Three half-
--   NULL violation paths of mls_listings_assigned_coupled_check:
--     (a) (agent=X, scope=community) + empty routing set -> picks NULL ->
--         (agent=NULL, scope=community). VIOLATES.
--     (b) (agent=NULL, scope=NULL) NULL-cache hit + apa exists -> picks Y ->
--         (agent=Y, scope=NULL). VIOLATES.
--     (c) (agent=X, scope=building) firm assignment -> reroll picks Y ->
--         (agent=Y, scope=building). Constraint holds, but scope is now LIE
--         (says "building" when really chosen by community apa).
--
--   Reachable from service_role via three call paths -- all proven safe today,
--   but the bug fires regardless of role:
--     1. handle_apa_insert / update / delete inline branch (when
--        app.skip_apa_reroll != 'on') -- 3 trigger handlers, all DEFINER as of
--        d2f0e69 (F-apa-secdef-sweep).
--     2. handle_apa_update OLD-scope branch when scope changes.
--     3. /admin-homes/territory/reroll-worker POST -- pg-direct as postgres,
--        drained by .github/workflows/reroll-worker.yml cron every 5 min.
--
--   Today's at-risk-row probe (2026-06-01): 2 rows (municipality, Commercial)
--   would half-NULL on next municipality reroll. NOT zero; tracker entry's
--   "latent" qualifier is stale.
--
--   The live body was also missing a property_type discriminator (would assign
--   a condo agent to a Residential Freehold listing if both shared a community
--   apa pool) and a floor-pool fallback (empty routing set just NULLed all
--   listings). The fix inherits both from reresolve_listings_in_set's L1-L10
--   cascade -- no re-implementation in this function's body.
--
--   GIT DRIFT: the on-disk migration
--   supabase/migrations/20260507_t3b_b_01_distribution_functions.sql has a
--   per-row-cursor body that does NOT match the live set-based hash-RR body
--   captured during recon. The live body was applied via a migration that was
--   never committed to git (the v22 lesson scenario). This CREATE OR REPLACE
--   closes the drift atomically -- after this commit, on-disk == live.
--
-- FIX SHAPE -- the 5-step body:
--   Step 1. Collect listing IDs in geo whose current scope_specificity
--           <= p_scope. Excludes pin (specificity=6) and building (5);
--           includes NULL-cache rows and same-or-lower-specificity (community,
--           municipality, area, floor).
--   Step 2. Capture pre-state agents into jsonb (for the return-value diff).
--   Step 3. ATOMIC TRIO RESET: one UPDATE setting (agent, scope, source) all
--           to NULL. Coupled CHECK holds: (NULL, NULL) satisfies the both-NULL
--           branch.
--   Step 4. PERFORM reresolve_listings_in_set(listing_ids, p_tenant_id). The
--           delegate is SECURITY DEFINER + locked search_path; writes the
--           coupled trio atomically per cascade level; handles tenant scoping,
--           property_type discriminator, sticky guard at the cascade levels
--           it walks, and floor-pool fallback + empty-pool alerts.
--   Step 5. Return COUNT of rows whose final agent differs from pre-state.
--           Matches the OLD function's semantic that the worker route uses
--           as `rowsUpdated`.
--
-- WHAT IS NET-NEW vs THE LIVE BODY (flagged per the user's audit ask):
--   Three behavior changes ride along; all are CORRECTNESS fixes for bug
--   classes the live body silently violated. None are new features; the bug
--   was multi-class. Explicit list so reviewer can object:
--     - Sticky preservation of pin/building rows (bug class c above) -- live
--       body would overwrite firm assignments with a community/muni/area pick.
--     - Property_type discriminator -- live body would assign a condo agent
--       to a Residential Freehold listing (or vice versa).
--     - Floor-pool fallback for unhomed rows -- live body just NULLed them
--       (half-NULL bug a).
--   These come from delegating to reresolve_listings_in_set -- already-correct
--   primitive -- NOT from re-implementing logic in this body. The reroll body
--   itself has ONLY: (collect ids) -> (NULL trio) -> (delegate) -> (return
--   diff count). Five steps; no cascade walk, no per-level CTE, no scope-
--   specific picking logic.
--
-- SECURITY DEFINER FLIP -- safety audit per Landing 1 v21 rubric:
--   (1) Body has no auth.uid() / current_user / session_user / current_setting
--       / dynamic SQL. Confirmed by reading the new body below.
--   (2) Every caller auditable: 3 trigger handlers (DB-internal, derive tenant
--       from NEW/OLD trigger context) + 1 worker route (validates tenant via
--       resolveAdminHomesUser session OR cron-Bearer + UUID-shape check).
--   (3) Caller chain validates p_tenant_id upstream: triggers use trigger-row
--       tenant_id; worker route uses validated session tenant. Not raw user
--       input.
--   (4) search_path locked to public, pg_temp -- below.
--   Same posture rubric as Landing 1 (pick_floor_agent), Event 4 Step C
--   (handle_agent_deactivate, reflow_deactivated_agent), Landing 2
--   (reresolve_listings_in_set), and F-apa-secdef-sweep (handle_apa_*).
--
-- MULTI-TENANT REVIEW (HARD GATE -- attached) -- see end of file.
-- ============================================================================

-- ============================================================================
-- 1. ALTER FUNCTION posture (SECURITY DEFINER + locked search_path)
-- ============================================================================
-- Applied BEFORE the CREATE OR REPLACE so the new body inherits the locked
-- search_path. (CREATE OR REPLACE preserves prosecdef + proconfig.)

ALTER FUNCTION public.reroll_listings_at_geo(text, uuid, uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

-- ============================================================================
-- 2. CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo
-- ============================================================================
-- Signature (text, uuid, uuid) RETURNS integer -- UNCHANGED.
-- Body: 5-step NULL-trio-then-delegate.

CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope     text,
  p_scope_id  uuid,
  p_tenant_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_listing_ids uuid[];
  v_pre_agents  jsonb;
  v_changed     int := 0;
BEGIN
  -- Input-shape guards. NULL tenant is NOT short-circuited here; the delegate
  -- reresolve_listings_in_set handles NULL tenant via predicate no-op (every
  -- cascade WHERE clause evaluates to unknown -> zero rows match). The guard
  -- below is a return-zero fast path, not a security predicate.
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area','municipality','community') THEN
    -- mls_listings has no neighbourhood_id; pin/building/floor are not
    -- reroll-by-geo scopes. Same allow-list as the old live body.
    RETURN 0;
  END IF;

  -- ============================================================
  -- Step 1. Collect listing IDs in this geo whose current scope
  -- is at-or-below p_scope. Pin (specificity=6) and building (5)
  -- are EXCLUDED -- firm assignments are not overridden by a
  -- geo reroll. NULL-cache rows are INCLUDED.
  -- ============================================================
  SELECT array_agg(ml.id)
    INTO v_listing_ids
    FROM public.mls_listings ml
   WHERE ((p_scope = 'community'    AND ml.community_id    = p_scope_id)
       OR (p_scope = 'municipality' AND ml.municipality_id = p_scope_id)
       OR (p_scope = 'area'         AND ml.area_id         = p_scope_id))
     AND (ml.assigned_scope IS NULL
          OR public.scope_specificity(ml.assigned_scope)
             <= public.scope_specificity(p_scope));

  IF v_listing_ids IS NULL OR cardinality(v_listing_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- ============================================================
  -- Step 2. Capture pre-state agents for the return-value diff.
  -- Stored as jsonb keyed by listing-id::text; NULL agents stored
  -- as the literal string 'null' so the post-state comparison is
  -- unambiguous.
  -- ============================================================
  SELECT jsonb_object_agg(id::text, COALESCE(assigned_agent_id::text, 'null'))
    INTO v_pre_agents
    FROM public.mls_listings
   WHERE id = ANY(v_listing_ids);

  -- ============================================================
  -- Step 3. ATOMIC TRIO RESET. One UPDATE sets all three columns
  -- to NULL. Coupled CHECK holds: (NULL, NULL) satisfies the
  -- both-NULL branch. No half-NULL state at any intermediate row.
  -- ============================================================
  UPDATE public.mls_listings
     SET assigned_agent_id  = NULL,
         assigned_scope     = NULL,
         assigned_source_id = NULL
   WHERE id = ANY(v_listing_ids);

  -- ============================================================
  -- Step 4. Delegate to the set-based cascade walker. Writes the
  -- coupled trio atomically per cascade level (L3/L4 community
  -- condo+home, L5/L6 muni, L7/L8 area, L9/L10 floor). Property_
  -- type discriminator + floor-pool fallback + tenant scoping
  -- all inherited from the delegate -- not re-implemented here.
  -- ============================================================
  PERFORM public.reresolve_listings_in_set(v_listing_ids, p_tenant_id);

  -- ============================================================
  -- Step 5. Return count of rows whose final agent differs from
  -- pre-state. Matches the OLD live body's semantic that the
  -- /reroll-worker route uses as rows_updated for queue audit.
  -- ============================================================
  SELECT COUNT(*)::int INTO v_changed
    FROM public.mls_listings ml
   WHERE ml.id = ANY(v_listing_ids)
     AND COALESCE(ml.assigned_agent_id::text, 'null')
         IS DISTINCT FROM (v_pre_agents ->> (ml.id::text));

  RETURN v_changed;
END;
$function$;

COMMENT ON FUNCTION public.reroll_listings_at_geo(text, uuid, uuid) IS
  'F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK fix (2026-06-01, P1 FIX 2/3).
   Two-step NULL-trio-then-delegate body. Replaces the prior set-based
   hash-RR live body that wrote assigned_agent_id only (3 half-NULL violation
   paths against mls_listings_assigned_coupled_check). New body:
     1. Collect listings in geo with scope_specificity <= p_scope (excludes
        pin/building -- firm assignments preserved).
     2. Capture pre-state agents (jsonb) for return-value diff.
     3. Atomic UPDATE: NULL the coupled trio for the collected listings.
     4. PERFORM reresolve_listings_in_set(listing_ids, p_tenant_id) -- the
        already-correct primitive walks the L1-L10 cascade and writes the
        coupled trio atomically. Property_type discriminator + floor-pool
        fallback + empty-pool alerts inherited from delegate; NOT
        re-implemented in this body.
     5. RETURN count of rows whose final agent != pre-state agent. Matches
        the old semantic the /reroll-worker route uses as rows_updated.
   SECURITY DEFINER + locked search_path = public, pg_temp. Consistent with
   reresolve_listings_in_set and the handle_apa_* DEFINER chain.
   Caller contract: p_tenant_id MUST come from a validated request context.
   Signature (text, uuid, uuid) RETURNS int UNCHANGED -- callers untouched.';

-- ============================================================================
-- VERIFICATION (in-tx; outer apply-runner BEGIN/COMMIT; any RAISE -> ROLLBACK)
-- ============================================================================
-- V1: shape + posture (read-only, pg_proc).
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reroll_listings_at_geo';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: reroll_listings_at_geo not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V1 FAIL: reroll_listings_at_geo.prosecdef=FALSE (expected TRUE)';
  END IF;
  IF v_proconfig IS NULL OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'V1 FAIL: reroll_listings_at_geo.proconfig missing locked search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'V1 PASS: reroll_listings_at_geo SECURITY DEFINER + locked search_path.';
END $$;

-- V2: signature unchanged. pronargs=3, args + result_type as expected.
DO $$
DECLARE
  v_nargs   int;
  v_args    text;
  v_result  text;
BEGIN
  SELECT p.pronargs,
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_nargs, v_args, v_result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reroll_listings_at_geo';
  IF v_nargs <> 3 THEN
    RAISE EXCEPTION 'V2 FAIL: pronargs=% (expected 3)', v_nargs;
  END IF;
  IF v_args <> 'p_scope text, p_scope_id uuid, p_tenant_id uuid' THEN
    RAISE EXCEPTION 'V2 FAIL: args="%" (expected "p_scope text, p_scope_id uuid, p_tenant_id uuid")', v_args;
  END IF;
  IF v_result <> 'integer' THEN
    RAISE EXCEPTION 'V2 FAIL: result_type="%" (expected "integer")', v_result;
  END IF;
  RAISE NOTICE 'V2 PASS: signature unchanged: (% ) RETURNS %', v_args, v_result;
END $$;

-- V3: input-shape guards return 0 cleanly. No state change.
DO $$
DECLARE
  v_n int;
BEGIN
  -- NULL scope_id -> 0
  SELECT public.reroll_listings_at_geo('community', NULL::uuid, gen_random_uuid()) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'V3 FAIL: NULL scope_id expected 0, got %', v_n; END IF;
  -- NULL tenant -> 0
  SELECT public.reroll_listings_at_geo('community', gen_random_uuid(), NULL::uuid) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'V3 FAIL: NULL tenant expected 0, got %', v_n; END IF;
  -- Unsupported scope -> 0
  SELECT public.reroll_listings_at_geo('pin', gen_random_uuid(), gen_random_uuid()) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'V3 FAIL: scope=pin expected 0, got %', v_n; END IF;
  SELECT public.reroll_listings_at_geo('building', gen_random_uuid(), gen_random_uuid()) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'V3 FAIL: scope=building expected 0, got %', v_n; END IF;
  SELECT public.reroll_listings_at_geo('floor', gen_random_uuid(), gen_random_uuid()) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'V3 FAIL: scope=floor expected 0, got %', v_n; END IF;
  RAISE NOTICE 'V3 PASS: all input-guard paths return 0 cleanly (no state change).';
END $$;

-- V4: FUNCTIONAL HALF-NULL + STICKY-PRESERVATION assert under empty-pool.
-- SAVEPOINT-isolated (PL/pgSQL BEGIN/EXCEPTION sub-transaction): the inner
-- block sets up an empty-routing-set scenario, calls reroll, asserts no
-- half-NULL rows + pin survives, then RAISEs a sentinel to roll the block
-- back. No production state change after the V-assert.
DO $$
DECLARE
  v_tenant_id   uuid;
  v_community_id uuid;
  v_agent_id    uuid;
  v_pin_listing_id uuid;
  v_n_community_listings int;
  v_n_half_null_post int;
  v_pin_scope_post text;
  v_pin_agent_post uuid;
BEGIN
  -- Setup: pick WALLiam tenant, a community with mls_listings cached at
  -- scope=community, and one of WALLiam's agents.
  SELECT t.id INTO v_tenant_id
    FROM public.tenants t WHERE t.source_key = 'walliam';
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'V4 SKIP: WALLiam tenant not found.';
    RETURN;
  END IF;

  SELECT c.id INTO v_community_id
    FROM public.communities c
    JOIN public.agent_property_access apa
      ON apa.community_id = c.id AND apa.scope='community' AND apa.is_active = TRUE
    WHERE apa.tenant_id = v_tenant_id
    GROUP BY c.id
    HAVING (SELECT COUNT(*) FROM public.mls_listings ml
             WHERE ml.community_id = c.id AND ml.assigned_scope = 'community') > 0
    ORDER BY (SELECT COUNT(*) FROM public.mls_listings ml
               WHERE ml.community_id = c.id AND ml.assigned_scope = 'community') ASC
    LIMIT 1;
  IF v_community_id IS NULL THEN
    RAISE NOTICE 'V4 SKIP: no WALLiam community-scoped fixture found.';
    RETURN;
  END IF;

  SELECT a.id INTO v_agent_id
    FROM public.agents a
   WHERE a.tenant_id = v_tenant_id AND a.is_active = TRUE AND a.is_selling = TRUE
   LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V4 SKIP: no active WALLiam agent.';
    RETURN;
  END IF;

  -- Pick one listing in the community for the pin fixture; it must currently
  -- have assigned_scope='community' so the pin elevates it.
  SELECT id INTO v_pin_listing_id
    FROM public.mls_listings
   WHERE community_id = v_community_id AND assigned_scope = 'community'
   LIMIT 1;
  IF v_pin_listing_id IS NULL THEN
    RAISE NOTICE 'V4 SKIP: no community-scoped listing in selected community.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_n_community_listings
    FROM public.mls_listings
   WHERE community_id = v_community_id AND assigned_scope = 'community';

  -- Inner savepoint-equivalent block.
  BEGIN
    BEGIN
      -- Suppress trigger reroll while we set up the empty-pool state.
      SET LOCAL app.skip_apa_reroll = 'on';

      -- (a) Install a pin on v_pin_listing_id and force it into scope='pin'.
      INSERT INTO public.agent_listing_assignments
        (listing_id, agent_id, is_active)
      VALUES
        (v_pin_listing_id, v_agent_id, TRUE);

      -- Pin alone doesn't update mls_listings -- run the resolver on this row
      -- so the cache becomes scope='pin'. reresolve_listing delegates to
      -- reresolve_listings_in_set (already DEFINER) -- safe inside this DEFINER tx.
      PERFORM public.reresolve_listing(v_pin_listing_id, v_tenant_id);

      -- Confirm pin took.
      SELECT assigned_scope, assigned_agent_id
        INTO v_pin_scope_post, v_pin_agent_post
        FROM public.mls_listings WHERE id = v_pin_listing_id;
      IF v_pin_scope_post <> 'pin' OR v_pin_agent_post <> v_agent_id THEN
        RAISE EXCEPTION 'V4 setup FAIL: pin install did not yield scope=pin (got scope=%, agent=%)',
                        v_pin_scope_post, v_pin_agent_post;
      END IF;

      -- (b) Deactivate ALL community apa for this community -> empty routing set.
      UPDATE public.agent_property_access
         SET is_active = FALSE
       WHERE tenant_id = v_tenant_id
         AND scope = 'community'
         AND community_id = v_community_id;

      -- (c) Call the new reroll under THIS DEFINER tx (postgres effective role).
      PERFORM public.reroll_listings_at_geo('community', v_community_id, v_tenant_id);

      -- (d) Assert ZERO half-NULL rows in this community.
      SELECT COUNT(*)::int INTO v_n_half_null_post
        FROM public.mls_listings
       WHERE community_id = v_community_id
         AND ((assigned_agent_id IS NULL) <> (assigned_scope IS NULL));
      IF v_n_half_null_post <> 0 THEN
        RAISE EXCEPTION 'V4 FAIL (half-NULL): % rows in community % are half-NULL post-reroll',
                        v_n_half_null_post, v_community_id;
      END IF;

      -- (e) Assert PIN PRESERVED (sticky for scope_specificity > community).
      SELECT assigned_scope, assigned_agent_id
        INTO v_pin_scope_post, v_pin_agent_post
        FROM public.mls_listings WHERE id = v_pin_listing_id;
      IF v_pin_scope_post <> 'pin' OR v_pin_agent_post <> v_agent_id THEN
        RAISE EXCEPTION 'V4 FAIL (sticky): pin clobbered. listing=%, expected (pin, %), got (%, %)',
                        v_pin_listing_id, v_agent_id, v_pin_scope_post, v_pin_agent_post;
      END IF;

      -- All asserts PASSED -- sentinel-rollback the setup.
      RAISE EXCEPTION 'V4_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V4_DONE_ROLLBACK' THEN
          NULL; -- swallow sentinel; PL/pgSQL rolls back the sub-tx.
        ELSE
          RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V4 PASS: empty-pool reroll on % (% community-scoped listings) -- zero half-NULL rows; pin preserved.',
               v_community_id, v_n_community_listings;
END $$;

-- End of in-tx verification. V1..V4 must all PASS (or V4 SKIP) for COMMIT.

-- ============================================================================
-- MULTI-TENANT REVIEW (HARD GATE) -- attached per CLAUDE.md ruleset
-- ============================================================================
-- Function: public.reroll_listings_at_geo(text, uuid, uuid)
-- Date: 2026-06-01
--
-- THE 4 PREDICATE PATHS that touch tenant-scoped data, and how each scopes
-- by p_tenant_id:
--
-- 1. STEP-1 COLLECT (SELECT mls_listings):
--    Does NOT filter on tenant_id directly because mls_listings has NO
--    tenant_id column (verified in CLAUDE.md "Verified key IDs" section).
--    Tenant scoping for mls_listings is RESOLVER-side, not row-side. The
--    geo filter (community_id / municipality_id / area_id = p_scope_id)
--    selects rows in a geographical bucket that is itself scope-shared
--    across tenants by design. The result is: the SET of listings we
--    might NULL-and-re-walk is geo-scoped, not tenant-scoped.
--
--    NOT a leak: every downstream WRITE that follows (Step 3 NULL UPDATE +
--    Step 4 cascade re-walk) only ASSIGNS agents from p_tenant_id's apa
--    pool. A listing whose previous cache pointed at tenant B's agent would
--    be NULLed-then-rewalked to a tenant-A agent or to NULL, never to a
--    tenant-B agent. Cross-tenant cache "drift" (where a listing in a
--    shared geo gets re-pointed across tenants) is a documented v16 model
--    behavior: see PART 6 lessons and the resolver's tenant-property-access
--    gate (which protects the READ path). Same posture as
--    reresolve_listings_in_set and distribute_listings_at_geo (both scope
--    by tenant via the apa/floor join, not via mls_listings.tenant_id).
--
-- 2. STEP-3 NULL UPDATE (UPDATE mls_listings):
--    Writes only NULL/NULL/NULL across (agent, scope, source). No
--    cross-tenant data is introduced; tenant-B's prior cache value is
--    erased symmetrically with tenant-A's. A NULL trio is tenant-neutral.
--
-- 3. STEP-4 DELEGATE (PERFORM reresolve_listings_in_set):
--    The delegate scopes BOTH the anchor table (apa.tenant_id, tfp.tenant_id)
--    AND the agents.tenant_id at every cascade level by p_tenant_id (v22
--    belt-and-suspenders rule -- documented in Landing 2 migration COMMENT).
--    The agent finally written is guaranteed to belong to p_tenant_id.
--
-- 4. STEP-5 RETURN-VALUE COMPUTATION (SELECT mls_listings):
--    Reads back the same v_listing_ids. No tenant predicate needed; this
--    is a read of the SAME set we just wrote. Pure post-state diff against
--    captured pre-state.
--
-- HOW p_tenant_id IS SOURCED BY EACH CALLER (validated upstream):
--   - handle_apa_insert: NEW.tenant_id from PostgreSQL trigger context.
--   - handle_apa_update: NEW.tenant_id / OLD.tenant_id from trigger context.
--   - handle_apa_delete: OLD.tenant_id from trigger context.
--   - reroll-worker POST: resolveTenantId() in route.ts validates via
--     session OR cron-Bearer-token + UUID-shape regex + tenant_manager_
--     assignments membership check. Not raw user input.
--   None of the call paths source p_tenant_id from user-supplied input.
--
-- INNER FUNCTION CALLS that need not duplicate tenant scoping here:
--   - reresolve_listings_in_set(uuid[], uuid): the receiving function does
--     its own tenant scoping at every cascade level. No re-check needed.
--   - scope_specificity(text): IMMUTABLE PARALLEL SAFE, returns int from
--     a CASE on text. No tenant reference; cannot leak.
--
-- SECURITY DEFINER -- THE p_tenant_id PARAMETER IS THE TRUST BOUNDARY:
--   The function body runs as postgres (owner). p_tenant_id is the only
--   tenant-scoping input. ALL FOUR callers source p_tenant_id from a
--   validated upstream context, NOT from user-supplied data. This is the
--   same trust contract as reresolve_listings_in_set, pick_floor_agent,
--   and reflow_deactivated_agent. Caller contract documented in the
--   COMMENT ON FUNCTION above; reviewer should re-confirm by auditing the
--   4 call sites before COMMIT.
--
-- CONCLUSION: tenant isolation is preserved. The fix neither introduces
-- nor relaxes any cross-tenant boundary. Same v22-belt-and-suspenders
-- scoping that reresolve_listings_in_set already provides at the delegate;
-- this body adds only NULL trio + diff count on top.
-- ============================================================================
