-- ============================================================================
-- W-TENANT-GOV-PHASE1 (Path C) — house-account invariant via BEFORE trigger.
-- 2026-06-25.
--
-- PURPOSE
--   When tenants.default_agent_id is set to a non-null value, validate that
--   the referenced agent is a valid house-account candidate:
--     (a) exists
--     (b) belongs to the SAME tenant (tenant_id match)
--     (c) is is_active = true
--     (d) has a role in the eligible set
--   On any failure: RAISE check_violation (23514) with a named error so app
--   callers can branch on the exact condition.
--
-- PATH C (this migration): default_agent_id stays NULLABLE. NOT NULL is
-- deferred to Phase 1b after create-tenant POST is reworked to auto-seed a
-- default agent in-flow. Today, tenants can be created with default_agent_id
-- = NULL; the trigger DOES NOT block that. The trigger ONLY fires when the
-- column is being set/changed to a non-null value.
--
-- PHASE 2 EXTENSION
--   When agents.cards_opt_out lands (Phase 2), this function gets a 5th
--   condition (NOT cards_opt_out) via CREATE OR REPLACE FUNCTION in that
--   migration. Function signature is unchanged so the replacement is
--   safe.
--
-- PHASE 3 EXTENSION
--   When agents.role gains 'admin_assistant' (Phase 3), the eligible role
--   list intentionally stays the same — admin_assistant is non-routing and
--   non-house-account-eligible, so it falls out by being absent from the
--   list. No trigger change required.
--
-- TRIGGER PATTERN
--   Mirrored from handle_listing_pin_change
--   (20260526_p5_listing_pin_lifecycle.sql:65-141): SELECT ... INTO +
--   RAISE EXCEPTION + BEFORE INSERT/UPDATE ON ... FOR EACH ROW EXECUTE
--   FUNCTION. Idempotent: DROP TRIGGER IF EXISTS + CREATE OR REPLACE
--   FUNCTION.
--
-- PASS-THROUGH GUARANTEE
--   Tenants writes that do NOT change default_agent_id (cyan
--   primary_color, all 40+ Settings PATCH fields, lifecycle status
--   transitions) flow through untouched: the first guard short-circuits
--   when NEW.default_agent_id IS NULL (Path C allows null); the second
--   short-circuits when the column value isn't changing
--   (IS NOT DISTINCT FROM handles NULL-on-either-side correctly).
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_house_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_agent_tenant_id uuid;
  v_agent_active    boolean;
  v_agent_role      text;
BEGIN
  -- Guard 1: Path C allows NULL default_agent_id. No validation needed.
  IF NEW.default_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: on UPDATE, skip when the column isn't changing (e.g., cyan
  -- primary_color write, lifecycle status change, any other Settings save).
  -- IS NOT DISTINCT FROM is the null-safe equality operator.
  IF TG_OP = 'UPDATE' AND NEW.default_agent_id IS NOT DISTINCT FROM OLD.default_agent_id THEN
    RETURN NEW;
  END IF;

  -- Validate the agent being assigned as the house account.
  SELECT tenant_id, is_active, role
    INTO v_agent_tenant_id, v_agent_active, v_agent_role
  FROM agents
  WHERE id = NEW.default_agent_id;

  -- (a) agent must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'house_account_invalid: agent % does not exist', NEW.default_agent_id
      USING ERRCODE = '23514';
  END IF;

  -- (b) agent's tenant must match the tenant being updated
  IF v_agent_tenant_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'house_account_tenant_mismatch: agent % is in tenant %, not %',
      NEW.default_agent_id, v_agent_tenant_id, NEW.id
      USING ERRCODE = '23514';
  END IF;

  -- (c) agent must be active
  IF NOT v_agent_active THEN
    RAISE EXCEPTION 'house_account_inactive: agent % is not is_active=true',
      NEW.default_agent_id
      USING ERRCODE = '23514';
  END IF;

  -- (d) agent's role must be eligible. Phase 3 will add 'admin_assistant'
  -- as a NEW role value, deliberately NOT included here (admin_assistant is
  -- non-licensed, never carded, never house-account-eligible).
  IF v_agent_role NOT IN ('agent', 'manager', 'area_manager', 'tenant_admin', 'admin') THEN
    RAISE EXCEPTION 'house_account_role_ineligible: agent % has role %, not eligible for house account',
      NEW.default_agent_id, v_agent_role
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_house_account ON tenants;
CREATE TRIGGER trg_validate_house_account
  BEFORE INSERT OR UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION validate_house_account();

-- ============================================================================
-- ROLLBACK (manual via Studio if needed):
--   DROP TRIGGER IF EXISTS trg_validate_house_account ON tenants;
--   DROP FUNCTION IF EXISTS validate_house_account();
-- ============================================================================
