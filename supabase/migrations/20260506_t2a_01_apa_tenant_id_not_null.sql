-- supabase/migrations/20260506_t2a_01_apa_tenant_id_not_null.sql
-- W-TERRITORY/T2a step 1 of 4 — agent_property_access.tenant_id NOT NULL.
--
-- DESIGN:
--   Multi-tenant gap closure. Recon (2026-05-05) confirmed the 1 existing row
--   has tenant_id set; no backfill needed. Future inserts must set tenant_id
--   to prevent cross-tenant assignment leakage.
--
-- IDEMPOTENCY:
--   Pre-flight DO block aborts if any NULL tenant_id row would block the
--   constraint. SET NOT NULL is safe to re-run if column is already NOT NULL.
--
-- ROLLBACK (manual):
--   ALTER TABLE agent_property_access ALTER COLUMN tenant_id DROP NOT NULL;
--
-- VERIFICATION (paste into SQL editor after apply):
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='agent_property_access'
--      AND column_name='tenant_id';
--   -- Expected: 'NO'

BEGIN;

DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM agent_property_access
  WHERE tenant_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'T2A_01_BLOCKED: % rows have NULL tenant_id; backfill required before this constraint', null_count;
  END IF;
END $$;

ALTER TABLE agent_property_access
  ALTER COLUMN tenant_id SET NOT NULL;

COMMIT;
