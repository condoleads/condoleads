-- supabase/migrations/20260526_p4_unowned_leads_claim.sql
-- W-TERRITORY-MASTER P4: unowned-lead feed + claim system.
--
-- Allows leads.agent_id to be NULL ("unowned").
-- Adds claim tracking columns to leads.
-- Extends lead_ownership_changes.reason CHECK with 'claim'.
-- Adds partial index for fast unowned-lead lookup.
--
-- Idempotent: re-running this migration on an already-migrated DB is a no-op.

BEGIN;

-- 1. leads.agent_id becomes nullable
ALTER TABLE leads ALTER COLUMN agent_id DROP NOT NULL;

-- 2. Claim tracking columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_by_agent_id uuid;

-- FK constraint for claimed_by_agent_id (only if column was just added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_claimed_by_agent_id_fkey'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_claimed_by_agent_id_fkey
      FOREIGN KEY (claimed_by_agent_id) REFERENCES agents(id);
  END IF;
END $$;

-- 3. lead_ownership_changes.reason CHECK extended with 'claim'
ALTER TABLE lead_ownership_changes
  DROP CONSTRAINT IF EXISTS lead_ownership_changes_reason_check;

ALTER TABLE lead_ownership_changes
  ADD CONSTRAINT lead_ownership_changes_reason_check
  CHECK (reason = ANY (ARRAY[
    'reroll'::text,
    'scope_shrink'::text,
    'manual_reassign'::text,
    'percentage_renormalize'::text,
    'agent_removed'::text,
    'agent_added'::text,
    'pin_grant'::text,
    'pin_revoke'::text,
    'cascade_resolution'::text,
    'other'::text,
    'claim'::text
  ]));

-- 4. leads.assignment_source CHECK extended with 'claim'
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_assignment_source_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_assignment_source_check
  CHECK (assignment_source = ANY (ARRAY[
    'geo'::text,
    'admin'::text,
    'manual'::text,
    'override'::text,
    'claim'::text
  ]));

-- 5. Partial index for unowned-lead lookup (fast feed queries)
CREATE INDEX IF NOT EXISTS idx_leads_unowned
  ON leads(tenant_id, created_at DESC)
  WHERE agent_id IS NULL;

COMMIT;