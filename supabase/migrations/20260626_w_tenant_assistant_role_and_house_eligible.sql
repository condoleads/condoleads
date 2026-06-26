-- ============================================================================
-- W-TENANT-ASSISTANT UNIT 27 — split 'assistant' into two real roles.
-- 2026-06-26.
--
-- ADDS the 'tenant_assistant' value to BOTH the agents.role CHECK constraint
-- AND the validate_house_account eligible-role list.
--
-- OPERATOR-LOCKED MODEL (UNIT 27, supersedes the Unit 25 anchor-based admin
-- gating for assistants):
--
--   'tenant_assistant' — TOP TIER, equal-to-tenant role:
--     * Admin rights BY ROLE (no anchor check): set house account, opt-out
--       others, edit roles.
--     * Top-tier lead/email copy recipient (sees all tenant leads).
--     * IS house-account eligible (the catch-all, like tenant_admin owner).
--
--   'assistant' (unchanged from Unit 19) — BRANCH-SCOPED:
--     * Reports to manager/area_manager/agent/tenant_assistant.
--     * Inherits anchor's lead-flow (no tenant-wide reach unless anchor
--       resolves to top tier).
--     * NO tenant-wide admin rights (Unit 25's anchor-grant for plain
--       assistant is removed in the companion app-layer changes).
--     * NOT house-account eligible (preserved here in the trigger).
--
-- TWO ATOMIC DDLS:
--
--   (1) ALTER TABLE agents — extend role CHECK constraint to allow
--       'tenant_assistant'. Superset of the old list; every existing row
--       remains valid. No data migration needed.
--
--   (2) CREATE OR REPLACE FUNCTION validate_house_account — add
--       'tenant_assistant' to the eligible-role list. The other three
--       conditions (exists / tenant_id match / is_active) are byte-
--       identical to the d39941f original. Plain 'assistant' stays
--       EXCLUDED (the new condition adds tenant_assistant, doesn't
--       expand or weaken the others).
--
-- DATA SAFETY: zero existing agents have role='tenant_assistant' (the CHECK
-- rejects it pre-apply); the CHECK extension is a superset; existing
-- 'assistant' rows (e.g. Aily's Olga Condo) are NOT migrated — they stay
-- as plain branch-scoped assistants. The operator changes individual rows
-- to 'tenant_assistant' via Edit Agent post-deploy if they want top-tier
-- status.
--
-- IDEMPOTENT:
--   - The CHECK is dropped + re-added (always safe).
--   - The function is CREATE OR REPLACE (always safe).
--
-- ROLLBACK (paired down, in apply-runner snapshot):
--   ALTER TABLE public.agents DROP CONSTRAINT agents_role_check;
--   ALTER TABLE public.agents ADD CONSTRAINT agents_role_check CHECK (
--     role = ANY (ARRAY['agent','manager','area_manager','tenant_admin','admin','assistant']));
--   CREATE OR REPLACE FUNCTION validate_house_account() ...  -- prior body
-- ============================================================================

-- ─── (1) agents.role CHECK extension ──────────────────────────────────────
ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_role_check;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_role_check CHECK (
    role = ANY (ARRAY[
      'agent'::text,
      'manager'::text,
      'area_manager'::text,
      'tenant_admin'::text,
      'admin'::text,
      'assistant'::text,
      'tenant_assistant'::text
    ])
  );

-- ─── (2) validate_house_account: add tenant_assistant as eligible ─────────
CREATE OR REPLACE FUNCTION public.validate_house_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_agent_tenant_id uuid;
  v_agent_active    boolean;
  v_agent_role      text;
BEGIN
  -- Guard 1: Path C allows NULL default_agent_id.
  IF NEW.default_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: on UPDATE, skip when the column isn't changing.
  IF TG_OP = 'UPDATE' AND NEW.default_agent_id IS NOT DISTINCT FROM OLD.default_agent_id THEN
    RETURN NEW;
  END IF;

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

  -- (d) agent's role must be eligible.
  -- W-TENANT-ASSISTANT UNIT 27 (2026-06-26): 'tenant_assistant' ADDED to
  -- the eligible set — by operator-locked model, tenant_assistant is a
  -- top-tier role equal to tenant_admin owner and CAN be the catch-all.
  -- Plain 'assistant' stays excluded (branch-scoped role; cannot be house
  -- account by the trigger contract).
  IF v_agent_role NOT IN ('agent', 'manager', 'area_manager', 'tenant_admin', 'admin', 'tenant_assistant') THEN
    RAISE EXCEPTION 'house_account_role_ineligible: agent % has role %, not eligible for house account',
      NEW.default_agent_id, v_agent_role
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_house_account IS
  'W-TENANT-ASSISTANT UNIT 27 (2026-06-26): added tenant_assistant to eligible role list. Other 3 conditions (exists / tenant_id match / is_active) byte-identical to d39941f. Plain assistant stays excluded.';
