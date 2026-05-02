-- supabase/migrations/20260501_phase_d1_tenants_source_key.sql
-- W-CREDIT-VERIFY Phase D1 — add tenants.source_key column
-- Retires hardcoded 'walliam' literal from /api/charlie/route.ts (4 spots — F1, F2, F8, F18).
-- Code change to read this column ships in D2.
-- D1 is schema-only; app behavior unchanged after this migration runs.

BEGIN;

-- 1. Add nullable column first (allows backfill without violating NOT NULL)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS source_key TEXT;

-- 2. Backfill existing tenants
-- WALLiam (production) → 'walliam'
UPDATE tenants
SET source_key = 'walliam'
WHERE id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
  AND source_key IS NULL;

-- TEST_TENANT_DELETE_ME (W-HIERARCHY test fixture, 7 role-test agents) → 'test_tenant_3'
UPDATE tenants
SET source_key = 'test_tenant_3'
WHERE id = '00000000-0000-0000-0000-000000000003'
  AND source_key IS NULL;

-- 3. Verify backfill — exactly one row populated, no nulls remain
DO $$
DECLARE
  null_count INT;
  total_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM tenants WHERE source_key IS NULL;
  SELECT COUNT(*) INTO total_count FROM tenants;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'tenants.source_key has % NULL rows out of % total — backfill incomplete. Add UPDATE for each tenant before re-running.', null_count, total_count;
  END IF;

  RAISE NOTICE 'Backfill OK: % rows total, 0 NULL', total_count;
END $$;

-- 4. Promote to NOT NULL — enforces every future tenant must have a source_key
ALTER TABLE tenants ALTER COLUMN source_key SET NOT NULL;

-- 5. Unique index — prevents two tenants from sharing the same source_key
--    This matters because source_key is a product-namespace key, not a free label.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_source_key_unique ON tenants (source_key);


COMMIT;

-- ─── Verification (run manually after migration) ──────────────────────────
-- 1. Column exists with correct type and constraint:
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_name = 'tenants' AND column_name = 'source_key';
--   Expected: column_name='source_key', data_type='text', is_nullable='NO'
--
-- 2. WALLiam tenant has source_key = 'walliam':
--      SELECT id, name, source_key FROM tenants WHERE id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
--   Expected: source_key = 'walliam'
--
-- 3. Unique index exists:
--      SELECT indexname, indexdef FROM pg_indexes
--      WHERE tablename = 'tenants' AND indexname = 'idx_tenants_source_key_unique';