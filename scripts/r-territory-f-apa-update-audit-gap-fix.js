// scripts/r-territory-f-apa-update-audit-gap-fix.js
//
// W-TERRITORY / F-APA-UPDATE-AUDIT-GAP fix (v11).
//
// Patches the three trigger functions on agent_property_access to write audit
// rows to territory_assignment_changes for direct apa state changes. Before
// this patch, only distribute_geo_to_children writes audit rows (change_type
// = 'primary_set'); direct INSERT / UPDATE (is_active flip, agent change,
// scope change) / DELETE events were silently happening with no audit trail.
// Test C in scripts/r-territory-t6-followups.js surfaced the gap.
//
// Functions patched:
//   - handle_apa_insert -> writes 'assignment_granted' for new active rows
//   - handle_apa_delete -> writes 'assignment_revoked' for deleted active rows
//   - handle_apa_update -> writes
//       active->inactive:    'assignment_revoked' (1 row)
//       inactive->active:    'assignment_granted' (1 row)
//       active->active with agent/scope/scope_id changed:
//                            'assignment_revoked' (OLD context)
//                            + 'assignment_granted' (NEW context)  (2 rows)
//
// All other trigger logic (recursion guard, distribute_geo_to_children calls,
// reroll_listings_at_geo calls, early returns on 'all' scope or NULL scope_id)
// preserved exactly as in the v3 baseline (probe-apa-trigger-functions.js
// captured those bodies; this patch adds audit logic without removing or
// changing any existing behaviour).
//
// Safety:
//   - Pre-state verified: each function body must contain expected phrases
//     before being overwritten. Refuses to overwrite a function whose body
//     diverged from the v3 baseline.
//   - Idempotent: if the F-APA-UPDATE-AUDIT-GAP marker is already present in
//     a function's body, that function is skipped.
//   - Atomic: all three CREATE OR REPLACE FUNCTION calls inside one
//     transaction with verify-then-commit. ROLLBACK on any failure.
//
// Run: node scripts/r-territory-f-apa-update-audit-gap-fix.js

const { Client } = require('pg');
const fs = require('fs');

function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function resolveConnString() {
  const fromFiles = Object.assign({}, loadEnvFile('.env'), loadEnvFile('.env.local'));
  const order = ['DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'];
  for (const key of order) {
    if (process.env[key]) return { value: process.env[key], source: 'process.env.' + key };
    if (fromFiles[key]) return { value: fromFiles[key], source: '.env*::' + key };
  }
  return null;
}

function fingerprintHost(connStr) {
  try { const u = new URL(connStr); return u.hostname + u.pathname; }
  catch (_) { return '(unparsable)'; }
}

const IDEMPOTENCY_MARKER = 'F-APA-UPDATE-AUDIT-GAP';

// ============================================================================
// New function bodies (preserve v3 baseline behaviour + add audit writes)
// ============================================================================

const NEW_HANDLE_APA_INSERT_BODY = `
DECLARE
  v_scope_id uuid;
BEGIN
  -- Recursion guard: skip if we're already inside a trigger chain
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip inactive rows; they don't participate in routing
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Determine the scope_id for this row based on scope discriminator
  v_scope_id := CASE NEW.scope
    WHEN 'area' THEN NEW.area_id
    WHEN 'municipality' THEN NEW.municipality_id
    WHEN 'community' THEN NEW.community_id
    WHEN 'neighbourhood' THEN NEW.neighbourhood_id
  END;

  IF v_scope_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): audit the assignment grant.
  -- Triggered by INSERT of an active apa row at a geo-typed scope.
  INSERT INTO territory_assignment_changes (
    tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
  ) VALUES (
    NEW.tenant_id, NEW.agent_id, NEW.scope, v_scope_id, 'assignment_granted',
    NULL, to_jsonb(NEW)
  );

  -- Event 1: distribute primaries to child geos for valid parent->child pairs
  IF NEW.scope = 'area' THEN
    PERFORM distribute_geo_to_children('area', v_scope_id, 'municipality', NEW.tenant_id);
    PERFORM distribute_geo_to_children('area', v_scope_id, 'neighbourhood', NEW.tenant_id);
  ELSIF NEW.scope = 'municipality' THEN
    PERFORM distribute_geo_to_children('municipality', v_scope_id, 'community', NEW.tenant_id);
  END IF;
  -- community + neighbourhood have no children in this schema

  -- Event 2: reroll cached listings at this scope
  -- (mls_listings has no neighbourhood_id; skip neighbourhood)
  IF NEW.scope IN ('area', 'municipality', 'community') THEN
    PERFORM reroll_listings_at_geo(NEW.scope, v_scope_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
`;

const NEW_HANDLE_APA_DELETE_BODY = `
DECLARE
  v_scope_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Skip if was already inactive (no routing impact)
  IF OLD.is_active IS NOT TRUE THEN
    RETURN OLD;
  END IF;

  v_scope_id := CASE OLD.scope
    WHEN 'area' THEN OLD.area_id
    WHEN 'municipality' THEN OLD.municipality_id
    WHEN 'community' THEN OLD.community_id
    WHEN 'neighbourhood' THEN OLD.neighbourhood_id
  END;

  IF v_scope_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): audit the assignment revocation.
  -- Triggered by DELETE of an active apa row at a geo-typed scope.
  INSERT INTO territory_assignment_changes (
    tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
  ) VALUES (
    OLD.tenant_id, OLD.agent_id, OLD.scope, v_scope_id, 'assignment_revoked',
    to_jsonb(OLD), NULL
  );

  -- Event 2: reroll cached listings at this scope
  IF OLD.scope IN ('area', 'municipality', 'community') THEN
    PERFORM reroll_listings_at_geo(OLD.scope, v_scope_id, OLD.tenant_id);
  END IF;

  RETURN OLD;
END;
`;

const NEW_HANDLE_APA_UPDATE_BODY = `
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
  v_old_in_audit_scope boolean;
  v_new_in_audit_scope boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip if no routing-affecting fields changed.
  -- is_primary flips and access-toggle changes (buildings/condo/homes) are
  -- display/policy-only -- no listing impact.
  IF NEW.agent_id IS NOT DISTINCT FROM OLD.agent_id
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope
     AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id
     AND NEW.municipality_id IS NOT DISTINCT FROM OLD.municipality_id
     AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
     AND NEW.neighbourhood_id IS NOT DISTINCT FROM OLD.neighbourhood_id THEN
    RETURN NEW;
  END IF;

  -- Compute scope_ids for both OLD and NEW state (used by audit + reroll)
  v_old_scope_id := CASE OLD.scope
    WHEN 'area' THEN OLD.area_id
    WHEN 'municipality' THEN OLD.municipality_id
    WHEN 'community' THEN OLD.community_id
    WHEN 'neighbourhood' THEN OLD.neighbourhood_id
  END;
  v_new_scope_id := CASE NEW.scope
    WHEN 'area' THEN NEW.area_id
    WHEN 'municipality' THEN NEW.municipality_id
    WHEN 'community' THEN NEW.community_id
    WHEN 'neighbourhood' THEN NEW.neighbourhood_id
  END;

  -- "in audit scope" means scope is one of the audit table's accepted values.
  -- The audit scope CHECK does not include 'all'.
  v_old_in_audit_scope := OLD.scope IN ('area', 'municipality', 'community', 'neighbourhood');
  v_new_in_audit_scope := NEW.scope IN ('area', 'municipality', 'community', 'neighbourhood');

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): write audit rows for direct apa state changes.
  -- Cases:
  --   active -> inactive: 1 row, change_type='assignment_revoked'
  --   inactive -> active: 1 row, change_type='assignment_granted'
  --   active -> active with agent_id/scope/scope_id changed: 2 rows
  --     (assignment_revoked at OLD context + assignment_granted at NEW context)
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    -- Active -> Inactive: revoke
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE THEN
    -- Inactive -> Active: grant
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF NEW.is_active IS TRUE AND (
        NEW.agent_id IS DISTINCT FROM OLD.agent_id
        OR NEW.scope IS DISTINCT FROM OLD.scope
        OR v_new_scope_id IS DISTINCT FROM v_old_scope_id) THEN
    -- Active -> Active but agent/scope/scope_id changed: revoke OLD, grant NEW
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  END IF;

  -- Reroll at NEW scope (only if active, since inactive rows don't route)
  IF NEW.is_active IS TRUE AND NEW.scope IN ('area', 'municipality', 'community') THEN
    IF v_new_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(NEW.scope, v_new_scope_id, NEW.tenant_id);
    END IF;
  END IF;

  -- If scope changed OR scope_id changed OR row went active->inactive,
  -- also reroll at OLD scope (listings might have cached the old context)
  IF (OLD.scope IS DISTINCT FROM NEW.scope
      OR OLD.area_id IS DISTINCT FROM NEW.area_id
      OR OLD.municipality_id IS DISTINCT FROM NEW.municipality_id
      OR OLD.community_id IS DISTINCT FROM NEW.community_id
      OR (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE))
     AND OLD.scope IN ('area', 'municipality', 'community') THEN
    IF v_old_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(OLD.scope, v_old_scope_id, OLD.tenant_id);
    END IF;
  END IF;

  RETURN NEW;
END;
`;

// ============================================================================
// Patches configuration
// ============================================================================

const PATCHES = [
  {
    name: 'handle_apa_insert',
    expectedPhrasesV3: [
      'PERFORM distribute_geo_to_children',
      "WHEN 'area' THEN NEW.area_id",
      'pg_trigger_depth'
    ],
    newBody: NEW_HANDLE_APA_INSERT_BODY
  },
  {
    name: 'handle_apa_update',
    expectedPhrasesV3: [
      'IS NOT DISTINCT FROM',
      'PERFORM reroll_listings_at_geo',
      'pg_trigger_depth'
    ],
    newBody: NEW_HANDLE_APA_UPDATE_BODY
  },
  {
    name: 'handle_apa_delete',
    expectedPhrasesV3: [
      'PERFORM reroll_listings_at_geo(OLD.scope',
      'pg_trigger_depth'
    ],
    newBody: NEW_HANDLE_APA_DELETE_BODY
  }
];

// ============================================================================
// Probe + apply
// ============================================================================

async function probeFunctionBody(c, fnName) {
  const r = await c.query(
    "SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
    "WHERE n.nspname = 'public' AND p.proname = $1",
    [fnName]
  );
  if (r.rows.length === 0) throw new Error('Function ' + fnName + ' not found.');
  if (r.rows.length > 1) throw new Error('Multiple ' + fnName + ' overloads found.');
  return r.rows[0].prosrc;
}

async function main() {
  const conn = resolveConnString();
  if (!conn) throw new Error('No DB connection string in env.');
  console.log('Connecting to: ' + fingerprintHost(conn.value) + ' (source: ' + conn.source + ')');

  const c = new Client({ connectionString: conn.value, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    console.log('\n[Pre-flight] Verifying current state of all three functions...');
    const skipFns = new Set();
    for (const p of PATCHES) {
      const body = await probeFunctionBody(c, p.name);
      if (body.indexOf(IDEMPOTENCY_MARKER) !== -1) {
        console.log('  SKIP ' + p.name + ': ' + IDEMPOTENCY_MARKER + ' marker already present (idempotent re-run)');
        skipFns.add(p.name);
        continue;
      }
      const missing = p.expectedPhrasesV3.filter(function (phrase) {
        return body.indexOf(phrase) === -1;
      });
      if (missing.length > 0) {
        throw new Error(
          'Pre-state mismatch for ' + p.name + ': expected phrases not found: [' +
          missing.map(function (s) { return JSON.stringify(s); }).join(', ') + ']. ' +
          'Refusing to overwrite a function whose body has diverged from the v3 baseline. ' +
          'Re-run scripts/probe-apa-trigger-functions.js, inspect manually, and update ' +
          'expectedPhrasesV3 in this script if the divergence is intentional.'
        );
      }
      console.log('  OK   ' + p.name + ': pre-state matches v3 baseline; will patch.');
    }

    if (skipFns.size === PATCHES.length) {
      console.log('\nAll three functions already patched. No-op.');
      process.exit(0);
    }

    console.log('\n[Apply] Inside transaction with CREATE OR REPLACE FUNCTION...');
    await c.query('BEGIN');
    try {
      for (const p of PATCHES) {
        if (skipFns.has(p.name)) continue;
        const ddl =
          'CREATE OR REPLACE FUNCTION public.' + p.name + '() ' +
          'RETURNS trigger LANGUAGE plpgsql AS $function$' + p.newBody + '$function$;';
        await c.query(ddl);
        console.log('  Applied: ' + p.name);
      }

      console.log('\n[Verify] Confirming all patched functions now contain the marker...');
      for (const p of PATCHES) {
        if (skipFns.has(p.name)) continue;
        const body = await probeFunctionBody(c, p.name);
        if (body.indexOf(IDEMPOTENCY_MARKER) === -1) {
          throw new Error(
            'Post-state verification failed for ' + p.name + ': ' + IDEMPOTENCY_MARKER +
            ' marker not present in new body. Rolling back.'
          );
        }
        console.log('  Verified: ' + p.name + ' (body ' + body.length + ' chars)');
      }

      await c.query('COMMIT');
      console.log('\nSUCCESS: F-APA-UPDATE-AUDIT-GAP migration applied.');
      console.log('All three handle_apa_* trigger functions now write audit rows ' +
        'to territory_assignment_changes for direct apa state changes.');
      console.log('Re-run scripts/r-territory-t6-followups.js to verify Test C passes 4/4.');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  } finally {
    await c.end();
  }
}

main().catch(function (e) {
  console.error('FAIL: ' + (e && e.message ? e.message : String(e)));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});