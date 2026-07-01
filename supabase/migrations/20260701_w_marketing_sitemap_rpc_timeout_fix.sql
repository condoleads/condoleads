-- W-MARKETING A-UNIT-1b TIMEOUT FIX (2026-07-01)
-- Adds SET statement_timeout = 0 to each of the 3 sitemap functions
-- shipped in migration 20260701_w_marketing_sitemap_rpc_functions.sql
-- (373640a).
--
-- WHY: PostgREST connects as `authenticator` role (8s statement_timeout
-- set at role-login time). `SET LOCAL ROLE service_role` per request does
-- NOT reset statement_timeout — it stays at the login role's value.
-- service_role itself inherits authenticator's 8s. Only per-function
-- SET clause can override at call time.
--
-- The sitemap listings scan takes ~17.7s (Index Scan on standard_status
-- + external merge sort on 86k rows — see recon EXPLAIN). Without this
-- override every rpc times out at 8s and the sitemap serves partial /
-- empty data (verified 2026-07-01 STAGE 2 probe: chunk 0 = 30k of 50k
-- URLs; chunks 1 + 2 = empty).
--
-- Bodies + return types + grants are IDENTICAL to migration
-- 20260701_w_marketing_sitemap_rpc_functions.sql — the ONLY change is
-- one additional `SET statement_timeout = 0` line in each function's
-- SET clause. Idempotent via CREATE OR REPLACE.
--
-- NOTE on SET clause + LANGUAGE sql: the SET clause on CREATE FUNCTION
-- applies to every call regardless of language — Postgres wraps the
-- call in a local `SET` + `RESET` around the body execution. Works for
-- LANGUAGE sql identically to plpgsql (verified in pg docs).
--
-- Optional companion migration (see recommendation in scripts/apply-
-- sitemap-rpc-timeout-fix.js — CREATE INDEX CONCURRENTLY on
-- (standard_status, id) — NOT in this file because CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block. The runner
-- handles that outside the function txn.

-- ----------------------------------------------------------------------
-- 1. get_sitemap_listings — add SET statement_timeout = 0
-- ----------------------------------------------------------------------
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
SET statement_timeout = 0
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
          'Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
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
  'W-MARKETING A-UNIT-1b (timeout fix 2026-07-01): sitemap listing rows for '
  'slug generation. Predicate mirrors HomePropertyPage RESIDENTIAL_TYPES gate. '
  'Paginated. SET statement_timeout=0 required — full-set sort on ~86k rows '
  'takes ~17s which exceeds PostgREST authenticator role default 8s.';

-- ----------------------------------------------------------------------
-- 2. get_sitemap_buildings — add SET statement_timeout = 0
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sitemap_buildings()
RETURNS TABLE (
  slug    text,
  lastmod timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = 0
AS $function$
  SELECT DISTINCT
    b.slug::text,
    b.updated_at AS lastmod
  FROM buildings b
  WHERE b.slug IS NOT NULL
    AND b.cover_photo_url IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM mls_listings ml
       WHERE ml.building_id = b.id
         AND ml.standard_status IN ('Active', 'Active Under Contract')
    );
$function$;

REVOKE ALL ON FUNCTION public.get_sitemap_buildings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sitemap_buildings() TO service_role;

COMMENT ON FUNCTION public.get_sitemap_buildings() IS
  'W-MARKETING A-UNIT-1b (timeout fix 2026-07-01): sitemap building rows. '
  'Quality-gated: slug + cover_photo + active listing. SET statement_timeout=0 '
  'because EXISTS-per-building on ~4600 buildings exceeds the 8s default cap.';

-- ----------------------------------------------------------------------
-- 3. get_sitemap_geo_slugs — add SET statement_timeout = 0
--    (geo is small — ~2500 rows — but adding for consistency + future-proofing)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sitemap_geo_slugs()
RETURNS TABLE (
  kind    text,
  slug    text,
  lastmod timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = 0
AS $function$
  SELECT 'community'::text     AS kind, c.slug::text, c.updated_at AS lastmod
    FROM communities c
   WHERE c.slug IS NOT NULL
     AND c.is_active = true
  UNION ALL
  SELECT 'municipality'::text  AS kind, m.slug::text, m.updated_at AS lastmod
    FROM municipalities m
   WHERE m.slug IS NOT NULL
  UNION ALL
  SELECT 'treb_area'::text     AS kind, a.slug::text, a.updated_at AS lastmod
    FROM treb_areas a
   WHERE a.slug IS NOT NULL
  UNION ALL
  SELECT 'neighbourhood'::text AS kind, n.slug::text, n.updated_at AS lastmod
    FROM neighbourhoods n
   WHERE n.slug IS NOT NULL
     AND n.is_active = true
  UNION ALL
  SELECT 'development'::text   AS kind, d.slug::text, d.updated_at AS lastmod
    FROM developments d
   WHERE d.slug IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_sitemap_geo_slugs() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sitemap_geo_slugs() TO service_role;

COMMENT ON FUNCTION public.get_sitemap_geo_slugs() IS
  'W-MARKETING A-UNIT-1b (timeout fix 2026-07-01): sitemap geo rows. Union of '
  '5 geo tables. Currently ~2543 rows total. SET statement_timeout=0 for '
  'consistency across the 3 sitemap functions.';
