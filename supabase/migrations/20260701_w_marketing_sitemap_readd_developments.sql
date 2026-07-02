-- W-MARKETING A-UNIT-1b DEV-URL RE-ADD (2026-07-01)
-- Restores the developments UNION ALL branch in get_sitemap_geo_slugs()
-- after the DevelopmentPage 404 fix (commit 4d305b8) proved all 7
-- production dev URLs render 200:
--   /corktown-district-lofts-...  → 200 (Corktown District Lofts)
--   /pier-27-condos-...           → 200 (Pier 27 Condos)
--   /playground-condos-...        → 200 (Playground Condos)
--   /the-monde-condos-...         → 200 (The Monde Condos)
--   /lighthouse-east-and-west-... → 200 (Lighthouse East and West Towers)
--   /harbour-plaza-residences-... → 200 (Harbour Plaza Residences)
--   /the-thompson-residences-...  → 200 (The Thompson Residences)
--
-- Root cause of the 404s (from the bbe7e65 removal commit):
--   DevelopmentPage.tsx:130-132 called notFound() when displayAgent was
--   null. On comprehensive tenants (aily) getAgentFromHost returns null
--   because aily's tenant→agent linkage is in tenants.default_agent_id,
--   not agents.custom_domain — so displayAgent was always null for aily.
--   BuildingPage tolerates the same null (line 315 "May be null — page
--   renders without agent features"). DevelopmentPage was diverging.
--
-- Fix in 4d305b8: DevelopmentPage now matches BuildingPage's tolerance.
--
-- This migration reverses bbe7e65's removal by putting the developments
-- UNION ALL branch back into get_sitemap_geo_slugs. Function body +
-- return type + grants + SET clauses otherwise IDENTICAL to the
-- pre-bbe7e65 version (from migration 373640a as amended by the
-- timeout-fix migration).
--
-- Expected counts after apply:
--   community      1948   (unchanged)
--   municipality    506   (unchanged)
--   treb_area        73   (unchanged)
--   neighbourhood     9   (unchanged)
--   development       7   (restored)
--   TOTAL          2543   (was 2536 in the removed state)

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
  'W-MARKETING A-UNIT-1b (developments re-added 2026-07-01): sitemap geo rows. '
  'Union of communities + munis + treb_areas + neighbourhoods + developments. '
  'Developments restored after DevelopmentPage.tsx 404 fix (commit 4d305b8) '
  'verified all 7 dev URLs render 200 on production. Currently 2543 rows total.';
