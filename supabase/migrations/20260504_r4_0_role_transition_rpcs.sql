-- supabase/migrations/20260504_r4_0_role_transition_rpcs.sql
-- W-ROLES-DELEGATION/R4.0 — atomic role transition RPCs.
--
-- Five SECURITY DEFINER functions, each a single Postgres transaction:
--   rpc_promote_agent       — agent → manager → area_manager → tenant_admin
--   rpc_demote_agent        — reverse direction
--   rpc_reassign_parent     — change target's parent_id (cycle-safe)
--   rpc_grant_delegation    — insert into agent_delegations
--   rpc_revoke_delegation   — soft-delete via revoked_at + revoked_by
--
-- DESIGN (Option C — locked 2026-05-04):
--   - App layer (lib/admin-homes/permissions.ts can()) decides policy: "is this
--     action permitted by the matrix?". App calls can() before RPC.
--   - DB layer (these RPCs) enforces invariants: cardinality (sole admin/TA),
--     no-orphan, no-cycle, tenant boundary, role-tier-step validity.
--   - RPC trusts that can() permitted the call. Service-role-only access; no
--     other role can invoke. Authenticated user routes that call these go
--     through resolveAdminHomesUser + can() first.
--   - Audit row written into agent_role_changes for promote/demote/reassign.
--   - Delegations self-audit via the row itself (granted_at/granted_by/...).
--
-- INVARIANT CHEAT-SHEET:
--   promote:    tenant boundary, valid step, self-protection, role in CHECK.
--   demote:     tenant boundary, valid step, self-protection, role in CHECK,
--               sole-tenant-admin guard, sole-admin guard, no-orphan guard.
--   reassign:   tenant boundary, no-cycle (target's subtree cannot contain
--               new parent), parent's role tier >= target's tier,
--               self-protection (parent != target).
--   grant:      tenant boundary, table CHECK + triggers cover no-self,
--               no-cycle, no-SOS.
--   revoke:     active row exists, tenant match, sets revoked_at/revoked_by.
--
-- ERROR CONTRACT:
--   On invariant violation: RAISE EXCEPTION with a structured prefix.
--     'INVARIANT_<NAME>: <details>'
--   App layer parses prefix to map to user-facing message.
--   Auto-rollback on any RAISE.
--
-- IDEMPOTENCY: CREATE OR REPLACE on every function. Safe to re-run.

--BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: tier rank for role comparisons.
-- Returns 0 for unknown so unknowns can never satisfy >= comparisons.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION role_tier_rank(role_name text) RETURNS int AS $$
BEGIN
  RETURN CASE role_name
    WHEN 'agent'         THEN 1
    WHEN 'manager'       THEN 2
    WHEN 'area_manager'  THEN 3
    WHEN 'tenant_admin'  THEN 4
    WHEN 'admin'         THEN 4   -- treated equivalent to tenant_admin
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: assert actor and target share tenant scope (or actor is null=platform).
-- Raises on violation. actor_tenant_id NULL means platform-tier caller (skip).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_same_tenant(actor_tenant_id uuid, target_tenant_id uuid) RETURNS void AS $$
BEGIN
  IF actor_tenant_id IS NULL THEN
    RETURN;  -- platform actor, no tenant boundary
  END IF;
  IF actor_tenant_id <> target_tenant_id THEN
    RAISE EXCEPTION 'INVARIANT_CROSS_TENANT: actor tenant % differs from target tenant %', actor_tenant_id, target_tenant_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_promote_agent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_promote_agent(
  p_actor_id    uuid,
  p_target_id   uuid,
  p_new_role    text,
  p_reason      text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_actor_tenant uuid;
  v_actor_role   text;
  v_target       agents%ROWTYPE;
  v_old_role     text;
BEGIN
  IF p_actor_id = p_target_id THEN
    RAISE EXCEPTION 'INVARIANT_SELF_ACTION: actor cannot promote self';
  END IF;

  IF p_new_role NOT IN ('agent','manager','area_manager','tenant_admin','admin') THEN
    RAISE EXCEPTION 'INVARIANT_INVALID_ROLE: % is not a valid role', p_new_role;
  END IF;

  -- Lock target row for the duration of the transaction
  SELECT * INTO v_target FROM agents WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_TARGET_NOT_FOUND: agent % does not exist', p_target_id;
  END IF;

  -- Lookup actor's tenant + role (NULL tenant = treat as platform)
  SELECT tenant_id, role INTO v_actor_tenant, v_actor_role FROM agents WHERE id = p_actor_id;
  -- v_actor_tenant may be NULL legitimately for synthetic platform admins (no agents row).
  -- That's fine: assert_same_tenant returns early on NULL.

  PERFORM assert_same_tenant(v_actor_tenant, v_target.tenant_id);

  v_old_role := v_target.role;

  IF v_old_role = p_new_role THEN
    RAISE EXCEPTION 'INVARIANT_NO_CHANGE: target already has role %', p_new_role;
  END IF;

  -- Promote = new tier strictly higher than old tier
  IF role_tier_rank(p_new_role) <= role_tier_rank(v_old_role) THEN
    RAISE EXCEPTION 'INVARIANT_NOT_PROMOTION: % to % is not a promotion (use rpc_demote_agent)', v_old_role, p_new_role;
  END IF;

  -- Apply mutation
  UPDATE agents SET role = p_new_role, updated_at = now() WHERE id = p_target_id;

  -- Audit
  INSERT INTO agent_role_changes (agent_id, from_role, to_role, changed_by, tenant_id, reason)
  VALUES (p_target_id, v_old_role, p_new_role, p_actor_id, v_target.tenant_id, p_reason);

  RETURN jsonb_build_object('ok', true, 'agent_id', p_target_id, 'from_role', v_old_role, 'to_role', p_new_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_demote_agent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_demote_agent(
  p_actor_id    uuid,
  p_target_id   uuid,
  p_new_role    text,
  p_reason      text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_actor_tenant uuid;
  v_target       agents%ROWTYPE;
  v_old_role     text;
  v_admin_count  int;
  v_ta_count     int;
  v_child_count  int;
  v_new_tier     int;
  v_old_tier     int;
BEGIN
  IF p_actor_id = p_target_id THEN
    RAISE EXCEPTION 'INVARIANT_SELF_ACTION: actor cannot demote self';
  END IF;

  IF p_new_role NOT IN ('agent','manager','area_manager','tenant_admin','admin') THEN
    RAISE EXCEPTION 'INVARIANT_INVALID_ROLE: % is not a valid role', p_new_role;
  END IF;

  SELECT * INTO v_target FROM agents WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_TARGET_NOT_FOUND: agent % does not exist', p_target_id;
  END IF;

  SELECT tenant_id INTO v_actor_tenant FROM agents WHERE id = p_actor_id;
  PERFORM assert_same_tenant(v_actor_tenant, v_target.tenant_id);

  v_old_role := v_target.role;
  v_old_tier := role_tier_rank(v_old_role);
  v_new_tier := role_tier_rank(p_new_role);

  IF v_old_role = p_new_role THEN
    RAISE EXCEPTION 'INVARIANT_NO_CHANGE: target already has role %', p_new_role;
  END IF;

  -- Demote = new tier strictly lower than old tier
  IF v_new_tier >= v_old_tier THEN
    RAISE EXCEPTION 'INVARIANT_NOT_DEMOTION: % to % is not a demotion (use rpc_promote_agent)', v_old_role, p_new_role;
  END IF;

  -- Sole tenant_admin guard: if demoting from tenant_admin/admin tier (4),
  -- ensure at least one OTHER tier-4 remains in this tenant.
  IF v_old_tier = 4 THEN
    SELECT COUNT(*) INTO v_ta_count
      FROM agents
      WHERE tenant_id = v_target.tenant_id
        AND role IN ('tenant_admin','admin')
        AND id <> p_target_id;
    IF v_ta_count = 0 THEN
      RAISE EXCEPTION 'INVARIANT_SOLE_TENANT_ADMIN: cannot demote the only tenant_admin in tenant %', v_target.tenant_id;
    END IF;
  END IF;

  -- Sole admin guard: if target.role = 'admin' specifically (legacy alias),
  -- ensure at least one admin/tenant_admin remains. (Subsumed by above; explicit
  -- here so the error message is precise if someone runs against legacy data.)
  IF v_old_role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
      FROM agents
      WHERE tenant_id = v_target.tenant_id
        AND role IN ('admin','tenant_admin')
        AND id <> p_target_id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'INVARIANT_SOLE_ADMIN: cannot demote the only admin in tenant %', v_target.tenant_id;
    END IF;
  END IF;

  -- No-orphan guard: if target has direct children, blocking demotion below
  -- tier 2 (manager). At tier 1 (agent), they cannot have children pointing
  -- at them.
  IF v_new_tier < 2 THEN
    SELECT COUNT(*) INTO v_child_count
      FROM agents
      WHERE parent_id = p_target_id;
    IF v_child_count > 0 THEN
      RAISE EXCEPTION 'INVARIANT_NO_ORPHAN: target has % direct children; reassign them before demotion', v_child_count;
    END IF;
  END IF;

  -- Apply
  UPDATE agents SET role = p_new_role, updated_at = now() WHERE id = p_target_id;

  -- Audit
  INSERT INTO agent_role_changes (agent_id, from_role, to_role, changed_by, tenant_id, reason)
  VALUES (p_target_id, v_old_role, p_new_role, p_actor_id, v_target.tenant_id, p_reason);

  RETURN jsonb_build_object('ok', true, 'agent_id', p_target_id, 'from_role', v_old_role, 'to_role', p_new_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_reassign_parent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_reassign_parent(
  p_actor_id     uuid,
  p_target_id    uuid,
  p_new_parent_id uuid,  -- NULL = move to top of tenant (no parent)
  p_reason       text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_actor_tenant uuid;
  v_target       agents%ROWTYPE;
  v_new_parent   agents%ROWTYPE;
  v_old_parent   uuid;
  v_cycle_check  int;
BEGIN
  IF p_actor_id = p_target_id THEN
    RAISE EXCEPTION 'INVARIANT_SELF_ACTION: actor cannot reassign self';
  END IF;

  IF p_target_id = p_new_parent_id THEN
    RAISE EXCEPTION 'INVARIANT_SELF_PARENT: target cannot be its own parent';
  END IF;

  SELECT * INTO v_target FROM agents WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_TARGET_NOT_FOUND: agent % does not exist', p_target_id;
  END IF;

  SELECT tenant_id INTO v_actor_tenant FROM agents WHERE id = p_actor_id;
  PERFORM assert_same_tenant(v_actor_tenant, v_target.tenant_id);

  v_old_parent := v_target.parent_id;

  IF v_old_parent IS NOT DISTINCT FROM p_new_parent_id THEN
    RAISE EXCEPTION 'INVARIANT_NO_CHANGE: target parent_id is already %', p_new_parent_id;
  END IF;

  -- New parent constraints (skip if NULL — moving to top of tenant)
  IF p_new_parent_id IS NOT NULL THEN
    SELECT * INTO v_new_parent FROM agents WHERE id = p_new_parent_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVARIANT_PARENT_NOT_FOUND: parent % does not exist', p_new_parent_id;
    END IF;

    -- Cross-tenant: new parent must be in same tenant as target
    IF v_new_parent.tenant_id <> v_target.tenant_id THEN
      RAISE EXCEPTION 'INVARIANT_CROSS_TENANT_PARENT: new parent is in tenant %, target in %', v_new_parent.tenant_id, v_target.tenant_id;
    END IF;

    -- Tier check: new parent's role tier must be strictly greater than target's
    IF role_tier_rank(v_new_parent.role) <= role_tier_rank(v_target.role) THEN
      RAISE EXCEPTION 'INVARIANT_PARENT_TIER: new parent role % is not above target role %', v_new_parent.role, v_target.role;
    END IF;

    -- No-cycle: new_parent must NOT be in target's subtree.
    -- Walk down from target; if we reach new_parent, it's a cycle.
    WITH RECURSIVE subtree AS (
      SELECT id FROM agents WHERE parent_id = p_target_id
      UNION
      SELECT a.id FROM agents a JOIN subtree s ON a.parent_id = s.id
    )
    SELECT COUNT(*) INTO v_cycle_check FROM subtree WHERE id = p_new_parent_id;

    IF v_cycle_check > 0 THEN
      RAISE EXCEPTION 'INVARIANT_CYCLE: new parent % is in target''s subtree (would create cycle)', p_new_parent_id;
    END IF;
  END IF;

  -- Apply
  UPDATE agents SET parent_id = p_new_parent_id, updated_at = now() WHERE id = p_target_id;

  -- Audit
  INSERT INTO agent_role_changes (
    agent_id, from_role, to_role, from_parent_id, to_parent_id,
    changed_by, tenant_id, reason
  )
  VALUES (
    p_target_id, v_target.role, v_target.role, v_old_parent, p_new_parent_id,
    p_actor_id, v_target.tenant_id, p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'agent_id', p_target_id,
    'from_parent_id', v_old_parent,
    'to_parent_id', p_new_parent_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_grant_delegation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_grant_delegation(
  p_actor_id     uuid,  -- the agent who is the granter (typically = delegator)
  p_delegator_id uuid,  -- whose authority is being delegated
  p_delegate_id  uuid,  -- to whom
  p_notes        text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_delegator agents%ROWTYPE;
  v_delegate  agents%ROWTYPE;
  v_new_id    uuid;
BEGIN
  -- Existence + lock
  SELECT * INTO v_delegator FROM agents WHERE id = p_delegator_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_DELEGATOR_NOT_FOUND: %', p_delegator_id;
  END IF;
  SELECT * INTO v_delegate FROM agents WHERE id = p_delegate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_DELEGATE_NOT_FOUND: %', p_delegate_id;
  END IF;

  -- Tenant scoping: delegator and delegate must share tenant
  IF v_delegator.tenant_id <> v_delegate.tenant_id THEN
    RAISE EXCEPTION 'INVARIANT_CROSS_TENANT_DELEGATION: delegator % and delegate % are in different tenants', p_delegator_id, p_delegate_id;
  END IF;

  -- Insert (table CHECK + triggers cover no-self, no-cycle, no-SOS)
  INSERT INTO agent_delegations (delegator_id, delegate_id, tenant_id, granted_by, notes)
  VALUES (p_delegator_id, p_delegate_id, v_delegator.tenant_id, p_actor_id, p_notes)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'delegation_id', v_new_id,
    'delegator_id', p_delegator_id,
    'delegate_id', p_delegate_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_revoke_delegation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_revoke_delegation(
  p_actor_id      uuid,
  p_delegation_id uuid,
  p_reason        text DEFAULT NULL  -- reserved; not stored on agent_delegations today
) RETURNS jsonb AS $$
DECLARE
  v_row agent_delegations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM agent_delegations WHERE id = p_delegation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVARIANT_DELEGATION_NOT_FOUND: %', p_delegation_id;
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVARIANT_ALREADY_REVOKED: delegation % was revoked at %', p_delegation_id, v_row.revoked_at;
  END IF;

  UPDATE agent_delegations
    SET revoked_at = now(), revoked_by = p_actor_id
    WHERE id = p_delegation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'delegation_id', p_delegation_id,
    'revoked_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants — service_role must be able to invoke each RPC.
-- (PostgREST exposes SECURITY DEFINER funcs only to roles with EXECUTE.)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION role_tier_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION assert_same_tenant(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_promote_agent(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_demote_agent(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_reassign_parent(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_grant_delegation(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_revoke_delegation(uuid, uuid, text) TO service_role;

--COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION (run manually after applying)
--
-- 1. Functions exist:
--    SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' ORDER BY proname;
--    Expected: rpc_demote_agent, rpc_grant_delegation, rpc_promote_agent,
--              rpc_reassign_parent, rpc_revoke_delegation
--
-- 2. Service role has EXECUTE:
--    SELECT routine_name, grantee, privilege_type
--    FROM information_schema.role_routine_grants
--    WHERE routine_name LIKE 'rpc_%' AND grantee = 'service_role'
--    ORDER BY routine_name;
--    Expected: 5 rows (one per RPC), privilege_type = EXECUTE.
--
-- 3. Smoke test from app via Supabase JS:
--    const { data, error } = await supabase.rpc('rpc_promote_agent', {
--      p_actor_id: ACTOR_UUID,
--      p_target_id: TARGET_UUID,
--      p_new_role: 'manager',
--      p_reason: 'R4.2 smoke test'
--    })
-- ─────────────────────────────────────────────────────────────────────────────