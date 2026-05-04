-- supabase/migrations/20260504_r2_2_agent_delegations.sql
-- W-ROLES-DELEGATION R2.2 — universal delegation join table.
--
-- Per locked spec: any role can grant; one delegate can serve many delegators;
-- soft-delete only; no self, no cycles, no support-of-support.

BEGIN;

-- 1. Table
CREATE TABLE IF NOT EXISTS agent_delegations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  delegate_id  uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  tenant_id    uuid NOT NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  granted_by   uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES agents(id) ON DELETE RESTRICT,
  notes        text,
  
  -- No-self: cannot delegate to oneself
  CONSTRAINT agent_delegations_no_self CHECK (delegator_id <> delegate_id),
  
  -- Revoke consistency: revoked_at and revoked_by must both be set or both null
  CONSTRAINT agent_delegations_revoke_consistency
    CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);

-- 2. Indexes for the two main query patterns
CREATE INDEX IF NOT EXISTS idx_agent_delegations_delegator_active
  ON agent_delegations (delegator_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_delegations_delegate_active
  ON agent_delegations (delegate_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_delegations_tenant
  ON agent_delegations (tenant_id);

-- 3. No-cycle trigger: delegate cannot delegate back to delegator (direct or transitive)
CREATE OR REPLACE FUNCTION check_no_delegation_cycle() RETURNS trigger AS $cycle$
DECLARE
  cycle_found INT;
BEGIN
  -- Direct cycle: does delegate already delegate (active) to delegator?
  SELECT COUNT(*) INTO cycle_found
  FROM agent_delegations
  WHERE delegator_id = NEW.delegate_id
    AND delegate_id = NEW.delegator_id
    AND revoked_at IS NULL;
  
  IF cycle_found > 0 THEN
    RAISE EXCEPTION 'Delegation cycle: % already actively delegates to %', NEW.delegate_id, NEW.delegator_id;
  END IF;
  
  -- Transitive cycle: walk delegate's active delegators upward; if delegator appears, cycle.
  WITH RECURSIVE chain AS (
    SELECT delegator_id, delegate_id
    FROM agent_delegations
    WHERE delegate_id = NEW.delegator_id AND revoked_at IS NULL
    UNION
    SELECT ad.delegator_id, ad.delegate_id
    FROM agent_delegations ad
    JOIN chain c ON ad.delegate_id = c.delegator_id
    WHERE ad.revoked_at IS NULL
  )
  SELECT COUNT(*) INTO cycle_found FROM chain WHERE delegator_id = NEW.delegate_id;
  
  IF cycle_found > 0 THEN
    RAISE EXCEPTION 'Transitive delegation cycle detected involving % and %', NEW.delegator_id, NEW.delegate_id;
  END IF;
  
  RETURN NEW;
END;
$cycle$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_no_delegation_cycle ON agent_delegations;
CREATE TRIGGER trigger_check_no_delegation_cycle
  BEFORE INSERT ON agent_delegations
  FOR EACH ROW EXECUTE FUNCTION check_no_delegation_cycle();

-- 4. No-support-of-support trigger: a delegate cannot themselves grant delegation
CREATE OR REPLACE FUNCTION check_no_support_of_support() RETURNS trigger AS $sos$
DECLARE
  delegator_is_already_delegate INT;
BEGIN
  SELECT COUNT(*) INTO delegator_is_already_delegate
  FROM agent_delegations
  WHERE delegate_id = NEW.delegator_id
    AND revoked_at IS NULL;
  
  IF delegator_is_already_delegate > 0 THEN
    RAISE EXCEPTION 'No support-of-support: % is already a delegate and cannot grant further delegations', NEW.delegator_id;
  END IF;
  
  RETURN NEW;
END;
$sos$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_no_support_of_support ON agent_delegations;
CREATE TRIGGER trigger_check_no_support_of_support
  BEFORE INSERT ON agent_delegations
  FOR EACH ROW EXECUTE FUNCTION check_no_support_of_support();

-- 5. RLS: service-role only. All reads/writes go through R5 API (service-role client).
-- Tenant-scoped client-direct reads can be added later if/when that surface exists.
ALTER TABLE agent_delegations ENABLE ROW LEVEL SECURITY;

-- Service-role can do anything. No policy = no access for other roles (deny-by-default).
DROP POLICY IF EXISTS agent_delegations_service_role ON agent_delegations;
CREATE POLICY agent_delegations_service_role ON agent_delegations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;

-- Verification (run manually after):
--   1. Table exists:
--      SELECT table_name FROM information_schema.tables WHERE table_name = 'agent_delegations';
--   2. Triggers active:
--      SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'agent_delegations';
--   3. Cycle defense smoke:
--      INSERT INTO agent_delegations (delegator_id, delegate_id, tenant_id, granted_by)
--        VALUES (X, Y, T, X);  -- ok
--      INSERT INTO agent_delegations (delegator_id, delegate_id, tenant_id, granted_by)
--        VALUES (Y, X, T, Y);  -- should FAIL with "Delegation cycle"
