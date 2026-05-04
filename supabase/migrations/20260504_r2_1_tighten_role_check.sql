-- supabase/migrations/20260504_r2_1_tighten_role_check.sql
-- W-ROLES-DELEGATION R2.1 — tighten agents.role CHECK constraint.
--
-- Drops vestigial values: assistant, support, managed.
-- New constraint: role IN (agent, manager, area_manager, tenant_admin, admin).
-- Verified zero live rows on dropped values 2026-05-04 (post-test-tenant wipe).

BEGIN;

-- 1. Verify zero rows on values we're about to drop (defense in depth)
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM agents
  WHERE role IN ('assistant', 'support', 'managed');
  
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot tighten role CHECK: % rows still use assistant/support/managed. Migrate them first.', bad_count;
  END IF;
END $$;

-- 2. Drop old constraint
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_role_check;

-- 3. Create new tighter constraint
ALTER TABLE agents ADD CONSTRAINT agents_role_check
  CHECK (role = ANY (ARRAY['agent'::text, 'manager'::text, 'area_manager'::text, 'tenant_admin'::text, 'admin'::text]));

COMMIT;

-- Verification (run manually after):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.agents'::regclass AND conname = 'agents_role_check';
-- Expected: CHECK ((role = ANY (ARRAY['agent', 'manager', 'area_manager', 'tenant_admin', 'admin'])))
