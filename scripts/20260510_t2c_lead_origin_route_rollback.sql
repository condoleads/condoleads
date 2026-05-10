-- W-LEADS-EMAIL T2c — manual rollback for lead_origin_route column.
-- Idempotent. Reverse order of creation.

BEGIN;

DROP INDEX IF EXISTS idx_leads_tenant_origin_route;
ALTER TABLE leads DROP COLUMN IF EXISTS lead_origin_route;

COMMIT;