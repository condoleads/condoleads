-- Rollback for F-MLS-LISTINGS-GEO-INDEXES
-- Captured: 2026-05-07T10:25:48.648Z
-- Drops the three geo-column indexes added by the forward migration.
-- Note: dropping these will cause reroll_listings_at_geo to Seq Scan
-- mls_listings again, killing performance. Only run if you have a reason.

DROP INDEX IF EXISTS public.idx_mls_listings_area_id;
DROP INDEX IF EXISTS public.idx_mls_listings_municipality_id;
DROP INDEX IF EXISTS public.idx_mls_listings_community_id;
