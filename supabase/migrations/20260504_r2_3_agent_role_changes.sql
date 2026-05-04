-- supabase/migrations/20260504_r2_3_agent_role_changes.sql
-- W-ROLES-DELEGATION R2.3 — append-only audit table for role + parent_id changes.
--
-- Per locked spec: every promote/demote/lateral/parent-reassign writes a row here.
-- Append-only enforced via trigger (UPDATE/DELETE blocked except by service role).

BEGIN;

-- 1. Table
CREATE TABLE IF NOT EXISTS agent_role_changes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                 uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  from_role                text,
  to_role                  text,
  from_parent_id           uuid,
  to_parent_id             uuid,
  from_can_create_children boolean,
  to_can_create_children   boolean,
  changed_by               uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  changed_at               timestamptz NOT NULL DEFAULT now(),
  reason                   text,
  tenant_id                uuid NOT NULL,
  
  -- Sanity: at least one of role/parent/can_create_children must have changed
  CONSTRAINT agent_role_changes_at_least_one_change
    CHECK (
      from_role IS DISTINCT FROM to_role
      OR from_parent_id IS DISTINCT FROM to_parent_id
      OR from_can_create_children IS DISTINCT FROM to_can_create_children
    )
);

-- 2. Indexes for the dashboard "history tab" query and for tenant-wide audit views
CREATE INDEX IF NOT EXISTS idx_agent_role_changes_agent_changed
  ON agent_role_changes (agent_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_role_changes_tenant_changed
  ON agent_role_changes (tenant_id, changed_at DESC);

-- 3. Append-only trigger: block UPDATE and DELETE except by service role
CREATE OR REPLACE FUNCTION enforce_append_only_role_changes() RETURNS trigger AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'agent_role_changes is append-only; UPDATE/DELETE blocked';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_update_role_changes ON agent_role_changes;
CREATE TRIGGER trigger_block_update_role_changes
  BEFORE UPDATE ON agent_role_changes
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only_role_changes();

DROP TRIGGER IF EXISTS trigger_block_delete_role_changes ON agent_role_changes;
CREATE TRIGGER trigger_block_delete_role_changes
  BEFORE DELETE ON agent_role_changes
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only_role_changes();

-- 4. RLS: service-role only. Same rationale as agent_delegations.
ALTER TABLE agent_role_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_role_changes_service_role ON agent_role_changes;
CREATE POLICY agent_role_changes_service_role ON agent_role_changes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;

-- Verification (run manually after):
--   1. Append-only smoke:
--      INSERT INTO agent_role_changes (agent_id, from_role, to_role, changed_by, tenant_id)
--        VALUES (X, 'agent', 'manager', X, T);  -- ok
--      UPDATE agent_role_changes SET reason = 'test' WHERE id = ...;  -- should FAIL
--      DELETE FROM agent_role_changes WHERE id = ...;  -- should FAIL
