-- P-LIFECYCLE Event 7 -- PRE-FIX SNAPSHOT
-- Captured: 2026-06-01T15-42-34-453Z

-- tenant_floor_alerts CHECK constraints pre-Event-7:
--   tenant_floor_alerts_listing_id_fkey: FOREIGN KEY (listing_id) REFERENCES mls_listings(id) ON DELETE SET NULL
--   tenant_floor_alerts_pkey: PRIMARY KEY (id)
--   tenant_floor_alerts_tenant_id_fkey: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
--   tfa_alert_type_check: CHECK ((alert_type = ANY (ARRAY['empty_floor_pool'::text, 'all_inactive'::text, 'all_flags_off_for_type'::text])))
--   tfa_property_type_check: CHECK ((property_type = ANY (ARRAY['condo'::text, 'home'::text])))

-- reconcile_corrections table exists pre-apply: NO
-- reconcile_tenant_cache function exists pre-apply: NO
-- idx_mls_listings_updated_at index exists pre-apply: NO