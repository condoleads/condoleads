-- 20260521_tenants_source_key_unique.sql
--
-- W-MULTITENANT-BENCH P3 finding #1: tenant onboarding via dashboard fails
-- because source_key is NOT NULL but the modal does not collect it and the
-- API route did not derive it.
--
-- This migration:
--   1. Locks source_key as NOT NULL (already enforced; documented here).
--   2. Adds UNIQUE constraint on source_key.
--      Rationale: lead.source strings embed tenant.source_key as a prefix
--      (e.g., '${tenant.source_key}_estimator_questionnaire'). Duplicate
--      source_keys would collapse two tenant identities into one string,
--      making lead attribution ambiguous and constituting a tenant-leak
--      shape at the analytics layer.
--
-- Verified safe to apply 2026-05-21:
--   - All existing tenants (WALLiam) have non-null source_key.
--   - No duplicates exist (AZ.2 probe confirmed).

BEGIN;

-- Defensive: ensure NOT NULL is in place (already true; idempotent).
ALTER TABLE public.tenants
  ALTER COLUMN source_key SET NOT NULL;

-- Add UNIQUE constraint.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_source_key_key UNIQUE (source_key);

COMMIT;