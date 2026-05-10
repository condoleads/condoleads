-- W-LEADS-EMAIL T2e — vip_requests tenant scoping fix
-- T2e-pre probe (2026-05-10) verified: 0 rows. No backfill required.
--
-- Fixes:
--   F-VIP-REQUESTS-TENANT-ID-NULLABLE
--   F-VIP-REQUESTS-NO-FK-ON-TENANT-ID
--   F-VIP-REQUESTS-NO-TENANT-INDEX
--   F-VIP-REQUESTS-NO-CHECK-CONSTRAINTS (partial — status + request_type only;
--     request_source CHECK deferred to T6c due to F-VIP-REQUEST-SOURCE-HARDCODED-WALLIAM-PREFIX)
--
-- CHECK enum sources:
--   status: code writes 'pending' (insert), 'approved' (auto-approve), 'expired' (token-timeout).
--           'rejected' + 'cancelled' reserved for admin-deny + user-cancel design intent.
--   request_type: code writes 'estimator' explicit; 'plan' = column DEFAULT;
--                 'chat' covers charlie path (DEFAULT request_source 'chat').
--
-- request_source CHECK + SET NOT NULL deferred to T6c — bundled with the route fix
-- that replaces 'walliam_estimator' with tenant-agnostic 'estimator'.

BEGIN;

-- Tenant scoping
ALTER TABLE vip_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vip_requests ADD CONSTRAINT vip_requests_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id);
CREATE INDEX idx_vip_requests_tenant ON vip_requests (tenant_id);

-- Status enum + NOT NULL
ALTER TABLE vip_requests ALTER COLUMN status SET NOT NULL;
ALTER TABLE vip_requests ADD CONSTRAINT vip_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled'));

-- Request type enum + NOT NULL
ALTER TABLE vip_requests ALTER COLUMN request_type SET NOT NULL;
ALTER TABLE vip_requests ADD CONSTRAINT vip_requests_request_type_check
  CHECK (request_type IN ('plan', 'chat', 'estimator'));

COMMIT;