-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 - DOWN migration (DROP-ONLY).
--
-- Date:        2026-05-30
-- Pairs with:  20260530_phase_lifecycle_landing_3_event_4_agent_reflow.sql
-- Apply via:   node scripts/apply-phase-lifecycle-landing-3-event-4-down.js
--              (or psql -f directly; this down is self-contained -- there is
--              no pre-existing body to restore, only DROPs.)
--
-- WHAT THIS DOES:
--   1. DROP TRIGGER trg_agent_deactivate_reflow on public.agents.
--   2. DROP FUNCTION handle_agent_deactivate().
--   3. DROP FUNCTION reflow_deactivated_agent(uuid, uuid).
--
-- WHAT YOU LOSE ON REVERT:
--   Event 4 reflow stops firing. Any agent deactivated after this point
--   will leave their mls_listings.assigned_agent_id pointing at them.
--   Until the cache-first hardening (Phase 2 TS edit) is also reverted,
--   the cache-first reader will still fall through to the RPC -- the
--   second half of the correctness fix still protects new leads.
--   If BOTH this and the cache-first hardening are reverted, new leads
--   on a dead agent's listings route to the dead agent. Restoration is
--   re-applying both halves.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_agent_deactivate_reflow ON public.agents;
DROP FUNCTION IF EXISTS public.handle_agent_deactivate();
DROP FUNCTION IF EXISTS public.reflow_deactivated_agent(uuid, uuid);

-- ============================================================================
-- VERIFICATION (post-DROPs)
-- ============================================================================

DO $$
DECLARE
  v_trigger_exists boolean;
  v_handler_exists boolean;
  v_reflow_exists  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'agents' AND t.tgname = 'trg_agent_deactivate_reflow'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_agent_deactivate'
  ) INTO v_handler_exists;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reflow_deactivated_agent'
  ) INTO v_reflow_exists;

  IF v_trigger_exists THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: trg_agent_deactivate_reflow still exists after DROP';
  END IF;
  IF v_handler_exists THEN
    RAISE EXCEPTION 'DOWN V2 FAIL: handle_agent_deactivate still exists after DROP';
  END IF;
  IF v_reflow_exists THEN
    RAISE EXCEPTION 'DOWN V3 FAIL: reflow_deactivated_agent still exists after DROP';
  END IF;

  RAISE NOTICE 'DOWN V1+V2+V3 PASS: trigger + both functions dropped.';
END $$;
