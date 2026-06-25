-- ============================================================================
-- W-TENANT-ASSISTANT UNIT 11 — add 'assistant' to agents.role CHECK constraint.
-- 2026-06-25.
--
-- COMPANION TO: UNIT 9 (lead-email-recipients.ts) which ALREADY queries
--   .in('role', ['tenant_admin', 'assistant'])
-- as the top-layer copy recipient. That query returns 0 rows today because
-- agents.role CHECK rejects any attempt to insert role='assistant'. This
-- migration extends the CHECK so role='assistant' is allowed; the UNIT 9
-- leg activates automatically as soon as any agent is created/updated with
-- that role.
--
-- DESIGN (operator-locked W-TENANT-ASSISTANT UNIT 11):
--   - Multiple assistants per tenant supported (no uniqueness constraint).
--   - Assistant role MAY or MAY NOT be licensed (per-agent decision).
--   - Licensed-ness derived from agents.license_number (existing column):
--     populated string = licensed; null/empty = not licensed.
--   - Lead/email copy: assistant copied REGARDLESS of license (UNIT 9 leg).
--   - Card eligibility: assistant is card-eligible ONLY when licensed.
--     Enforced app-side in agents-summary filter (UNIT 11 build).
--
-- validate_house_account trigger (Phase 1, d39941f) intentionally EXCLUDES
-- 'assistant' from the eligible-for-house-account set. Assistants are NOT
-- the catch-all role — the house account must be a "real" licensed agent
-- (agent/manager/area_manager/tenant_admin/admin). This is the correct
-- design: assistants support the tenant but don't carry the legal floor.
-- The CHECK extension here does NOT change the trigger's contract.
--
-- DATA SAFETY: zero existing agents have role='assistant' (the CHECK rejects
-- it). The new CHECK is a superset of the old (adds one allowed value);
-- every existing row remains valid.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Safe to re-apply.
--
-- ROLLBACK (manual via apply-runner snapshot, or in Studio if needed):
--   ALTER TABLE public.agents DROP CONSTRAINT agents_role_check;
--   ALTER TABLE public.agents ADD CONSTRAINT agents_role_check
--     CHECK (role = ANY (ARRAY['agent'::text, 'manager'::text,
--       'area_manager'::text, 'tenant_admin'::text, 'admin'::text]));
-- (apply-runner captures the prior constraint definition verbatim as the
--  rollback snapshot before applying.)
-- ============================================================================

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
      'assistant'::text
    ])
  );
