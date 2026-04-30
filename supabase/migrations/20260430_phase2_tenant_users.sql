-- W-TENANT-AUTH Phase 2 (Apr 30, 2026)
--
-- Creates tenant_users table for per-tenant user/lead/agent assignment.
-- Backfills tenant_users from existing chat_sessions (user_id, tenant_id) pairs.
-- Stamps any NULL leads.tenant_id rows to walliam (single production tenant)
-- and enforces NOT NULL on the column.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING, CREATE INDEX IF NOT EXISTS.
-- Walliam tenant resolved by domain (no UUID literal in business logic).

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_users (
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id               uuid        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  registered_at           timestamptz NOT NULL DEFAULT now(),
  registration_source     text,
  registration_url        text,
  marketing_consent       boolean     NOT NULL DEFAULT false,
  sms_consent             boolean     NOT NULL DEFAULT false,
  assigned_agent_id       uuid        REFERENCES agents(id) ON DELETE SET NULL,
  agent_assigned_at       timestamptz,
  agent_assignment_source text,
  unsubscribed_at         timestamptz,
  welcome_email_sent      boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user   ON tenant_users (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_agent  ON tenant_users (tenant_id, assigned_agent_id);

INSERT INTO tenant_users (
  user_id, tenant_id, registered_at,
  assigned_agent_id, agent_assigned_at, agent_assignment_source,
  marketing_consent, welcome_email_sent
)
SELECT
  pair.user_id,
  pair.tenant_id,
  pair.first_session_at,
  up.assigned_agent_id,
  up.agent_assigned_at,
  up.agent_assignment_source,
  COALESCE(up.marketing_consent, false),
  COALESCE(up.welcome_email_sent, false)
FROM (
  SELECT user_id, tenant_id, MIN(created_at) AS first_session_at
  FROM chat_sessions
  WHERE user_id IS NOT NULL AND tenant_id IS NOT NULL
  GROUP BY user_id, tenant_id
) pair
LEFT JOIN user_profiles up ON up.id = pair.user_id
ON CONFLICT (user_id, tenant_id) DO NOTHING;

UPDATE leads
SET tenant_id = (SELECT id FROM tenants WHERE domain = 'walliam.ca' LIMIT 1)
WHERE tenant_id IS NULL;

DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count FROM leads WHERE tenant_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 abort: % leads rows still have NULL tenant_id', null_count;
  END IF;
END $$;

ALTER TABLE leads ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant       ON leads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_agent ON leads (tenant_id, agent_id);

COMMIT;