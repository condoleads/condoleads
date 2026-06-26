-- Snapshot BEFORE UNIT 16b GATE 1 (FK-only).
-- Restore via: psql -f <this file>

-- Restore FK deferrability:
ALTER TABLE public.agents ALTER CONSTRAINT agents_tenant_id_fkey NOT DEFERRABLE;
ALTER TABLE public.tenants ALTER CONSTRAINT tenants_default_agent_id_fkey NOT DEFERRABLE;

-- validate_house_account function body (for reference; not modified by Gate 1):
CREATE OR REPLACE FUNCTION public.validate_house_account()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;
