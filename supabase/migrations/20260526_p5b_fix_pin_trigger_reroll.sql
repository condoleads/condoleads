-- supabase/migrations/20260526_p5b_fix_pin_trigger_reroll.sql
-- W-TERRITORY-MASTER P5b: fix handle_listing_pin_change trigger.
--
-- BUG: P5 migration called reresolve_listing(uuid) with 1 arg, but the real
--      function signature is reresolve_listing(uuid, uuid) — listing_id + tenant_id.
--      As shipped, the trigger raises "function reresolve_listing(uuid) does not exist"
--      on every pin lifecycle event. Pins cannot be created/modified.
--
-- FIX: CREATE OR REPLACE the trigger function with the correct call signature,
--      plus alignment with the canonical handle_apa_insert pattern:
--        - pg_trigger_depth() > 1 recursion guard
--        - same audit-then-reroll order
--
-- This migration touches only the trigger FUNCTION. Schema columns, indexes,
-- the audit-CHECK extension, and the resolver patch from P5 all stay.

CREATE OR REPLACE FUNCTION handle_listing_pin_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_change_type text;
  v_before jsonb;
  v_after jsonb;
  v_affected_listing_id uuid;
  v_acting_user uuid;
BEGIN
  -- Recursion guard — match the apa-trigger pattern.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve tenant from agent (multi-tenant safety). Agent.tenant_id is the
  -- canonical owner; pins inherit tenant from the agent they pin to.
  SELECT tenant_id INTO v_tenant_id
  FROM agents
  WHERE id = COALESCE(NEW.agent_id, OLD.agent_id);

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'handle_listing_pin_change: cannot resolve tenant_id for agent %',
      COALESCE(NEW.agent_id, OLD.agent_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_change_type := 'pin_added';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_affected_listing_id := NEW.listing_id;
    v_acting_user := NEW.assigned_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_affected_listing_id := NEW.listing_id;
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_change_type := 'pin_removed';
      v_acting_user := NEW.deactivated_by;
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      v_change_type := 'pin_reactivated';
      v_acting_user := NEW.assigned_by;
    ELSE
      v_change_type := NULL;
      v_acting_user := NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'pin_removed';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_affected_listing_id := OLD.listing_id;
    v_acting_user := OLD.assigned_by;
  END IF;

  -- Audit row (synchronous, tiny insert).
  IF v_change_type IS NOT NULL THEN
    INSERT INTO territory_assignment_changes(
      tenant_id, agent_id, scope, scope_id,
      change_type, before_state, after_state,
      changed_by, notes
    ) VALUES (
      v_tenant_id,
      COALESCE(NEW.agent_id, OLD.agent_id),
      'listing',
      v_affected_listing_id,
      v_change_type,
      v_before,
      v_after,
      v_acting_user,
      COALESCE(NEW.pin_reason, OLD.pin_reason)
    );
  END IF;

  -- Per-listing reroll. Single-row UPDATE on mls_listings.assigned_agent_id —
  -- cheap, no need for the async territory_reroll_queue path used at geo scope.
  -- Correct signature: reresolve_listing(listing_id, tenant_id).
  PERFORM reresolve_listing(v_affected_listing_id, v_tenant_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;