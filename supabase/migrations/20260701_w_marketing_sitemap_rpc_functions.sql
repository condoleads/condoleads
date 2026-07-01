-- W-MARKETING A-UNIT-1b RPC REWRITE (2026-07-01)
-- Sitemap query functions. Three SETOF returning functions that encapsulate
-- the exact predicates the pg-direct query in app/sitemap.ts shipped with,
-- so the app can call supabase.rpc(...) instead of importing `pg` (whose
-- native-binding graph silently trips Next 14.2.5's metadata-route loader
-- on Vercel and drops app/sitemap.ts from the compiled route table).
--
-- WHY THREE FUNCTIONS + PARAMETERS ON THE LISTINGS ONE:
--   - This project's Supabase project has PGRST_MAX_ROWS = 5000 (empirically
--     verified during A-UNIT-1b build). PostgREST enforces the cap on any
--     response — including TABLE-returning RPCs. Buildings (~4,634) and geo
--     (~2,543) fit under the cap in a single call. Listings (~102K) do not;
--     the listings function takes (p_limit, p_offset) so the app can page
--     in parallel (10 calls at offsets 0, 5000, ..., 45000 per 50k chunk).
--
-- WHY RAW FIELDS FOR LISTINGS, NOT PRE-COMPUTED SLUG:
--   - Slug generation lives in lib/utils/slugs.ts (generatePropertySlug /
--     generateHomePropertySlug). Complex regex-driven normalization
--     (address parsing, apostrophe stripping, city extraction, unit-number
--     collision handling). Replicating in SQL would drift silently; keeping
--     it in JS means one source of truth. The function returns the raw
--     fields the app already uses to build slugs — same fields that shipped
--     in the pg-direct query (listing_key, unparsed_address, unit_number,
--     property_type, street_number, street_name, + coalesced lastmod).
--
-- PATTERN:
--   LANGUAGE sql (no plpgsql needed — pure SELECT bodies), STABLE,
--   SECURITY DEFINER + SET search_path = public, pg_temp (matches
--   supabase/migrations/20260530_phase_lifecycle_landing_2_reresolve_in_set.sql
--   and other in-tree precedent).
--   GRANT EXECUTE TO service_role (sitemap route uses createClient with
--   SUPABASE_SERVICE_ROLE_KEY — service_role is the correct grantee).
--
-- MULTI-TENANT SAFETY:
--   mls_listings, buildings, communities, municipalities, treb_areas,
--   neighbourhoods, developments have NO tenant_id column per CLAUDE.md
--   (shared MLS/geo tables). No tenant scoping applicable. The route
--   itself gates on getCurrentTenantId() BEFORE any rpc() call fires
--   (non-tenant hosts → [] before any DB read).

-- ----------------------------------------------------------------------
-- 1. get_sitemap_listings(p_limit, p_offset)
--    Returns rows the app maps to /<slug> URLs via generatePropertySlug /
--    generateHomePropertySlug. Predicate mirrors HomePropertyPage.tsx:87
--    RESIDENTIAL_TYPES gate — vacant land, farms, commercial excluded
--    because those subtypes don't have a serving route (would 404).
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
  'W-MARKETING A-UNIT-1b: sitemap listing rows for slug generation in app. '
  'Predicate mirrors HomePropertyPage RESIDENTIAL_TYPES gate + condo route. '
  'Paginated (p_limit, p_offset) because response is subject to PGRST_MAX_ROWS.';

-- ----------------------------------------------------------------------
-- 2. get_sitemap_buildings()
--    Quality gate identical to the pg-direct shipped query: slug NOT NULL
--    AND cover_photo_url NOT NULL AND EXISTS one active listing.
--    Single call — result set (~4,634) fits under PGRST_MAX_ROWS=5000
--    with a comfortable margin. If the count grows past 5000 we add
--    pagination in a follow-up.
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
  'W-MARKETING A-UNIT-1b: sitemap building rows. Quality-gated: slug + cover_photo + '
  'active listing. Currently ~4634 rows, under PGRST_MAX_ROWS=5000. Single call.';

-- ----------------------------------------------------------------------
-- 3. get_sitemap_geo_slugs()
--    Union of the 5 geo tables. Predicate: slug NOT NULL + is_active
--    where applicable (communities + neighbourhoods have is_active;
--    municipalities, treb_areas, developments do not).
--    Route conventions handled by the app:
--      community, municipality, treb_area, development -> /<slug>
--      neighbourhood                                   -> /toronto/<slug>
--    Total ~2,543 rows — well under PGRST_MAX_ROWS=5000. Single call.
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
  'W-MARKETING A-UNIT-1b: sitemap geo rows. Union of communities + munis + '
  'treb_areas + neighbourhoods + developments. Currently ~2543 rows total, '
  'under PGRST_MAX_ROWS=5000. Single call.';
