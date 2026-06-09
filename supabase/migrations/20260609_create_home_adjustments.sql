-- supabase/migrations/20260609_create_home_adjustments.sql
-- v10 step 3 Phase 1: community-level adjustment analytics for HOMES (System 2).
--
-- Mirrors the shape of the legacy condo `adjustments` table but with three
-- critical departures from the condo precedent (which violates multi-tenant
-- Rule Zero — see W-ESTIMATOR-RAG-TRACKER recon for the audit):
--
--   1. tenant_id NOT NULL on every row. Every adjustment belongs to exactly
--      one tenant. No global rows.
--   2. RLS enabled + forced. Authenticated callers see only rows whose
--      tenant_id matches an agent record they own (mirrors the existing
--      `leads` policy pattern; current_tenant_id() does NOT exist in this
--      Postgres — verified pre-build). Service role retains full access for
--      the matcher read path (anonymous-buyer estimator traffic).
--   3. No building tier. Homes are orphan property (no building parent in
--      MLS terms — verified in lib/estimator types). Scope FKs: area_id,
--      municipality_id, community_id only; exactly one set per row OR all
--      three null (tenant-generic default).
--
-- Default-empty NO-OP guarantee: an empty table (zero rows for a tenant)
-- means the resolver returns DEFAULT_ADJUSTMENTS verbatim, which is the
-- f7f3c6e behavior byte-for-byte. The layer can be applied to production
-- without changing a single estimate; it only takes effect when an
-- operator writes a row.
--
-- Column set mirrors lib/estimator/home-adjustment-math.js:DEFAULT_ADJUSTMENTS
-- PRICE keys exactly. Recency bands (RECENCY_PCT_*) intentionally NOT mirrored
-- — they're score-only signals in scoreMatch, never applied to price.
--
-- TRANSACTION CONTROL: this file is pure DDL — NO BEGIN; / COMMIT; here.
-- The apply-runner (scripts/apply-home-adjustments-migration.js) wraps the
-- whole apply+verify in ONE Node-managed transaction so a verify-fail can
-- ROLLBACK the migration cleanly. Putting BEGIN/COMMIT here would self-commit
-- the DDL before verification, leaving a verify-fail with no rollback path —
-- that's the prior-runner defect class. Audit 2026-06-09 caught + fixed.

CREATE TABLE IF NOT EXISTS home_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Scope FKs (homes have no building parent — only 3 levels).
  -- At most one of these is set per row; all-null = tenant-generic default.
  area_id uuid REFERENCES treb_areas(id) ON DELETE CASCADE,
  municipality_id uuid REFERENCES municipalities(id) ON DELETE CASCADE,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,

  -- Sale vs lease split (mirrors the condo table's column-pair pattern but as
  -- a row-level discriminator — cleaner with 14+ adjustment columns).
  type text NOT NULL CHECK (type IN ('sale','lease')),

  -- Proportional frontage band (h6 — 2026-06-09):
  --   per_foot_pct + max_pct are a pair; the matcher uses both:
  --   amount = sign(diff) * min(|diff|*per_foot_pct, max_pct) * comp.close_price
  -- DEFAULT_ADJUSTMENTS defaults: 0.008, 0.20.
  lot_frontage_per_foot_pct numeric,
  lot_frontage_max_pct numeric,

  -- Additive sale-side adjustments (DEFAULT_ADJUSTMENTS price keys).
  lot_depth_per_10ft numeric,
  lot_depth_max numeric,
  basement_finished numeric,
  basement_sep_entrance numeric,
  basement_walkout_bonus numeric,
  garage_detached_single numeric,
  garage_attached_single numeric,
  garage_builtin numeric,
  garage_attached_double numeric,
  pool_inground numeric,
  bathroom_full numeric,
  bathroom_half numeric,

  -- Lease-side adjustments. The home rentals matcher applies only parking +
  -- bathroom today (HOME_RENTAL_ADJUSTMENTS in home-comparable-matcher-rentals);
  -- these two columns carry the editable per-geo lease values. For sale-type
  -- rows these are unused (left null).
  parking_per_space numeric,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),

  -- At most one scope FK set per row. All-null = tenant-generic default.
  CONSTRAINT home_adjustments_at_most_one_scope CHECK (
    (CASE WHEN area_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN municipality_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN community_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

-- Partial unique indexes: one row per (tenant, scope, type) combination.
-- The four-index split is needed because PG can't express "exactly one of
-- {a,b,c} is non-null" as a single UNIQUE — we partition by which scope FK
-- is non-null and apply UNIQUE within each partition.

CREATE UNIQUE INDEX IF NOT EXISTS home_adjustments_unique_community
  ON home_adjustments (tenant_id, community_id, type)
  WHERE community_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS home_adjustments_unique_municipality
  ON home_adjustments (tenant_id, municipality_id, type)
  WHERE municipality_id IS NOT NULL AND community_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS home_adjustments_unique_area
  ON home_adjustments (tenant_id, area_id, type)
  WHERE area_id IS NOT NULL AND municipality_id IS NULL AND community_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS home_adjustments_unique_generic
  ON home_adjustments (tenant_id, type)
  WHERE area_id IS NULL AND municipality_id IS NULL AND community_id IS NULL;

-- Read-path indexes (the resolver does .eq('tenant_id', x).in(scope, [...])
-- to cascade. Tenant-first index covers all scope variants).
CREATE INDEX IF NOT EXISTS idx_home_adjustments_tenant_community
  ON home_adjustments (tenant_id, community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_home_adjustments_tenant_municipality
  ON home_adjustments (tenant_id, municipality_id) WHERE municipality_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_home_adjustments_tenant_area
  ON home_adjustments (tenant_id, area_id) WHERE area_id IS NOT NULL;

-- updated_at trigger (mirrors the pattern used on other recent System 2
-- tables; if the project has a shared trigger function, we reuse it,
-- otherwise this inline one is self-contained).
CREATE OR REPLACE FUNCTION update_home_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_home_adjustments_updated_at
BEFORE UPDATE ON home_adjustments
FOR EACH ROW
EXECUTE FUNCTION update_home_adjustments_updated_at();

-- ============ RLS ============
-- Forced RLS — even the table owner is subject to the policies.
-- Verified pre-build: current_tenant_id() function does NOT exist in this
-- Postgres. The existing tenant-scoping pattern (see leads RLS) joins through
-- agents.user_id = auth.uid() to derive tenant_id. We mirror that.

ALTER TABLE home_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_adjustments FORCE ROW LEVEL SECURITY;

-- Authenticated users (tenant admins / managers / agents): see and modify
-- rows where tenant_id matches a tenant they're an agent of.
CREATE POLICY home_adjustments_tenant_isolation_select ON home_adjustments
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()));

CREATE POLICY home_adjustments_tenant_isolation_insert ON home_adjustments
FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()));

CREATE POLICY home_adjustments_tenant_isolation_update ON home_adjustments
FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()));

CREATE POLICY home_adjustments_tenant_isolation_delete ON home_adjustments
FOR DELETE TO authenticated
USING (tenant_id IN (SELECT a.tenant_id FROM agents a WHERE a.user_id = auth.uid()));

-- Service role: full access — the matcher read path runs in anonymous-buyer
-- context (no authenticated user) and uses service role to read adjustments.
-- Application-side .eq('tenant_id', tenantId) enforces correctness on that
-- path (defense in depth — RLS on writes, app on reads).
CREATE POLICY home_adjustments_service_role ON home_adjustments
FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Document the table (DBA-facing).
COMMENT ON TABLE home_adjustments IS
  'Per-tenant, per-geo, per-type (sale|lease) override values for the home estimator''s adjustment math. Empty table => resolver falls through to lib/estimator/home-adjustment-math.js:DEFAULT_ADJUSTMENTS (byte-identical to pre-v10-step-3 behavior). v10 step 3 Phase 1 (2026-06-09).';

-- No COMMIT here — transaction is owned by the apply-runner (see top-of-file
-- TRANSACTION CONTROL note). Runner issues COMMIT only after name-level
-- verification passes; ROLLBACK on any failure leaves zero persisted state.
