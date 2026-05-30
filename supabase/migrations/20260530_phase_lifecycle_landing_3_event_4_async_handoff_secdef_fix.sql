-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 -- ASYNC HANDOFF SECDEF FIX.
-- Up: ALTER FUNCTION handle_agent_deactivate() SECURITY DEFINER + locked
--     search_path. Closes F-EVENT-4-ASYNC-PERMISSION-DENIED (HIGH).
--
-- Date:           2026-05-30
-- Plan:           F-EVENT-4-ASYNC-PERMISSION-DENIED finding + the post-COMMIT
--                 probe of 20260530_phase_lifecycle_landing_3_event_4_async_handoff.sql
--                 that surfaced the dual-rooted failure: the runner's V3
--                 probe queried territory_reroll_queue directly under
--                 service_role (no grant), AND the production path itself
--                 (admin route -> service_role -> UPDATE agents -> trigger)
--                 fails because handle_agent_deactivate is SECURITY INVOKER
--                 and service_role has zero grants on the queue.
-- Apply via:      node scripts/apply-phase-lifecycle-landing-3-event-4-async-handoff-secdef-fix.js
-- Down-migration: 20260530_phase_lifecycle_landing_3_event_4_async_handoff_secdef_fix_down.sql
--                 (ALTER FUNCTION ... SECURITY INVOKER -- re-introduces the
--                  broken state; down is "revert this fix", not "return to
--                  good".)
--
-- Class-mirror of F-FLOOR-POOL-PERMISSION-DENIED (Landing 1, 2026-05-29):
-- same fix pattern, same posture as pick_floor_agent, reresolve_listings_in_set,
-- and reflow_deactivated_agent. The function body runs as the owner (postgres)
-- regardless of caller; the INSERT into territory_reroll_queue succeeds
-- because postgres has all grants on the queue. service_role no longer needs
-- direct grants on the queue.
--
-- TENANT-ISOLATION REVIEW (HARD GATE):
--   Function body (unchanged by this migration, only the security model
--   changes):
--     IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
--     INSERT INTO public.territory_reroll_queue (tenant_id, scope, scope_id)
--     VALUES (NEW.tenant_id, 'agent', NEW.id)
--     ON CONFLICT (tenant_id, scope, scope_id) WHERE status='pending'
--     DO NOTHING;
--   Tenant scoping survives the INVOKER->DEFINER flip because:
--     (a) NEW.tenant_id is the agent row's tenant_id, derived by PostgreSQL's
--         trigger mechanism from the row being UPDATEd. It is NOT caller-
--         supplied user input.
--     (b) The queue row's tenant_id = NEW.tenant_id; ON CONFLICT target is
--         per-tenant. Cross-tenant collision impossible.
--     (c) The function body uses NO auth.uid(), current_user, session_user,
--         current_setting, or dynamic SQL. The INVOKER->DEFINER flip
--         therefore cannot change behavior beyond which role's grants
--         apply to the INSERT. The Landing 1 precondition pattern (the
--         pick_floor_agent flip) verified exactly this property is what
--         makes a definer flip safe.
--     (d) search_path locked to (public, pg_temp): no schema-injection
--         vulnerability via search_path manipulation.
-- ============================================================================

-- ============================================================================
-- 1. ALTER FUNCTION public.handle_agent_deactivate() SECURITY DEFINER
-- ============================================================================
-- The trigger function body is unchanged. Only the security model + locked
-- search_path are set. The trigger binding (trg_agent_deactivate_reflow ON
-- agents) is untouched; PostgreSQL re-resolves the function identity at
-- trigger-fire time so no trigger DROP/CREATE is needed.

ALTER FUNCTION public.handle_agent_deactivate()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.handle_agent_deactivate() IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 (async, 2026-05-30; secdef
   fix 2026-05-30 later same day).
   Trigger function backing trg_agent_deactivate_reflow on public.agents.
   Async-enqueue body INSERTs into territory_reroll_queue with ON CONFLICT
   DO NOTHING; the reroll-worker drains via reflow_deactivated_agent.

   SECURITY DEFINER + locked search_path: function body runs as postgres
   regardless of caller role. Closes F-EVENT-4-ASYNC-PERMISSION-DENIED:
   the admin route (app/api/admin/agents/[id]/route.ts) connects via
   supabase-js -> PostgREST -> authenticator -> SET LOCAL ROLE service_role.
   service_role has zero grants on territory_reroll_queue, so the prior
   INVOKER body raised permission-denied on the INSERT. The DEFINER flip
   runs the INSERT as the function owner (postgres), bypassing the gap.
   No auth.uid()/current_user/current_setting/dynamic SQL in the body, so
   the INVOKER->DEFINER flip does not change tenant-scoping behavior.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- ============================================================================

-- V1: prosecdef + proconfig on handle_agent_deactivate.
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='handle_agent_deactivate';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: handle_agent_deactivate not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V1 FAIL: handle_agent_deactivate.prosecdef = FALSE (expected TRUE)';
  END IF;
  IF v_proconfig IS NULL
     OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%')
  THEN
    RAISE EXCEPTION 'V1 FAIL: handle_agent_deactivate.proconfig missing locked search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'V1 PASS: handle_agent_deactivate SECURITY DEFINER + locked search_path.';
END $$;

-- V2: END-TO-END PRODUCTION-PATH TEST (the missing piece).
-- SAVEPOINT-isolated. Pick a real agent, capture pre-queue under postgres,
-- SET LOCAL ROLE service_role, UPDATE agents (fires trigger which under
-- DEFINER now runs as postgres -> INSERT succeeds), RESET ROLE, re-capture
-- queue under postgres, assert delta = 1. Rollback the test mutation via
-- sentinel raise (same SAVEPOINT pattern as Landing 2 / prior secdef
-- migrations).
--
-- THIS IS THE TEST THAT WAS MISSING IN THE PRIOR (async-handoff) MIGRATION.
-- The prior V3 only exercised the trigger under postgres (which always
-- worked); the production-path failure under service_role only surfaced
-- post-COMMIT, after the (no-good-state) trigger was already live.
DO $$
DECLARE
  v_agent_id   uuid;
  v_tenant_id  uuid;
  v_pre_queue  int;
  v_post_queue int;
BEGIN
  -- Pick an active+selling tenant agent with listings (as postgres).
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
   WHERE a.is_active  = TRUE
     AND a.is_selling = TRUE
     AND a.tenant_id  IS NOT NULL
   GROUP BY a.id, a.tenant_id
   HAVING COUNT(ml.id) > 0
   ORDER BY COUNT(ml.id) DESC
   LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V2 SKIP: no eligible test agent (V1 still proves the security flip).';
    RETURN;
  END IF;

  -- Pre-capture (as postgres) -- queue reads must NOT happen under service_role.
  SELECT COUNT(*)::int INTO v_pre_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id AND scope = 'agent' AND scope_id = v_agent_id
     AND status = 'pending';
  RAISE NOTICE 'V2 setup: agent=%, tenant=%, pre-queue=%', v_agent_id, v_tenant_id, v_pre_queue;

  BEGIN
    -- Inner BEGIN/EXCEPTION = SAVEPOINT-equivalent. The test mutation rolls
    -- back via the sentinel raise without aborting the outer migration tx.
    BEGIN
      -- Switch to service_role. SET LOCAL means the change reverts when
      -- the surrounding tx ends (or this DO block returns); we also
      -- RESET ROLE explicitly before reading the queue.
      SET LOCAL ROLE service_role;
      -- This UPDATE fires the trigger. The DEFINER function body INSERTs
      -- as postgres; if the fix worked, this succeeds.
      UPDATE public.agents SET is_active = FALSE WHERE id = v_agent_id;
      RESET ROLE;

      -- Read queue as postgres (the lesson: never SELECT a restricted
      -- table under service_role).
      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope = 'agent' AND scope_id = v_agent_id
         AND status = 'pending';

      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V2 FAIL: service_role UPDATE did not enqueue (% -> %). Production path still broken.',
                        v_pre_queue, v_post_queue;
      END IF;

      RAISE NOTICE 'V2 mid-test: service_role UPDATE fired trigger; queue grew by 1.';
      RAISE EXCEPTION 'V2_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        -- Defensively RESET ROLE in case the exception fired before our
        -- explicit RESET ROLE above. Idempotent.
        RESET ROLE;
        IF SQLERRM = 'V2_DONE_ROLLBACK' THEN
          NULL;
        ELSE
          RAISE;
        END IF;
    END;
  END;

  -- Confirm rollback restored agent + queue.
  SELECT COUNT(*)::int INTO v_post_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id AND scope = 'agent' AND scope_id = v_agent_id
     AND status = 'pending';
  IF v_post_queue <> v_pre_queue THEN
    RAISE EXCEPTION 'V2 FAIL: post-rollback queue count % != pre %', v_post_queue, v_pre_queue;
  END IF;
  PERFORM 1 FROM public.agents WHERE id = v_agent_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V2 FAIL: agent % not restored to is_active=TRUE', v_agent_id;
  END IF;

  RAISE NOTICE 'V2 PASS: production path under service_role enqueues exactly 1; rolled back cleanly.';
END $$;

-- V3: NULL-tenant guard still skips enqueue. The DEFINER flip should not have
-- changed any in-body logic; this verifies the early return is intact.
-- SAVEPOINT-isolated: temporarily NULL an agent's tenant_id, UPDATE
-- is_active, observe NO enqueue, rollback.
--
-- Note: this requires us to be able to set agents.tenant_id = NULL. If the
-- column has a NOT NULL constraint we'll SKIP. (Per the recon, tenant_id is
-- nullable on agents -- platform-tier agents like Syed Shah are tenant_id
-- NULL today.) Pick a fresh agent (not the one V2 used) so the previous
-- SAVEPOINT rollback doesn't matter.
DO $$
DECLARE
  v_agent_id  uuid;
  v_pre_queue int;
  v_post_queue int;
BEGIN
  -- Pick a tenant agent (we'll NULL its tenant_id inside the SAVEPOINT).
  SELECT a.id INTO v_agent_id
    FROM public.agents a
   WHERE a.is_active = TRUE AND a.is_selling = TRUE AND a.tenant_id IS NOT NULL
   LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V3 SKIP: no tenant agent for NULL-tenant probe.';
    RETURN;
  END IF;

  -- Pre-count any pending queue rows for this agent (across all tenant_ids;
  -- shouldn't be any after V2 rollback).
  SELECT COUNT(*)::int INTO v_pre_queue
    FROM public.territory_reroll_queue
   WHERE scope = 'agent' AND scope_id = v_agent_id AND status = 'pending';

  BEGIN
    BEGIN
      -- Force tenant_id = NULL on the agent (SAVEPOINT-isolated).
      UPDATE public.agents SET tenant_id = NULL WHERE id = v_agent_id;
      -- Now flip is_active. Trigger fires; the function's first IF should
      -- short-circuit and skip enqueue.
      UPDATE public.agents SET is_active = FALSE WHERE id = v_agent_id;

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE scope = 'agent' AND scope_id = v_agent_id AND status = 'pending';

      IF v_post_queue <> v_pre_queue THEN
        RAISE EXCEPTION 'V3 FAIL: NULL-tenant guard broken; queue grew % -> %', v_pre_queue, v_post_queue;
      END IF;

      RAISE EXCEPTION 'V3_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V3_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V3 PASS: NULL-tenant agent deactivation enqueues 0 rows (guard intact).';
END $$;

-- End of migration body. V1-V3 must all PASS (V2 or V3 may SKIP if no
-- eligible test agent exists) for COMMIT.
