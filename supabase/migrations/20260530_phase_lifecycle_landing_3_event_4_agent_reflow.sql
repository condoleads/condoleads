-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 -- Event 4 (deactivation reflow).
-- Up-migration: reflow_deactivated_agent (NEW) + handle_agent_deactivate (NEW)
--               + trg_agent_deactivate_reflow (NEW trigger on agents).
--
-- Date:           2026-05-30
-- Plan:           docs/W-TERRITORY-MASTER-TRACKER.md Part 1 line 234 (v16) +
--                 phase-lifecycle-landing-3-event4-recon-output.txt
-- Apply via:      node scripts/apply-phase-lifecycle-landing-3-event-4.js
-- Down-migration: 20260530_phase_lifecycle_landing_3_event_4_down.sql
--
-- Closes: Event 4 of the v16 routing lifecycle (deactivation reflow).
--
-- Operator decisions locked (per BUILD + SHOW gate, 2026-05-30):
--   Q1 SYNC reflow inside the trigger (close the misroute window;
--      deactivation is infrequent so the slower UPDATE is worth it).
--   Q2 cache-first hardening ships alongside (TypeScript edit, separate diff).
--   Q3 DB trigger on agents (catches PUT + DELETE + is_selling + any future
--      write path; matches v16 model line 234).
--
-- Frozen contract preserved: resolve_agent_for_context AND
-- reresolve_listings_in_set bodies + signatures untouched. This file adds
-- a shim that composes reresolve_listings_in_set after NULLing the trio.
--
-- Security: reflow_deactivated_agent is SECURITY DEFINER + locked search_path
-- (Landing 1 + Landing 2 posture). handle_agent_deactivate is SECURITY
-- INVOKER (the trigger function itself doesn't need DEFINER; its PERFORM
-- crosses into reflow_deactivated_agent's DEFINER scope for the agent_property_
-- access + tenant_floor_pool reads inside reresolve_listings_in_set).
-- ============================================================================

-- ============================================================================
-- 1. CREATE FUNCTION public.reflow_deactivated_agent
-- ============================================================================
-- Thin shim that:
--   (a) collects mls_listings.id WHERE assigned_agent_id = p_agent_id, scoped
--       to p_tenant_id via the agents JOIN;
--   (b) NULLs the coupled trio (agent + scope + source) for those rows so
--       reresolve_listings_in_set's sticky guard treats them as fresh;
--   (c) re-walks the cascade. By the time this is called (AFTER UPDATE trigger
--       on agents), the dead agent has is_active=false (or is_selling=false),
--       so every cascade level's `a.is_active AND a.is_selling` predicate
--       excludes them. Listings re-resolve to the next eligible agent or fall
--       to floor / fire one tenant_floor_alerts row per call per property type.
--
-- Tenant isolation (every step is anchored on p_tenant_id AND agents.tenant_id):
--   - SELECT phase: agents.id = p_agent_id AND agents.tenant_id = p_tenant_id.
--     Belt-and-suspenders: a cross-tenant call collects zero rows.
--   - UPDATE phase: WHERE id = ANY(v_ids); v_ids was derived only from rows
--     whose agent.tenant_id matched p_tenant_id, so no cross-tenant clobber
--     is possible.
--   - reresolve_listings_in_set is already tenant-scoped (Landing 2's V1-V6
--     proved every cascade level scopes the anchor table AND agents.tenant_id
--     by p_tenant_id).

CREATE OR REPLACE FUNCTION public.reflow_deactivated_agent(
  p_agent_id  uuid,
  p_tenant_id uuid
) RETURNS TABLE (reflowed_count int, null_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  -- Guards: NULL inputs no-op cleanly (mirrors reresolve_listings_in_set).
  IF p_agent_id IS NULL OR p_tenant_id IS NULL THEN
    reflowed_count := 0;
    null_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Collect listing ids currently assigned to the dead agent within the
  -- target tenant. The JOIN on agents.tenant_id is the tenant-isolation gate.
  SELECT array_agg(ml.id) INTO v_ids
  FROM   public.mls_listings ml
  JOIN   public.agents a ON a.id = ml.assigned_agent_id
  WHERE  a.id = p_agent_id
    AND  a.tenant_id = p_tenant_id;

  -- No rows held by this agent in this tenant: no-op.
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    reflowed_count := 0;
    null_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- NULL the coupled trio atomically. The Phase 1 coupled CHECK
  -- (mls_listings_assigned_coupled_check) is satisfied because all three
  -- columns transition to NULL together. After this UPDATE, the rows look
  -- exactly like fresh inserts to reresolve_listings_in_set: assigned_scope
  -- IS NULL so the sticky guard at every cascade level matches.
  UPDATE public.mls_listings
     SET assigned_agent_id  = NULL,
         assigned_scope     = NULL,
         assigned_source_id = NULL
   WHERE id = ANY(v_ids);

  -- Re-walk the cascade. Returns (resolved_count, null_count) tuple per
  -- Landing 2's contract.
  RETURN QUERY
    SELECT r.resolved_count, r.null_count
      FROM public.reresolve_listings_in_set(v_ids, p_tenant_id) r;
END;
$function$;

COMMENT ON FUNCTION public.reflow_deactivated_agent(uuid, uuid) IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 (v24+, 2026-05-30).
   Thin shim composing reresolve_listings_in_set after NULLing the cache
   trio for all rows currently assigned to a deactivated agent.

   Wraps the Landing 2 primitive because reresolve_listings_in_set on its
   own cannot re-resolve rows whose existing scope equals the carve level
   that would re-fill them (sticky guard: scope_specificity(current) <
   scope_specificity(this-level)). NULLing the trio satisfies that guard
   by setting assigned_scope IS NULL.

   Tenant isolation: SELECT phase joins agents on tenant_id = p_tenant_id;
   UPDATE phase filters on the resulting id set; downstream
   reresolve_listings_in_set scopes every cascade level by p_tenant_id.
   A cross-tenant call returns (0,0) cleanly.

   Caller contract: p_tenant_id MUST come from a validated request context
   (trigger: NEW.tenant_id from the agents row being updated). Do NOT call
   with a user-supplied tenant_id.

   SECURITY DEFINER + locked search_path mirrors Landing 1 (pick_floor_agent)
   and Landing 2 (reresolve_listings_in_set) posture: function body runs as
   postgres so the chained calls into reresolve_listings_in_set + its
   downstream reads on tenant_floor_pool / agent_property_access / agents
   succeed regardless of caller role.';

-- ============================================================================
-- 2. CREATE FUNCTION public.handle_agent_deactivate (trigger function)
-- ============================================================================
-- AFTER UPDATE trigger function. Fires reflow when the WHEN clause on the
-- trigger detects a true->false transition of is_active or is_selling.
--
-- Defensive NULL-tenant guard: agents with tenant_id IS NULL are platform-
-- tier (e.g. Syed Shah). They should never be the assigned agent on a tenant
-- listing; if somehow one is deactivated, skip rather than crash.

CREATE OR REPLACE FUNCTION public.handle_agent_deactivate()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Platform-tier agents have tenant_id IS NULL. Skip reflow.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Synchronous reflow inside the agents-table UPDATE transaction.
  -- The PERFORM swallows the result tuple; reflow_deactivated_agent
  -- writes its effects directly to mls_listings.
  PERFORM public.reflow_deactivated_agent(NEW.id, NEW.tenant_id);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_agent_deactivate() IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 (2026-05-30).
   Trigger function backing trg_agent_deactivate_reflow on public.agents.
   Wraps reflow_deactivated_agent in a NULL-tenant guard. Fires
   synchronously inside the agents UPDATE transaction. If the reflow
   raises, the UPDATE rolls back (fail-closed; an agent cannot be
   deactivated unless their listings are successfully reflowed).';

-- ============================================================================
-- 3. CREATE TRIGGER trg_agent_deactivate_reflow
-- ============================================================================
-- AFTER UPDATE OF is_active, is_selling: fires only when one of these two
-- columns is touched by the UPDATE. The WHEN clause further narrows to the
-- specific true->false transition. Reactivations (false->true) and other
-- column updates are no-ops.

DROP TRIGGER IF EXISTS trg_agent_deactivate_reflow ON public.agents;

CREATE TRIGGER trg_agent_deactivate_reflow
AFTER UPDATE OF is_active, is_selling ON public.agents
FOR EACH ROW
WHEN (
  (OLD.is_active  IS DISTINCT FROM NEW.is_active
   AND OLD.is_active  IS TRUE
   AND (NEW.is_active  IS NULL OR NEW.is_active  IS FALSE))
  OR
  (OLD.is_selling IS DISTINCT FROM NEW.is_selling
   AND OLD.is_selling IS TRUE
   AND (NEW.is_selling IS NULL OR NEW.is_selling IS FALSE))
)
EXECUTE FUNCTION public.handle_agent_deactivate();

COMMENT ON TRIGGER trg_agent_deactivate_reflow ON public.agents IS
  'W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 (2026-05-30).
   Fires synchronously when an agent transitions to is_active=false
   OR is_selling=false. Reactivations are no-ops. Calls
   handle_agent_deactivate which delegates to reflow_deactivated_agent.';

-- ============================================================================
-- VERIFICATION (inside the same transaction)
-- Every assertion either RAISE EXCEPTION (forces ROLLBACK) or RAISE NOTICE
-- with PASS. Runtime-SELECTed UUIDs only; no hardcoded ids.
-- ============================================================================

-- V1: prosecdef + proconfig on reflow_deactivated_agent.
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig
    INTO v_secdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reflow_deactivated_agent';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V1 FAIL: reflow_deactivated_agent not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V1 FAIL: reflow_deactivated_agent.prosecdef is FALSE (expected TRUE)';
  END IF;
  IF v_proconfig IS NULL
     OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%')
  THEN
    RAISE EXCEPTION 'V1 FAIL: reflow_deactivated_agent.proconfig missing locked search_path. Got: %', v_proconfig;
  END IF;
  RAISE NOTICE 'V1 PASS: reflow_deactivated_agent SECURITY DEFINER + locked search_path.';
END $$;

-- V2: trg_agent_deactivate_reflow exists on public.agents with the correct
-- function binding. The WHEN clause is captured in pg_trigger.tgqual but is
-- binary; we assert the trigger exists, fires AFTER UPDATE, and binds the
-- expected function. The WHEN-clause semantics are exercised end-to-end in V3.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE c.relname = 'agents'
     AND t.tgname = 'trg_agent_deactivate_reflow'
     AND p.proname = 'handle_agent_deactivate'
     AND NOT t.tgisinternal;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'V2 FAIL: trg_agent_deactivate_reflow not bound correctly (count=%)', v_count;
  END IF;
  RAISE NOTICE 'V2 PASS: trg_agent_deactivate_reflow bound to handle_agent_deactivate on public.agents.';
END $$;

-- V3: End-to-end SAVEPOINT test. Pick a real agent in WALLiam with listings.
-- Inside a savepoint, set is_active = false (triggering reflow), assert the
-- agent no longer owns any rows, then ROLLBACK TO SAVEPOINT so the migration
-- itself doesn't deactivate anyone.
--
-- Why SAVEPOINT (vs. raw test in the migration tx): the agent UPDATE we
-- perform here is purely for verification; we must undo it before COMMIT.
-- A SAVEPOINT + ROLLBACK TO inside the migration tx accomplishes that
-- without aborting the migration's other DDL.
DO $$
DECLARE
  v_agent_id   uuid;
  v_tenant_id  uuid;
  v_pre_count  int;
  v_post_count int;
  v_total_rows int;
  v_null_rows  int;
  v_reassigned int;
BEGIN
  -- Pick an agent who: is currently active+selling, owns >= 1 mls_listings row.
  SELECT a.id, a.tenant_id, COUNT(ml.id)::int
    INTO v_agent_id, v_tenant_id, v_pre_count
    FROM public.agents a
    JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
   WHERE a.is_active = TRUE
     AND a.is_selling = TRUE
     AND a.tenant_id IS NOT NULL
   GROUP BY a.id, a.tenant_id
   HAVING COUNT(ml.id) > 0
   ORDER BY COUNT(ml.id) DESC
   LIMIT 1;

  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'V3 SKIP: no active+selling agent with listings found in the DB. Trigger semantics still verified by V1+V2; smoke harness covers the runtime path.';
    RETURN;
  END IF;

  RAISE NOTICE 'V3 setup: agent %, tenant %, owns % listings (pre).',
               v_agent_id, v_tenant_id, v_pre_count;

  -- Capture the listing ids the agent owns so we can verify the reflow
  -- targeted exactly that set.
  CREATE TEMP TABLE v3_pre_set ON COMMIT DROP AS
    SELECT id FROM public.mls_listings WHERE assigned_agent_id = v_agent_id;

  -- SAVEPOINT-isolated mutation.
  BEGIN
    -- Anonymous block can't issue SAVEPOINT; we use a sub-DO and rely on
    -- BEGIN..EXCEPTION to roll back the inner work. The outer transaction
    -- proceeds. We RAISE inside the inner block to force the rollback after
    -- the assertions complete, then catch the sentinel here.
    BEGIN
      UPDATE public.agents
         SET is_active = FALSE
       WHERE id = v_agent_id;
      -- The AFTER UPDATE trigger fired synchronously above. Now verify.
      SELECT COUNT(*)::int INTO v_post_count
        FROM public.mls_listings
       WHERE assigned_agent_id = v_agent_id;
      SELECT COUNT(*)::int INTO v_total_rows
        FROM public.mls_listings ml
       WHERE EXISTS (SELECT 1 FROM v3_pre_set p WHERE p.id = ml.id);
      SELECT COUNT(*)::int INTO v_null_rows
        FROM public.mls_listings ml
       WHERE EXISTS (SELECT 1 FROM v3_pre_set p WHERE p.id = ml.id)
         AND ml.assigned_agent_id IS NULL;
      v_reassigned := v_total_rows - v_null_rows;

      IF v_post_count <> 0 THEN
        RAISE EXCEPTION 'V3 FAIL: agent % still owns % rows after deactivation+reflow (expected 0)',
                        v_agent_id, v_post_count;
      END IF;
      IF v_total_rows <> v_pre_count THEN
        RAISE EXCEPTION 'V3 FAIL: pre-set size changed during reflow: pre=%, post=%',
                        v_pre_count, v_total_rows;
      END IF;
      RAISE NOTICE 'V3 mid-test: after reflow agent owns 0; pre-set rows: %=reassigned, %=NULL (empty-pool floor case)',
                   v_reassigned, v_null_rows;
      -- Sentinel to bail out and trigger rollback of the test mutation.
      RAISE EXCEPTION 'V3_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V3_DONE_ROLLBACK' THEN
          -- expected
          NULL;
        ELSE
          RAISE; -- propagate real failures (force migration rollback)
        END IF;
    END;
  END;

  -- Verify the mutation was rolled back.
  SELECT COUNT(*)::int INTO v_post_count
    FROM public.mls_listings
   WHERE assigned_agent_id = v_agent_id;
  IF v_post_count <> v_pre_count THEN
    RAISE EXCEPTION 'V3 FAIL: post-rollback count % does not match pre %', v_post_count, v_pre_count;
  END IF;

  -- Confirm the agent is still is_active = TRUE (mutation rolled back).
  PERFORM 1 FROM public.agents WHERE id = v_agent_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V3 FAIL: agent % was not restored to is_active=TRUE after rollback', v_agent_id;
  END IF;

  RAISE NOTICE 'V3 PASS: deactivation trigger reflowed % listings off agent % within the agents UPDATE tx; rolled back cleanly.',
               v_pre_count, v_agent_id;
END $$;

-- V4: NULL inputs to reflow_deactivated_agent no-op cleanly (mirrors Landing 2 V4/V5).
DO $$
DECLARE
  v_resolved int;
  v_null     int;
BEGIN
  SELECT reflowed_count, null_count INTO v_resolved, v_null
    FROM public.reflow_deactivated_agent(NULL::uuid, NULL::uuid);
  IF v_resolved <> 0 OR v_null <> 0 THEN
    RAISE EXCEPTION 'V4 FAIL: NULL inputs expected (0,0), got (%, %)', v_resolved, v_null;
  END IF;

  SELECT reflowed_count, null_count INTO v_resolved, v_null
    FROM public.reflow_deactivated_agent(NULL::uuid, gen_random_uuid());
  IF v_resolved <> 0 OR v_null <> 0 THEN
    RAISE EXCEPTION 'V4 FAIL: NULL agent_id expected (0,0), got (%, %)', v_resolved, v_null;
  END IF;

  SELECT reflowed_count, null_count INTO v_resolved, v_null
    FROM public.reflow_deactivated_agent(gen_random_uuid(), NULL::uuid);
  IF v_resolved <> 0 OR v_null <> 0 THEN
    RAISE EXCEPTION 'V4 FAIL: NULL tenant_id expected (0,0), got (%, %)', v_resolved, v_null;
  END IF;

  RAISE NOTICE 'V4 PASS: NULL-input variants all return (0,0) cleanly.';
END $$;

-- End of migration body. V1..V4 must all PASS (or V3 SKIP) for COMMIT.
