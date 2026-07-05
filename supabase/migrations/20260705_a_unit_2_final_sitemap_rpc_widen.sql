-- W-MARKETING A-UNIT-2 FINAL (2026-07-05)
-- Widen public.get_sitemap_listings predicate to include every Residential
-- Freehold subtype that now has a rendering surface. Mirrors the expanded
-- RESIDENTIAL_TYPES constant in app/property/[id]/HomePropertyPage.tsx +
-- app/api/geo-listings/route.ts + app/api/neighbourhood-listings/route.ts +
-- app/sitemap.xml/route.ts. Predicate MUST stay in sync with the app-side
-- constant (per migration 20260701_w_marketing_sitemap_rpc_functions.sql
-- comment: "any edit to get_sitemap_listings' WHERE clause requires a
-- matching update in HomePropertyPage.tsx and vice versa").
--
-- Rollback: replace body with the 8-subtype list from
-- 20260701_w_marketing_sitemap_rpc_functions.sql.

CREATE OR REPLACE FUNCTION public.get_sitemap_listings(
  p_limit  int,
  p_offset int
)
RETURNS TABLE (
  listing_key      text,
  unparsed_address text,
  unit_number      text,
  property_type    text,
  street_number    text,
  street_name      text,
  lastmod          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    ml.listing_key::text,
    ml.unparsed_address::text,
    ml.unit_number::text,
    ml.property_type::text,
    ml.street_number::text,
    ml.street_name::text,
    COALESCE(ml.modification_timestamp, ml.updated_at) AS lastmod
  FROM mls_listings ml
  WHERE ml.standard_status IN ('Active', 'Active Under Contract')
    AND (
      ml.property_type = 'Residential Condo & Other'
      OR (
        ml.property_type = 'Residential Freehold'
        AND ml.property_subtype IN (
          'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
          'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
          'Modular Home', 'Upper Level', 'Lower Level', 'Room', 'Shared Room',
          'Rural Residential', 'MobileTrailer',
          'Farm', 'Store W Apt/Office', 'Other', 'Vacant Land'
        )
      )
    )
  ORDER BY ml.id
  LIMIT  p_limit
  OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public.get_sitemap_listings(int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sitemap_listings(int, int) TO service_role;

COMMENT ON FUNCTION public.get_sitemap_listings(int, int) IS
  'W-MARKETING A-UNIT-2 FINAL (2026-07-05): sitemap listing rows for slug '
  'generation in app. Predicate mirrors HomePropertyPage RESIDENTIAL_TYPES '
  '(19 freehold subtypes + all condo types). Paginated (p_limit, p_offset) '
  'because response is subject to PGRST_MAX_ROWS=5000.';
