-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 - ASYNC HANDOFF down.
--
-- Date:        2026-05-30
-- Pairs with:  20260530_phase_lifecycle_landing_3_event_4_async_handoff.sql
-- Apply via:   node scripts/apply-phase-lifecycle-landing-3-event-4-async-handoff-down.js
--              (NOT psql -f directly: the down-RUNNER restores
--              handle_agent_deactivate body from the snapshot captured
--              pre-BEGIN by the up-runner; the body is NEVER hardcoded in
--              this .sql.)
--
-- WHAT THIS .sql DOES:
--   1. ALTER scope CHECK to drop 'agent' (back to area/muni/community/tenant_default).
--   2. DROP handle_agent_deactivate (the async-enqueue body).
--      Cannot DROP unless we remove the trigger first; the trigger has a
--      hard dependency on the function. The runner re-creates the function
--      from the snapshot AFTER this DDL runs.
--
-- WHAT THIS .sql DOES NOT DO:
--   Does NOT restore the pre-async handle_agent_deactivate body. That is
--   performed by scripts/apply-phase-lifecycle-landing-3-event-4-async-
--   handoff-down.js which reads the snapshot file
--   supabase/migrations/rollback-snapshots/_phase-lifecycle-landing-3-event-4-async-handoff_handle_agent_deactivate_<ts>.sql
--   captured pre-BEGIN by the up-runner, BOM-strips it, and executes it.
--   The snapshot is the SINGLE source of truth for the restored body.
--   No body is hardcoded anywhere in the down path -- same pattern as
--   Landing 2's down-migration.
--
-- WHY NOT INLINE THE BODY:
--   If between the up-migration and the down, someone hotfixes the synchronous
--   handle_agent_deactivate body (unlikely but possible), an inline restore
--   here would silently revert their fix. Reading from the snapshot freezes
--   the exact pre-migration body. Drift impossible.
--
-- WHEN TO RUN THIS:
--   If async handoff turns out to be incorrect and the operator wants to
--   revert to synchronous reflow. NOT recommended without first solving the
--   production-path timeout problem (per the recon, sync is unworkable for
--   high-footprint agents). The down exists for completeness; the up is the
--   forward path.
--
-- WHAT YOU LOSE ON REVERT:
--   - Async drain stops; new deactivations again attempt synchronous reflow.
--   - Any pending scope='agent' queue rows can no longer be inserted (the
--     CHECK rejects). EXISTING pending scope='agent' rows survive (the
--     CHECK is not validated against existing rows by default) but the
--     worker no longer recognizes them as drainable since the route's
--     scope='agent' branch is a separate TS edit that you'd also revert.
--     Best to drain (or DELETE) pending scope='agent' rows BEFORE running
--     this down.
-- ============================================================================

-- ============================================================================
-- 1. Revert scope CHECK (drop 'agent')
-- ============================================================================
-- Pre-check: warn if any non-pending rows with scope='agent' would now violate
-- the constraint. Pending rows would also violate, but ON CONFLICT semantics
-- mean they would simply prevent new enqueues -- they'd stay in place.
DO $$
DECLARE
  v_agent_rows int;
BEGIN
  SELECT COUNT(*)::int INTO v_agent_rows
    FROM public.territory_reroll_queue WHERE scope = 'agent';
  IF v_agent_rows > 0 THEN
    RAISE WARNING 'DOWN: % existing territory_reroll_queue rows with scope=''agent'' will violate the reverted CHECK. Consider draining or DELETING before running this down. Proceeding will FAIL constraint validation.', v_agent_rows;
  END IF;
END $$;

ALTER TABLE public.territory_reroll_queue
  DROP CONSTRAINT territory_reroll_queue_scope_check;

ALTER TABLE public.territory_reroll_queue
  ADD CONSTRAINT territory_reroll_queue_scope_check
  CHECK (scope = ANY (ARRAY[
    'area'::text,
    'municipality'::text,
    'community'::text,
    'tenant_default'::text
  ]));

-- ============================================================================
-- 2. DROP handle_agent_deactivate (will be re-created from snapshot by runner)
-- ============================================================================
-- The trigger holds a dependency on this function; DROP FUNCTION cascades to
-- the trigger only if CASCADE is specified, OR the function must be replaced
-- (CREATE OR REPLACE) which preserves the trigger binding. The down-runner
-- uses CREATE OR REPLACE from snapshot bytes, so no DROP is needed here --
-- the runner will overwrite the body directly.
--
-- This block is a no-op assertion that the function still exists prior to
-- the runner's restore step.

DO $$
BEGIN
  PERFORM 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'handle_agent_deactivate';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOWN PRE-RUNNER FAIL: handle_agent_deactivate does not exist; cannot restore body via runner';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION (post-CHECK-revert, pre-runner-restore)
-- ============================================================================

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'territory_reroll_queue'
     AND c.conname = 'territory_reroll_queue_scope_check';
  IF v_def LIKE '%''agent''%' THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: scope CHECK still includes ''agent''';
  END IF;
  RAISE NOTICE 'DOWN V1 PASS: scope CHECK reverted (no ''agent'').';
  RAISE NOTICE 'DOWN: now run the runner restore step to replace handle_agent_deactivate body from snapshot.';
END $$;
