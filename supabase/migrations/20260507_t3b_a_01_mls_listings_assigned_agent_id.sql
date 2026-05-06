-- supabase/migrations/20260507_t3b_a_01_mls_listings_assigned_agent_id.sql
-- W-TERRITORY/T3b-A — mls_listings.assigned_agent_id cache column.
--
-- Why: T3a shipped the resolver functions; T3b ships the distribution + re-roll
-- mechanics that drive Event 2 (listings → routing-set distribution). Without
-- this column there's nowhere to cache the per-listing agent decision after
-- a routing-set pick. Re-roll on territory state change updates this column.
--
-- Behavior:
--   * NULL = uncached → resolver computes on-demand each call (slow path)
--   * non-NULL = cached agent_id from Event 2 distribution (fast path)
--   * ON DELETE SET NULL: hard-deleted agents null the cache; re-resolve picks
--     up the listing on next read. Soft-deactivated agents (is_active=false)
--     leave cache intact until re-roll trigger fires (T3b-C).
--
-- Lock profile: ADD COLUMN with nullable + no default = metadata-only change
-- (fast, no table rewrite). FK validation trivially satisfied on initial NULL
-- values. Partial index on a fresh column has zero entries to build. Total
-- lock duration on mls_listings: milliseconds.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Safe to re-run.
--
-- Rollback: ALTER TABLE mls_listings DROP COLUMN assigned_agent_id;
-- (drops column, FK constraint, and partial index atomically)
--
-- VERIFICATION (separate blocks after apply):
--   Block A: column exists with correct type + nullable
--   Block B: FK exists with ON DELETE SET NULL targeting agents(id)
--   Block C: partial index exists

BEGIN;

-- ─── Add cache column with FK to agents(id), ON DELETE SET NULL ─────────────
ALTER TABLE mls_listings
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid
    REFERENCES agents(id) ON DELETE SET NULL;

-- ─── Document the column's purpose ──────────────────────────────────────────
COMMENT ON COLUMN mls_listings.assigned_agent_id IS
  'W-TERRITORY/T3b: cached agent_id for this listing per Event 2 distribution. NULL = uncached (resolver computes on demand). Re-rolled on routing-set state change (T3b-C trigger). FK ON DELETE SET NULL.';

-- ─── Partial index for 'agent X listings' lookups (skips NULL rows) ─────────
CREATE INDEX IF NOT EXISTS idx_mls_listings_assigned_agent_id
  ON mls_listings(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

COMMIT;
