-- W-TENANT-AUTH File 7a (Apr 30, 2026)
--
-- Adds tenant_id to user_activities. Backfills from leads (per-email tenant lookup)
-- with walliam fallback. Enforces NOT NULL. Adds tenant-scoped indexes.

BEGIN;

ALTER TABLE user_activities
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE user_activities ua
SET tenant_id = (
  SELECT l.tenant_id FROM leads l
  WHERE l.contact_email = ua.contact_email AND l.tenant_id IS NOT NULL
  ORDER BY l.created_at DESC LIMIT 1
)
WHERE ua.tenant_id IS NULL;

UPDATE user_activities
SET tenant_id = (SELECT id FROM tenants WHERE domain = 'walliam.ca' LIMIT 1)
WHERE tenant_id IS NULL;

DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count FROM user_activities WHERE tenant_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'File 7a abort: % user_activities rows still have NULL tenant_id', null_count;
  END IF;
END $$;

ALTER TABLE user_activities ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_activities_tenant
  ON user_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_tenant_email
  ON user_activities (tenant_id, contact_email);
CREATE INDEX IF NOT EXISTS idx_user_activities_tenant_agent
  ON user_activities (tenant_id, agent_id) WHERE agent_id IS NOT NULL;

COMMIT;