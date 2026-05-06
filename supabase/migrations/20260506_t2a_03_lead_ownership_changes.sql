-- supabase/migrations/20260506_t2a_03_lead_ownership_changes.sql
-- W-TERRITORY/T2a step 3 of 4 — lead_ownership_changes audit table.
--
-- DESIGN:
--   Append-only audit log of every lead reassignment. Required for
--   commission attribution disputes per the W-TERRITORY locked spec.
--   Each row captures: lead, tenant, old/new agent, reason (CHECK-constrained),
--   actor (NULL = system-triggered), timestamp, notes.
--   Append-only enforced by trigger that RAISES on UPDATE/DELETE.
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS, indexes, trigger all safe to re-run.
--
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_loc_no_update ON lead_ownership_changes;
--   DROP TRIGGER IF EXISTS trg_loc_no_delete ON lead_ownership_changes;
--   DROP FUNCTION IF EXISTS lead_ownership_changes_no_mutate();
--   DROP TABLE IF EXISTS lead_ownership_changes;
--
-- VERIFICATION (run after apply):
--   SELECT to_regclass('public.lead_ownership_changes');
--   -- Expected: non-NULL
--   SELECT trigger_name, event_manipulation
--   FROM information_schema.triggers
--   WHERE event_object_table='lead_ownership_changes' ORDER BY trigger_name;
--   -- Expected: 2 rows (trg_loc_no_delete=DELETE, trg_loc_no_update=UPDATE)

BEGIN;

-- Pre-flight: verify dependent tables exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='leads') THEN
    RAISE EXCEPTION 'T2A_03_BLOCKED: leads table does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='tenants') THEN
    RAISE EXCEPTION 'T2A_03_BLOCKED: tenants table does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='agents') THEN
    RAISE EXCEPTION 'T2A_03_BLOCKED: agents table does not exist';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lead_ownership_changes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  old_agent_id uuid REFERENCES agents(id),
  new_agent_id uuid NOT NULL REFERENCES agents(id),
  reason       text NOT NULL CHECK (reason IN (
                 'reroll',
                 'scope_shrink',
                 'manual_reassign',
                 'percentage_renormalize',
                 'agent_removed',
                 'agent_added',
                 'pin_grant',
                 'pin_revoke',
                 'cascade_resolution',
                 'other'
               )),
  changed_by   uuid REFERENCES agents(id),  -- NULL = system-triggered
  changed_at   timestamp with time zone NOT NULL DEFAULT now(),
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_loc_lead       ON lead_ownership_changes (lead_id);
CREATE INDEX IF NOT EXISTS idx_loc_tenant     ON lead_ownership_changes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_loc_changed_at ON lead_ownership_changes (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_new_agent  ON lead_ownership_changes (new_agent_id);

-- Append-only enforcement: no UPDATE, no DELETE.
CREATE OR REPLACE FUNCTION lead_ownership_changes_no_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lead_ownership_changes is append-only; UPDATE/DELETE not permitted';
END;
$$;

DROP TRIGGER IF EXISTS trg_loc_no_update ON lead_ownership_changes;
CREATE TRIGGER trg_loc_no_update
  BEFORE UPDATE ON lead_ownership_changes
  FOR EACH ROW EXECUTE FUNCTION lead_ownership_changes_no_mutate();

DROP TRIGGER IF EXISTS trg_loc_no_delete ON lead_ownership_changes;
CREATE TRIGGER trg_loc_no_delete
  BEFORE DELETE ON lead_ownership_changes
  FOR EACH ROW EXECUTE FUNCTION lead_ownership_changes_no_mutate();

COMMIT;
