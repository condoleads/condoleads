-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 -- ASYNC HANDOFF migration.
-- Up: extend territory_reroll_queue.scope CHECK to include 'agent';
--     CREATE OR REPLACE handle_agent_deactivate to ENQUEUE instead of PERFORM.
--
-- Date:           2026-05-30
-- Plan:           phase-lifecycle-landing-3-event4-async-recon.txt
-- Apply via:      node scripts/apply-phase-lifecycle-landing-3-event-4-async-handoff.js
-- Down-migration: 20260530_phase_lifecycle_landing_3_event_4_async_handoff_down.sql
--                 (paired with apply-...-async-handoff-down.js which restores
--                  handle_agent_deactivate body from the snapshot captured
--                  pre-COMMIT by the up-runner; body is NEVER hardcoded in
--                  the down SQL.)
--
-- Reverses operator decision Q1 from sync to async after the production-path
-- timeout analysis surfaced an unworkable constraint:
--   - The admin route at app/api/admin/agents/[id]/route.ts uses supabase-js
--     -> PostgREST -> authenticator role -> SET LOCAL ROLE service_role.
--   - authenticator's role config caps statement_timeout = 8s and that limit
--     is NOT reset by SET LOCAL ROLE (role-startup settings apply at connect,
--     not on role switch).
--   - All three current WALLiam agents (King Shah, Neo Smith, WALLiam seed)
--     hold ~430k mls_listings rows each (they are floor-pool members in
--     addition to their geo carves). A 430k-row reflow cannot complete in 8s.
--   - The synchronous trigger therefore fail-closed-rolls-back every real
--     WALLiam agent deactivation. Operator cannot deactivate via the UI.
--
-- Q2 reader-hardening (Phase 2 cache-first INNER JOIN now filters on
-- agents.is_active AND agents.is_selling) already closes the misroute window
-- regardless of cache staleness. That was the only justification for sync.
-- So async is now both NECESSARY (sync is broken) AND SAFER (no fail-closed
-- footgun; reader hardening masks cache lag).
--
-- WHAT THIS MIGRATION DOES NOT CHANGE:
--   - reflow_deactivated_agent(uuid, uuid) function body + signature + flags
--     (SECURITY DEFINER, locked search_path, args, return type). Already
--     correct for async; the worker calls it with statement_timeout=0.
--   - trg_agent_deactivate_reflow trigger definition (the WHEN clause + the
--     binding to handle_agent_deactivate). Only the function body switches.
--
-- ATOMIC SYNC->ASYNC TRANSITION:
--   CREATE OR REPLACE FUNCTION swaps the body in one statement. The trigger
--   binding is unchanged so there is no unprotected window between dropping
--   the old function and creating the new one.
-- ============================================================================

-- ============================================================================
-- 1. Extend territory_reroll_queue.scope CHECK
-- ============================================================================
-- Existing CHECK allows ('area', 'municipality', 'community', 'tenant_default').
-- Async Event 4 enqueues rows with scope='agent', so the CHECK must admit it.
-- DROP-and-recreate is the safest pattern for a CHECK update (no ALTER ... ADD
-- VALUE TO CHECK syntax exists in PostgreSQL).

ALTER TABLE public.territory_reroll_queue
  DROP CONSTRAINT territory_reroll_queue_scope_check;

ALTER TABLE public.territory_reroll_queue
  ADD CONSTRAINT territory_reroll_queue_scope_check
  CHECK (scope = ANY (ARRAY[
    'area'::text,
    'municipality'::text,
    'community'::text,
    'tenant_default'::text,
    'agent'::text
  ]));

COMMENT ON CONSTRAINT territory_reroll_queue_scope_check ON public.territory_reroll_queue IS
  'Allowed reroll scopes. Geo levels (area/municipality/community) and
   tenant_default enqueued by handle_apa_* triggers. The agent level was
   added 2026-05-30 by Event 4 async-handoff so handle_agent_deactivate can
   enqueue (scope=''agent'', scope_id=agent.id) and the existing worker
   drains via reflow_deactivated_agent.';

-- ============================================================================
-- 2. CREATE OR REPLACE handle_agent_deactivate -- SWAP BODY (PERFORM -> INSERT)
-- ============================================================================
-- Pre-swap body (will be captured pre-BEGIN by the up-runner snapshot for the
-- down path): synchronous PERFORM public.reflow_deactivated_agent(NEW.id,
-- NEW.tenant_id) inside the agents UPDATE transaction.
--
-- Post-swap body: INSERT INTO territory_reroll_queue with ON CONFLICT DO
-- NOTHING. Returns immediately. The worker drains the queue.
--
-- Tenant isolation: NEW.tenant_id (the agent's tenant) is written into both
-- the queue row's tenant_id AND embedded in the ON CONFLICT target. A
-- cross-tenant call (impossible via the trigger context but defensive) would
-- still produce a tenant-scoped queue row. The worker drains per-tenant via
-- WHERE tenant_id=$1 so cross-tenant leak at drain time is impossible.

CREATE OR REPLACE FUNCTION public.handle_agent_deactivate()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Platform-tier agents have tenant_id IS NULL. Skip; they should never
  -- be the routed agent for tenant leads, and the queue has tenant_id NOT NULL.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ASYNC HANDOFF (Event 4 async, 2026-05-30): enqueue and return.
  -- The worker (app/api/admin-homes/territory/reroll-worker/route.ts +
  -- .github/workflows/reroll-worker.yml cron) calls reflow_deactivated_agent
  -- per claim with statement_timeout=0, bypassing the 8s authenticator cap.
  --
  -- ON CONFLICT (tenant_id, scope, scope_id) WHERE status='pending' DO
  -- NOTHING coalesces repeated enqueues. If an agent is deactivated, then
  -- reactivated (no-op per trigger WHEN clause), then deactivated again
  -- before the worker drains, the second deactivation hits the conflict
  -- target and DOES NOTHING -- still exactly one pending row. Per the
  -- recon's idempotency analysis, draining on an agent that has since been
  -- reactivated is HARMLESS (cascade predicates re-admit the now-active
  -- agent; rows resolve back to them or to whichever agent the routing-set
  -- currently picks).
  INSERT INTO public.territory_reroll_queue (tenant_id, scope, scope_id)
  VALUES (NEW.tenant_id, 'agent', NEW.id)
  ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending'
  DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_agent_deactivate() IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 (async, 2026-05-30).
   Trigger function backing trg_agent_deactivate_reflow on public.agents.
   Replaces the synchronous body (2026-05-30 morning) with an asynchronous
   enqueue into territory_reroll_queue (scope=agent, scope_id=NEW.id).
   The reroll-worker route drains the queue via reflow_deactivated_agent.
   Idempotent via ON CONFLICT DO NOTHING on the pending-slot unique index.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- Every assertion either RAISE EXCEPTION (forces ROLLBACK) or RAISE NOTICE
-- PASS. Runtime-SELECTed UUIDs only; no hardcoded ids.
-- ============================================================================

-- V1: scope CHECK now admits 'agent'.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'territory_reroll_queue'
     AND c.conname = 'territory_reroll_queue_scope_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: territory_reroll_queue_scope_check not found';
  END IF;
  IF v_def NOT LIKE '%''agent''%' THEN
    RAISE EXCEPTION 'V1 FAIL: scope CHECK does not include ''agent''. Got: %', v_def;
  END IF;
  RAISE NOTICE 'V1 PASS: scope CHECK admits ''agent''.';
END $$;

-- V2: handle_agent_deactivate body switched: INSERT present, PERFORM absent.
-- Asserts the BODY actually changed (no half-applied state).
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'handle_agent_deactivate';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'V2 FAIL: handle_agent_deactivate not found';
  END IF;
  IF v_src NOT LIKE '%INSERT INTO public.territory_reroll_queue%' THEN
    RAISE EXCEPTION 'V2 FAIL: handle_agent_deactivate body missing INSERT clause';
  END IF;
  IF v_src LIKE '%PERFORM public.reflow_deactivated_agent%' THEN
    RAISE EXCEPTION 'V2 FAIL: handle_agent_deactivate body still contains synchronous PERFORM';
  END IF;
  RAISE NOTICE 'V2 PASS: handle_agent_deactivate body switched (INSERT present, sync PERFORM removed).';
END $$;

-- V3: SAVEPOINT-isolated end-to-end test. Deactivate a real agent inside an
-- inner BEGIN/EXCEPTION block; assert (a) NEW pending queue row appears with
-- scope='agent', scope_id=agent.id, status='pending'; (b) the agent's
-- mls_listings rows are STILL pointed at them (no inline reflow); (c)
-- ROLLBACK undoes everything cleanly. Same pattern as the previous (sync)
-- migration's V3.
DO $$
DECLARE
  v_agent_id   uuid;
  v_tenant_id  uuid;
  v_pre_count  int;
  v_pre_queue  int;
  v_post_queue int;
  v_post_owned int;
BEGIN
  -- Pick an active+selling agent with listings (any tenant; runtime-SELECTed)
  SELECT a.id, a.tenant_id, COUNT(ml.id)::int
    INTO v_agent_id, v_tenant_id, v_pre_count
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
    RAISE NOTICE 'V3 SKIP: no eligible test agent in DB. V1+V2 still verified the body; smoke harness runs the full path.';
    RETURN;
  END IF;

  -- Capture pre-state queue count for (this tenant, scope='agent', scope_id=agent)
  SELECT COUNT(*)::int INTO v_pre_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id
     AND scope = 'agent'
     AND scope_id = v_agent_id
     AND status = 'pending';

  RAISE NOTICE 'V3 setup: agent=%, tenant=%, owns % listings, pre-queue rows=%',
               v_agent_id, v_tenant_id, v_pre_count, v_pre_queue;

  BEGIN
    -- Inner block: deactivate, observe, then RAISE sentinel to roll back.
    BEGIN
      UPDATE public.agents SET is_active = FALSE WHERE id = v_agent_id;

      SELECT COUNT(*)::int INTO v_post_owned
        FROM public.mls_listings
       WHERE assigned_agent_id = v_agent_id;

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id
         AND scope = 'agent'
         AND scope_id = v_agent_id
         AND status = 'pending';

      IF v_post_owned <> v_pre_count THEN
        RAISE EXCEPTION 'V3 FAIL: agent listings count changed % -> % (expected unchanged; async = no inline reflow)',
                        v_pre_count, v_post_owned;
      END IF;
      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V3 FAIL: pending queue rows for (tenant=%, scope=agent, scope_id=%): % -> % (expected +1)',
                        v_tenant_id, v_agent_id, v_pre_queue, v_post_queue;
      END IF;

      RAISE NOTICE 'V3 mid-test: queue grew by 1 (now %); mls_listings unchanged (%)',
                   v_post_queue, v_post_owned;
      RAISE EXCEPTION 'V3_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V3_DONE_ROLLBACK' THEN
          NULL;
        ELSE
          RAISE;
        END IF;
    END;
  END;

  -- Post-rollback: queue count and agent state should be back.
  SELECT COUNT(*)::int INTO v_post_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id
     AND scope = 'agent'
     AND scope_id = v_agent_id
     AND status = 'pending';
  IF v_post_queue <> v_pre_queue THEN
    RAISE EXCEPTION 'V3 FAIL: post-rollback pending queue count % != pre %', v_post_queue, v_pre_queue;
  END IF;
  PERFORM 1 FROM public.agents WHERE id = v_agent_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V3 FAIL: agent % not restored to is_active=TRUE', v_agent_id;
  END IF;

  RAISE NOTICE 'V3 PASS: agent deactivation now enqueues exactly 1 row; mls_listings unchanged; rolled back cleanly.';
END $$;

-- V4: Idempotency / coalesce. Deactivate -> reactivate -> deactivate inside
-- a SAVEPOINT-isolated block. Expected end state: ONE pending queue row
-- (not two), agent is_active=false. The reactivation in the middle is a
-- trigger no-op per the WHEN clause. The second deactivation hits ON
-- CONFLICT DO NOTHING because the first pending row still exists.
DO $$
DECLARE
  v_agent_id   uuid;
  v_tenant_id  uuid;
  v_pre_queue  int;
  v_post_queue int;
BEGIN
  SELECT a.id, a.tenant_id INTO v_agent_id, v_tenant_id
    FROM public.agents a
    JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
   WHERE a.is_active  = TRUE
     AND a.is_selling = TRUE
     AND a.tenant_id  IS NOT NULL
   GROUP BY a.id, a.tenant_id
   HAVING COUNT(ml.id) > 0
   LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V4 SKIP: no eligible test agent.';
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_pre_queue
    FROM public.territory_reroll_queue
   WHERE tenant_id = v_tenant_id AND scope = 'agent' AND scope_id = v_agent_id
     AND status = 'pending';

  BEGIN
    BEGIN
      UPDATE public.agents SET is_active = FALSE WHERE id = v_agent_id;  -- enqueue
      UPDATE public.agents SET is_active = TRUE  WHERE id = v_agent_id;  -- no trigger (false->true)
      UPDATE public.agents SET is_active = FALSE WHERE id = v_agent_id;  -- ON CONFLICT DO NOTHING

      SELECT COUNT(*)::int INTO v_post_queue
        FROM public.territory_reroll_queue
       WHERE tenant_id = v_tenant_id AND scope = 'agent' AND scope_id = v_agent_id
         AND status = 'pending';

      IF v_post_queue <> v_pre_queue + 1 THEN
        RAISE EXCEPTION 'V4 FAIL: coalesce broken. pending queue rows: % -> % (expected +1, deactivate-reactivate-deactivate must coalesce to ONE pending row)',
                        v_pre_queue, v_post_queue;
      END IF;
      RAISE EXCEPTION 'V4_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V4_DONE_ROLLBACK' THEN NULL;
        ELSE RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V4 PASS: deactivate->reactivate->deactivate coalesces to ONE pending queue row.';
END $$;

-- End of migration body. V1..V4 must all PASS (V3 or V4 may SKIP if no test
-- agent exists) for COMMIT.
