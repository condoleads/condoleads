-- scripts/r-territory-f-mls-listings-geo-indexes.sql
-- W-TERRITORY/F-MLS-LISTINGS-GEO-INDEXES
--
-- Three btree indexes on mls_listings.{area_id, municipality_id, community_id}
-- to make reroll_listings_at_geo + distribute_listings_at_geo perform Index
-- Scan instead of Seq Scan over 1.25M rows.
--
-- ANALYZE at end refreshes stats so planner picks the new indexes immediately.

CREATE INDEX IF NOT EXISTS idx_mls_listings_area_id
  ON public.mls_listings (area_id);

CREATE INDEX IF NOT EXISTS idx_mls_listings_municipality_id
  ON public.mls_listings (municipality_id);

CREATE INDEX IF NOT EXISTS idx_mls_listings_community_id
  ON public.mls_listings (community_id);

ANALYZE public.mls_listings;
