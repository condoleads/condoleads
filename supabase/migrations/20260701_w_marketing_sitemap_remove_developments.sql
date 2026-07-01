-- W-MARKETING A-UNIT-1b DEV-URL FIX (2026-07-01)
-- CREATE OR REPLACE get_sitemap_geo_slugs() removing the developments
-- UNION ALL branch. Community, municipality, treb_area, neighbourhood
-- branches unchanged.
--
-- WHY: production probe showed 7/7 development URLs (emitted from the
-- previous get_sitemap_geo_slugs' development branch) return 404 on
-- aily.ca. Recon:
--   - Dispatch code EXISTS at app/comprehensive-site/[slug]/page.tsx:95-97
--     and app/[slug]/page.tsx:145 — queries developments.slug and renders
--     DevelopmentPage if matched.
--   - DB rows EXIST for all 7 slugs (verified via direct SELECT).
--   - RLS is DISABLED on developments; direct supabase-anon query returns
--     the row.
--   - Nonetheless, production URLs /<development-slug> 404 on aily. Some
--     app-level dispatch bug — root cause not identified this session.
--
-- Fix scope: sitemap-side only. Do NOT emit URLs that don't work today.
-- Google sees 404s = poor crawl signal.
--
-- The app dispatch bug is a SEPARATE open item (see tracker follow-up).
-- Once fixed, this function can be reverted to include developments —
-- add the branch back with the SAME shape as the neighbourhood branch:
--
--   UNION ALL
--   SELECT 'development'::text  AS kind, d.slug::text, d.updated_at AS lastmod
--     FROM developments d
--    WHERE d.slug IS NOT NULL
--
-- Function body + return type + grants otherwise IDENTICAL to prior
-- versions in migrations 373640a and the timeout-fix migration.
-- Idempotent via CREATE OR REPLACE.

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
     AND n.is_active = true;
$function$;

REVOKE ALL ON FUNCTION public.get_sitemap_geo_slugs() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_sitemap_geo_slugs() TO service_role;

COMMENT ON FUNCTION public.get_sitemap_geo_slugs() IS
  'W-MARKETING A-UNIT-1b (developments removed 2026-07-01): sitemap geo rows. '
  'Union of communities + munis + treb_areas + neighbourhoods. Developments '
  'excluded — production probe showed /<development-slug> URLs 404 despite '
  'dispatch code existing and DB rows existing (app-level dispatch bug, '
  'tracked separately). Currently 2536 rows total (was 2543 pre-removal).';
