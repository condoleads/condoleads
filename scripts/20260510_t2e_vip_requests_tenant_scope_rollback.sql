-- W-LEADS-EMAIL T2e — manual rollback for vip_requests tenant scoping.
-- Idempotent. Reverse order of creation.

BEGIN;

ALTER TABLE vip_requests DROP CONSTRAINT IF EXISTS vip_requests_request_type_check;
ALTER TABLE vip_requests ALTER COLUMN request_type DROP NOT NULL;

ALTER TABLE vip_requests DROP CONSTRAINT IF EXISTS vip_requests_status_check;
ALTER TABLE vip_requests ALTER COLUMN status DROP NOT NULL;

DROP INDEX IF EXISTS idx_vip_requests_tenant;
ALTER TABLE vip_requests DROP CONSTRAINT IF EXISTS vip_requests_tenant_id_fkey;
ALTER TABLE vip_requests ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;