-- supabase/migrations/20260522_mtb_def_1_wordmark_style.sql
-- MTB-DEF-1: add tenants.wordmark_style for per-tenant wordmark variant selection
--
-- Why: previously SiteHeaderClient, HomePageComprehensiveClient, HomePageComprehensiveClientV2
-- each hardcoded WALLIAM_TENANT_ID = 'b16e1039-...' and gated the fancy animated WALLiam
-- wordmark on tenantId === WALLIAM_TENANT_ID. This meant: (1) the WALLiam UUID was
-- duplicated across 3 client component files, and (2) no other tenant could ever opt
-- into a fancy wordmark variant without code changes.
--
-- Architecture: this column is data-driven config that any tenant can set.
-- Valid values today: 'standard' (BrandWordmark plain text), 'hero' (WALLiam animated variant).
-- Future variants can be added without touching gate logic in components.

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS wordmark_style text NOT NULL DEFAULT 'standard';

-- Backfill: WALLiam tenant gets the 'hero' variant (preserves current production behavior).
-- Verified 2026-05-22: WALLiam tenant id = b16e1039-38ed-43d7-bbc5-dd02bb651bc9
UPDATE tenants
  SET wordmark_style = 'hero'
  WHERE id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
    AND wordmark_style = 'standard';

COMMIT;