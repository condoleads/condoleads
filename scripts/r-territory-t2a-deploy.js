// scripts/r-territory-t2a-deploy.js
// W-TERRITORY/T2a — schema migrations (4 files).
//
//   01: agent_property_access.tenant_id NOT NULL
//   02: agent_property_access.is_primary + 4 partial unique indexes + backfill
//   03: lead_ownership_changes audit table (append-only)
//   04: territory_assignment_changes audit table (append-only)
//
// New files only. Idempotent: refuses to overwrite existing files.
// Each migration file is itself idempotent (DO-block pre-flights, IF NOT EXISTS).
// Each migration is self-contained BEGIN/COMMIT — apply individually via Supabase SQL editor.
//
// Usage: node scripts/r-territory-t2a-deploy.js

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

console.log('[T2A-DEPLOY] W-TERRITORY/T2a — 4 migration files')
console.log('[T2A-DEPLOY] STAMP=' + STAMP)
console.log('[T2A-DEPLOY] PROJECT_ROOT=' + PROJECT_ROOT)
console.log('')

// ────────────────────────────────────────────────────────────────────────────
// Migration 01 — agent_property_access.tenant_id NOT NULL
// ────────────────────────────────────────────────────────────────────────────
const FILE1_REL = "supabase/migrations/20260506_t2a_01_apa_tenant_id_not_null.sql"
const FILE1_LINES = [
  "-- supabase/migrations/20260506_t2a_01_apa_tenant_id_not_null.sql",
  "-- W-TERRITORY/T2a step 1 of 4 — agent_property_access.tenant_id NOT NULL.",
  "--",
  "-- DESIGN:",
  "--   Multi-tenant gap closure. Recon (2026-05-05) confirmed the 1 existing row",
  "--   has tenant_id set; no backfill needed. Future inserts must set tenant_id",
  "--   to prevent cross-tenant assignment leakage.",
  "--",
  "-- IDEMPOTENCY:",
  "--   Pre-flight DO block aborts if any NULL tenant_id row would block the",
  "--   constraint. SET NOT NULL is safe to re-run if column is already NOT NULL.",
  "--",
  "-- ROLLBACK (manual):",
  "--   ALTER TABLE agent_property_access ALTER COLUMN tenant_id DROP NOT NULL;",
  "--",
  "-- VERIFICATION (paste into SQL editor after apply):",
  "--   SELECT is_nullable FROM information_schema.columns",
  "--    WHERE table_schema='public' AND table_name='agent_property_access'",
  "--      AND column_name='tenant_id';",
  "--   -- Expected: 'NO'",
  "",
  "BEGIN;",
  "",
  "DO $$",
  "DECLARE",
  "  null_count int;",
  "BEGIN",
  "  SELECT COUNT(*) INTO null_count",
  "  FROM agent_property_access",
  "  WHERE tenant_id IS NULL;",
  "",
  "  IF null_count > 0 THEN",
  "    RAISE EXCEPTION 'T2A_01_BLOCKED: % rows have NULL tenant_id; backfill required before this constraint', null_count;",
  "  END IF;",
  "END $$;",
  "",
  "ALTER TABLE agent_property_access",
  "  ALTER COLUMN tenant_id SET NOT NULL;",
  "",
  "COMMIT;",
  "",
]

// ────────────────────────────────────────────────────────────────────────────
// Migration 02 — agent_property_access.is_primary + partial unique indexes + backfill
// ────────────────────────────────────────────────────────────────────────────
const FILE2_REL = "supabase/migrations/20260506_t2a_02_apa_is_primary.sql"
const FILE2_LINES = [
  "-- supabase/migrations/20260506_t2a_02_apa_is_primary.sql",
  "-- W-TERRITORY/T2a step 2 of 4 — is_primary + 4 partial unique indexes + backfill.",
  "--",
  "-- DESIGN (W-TERRITORY OD-5 — display vs routing two-layer model):",
  "--   `is_primary` flags which row of the routing set is the public-page face.",
  "--   Exactly one is_primary=true allowed per (scope, scope_target, tenant_id),",
  "--   enforced via partial unique indexes. Schema uses separate scope_id columns",
  "--   per scope (area_id / municipality_id / community_id / neighbourhood_id),",
  "--   so we ship 4 partial unique indexes — one per scope — instead of one",
  "--   composite index over a synthetic scope_target_id.",
  "--",
  "-- BACKFILL:",
  "--   For each unique (scope, scope_target_id, tenant_id) group, the earliest",
  "--   row by created_at is marked is_primary=true (deterministic by-design).",
  "--   With 1 existing row today, this is mechanical. Algorithm scales to any",
  "--   future state.",
  "--",
  "-- IDEMPOTENCY:",
  "--   ADD COLUMN guarded by information_schema check (DO block).",
  "--   Backfill UPDATE is no-op on subsequent runs (only flips rows where false).",
  "--   CREATE UNIQUE INDEX uses IF NOT EXISTS.",
  "--",
  "-- ROLLBACK (manual):",
  "--   DROP INDEX IF EXISTS uniq_apa_primary_area;",
  "--   DROP INDEX IF EXISTS uniq_apa_primary_muni;",
  "--   DROP INDEX IF EXISTS uniq_apa_primary_community;",
  "--   DROP INDEX IF EXISTS uniq_apa_primary_neighbourhood;",
  "--   ALTER TABLE agent_property_access DROP COLUMN is_primary;",
  "--",
  "-- VERIFICATION (run after apply):",
  "--   -- 1. Column exists with correct shape",
  "--   SELECT column_name, data_type, is_nullable, column_default",
  "--   FROM information_schema.columns",
  "--   WHERE table_schema='public' AND table_name='agent_property_access'",
  "--     AND column_name='is_primary';",
  "--   -- Expected: boolean, NO, false",
  "--",
  "--   -- 2. All 4 partial unique indexes exist",
  "--   SELECT indexname FROM pg_indexes",
  "--   WHERE schemaname='public' AND tablename='agent_property_access'",
  "--     AND indexname LIKE 'uniq_apa_primary%'",
  "--   ORDER BY indexname;",
  "--   -- Expected: 4 rows (area, muni, community, neighbourhood)",
  "--",
  "--   -- 3. Backfill landed (every group has exactly 1 primary)",
  "--   SELECT scope,",
  "--          COUNT(*) AS total_rows,",
  "--          COUNT(*) FILTER (WHERE is_primary) AS primary_rows",
  "--   FROM agent_property_access GROUP BY scope;",
  "--   -- Expected: each row has primary_rows >= 1; index would block > 1 per group",
  "",
  "BEGIN;",
  "",
  "-- Step 1: add the column (only if not already present)",
  "DO $$",
  "BEGIN",
  "  IF NOT EXISTS (",
  "    SELECT 1 FROM information_schema.columns",
  "    WHERE table_schema='public'",
  "      AND table_name='agent_property_access'",
  "      AND column_name='is_primary'",
  "  ) THEN",
  "    EXECUTE 'ALTER TABLE agent_property_access",
  "             ADD COLUMN is_primary boolean NOT NULL DEFAULT false';",
  "  END IF;",
  "END $$;",
  "",
  "-- Step 2: backfill — earliest row per (scope, scope_target, tenant_id) becomes primary.",
  "WITH ranked AS (",
  "  SELECT",
  "    id,",
  "    ROW_NUMBER() OVER (",
  "      PARTITION BY",
  "        scope,",
  "        CASE scope",
  "          WHEN 'area'          THEN area_id",
  "          WHEN 'municipality'  THEN municipality_id",
  "          WHEN 'community'     THEN community_id",
  "          WHEN 'neighbourhood' THEN neighbourhood_id",
  "        END,",
  "        tenant_id",
  "      ORDER BY created_at ASC NULLS LAST, id ASC",
  "    ) AS rn",
  "  FROM agent_property_access",
  ")",
  "UPDATE agent_property_access apa",
  "SET is_primary = true",
  "FROM ranked",
  "WHERE apa.id = ranked.id",
  "  AND ranked.rn = 1",
  "  AND apa.is_primary = false;  -- idempotent: don't re-flip already-primary rows",
  "",
  "-- Step 3: partial unique indexes — one per scope.",
  "CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_area",
  "  ON agent_property_access (area_id, tenant_id)",
  "  WHERE is_primary = true AND scope = 'area' AND area_id IS NOT NULL;",
  "",
  "CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_muni",
  "  ON agent_property_access (municipality_id, tenant_id)",
  "  WHERE is_primary = true AND scope = 'municipality' AND municipality_id IS NOT NULL;",
  "",
  "CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_community",
  "  ON agent_property_access (community_id, tenant_id)",
  "  WHERE is_primary = true AND scope = 'community' AND community_id IS NOT NULL;",
  "",
  "CREATE UNIQUE INDEX IF NOT EXISTS uniq_apa_primary_neighbourhood",
  "  ON agent_property_access (neighbourhood_id, tenant_id)",
  "  WHERE is_primary = true AND scope = 'neighbourhood' AND neighbourhood_id IS NOT NULL;",
  "",
  "COMMIT;",
  "",
]

// ────────────────────────────────────────────────────────────────────────────
// Migration 03 — lead_ownership_changes audit table
// ────────────────────────────────────────────────────────────────────────────
const FILE3_REL = "supabase/migrations/20260506_t2a_03_lead_ownership_changes.sql"
const FILE3_LINES = [
  "-- supabase/migrations/20260506_t2a_03_lead_ownership_changes.sql",
  "-- W-TERRITORY/T2a step 3 of 4 — lead_ownership_changes audit table.",
  "--",
  "-- DESIGN:",
  "--   Append-only audit log of every lead reassignment. Required for",
  "--   commission attribution disputes per the W-TERRITORY locked spec.",
  "--   Each row captures: lead, tenant, old/new agent, reason (CHECK-constrained),",
  "--   actor (NULL = system-triggered), timestamp, notes.",
  "--   Append-only enforced by trigger that RAISES on UPDATE/DELETE.",
  "--",
  "-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS, indexes, trigger all safe to re-run.",
  "--",
  "-- ROLLBACK (manual):",
  "--   DROP TRIGGER IF EXISTS trg_loc_no_update ON lead_ownership_changes;",
  "--   DROP TRIGGER IF EXISTS trg_loc_no_delete ON lead_ownership_changes;",
  "--   DROP FUNCTION IF EXISTS lead_ownership_changes_no_mutate();",
  "--   DROP TABLE IF EXISTS lead_ownership_changes;",
  "--",
  "-- VERIFICATION (run after apply):",
  "--   SELECT to_regclass('public.lead_ownership_changes');",
  "--   -- Expected: non-NULL",
  "--   SELECT trigger_name, event_manipulation",
  "--   FROM information_schema.triggers",
  "--   WHERE event_object_table='lead_ownership_changes' ORDER BY trigger_name;",
  "--   -- Expected: 2 rows (trg_loc_no_delete=DELETE, trg_loc_no_update=UPDATE)",
  "",
  "BEGIN;",
  "",
  "-- Pre-flight: verify dependent tables exist.",
  "DO $$",
  "BEGIN",
  "  IF NOT EXISTS (SELECT 1 FROM information_schema.tables",
  "                 WHERE table_schema='public' AND table_name='leads') THEN",
  "    RAISE EXCEPTION 'T2A_03_BLOCKED: leads table does not exist';",
  "  END IF;",
  "  IF NOT EXISTS (SELECT 1 FROM information_schema.tables",
  "                 WHERE table_schema='public' AND table_name='tenants') THEN",
  "    RAISE EXCEPTION 'T2A_03_BLOCKED: tenants table does not exist';",
  "  END IF;",
  "  IF NOT EXISTS (SELECT 1 FROM information_schema.tables",
  "                 WHERE table_schema='public' AND table_name='agents') THEN",
  "    RAISE EXCEPTION 'T2A_03_BLOCKED: agents table does not exist';",
  "  END IF;",
  "END $$;",
  "",
  "CREATE TABLE IF NOT EXISTS lead_ownership_changes (",
  "  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,",
  "  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,",
  "  old_agent_id uuid REFERENCES agents(id),",
  "  new_agent_id uuid NOT NULL REFERENCES agents(id),",
  "  reason       text NOT NULL CHECK (reason IN (",
  "                 'reroll',",
  "                 'scope_shrink',",
  "                 'manual_reassign',",
  "                 'percentage_renormalize',",
  "                 'agent_removed',",
  "                 'agent_added',",
  "                 'pin_grant',",
  "                 'pin_revoke',",
  "                 'cascade_resolution',",
  "                 'other'",
  "               )),",
  "  changed_by   uuid REFERENCES agents(id),  -- NULL = system-triggered",
  "  changed_at   timestamp with time zone NOT NULL DEFAULT now(),",
  "  notes        text",
  ");",
  "",
  "CREATE INDEX IF NOT EXISTS idx_loc_lead       ON lead_ownership_changes (lead_id);",
  "CREATE INDEX IF NOT EXISTS idx_loc_tenant     ON lead_ownership_changes (tenant_id);",
  "CREATE INDEX IF NOT EXISTS idx_loc_changed_at ON lead_ownership_changes (changed_at DESC);",
  "CREATE INDEX IF NOT EXISTS idx_loc_new_agent  ON lead_ownership_changes (new_agent_id);",
  "",
  "-- Append-only enforcement: no UPDATE, no DELETE.",
  "CREATE OR REPLACE FUNCTION lead_ownership_changes_no_mutate()",
  "RETURNS trigger LANGUAGE plpgsql AS $$",
  "BEGIN",
  "  RAISE EXCEPTION 'lead_ownership_changes is append-only; UPDATE/DELETE not permitted';",
  "END;",
  "$$;",
  "",
  "DROP TRIGGER IF EXISTS trg_loc_no_update ON lead_ownership_changes;",
  "CREATE TRIGGER trg_loc_no_update",
  "  BEFORE UPDATE ON lead_ownership_changes",
  "  FOR EACH ROW EXECUTE FUNCTION lead_ownership_changes_no_mutate();",
  "",
  "DROP TRIGGER IF EXISTS trg_loc_no_delete ON lead_ownership_changes;",
  "CREATE TRIGGER trg_loc_no_delete",
  "  BEFORE DELETE ON lead_ownership_changes",
  "  FOR EACH ROW EXECUTE FUNCTION lead_ownership_changes_no_mutate();",
  "",
  "COMMIT;",
  "",
]

// ────────────────────────────────────────────────────────────────────────────
// Migration 04 — territory_assignment_changes audit table
// ────────────────────────────────────────────────────────────────────────────
const FILE4_REL = "supabase/migrations/20260506_t2a_04_territory_assignment_changes.sql"
const FILE4_LINES = [
  "-- supabase/migrations/20260506_t2a_04_territory_assignment_changes.sql",
  "-- W-TERRITORY/T2a step 4 of 4 — territory_assignment_changes audit table.",
  "--",
  "-- DESIGN:",
  "--   Append-only audit log of every territory boundary change: assignments",
  "--   granted/revoked, primary flag flips, scope changes, percentage updates,",
  "--   building/listing pin changes. Required for boundary disputes per the",
  "--   W-TERRITORY locked spec. before_state and after_state captured as JSONB",
  "--   so this audit doesn't need to know all columns of agent_property_access.",
  "--   Append-only enforced by trigger.",
  "--",
  "-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS, indexes, trigger all safe to re-run.",
  "--",
  "-- ROLLBACK (manual):",
  "--   DROP TRIGGER IF EXISTS trg_tac_no_update ON territory_assignment_changes;",
  "--   DROP TRIGGER IF EXISTS trg_tac_no_delete ON territory_assignment_changes;",
  "--   DROP FUNCTION IF EXISTS territory_assignment_changes_no_mutate();",
  "--   DROP TABLE IF EXISTS territory_assignment_changes;",
  "--",
  "-- VERIFICATION (run after apply):",
  "--   SELECT to_regclass('public.territory_assignment_changes');",
  "--   -- Expected: non-NULL",
  "--   SELECT trigger_name, event_manipulation FROM information_schema.triggers",
  "--   WHERE event_object_table='territory_assignment_changes' ORDER BY trigger_name;",
  "--   -- Expected: 2 rows",
  "",
  "BEGIN;",
  "",
  "DO $$",
  "BEGIN",
  "  IF NOT EXISTS (SELECT 1 FROM information_schema.tables",
  "                 WHERE table_schema='public' AND table_name='tenants') THEN",
  "    RAISE EXCEPTION 'T2A_04_BLOCKED: tenants table does not exist';",
  "  END IF;",
  "  IF NOT EXISTS (SELECT 1 FROM information_schema.tables",
  "                 WHERE table_schema='public' AND table_name='agents') THEN",
  "    RAISE EXCEPTION 'T2A_04_BLOCKED: agents table does not exist';",
  "  END IF;",
  "END $$;",
  "",
  "CREATE TABLE IF NOT EXISTS territory_assignment_changes (",
  "  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,",
  "  agent_id      uuid REFERENCES agents(id),  -- NULL for tenant-level changes",
  "  scope         text NOT NULL CHECK (scope IN (",
  "                  'area',",
  "                  'municipality',",
  "                  'community',",
  "                  'neighbourhood',",
  "                  'building',",
  "                  'listing',",
  "                  'tenant_default'",
  "                )),",
  "  scope_id      uuid,  -- the area_id/muni_id/etc, or NULL for tenant_default",
  "  change_type   text NOT NULL CHECK (change_type IN (",
  "                  'assignment_granted',",
  "                  'assignment_revoked',",
  "                  'primary_set',",
  "                  'primary_unset',",
  "                  'percentage_set',",
  "                  'percentage_changed',",
  "                  'scope_widened',",
  "                  'scope_narrowed',",
  "                  'pin_added',",
  "                  'pin_removed',",
  "                  'access_toggle_changed'",
  "                )),",
  "  before_state  jsonb,",
  "  after_state   jsonb,",
  "  changed_by    uuid REFERENCES agents(id),",
  "  changed_at    timestamp with time zone NOT NULL DEFAULT now(),",
  "  notes         text",
  ");",
  "",
  "CREATE INDEX IF NOT EXISTS idx_tac_tenant     ON territory_assignment_changes (tenant_id);",
  "CREATE INDEX IF NOT EXISTS idx_tac_agent      ON territory_assignment_changes (agent_id);",
  "CREATE INDEX IF NOT EXISTS idx_tac_scope      ON territory_assignment_changes (scope, scope_id);",
  "CREATE INDEX IF NOT EXISTS idx_tac_changed_at ON territory_assignment_changes (changed_at DESC);",
  "",
  "CREATE OR REPLACE FUNCTION territory_assignment_changes_no_mutate()",
  "RETURNS trigger LANGUAGE plpgsql AS $$",
  "BEGIN",
  "  RAISE EXCEPTION 'territory_assignment_changes is append-only; UPDATE/DELETE not permitted';",
  "END;",
  "$$;",
  "",
  "DROP TRIGGER IF EXISTS trg_tac_no_update ON territory_assignment_changes;",
  "CREATE TRIGGER trg_tac_no_update",
  "  BEFORE UPDATE ON territory_assignment_changes",
  "  FOR EACH ROW EXECUTE FUNCTION territory_assignment_changes_no_mutate();",
  "",
  "DROP TRIGGER IF EXISTS trg_tac_no_delete ON territory_assignment_changes;",
  "CREATE TRIGGER trg_tac_no_delete",
  "  BEFORE DELETE ON territory_assignment_changes",
  "  FOR EACH ROW EXECUTE FUNCTION territory_assignment_changes_no_mutate();",
  "",
  "COMMIT;",
  "",
]

const FILES = [
  { rel: FILE1_REL, lines: FILE1_LINES, label: 'T2a-01: apa.tenant_id NOT NULL' },
  { rel: FILE2_REL, lines: FILE2_LINES, label: 'T2a-02: apa.is_primary + 4 partial unique indexes + backfill' },
  { rel: FILE3_REL, lines: FILE3_LINES, label: 'T2a-03: lead_ownership_changes audit table' },
  { rel: FILE4_REL, lines: FILE4_LINES, label: 'T2a-04: territory_assignment_changes audit table' },
]

// ────────────────────────────────────────────────────────────────────────────
// Pre-flight: refuse to overwrite existing files.
// ────────────────────────────────────────────────────────────────────────────
let abort = false
for (const f of FILES) {
  if (fs.existsSync(path.join(PROJECT_ROOT, f.rel))) {
    console.error('[T2A-DEPLOY] REFUSE: ' + f.rel + ' already exists')
    abort = true
  }
}
if (abort) {
  console.error('')
  console.error('[T2A-DEPLOY] Aborted — no files written.')
  process.exit(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Write all 4 migration files.
// ────────────────────────────────────────────────────────────────────────────
for (const f of FILES) {
  const abs = path.join(PROJECT_ROOT, f.rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, f.lines.join('\n'), 'utf8')
  const size = fs.statSync(abs).size
  console.log('[T2A-DEPLOY] WROTE  ' + f.rel + '  (' + size + ' bytes)')
  console.log('[T2A-DEPLOY]        ' + f.label)
}

console.log('')
console.log('[T2A-DEPLOY] All 4 migration files written.')
console.log('')
console.log('[T2A-DEPLOY] APPLY SEQUENCE — paste each file into Supabase SQL editor IN ORDER:')
console.log('  1. Open ' + FILE1_REL + ' → copy contents → paste in editor → run')
console.log('     Then run the verification block from that file\'s comment header.')
console.log('  2. Open ' + FILE2_REL + ' → same.')
console.log('  3. Open ' + FILE3_REL + ' → same.')
console.log('  4. Open ' + FILE4_REL + ' → same.')
console.log('')
console.log('[T2A-DEPLOY] Each migration is BEGIN/COMMIT atomic — if any fails, it rolls back cleanly.')
console.log('[T2A-DEPLOY] After all 4 + their verifications pass, paste output back in chat.')