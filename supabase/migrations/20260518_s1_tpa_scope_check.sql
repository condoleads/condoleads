-- Migration: 20260518_s1_tpa_scope_check
-- Purpose: Add symmetric CHECK constraint to tenant_property_access.scope
-- Verified: 2026-05-18 session, P1-A through P1-E
--   - P1-A: 0 rows in tenant_property_access (empty by design)
--   - P1-B: scope is text NOT NULL, no existing CHECK
--   - P1-D: app/api/admin-homes/tenants/[id]/geo/route.ts is a passthrough
--          writer with zero server-side scope validation
--   - P1-E: UI caller TenantGeoAssignmentSection.tsx constrains scope to
--          'area' | 'municipality' | 'community' | 'neighbourhood'
-- Rationale: DB is the contract of last resort. The 4-value set comes from
--   the verified UI contract. 'all' is excluded by design (empty rows
--   already mean full access per the tpa "empty = full access" pattern,
--   documented in W-TERRITORY-TRACKER v12).

BEGIN;

ALTER TABLE public.tenant_property_access
  ADD CONSTRAINT tenant_property_access_scope_check
  CHECK (scope = ANY (ARRAY['area'::text, 'municipality'::text, 'community'::text, 'neighbourhood'::text]));

COMMIT;