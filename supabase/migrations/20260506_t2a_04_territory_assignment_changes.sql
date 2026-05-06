-- supabase/migrations/20260506_t2a_04_territory_assignment_changes.sql
-- W-TERRITORY/T2a step 4 of 4 — territory_assignment_changes audit table.
--
-- DESIGN:
--   Append-only audit log of every territory boundary change: assignments
--   granted/revoked, primary flag flips, scope changes, percentage updates,
--   building/listing pin changes. Required for boundary disputes per the
--   W-TERRITORY locked spec. before_state and after_state captured as JSONB
--   so this audit doesn't need to know all columns of agent_property_access.
--   Append-only enforced by trigger.
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS, indexes, trigger all safe to re-run.
--
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_tac_no_update ON territory_assignment_changes;
--   DROP TRIGGER IF EXISTS trg_tac_no_delete ON territory_assignment_changes;
--   DROP FUNCTION IF EXISTS territory_assignment_changes_no_mutate();
--   DROP TABLE IF EXISTS territory_assignment_changes;
--
-- VERIFICATION (run after apply):
--   SELECT to_regclass('public.territory_assignment_changes');
--   -- Expected: non-NULL
--   SELECT trigger_name, event_manipulation FROM information_schema.triggers
--   WHERE event_object_table='territory_assignment_changes' ORDER BY trigger_name;
--   -- Expected: 2 rows

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='tenants') THEN
    RAISE EXCEPTION 'T2A_04_BLOCKED: tenants table does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='agents') THEN
    RAISE EXCEPTION 'T2A_04_BLOCKED: agents table does not exist';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS territory_assignment_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id      uuid REFERENCES agents(id),  -- NULL for tenant-level changes
  scope         text NOT NULL CHECK (scope IN (
                  'area',
                  'municipality',
                  'community',
                  'neighbourhood',
                  'building',
                  'listing',
                  'tenant_default'
                )),
  scope_id      uuid,  -- the area_id/muni_id/etc, or NULL for tenant_default
  change_type   text NOT NULL CHECK (change_type IN (
                  'assignment_granted',
                  'assignment_revoked',
                  'primary_set',
                  'primary_unset',
                  'percentage_set',
                  'percentage_changed',
                  'scope_widened',
                  'scope_narrowed',
                  'pin_added',
                  'pin_removed',
                  'access_toggle_changed'
                )),
  before_state  jsonb,
  after_state   jsonb,
  changed_by    uuid REFERENCES agents(id),
  changed_at    timestamp with time zone NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_tac_tenant     ON territory_assignment_changes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tac_agent      ON territory_assignment_changes (agent_id);
CREATE INDEX IF NOT EXISTS idx_tac_scope      ON territory_assignment_changes (scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_tac_changed_at ON territory_assignment_changes (changed_at DESC);

CREATE OR REPLACE FUNCTION territory_assignment_changes_no_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'territory_assignment_changes is append-only; UPDATE/DELETE not permitted';
END;
$$;

DROP TRIGGER IF EXISTS trg_tac_no_update ON territory_assignment_changes;
CREATE TRIGGER trg_tac_no_update
  BEFORE UPDATE ON territory_assignment_changes
  FOR EACH ROW EXECUTE FUNCTION territory_assignment_changes_no_mutate();

DROP TRIGGER IF EXISTS trg_tac_no_delete ON territory_assignment_changes;
CREATE TRIGGER trg_tac_no_delete
  BEFORE DELETE ON territory_assignment_changes
  FOR EACH ROW EXECUTE FUNCTION territory_assignment_changes_no_mutate();

COMMIT;
