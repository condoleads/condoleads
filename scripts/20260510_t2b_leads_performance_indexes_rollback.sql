-- W-LEADS-EMAIL T2b — manual rollback for performance indexes
-- Idempotent. Reverse order of creation.

BEGIN;

DROP INDEX IF EXISTS idx_leads_source;
DROP INDEX IF EXISTS idx_leads_listing_id;
DROP INDEX IF EXISTS idx_leads_tenant_email;

COMMIT;