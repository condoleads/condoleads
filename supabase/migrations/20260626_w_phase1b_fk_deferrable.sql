-- ============================================================================
-- W-TENANT-GOV PHASE 1b / UNIT 16b — GATE 1: deferrable FKs (FK ONLY).
-- 2026-06-26.
--
-- Resolves the cycle between tenants.default_agent_id and agents.tenant_id
-- by making BOTH FKs DEFERRABLE INITIALLY IMMEDIATE. Behavior for existing
-- queries is UNCHANGED (INITIALLY IMMEDIATE = validate at statement end,
-- same as before). Transactions can opt into SET CONSTRAINTS ALL DEFERRED
-- to defer validation to COMMIT, enabling the agent-first-with-correct-
-- tenant-id ordering used by the refactored UNIT 15 create flow.
--
-- WHY BOTH FKS NEED TO BE DEFERRABLE
--   Agent-first-with-correct-tenant-id order:
--     1. INSERT agent (tenant_id=Y, ...)  — references tenant Y that
--        doesn't exist yet -> agents.tenant_id FK must be deferred.
--     2. INSERT tenant (id=Y, default_agent_id=X, ...) — references agent X
--        that DOES exist (step 1) -> tenants.default_agent_id FK validates
--        immediately and passes. Trigger fires: looks up agent.tenant_id ==
--        Y (we set it correctly in step 1), matches NEW.id==Y, passes.
--     3. COMMIT — agents.tenant_id FK (deferred) validates: tenant Y exists,
--        passes. Cycle resolved with NO trigger modification.
--   If only tenants.default_agent_id were deferrable, step 1 would fail
--   the agents.tenant_id FK immediately. Both are required.
--
-- validate_house_account TRIGGER IS NOT MODIFIED
--   The trigger function shipped in d39941f remains exactly as-is. The
--   agent-first ordering above means the trigger always sees agent.tenant_id
--   already correctly set (== the new tenant's id) when the tenant insert
--   fires. All 4 reject conditions (a/b/c/d) keep their strict semantics:
--     (a) agent must exist -> agent inserted in step 1, exists at step 2.
--     (b) agent.tenant_id == tenant.id -> agent.tenant_id=Y matches NEW.id=Y.
--     (c) is_active -> we insert with is_active=true.
--     (d) role in eligible set -> we insert with role='tenant_admin'.
--   No NULL-tenant case is ever introduced; no semantic relaxation.
--
-- COMPANION (Gate 2, separate migration): NOT NULL on default_agent_id,
-- applied only after B1/B2 prove the refactored create flow GREEN under
-- the new deferrable FKs.
--
-- IDEMPOTENT: ALTER CONSTRAINT ... DEFERRABLE is idempotent — re-running
-- against an already-deferrable constraint is a no-op (PG silently accepts).
--
-- ROLLBACK (paired down, manual via apply-runner snapshot or this SQL):
--   ALTER TABLE public.tenants
--     ALTER CONSTRAINT tenants_default_agent_id_fkey NOT DEFERRABLE;
--   ALTER TABLE public.agents
--     ALTER CONSTRAINT agents_tenant_id_fkey NOT DEFERRABLE;
-- ============================================================================

ALTER TABLE public.tenants
  ALTER CONSTRAINT tenants_default_agent_id_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.agents
  ALTER CONSTRAINT agents_tenant_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
