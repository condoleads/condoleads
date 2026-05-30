-- ============================================================================
-- F-EXISTING-HANDLE-APA-TRIGGERS-SAME-LATENT-RISK -- APA secdef sweep.
-- Up: ALTER FUNCTION handle_apa_{insert,update,delete}() SECURITY DEFINER +
--     locked search_path. apa_mutation_lock_trigger() STAYS INVOKER.
--
-- Date:           2026-05-30
-- Plan:           f-apa-triggers-secdef-recon-output.txt
-- Apply via:      node scripts/apply-f-apa-secdef-sweep.js
-- Down-migration: 20260530_f_apa_secdef_sweep_down.sql
--
-- BACKGROUND:
--   The three AFTER-row trigger functions on agent_property_access
--   (handle_apa_insert/update/delete) are SECURITY INVOKER. Each INSERTs
--   into territory_reroll_queue (postgres-only grants, zero for
--   service_role) in their body. If any future caller writes APA via
--   supabase-js -> PostgREST -> SET LOCAL ROLE service_role, the trigger
--   INSERT will raise `permission denied for table territory_reroll_queue`
--   and the APA mutation will rollback fail-closed. Class-mirror of
--   F-EVENT-4-ASYNC-PERMISSION-DENIED (closed 9255a18 Step C).
--
--   This migration proactively closes the latent gap. As of the recon,
--   ZERO production write paths to agent_property_access use service_role
--   -- all 7 (bulk-create, bulk-restore, bulk-deactivate, bulk-reassign,
--   cleanup, cards/route, bulk-assign) use pg-direct as postgres. The
--   fix is preventative: required before any future admin route writes
--   APA via supabase-js.
--
-- WHY apa_mutation_lock_trigger STAYS INVOKER:
--   Body verified in recon: only `pg_advisory_xact_lock(...)`. No table
--   writes, no INSERT/UPDATE/DELETE, no grants required. The advisory
--   lock is a session-state operation; available to any role. Flipping
--   to DEFINER would be unnecessary and would slightly broaden the
--   security surface (function would run as postgres for a no-op lock
--   call). Leave it alone.
--
-- TENANT-ISOLATION REVIEW (HARD GATE) -- function bodies UNCHANGED:
--   All three handler bodies use NEW.tenant_id (insert/update) or
--   OLD.tenant_id (delete/update) derived from the APA row being mutated
--   by PostgreSQL's trigger mechanism. No auth.uid(), no current_user,
--   no session_user, no current_setting beyond the `app.skip_apa_reroll`
--   GUC (which is operator-controlled, not user-supplied). No dynamic
--   SQL. Tenant scoping is intrinsic to the trigger context and cannot
--   change behavior under the INVOKER->DEFINER flip. The inner PERFORMs
--   (distribute_geo_to_children, reroll_listings_at_geo) take the
--   tenant_id as a parameter, also from NEW/OLD context. ON CONFLICT
--   target in the queue INSERT is per-tenant. Same review structure
--   that PASSED for Event 4 Step C.
--
-- INNER-FUNCTION INHERITANCE (the V5 assertion's purpose):
--   PostgreSQL behavior: when a SECURITY DEFINER function (running as
--   owner = postgres) calls a SECURITY INVOKER function, the INVOKER
--   function runs with CURRENT_USER = postgres (the DEFINER's effective
--   role for the duration of the DEFINER body). So distribute_geo_to_
--   children and reroll_listings_at_geo (both INVOKER, both pre-existing,
--   both untouched by this migration) inherit postgres privileges
--   through the chain when called from the flipped handle_apa_*. No
--   need to flip the inner functions. V5 below proves this empirically.
-- ============================================================================

-- ============================================================================
-- 1. ALTER FUNCTION handle_apa_insert() SECURITY DEFINER
-- ============================================================================

ALTER FUNCTION public.handle_apa_insert()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.handle_apa_insert() IS
  'F-apa-secdef-sweep (2026-05-30). SECURITY DEFINER + locked search_path
   so the trigger INSERT into territory_reroll_queue + territory_assignment_
   changes succeeds when fired under service_role (postgres-only grants on
   the queue). Function body UNCHANGED. INVOKER->DEFINER flip is safe: body
   has no auth.uid()/current_user/dynamic SQL; NEW.tenant_id is trigger-
   context-derived. Inner PERFORM into distribute_geo_to_children /
   reroll_listings_at_geo inherits postgres privileges via DEFINER chain.';

-- ============================================================================
-- 2. ALTER FUNCTION handle_apa_update() SECURITY DEFINER
-- ============================================================================

ALTER FUNCTION public.handle_apa_update()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.handle_apa_update() IS
  'F-apa-secdef-sweep (2026-05-30). SECURITY DEFINER + locked search_path.
   Function body UNCHANGED -- 5,708-char body handles all the v13/c2a
   primary-toggle / access-toggle / routing-changed / NEW-scope / OLD-scope
   reroll paths. NEW.tenant_id and OLD.tenant_id are both trigger-context-
   derived. INVOKER->DEFINER flip preserves tenant scoping.';

-- ============================================================================
-- 3. ALTER FUNCTION handle_apa_delete() SECURITY DEFINER
-- ============================================================================

ALTER FUNCTION public.handle_apa_delete()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.handle_apa_delete() IS
  'F-apa-secdef-sweep (2026-05-30). SECURITY DEFINER + locked search_path.
   Function body UNCHANGED. OLD.tenant_id is trigger-context-derived.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- ============================================================================

-- V1: prosecdef=true + proconfig has locked search_path for all 3 handlers.
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
      RAISE EXCEPTION 'V1 FAIL: % not found', v_fn;
    END IF;
    IF v_secdef IS FALSE THEN
      RAISE EXCEPTION 'V1 FAIL: %.prosecdef=FALSE (expected TRUE)', v_fn;
    END IF;
    IF v_proconfig IS NULL OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION 'V1 FAIL: %.proconfig missing locked search_path. Got: %', v_fn, v_proconfig;
    END IF;
  END LOOP;
  RAISE NOTICE 'V1 PASS: handle_apa_insert/update/delete all SECURITY DEFINER + locked search_path.';
END $$;

-- V2: handle_apa_insert under service_role (ASYNC path, GUC=on) -- the
-- permission-denied gap we're fixing. Insert a test APA row for an aily
-- agent (zero-footprint tenant per recon), assert exactly one new pending
-- queue row appears. SAVEPOINT-isolated.
DO $$
DECLARE
  v_agent_id  uuid;
  v_tenant_id uuid;
  v_community_id uuid;
  v_pre_queue int;
  v_post_queue int;
BEGIN
  -- Pick an aily agent + any community (runtime-SELECTed, no hardcoded UUIDs).
  -- aily tenant has 3 agents and zero APA rows today -- safe small fixture.
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.tenants t ON t.id = a.tenant_id
   WHERE a.is_active = TRUE
     AND a.is_selling = TRUE
     AND a.tenant_id IS NOT NULL
     AND t.source_key = 'aily'
   LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V2 SKIP: no aily agent found; V1 still proves the flip.';
    RETURN;
  END IF;
  SELECT id INTO v_community_id FROM public.communities LIMIT 1;
  IF v_community_id IS NULL THEN
    RAISE NOTICE 'V2 SKIP: no community exists in the DB.';
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_pre_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id AND scope = 'community' AND scope_id = v_community_id
     AND status = 'pending';

  BEGIN
    BEGIN
      -- ASYNC path: skip_apa_reroll='on' makes the trigger enqueue not
      -- call reroll_listings_at_geo inline.
      SET LOCAL app.skip_apa_reroll = 'on';
      SET LOCAL ROLE service_role;
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        (v_agent_id, v_tenant_id, 'community', v_community_id, TRUE, FALSE,
         TRUE, TRUE, FALSE, 'manual');
      RESET ROLE;

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope = 'community' AND scope_id = v_community_id
         AND status = 'pending';

      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V2 FAIL: queue did not grow by 1 (% -> %). DEFINER flip did NOT close handle_apa_insert under service_role.',
                        v_pre_queue, v_post_queue;
      END IF;
      RAISE EXCEPTION 'V2_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM = 'V2_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V2 PASS: service_role INSERT on agent_property_access fired handle_apa_insert; queue grew by 1 (rolled back).';
END $$;

-- V3: handle_apa_update under service_role (ASYNC path). Setup needs an
-- existing APA row to UPDATE; insert one as postgres in the outer SAVEPOINT,
-- then SET ROLE service_role + UPDATE.
DO $$
DECLARE
  v_agent_id  uuid;
  v_tenant_id uuid;
  v_community_id uuid;
  v_test_apa_id uuid;
  v_pre_queue int;
  v_post_queue int;
BEGIN
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.tenants t ON t.id = a.tenant_id
   WHERE a.is_active = TRUE AND a.is_selling = TRUE AND a.tenant_id IS NOT NULL
     AND t.source_key = 'aily'
   LIMIT 1;
  IF v_agent_id IS NULL THEN RAISE NOTICE 'V3 SKIP'; RETURN; END IF;
  SELECT id INTO v_community_id FROM public.communities LIMIT 1;
  IF v_community_id IS NULL THEN RAISE NOTICE 'V3 SKIP'; RETURN; END IF;

  BEGIN
    BEGIN
      -- Setup: insert as postgres with GUC=on so it enqueues quickly.
      SET LOCAL app.skip_apa_reroll = 'on';
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        (v_agent_id, v_tenant_id, 'community', v_community_id, TRUE, FALSE,
         TRUE, TRUE, FALSE, 'manual')
      RETURNING id INTO v_test_apa_id;

      -- Drain the setup queue row so the test measurement is clean.
      DELETE FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      SELECT COUNT(*)::int INTO v_pre_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      -- Test: under service_role, UPDATE a routing field. is_active is in
      -- handle_apa_update's v_routing_changed predicate; is_primary alone
      -- is NOT (only routing fields enqueue, by design -- a primary toggle
      -- writes an audit row but never reroute-enqueues). The TRUE->FALSE
      -- transition on is_active is genuine here because the setup INSERT
      -- above used is_active=TRUE, so OLD.is_active IS TRUE and
      -- NEW.is_active IS FALSE -> IS DISTINCT FROM = TRUE -> v_routing_changed.
      -- GUC=on (set above) keeps this in the async queue-INSERT branch;
      -- the sync inner PERFORM reroll_listings_at_geo stays a V5 concern.
      SET LOCAL ROLE service_role;
      UPDATE public.agent_property_access
         SET is_active = FALSE, updated_at = now()
       WHERE id = v_test_apa_id;
      RESET ROLE;

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V3 FAIL: queue did not grow by 1 (% -> %). DEFINER flip did NOT close handle_apa_update under service_role.',
                        v_pre_queue, v_post_queue;
      END IF;
      RAISE EXCEPTION 'V3_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM = 'V3_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V3 PASS: service_role UPDATE on agent_property_access fired handle_apa_update; queue grew by 1 (rolled back).';
END $$;

-- V4: handle_apa_delete under service_role (ASYNC path).
DO $$
DECLARE
  v_agent_id  uuid;
  v_tenant_id uuid;
  v_community_id uuid;
  v_test_apa_id uuid;
  v_pre_queue int;
  v_post_queue int;
BEGIN
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.tenants t ON t.id = a.tenant_id
   WHERE a.is_active = TRUE AND a.is_selling = TRUE AND a.tenant_id IS NOT NULL
     AND t.source_key = 'aily'
   LIMIT 1;
  IF v_agent_id IS NULL THEN RAISE NOTICE 'V4 SKIP'; RETURN; END IF;
  SELECT id INTO v_community_id FROM public.communities LIMIT 1;
  IF v_community_id IS NULL THEN RAISE NOTICE 'V4 SKIP'; RETURN; END IF;

  BEGIN
    BEGIN
      SET LOCAL app.skip_apa_reroll = 'on';
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        (v_agent_id, v_tenant_id, 'community', v_community_id, TRUE, FALSE,
         TRUE, TRUE, FALSE, 'manual')
      RETURNING id INTO v_test_apa_id;

      DELETE FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      SELECT COUNT(*)::int INTO v_pre_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      SET LOCAL ROLE service_role;
      DELETE FROM public.agent_property_access WHERE id = v_test_apa_id;
      RESET ROLE;

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope='community' AND scope_id=v_community_id
         AND status='pending';

      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V4 FAIL: queue did not grow by 1 (% -> %). DEFINER flip did NOT close handle_apa_delete under service_role.',
                        v_pre_queue, v_post_queue;
      END IF;
      RAISE EXCEPTION 'V4_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM = 'V4_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V4 PASS: service_role DELETE on agent_property_access fired handle_apa_delete; queue grew by 1 (rolled back).';
END $$;

-- V5: FULL TRIGGER CHAIN under service_role (SYNC path, no GUC) -- the
-- inner-function inheritance proof. Pick an aily agent + the smallest
-- community (to keep reroll_listings_at_geo wall-clock minimal). INSERT
-- without setting app.skip_apa_reroll. handle_apa_insert PERFORMs
-- reroll_listings_at_geo inline. If reroll_listings_at_geo or any inner
-- function fails to inherit postgres privileges through the DEFINER chain,
-- the INSERT raises permission-denied or schema-related errors. Assert
-- the INSERT completes cleanly and the audit row appears.
DO $$
DECLARE
  v_agent_id  uuid;
  v_tenant_id uuid;
  v_community_id uuid;
  v_pre_audit int;
  v_post_audit int;
BEGIN
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.tenants t ON t.id = a.tenant_id
   WHERE a.is_active = TRUE AND a.is_selling = TRUE AND a.tenant_id IS NOT NULL
     AND t.source_key = 'aily'
   LIMIT 1;
  IF v_agent_id IS NULL THEN RAISE NOTICE 'V5 SKIP'; RETURN; END IF;

  -- Smallest community by mls_listings count -- keeps reroll wall-clock low.
  SELECT c.id INTO v_community_id
    FROM public.communities c
    LEFT JOIN public.mls_listings ml ON ml.community_id = c.id
   GROUP BY c.id
   ORDER BY COUNT(ml.id) ASC
   LIMIT 1;
  IF v_community_id IS NULL THEN RAISE NOTICE 'V5 SKIP: no communities'; RETURN; END IF;

  SELECT COUNT(*)::int INTO v_pre_audit
    FROM public.territory_assignment_changes
   WHERE tenant_id = v_tenant_id AND agent_id = v_agent_id
     AND change_type = 'assignment_granted';

  BEGIN
    BEGIN
      -- Explicitly DO NOT set app.skip_apa_reroll, so handle_apa_insert
      -- takes the SYNC branch and PERFORMs reroll_listings_at_geo.
      SET LOCAL ROLE service_role;
      INSERT INTO public.agent_property_access
        (agent_id, tenant_id, scope, community_id, is_active, is_primary,
         condo_access, homes_access, buildings_access, buildings_mode)
      VALUES
        (v_agent_id, v_tenant_id, 'community', v_community_id, TRUE, FALSE,
         TRUE, TRUE, FALSE, 'manual');
      RESET ROLE;

      SELECT COUNT(*)::int INTO v_post_audit
        FROM public.territory_assignment_changes
       WHERE tenant_id = v_tenant_id AND agent_id = v_agent_id
         AND change_type = 'assignment_granted';

      IF v_post_audit <> v_pre_audit + 1 THEN
        RAISE EXCEPTION 'V5 FAIL: audit row not inserted (% -> %). The full chain did NOT complete under service_role -- inner function inheritance broken.',
                        v_pre_audit, v_post_audit;
      END IF;
      RAISE EXCEPTION 'V5_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM = 'V5_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V5 PASS: full chain under service_role (no skip-reroll GUC) -- audit INSERT + reroll_listings_at_geo PERFORM all succeeded via DEFINER chain.';
END $$;

-- V6: apa_mutation_lock_trigger UNCHANGED (still INVOKER, no search_path lock).
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='apa_mutation_lock_trigger';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V6 FAIL: apa_mutation_lock_trigger not found';
  END IF;
  IF v_secdef IS NOT FALSE THEN
    RAISE EXCEPTION 'V6 FAIL: apa_mutation_lock_trigger.prosecdef=% (expected FALSE; this fn intentionally stays INVOKER)', v_secdef;
  END IF;
  RAISE NOTICE 'V6 PASS: apa_mutation_lock_trigger unchanged (still SECURITY INVOKER, no search_path; no table writes, no grants needed).';
END $$;

-- End of migration body. V1-V6 must all PASS (V2/V3/V4/V5 may SKIP if no
-- aily agent or community exists) for COMMIT.
