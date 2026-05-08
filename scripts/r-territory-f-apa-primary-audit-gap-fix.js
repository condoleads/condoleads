// scripts/r-territory-f-apa-primary-audit-gap-fix.js
//
// F-APA-PRIMARY-AUDIT-GAP comprehensive fix.
//
// Adds audit-row writes to handle_apa_update for two change classes previously
// silenced by the early-return:
//   1. is_primary flip → 'primary_set' or 'primary_unset' audit row
//   2. access toggle change (condo_access / homes_access / buildings_access /
//      buildings_mode) → 'access_toggle_changed' audit row
//
// Both classes were intended (territory_assignment_changes.change_type CHECK
// accepts these values) but never wired in the v3-vintage triggers OR v11's
// F-APA-UPDATE-AUDIT-GAP fix.
//
// Why now: T4a-1 introduces is_primary toggling via UI (auto-reassign on
// conflict). Every toggle MUST land in territory_assignment_changes per the
// "audit-on-state-change pattern (v11)" and "audit before action" workflow
// rules. Without this fix, T4a-1 produces silent state changes — a regression
// of v11's audit coverage philosophy.
//
// Behavior preservation:
//   - Early-return for "no routing-affecting changes" still fires AFTER the
//     new audit writes for is_primary / access toggles. Reroll behaviour
//     unchanged. T6 Test 3 (is_primary toggle = no reroll, no apa cardinality
//     change) still passes.
//   - All v11 routing-affecting audit writes preserved verbatim.
//
// Pattern: same as scripts/r-territory-f-apa-update-audit-gap-fix.js
//   - Capture rollback snapshot via pg_get_functiondef
//   - CREATE OR REPLACE FUNCTION inside transaction
//   - Verify post-state contains all required markers
//   - COMMIT on success, ROLLBACK on any verification failure
//
// Idempotent: skips if all three new markers ('primary_set', 'primary_unset',
// 'access_toggle_changed') are already present in the live function body.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

// Env loading chain
const envPaths = ['.env', '.env.local', '.env.production'];
for (const p of envPaths) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not found in env (.env / .env.local / .env.production).');
  process.exit(1);
}

// ===========================================================================
// New function body (PL/pgSQL)
// ===========================================================================

const NEW_BODY = `
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
  v_old_in_audit_scope boolean;
  v_new_in_audit_scope boolean;
  v_is_primary_changed boolean;
  v_access_toggle_changed boolean;
  v_routing_changed boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Compute scope_ids and audit-scope booleans (used by every audit branch)
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
  v_old_in_audit_scope := OLD.scope IN ('area', 'municipality', 'community', 'neighbourhood');
  v_new_in_audit_scope := NEW.scope IN ('area', 'municipality', 'community', 'neighbourhood');

  -- Classify the change
  v_is_primary_changed := NEW.is_primary IS DISTINCT FROM OLD.is_primary;
  v_access_toggle_changed := (
    NEW.condo_access IS DISTINCT FROM OLD.condo_access
    OR NEW.homes_access IS DISTINCT FROM OLD.homes_access
    OR NEW.buildings_access IS DISTINCT FROM OLD.buildings_access
    OR NEW.buildings_mode IS DISTINCT FROM OLD.buildings_mode
  );
  v_routing_changed := (
    NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.scope IS DISTINCT FROM OLD.scope
    OR NEW.area_id IS DISTINCT FROM OLD.area_id
    OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
    OR NEW.community_id IS DISTINCT FROM OLD.community_id
    OR NEW.neighbourhood_id IS DISTINCT FROM OLD.neighbourhood_id
  );

  -- F-APA-PRIMARY-AUDIT-GAP fix (v13): audit display/policy-only changes that
  -- previously caused early-return without any audit row. Only audit when the
  -- row is active and at an auditable scope.
  IF NEW.is_active IS TRUE AND v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
    IF v_is_primary_changed THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id,
        CASE WHEN NEW.is_primary THEN 'primary_set' ELSE 'primary_unset' END,
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
    IF v_access_toggle_changed THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'access_toggle_changed',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  END IF;

  -- If only display/policy-only fields changed (no routing impact), skip the
  -- routing-audit + reroll logic. Preserves T6 Test 3 semantics: is_primary
  -- toggle and access-toggle changes do not fire reroll.
  IF NOT v_routing_changed THEN
    RETURN NEW;
  END IF;

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): write audit rows for direct apa state changes.
  -- Cases:
  --   active -> inactive: 1 row, change_type='assignment_revoked'
  --   inactive -> active: 1 row, change_type='assignment_granted'
  --   active -> active with agent_id/scope/scope_id changed: 2 rows
  --     (assignment_revoked at OLD context + assignment_granted at NEW context)
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE THEN
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

const FORWARD_SQL =
  "CREATE OR REPLACE FUNCTION public.handle_apa_update()\n" +
  "RETURNS trigger\n" +
  "LANGUAGE plpgsql\n" +
  "AS $$" + NEW_BODY + "$$;\n";

// ===========================================================================
// Apply
// ===========================================================================

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let host = 'unknown';
  try { host = new URL(DATABASE_URL).host; } catch (e) {}
  console.log('Connected to: ' + host);

  // 1. Capture rollback snapshot
  console.log('\n--- 1. Capturing rollback snapshot ---');
  const oldDefRes = await client.query(
    "SELECT pg_get_functiondef('public.handle_apa_update()'::regprocedure) AS def;"
  );
  if (!oldDefRes.rows.length) {
    console.error('FAIL: handle_apa_update function not found in public schema.');
    await client.end();
    process.exit(1);
  }
  const oldDef = oldDefRes.rows[0].def;
  const rollbackSql = oldDef + ';\n';

  // Idempotency check
  const hasPrimarySetMarker = oldDef.indexOf("'primary_set'") !== -1;
  const hasPrimaryUnsetMarker = oldDef.indexOf("'primary_unset'") !== -1;
  const hasAccessToggleMarker = oldDef.indexOf("'access_toggle_changed'") !== -1;

  if (hasPrimarySetMarker && hasPrimaryUnsetMarker && hasAccessToggleMarker) {
    console.log('SKIP: F-APA-PRIMARY-AUDIT-GAP fix already applied.');
    console.log('  primary_set marker: PRESENT');
    console.log('  primary_unset marker: PRESENT');
    console.log('  access_toggle_changed marker: PRESENT');
    await client.end();
    process.exit(0);
  }

  // Write rollback snapshot
  const now = new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const stamp =
    now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
    pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const rollbackPath = path.join('scripts', 'r-territory-f-apa-primary-audit-gap-rollback_' + stamp + '.sql');
  fs.writeFileSync(rollbackPath, rollbackSql);
  console.log('Wrote rollback snapshot: ' + rollbackPath + ' (' + rollbackSql.length + ' chars)');

  // 2. Save forward SQL for git history
  const forwardPath = path.join('scripts', 'r-territory-f-apa-primary-audit-gap-fix.sql');
  fs.writeFileSync(forwardPath, FORWARD_SQL);
  console.log('Wrote forward SQL: ' + forwardPath + ' (' + FORWARD_SQL.length + ' chars)');

  // 3. Apply inside transaction with verify-then-commit
  console.log('\n--- 3. Applying CREATE OR REPLACE FUNCTION ---');
  await client.query('BEGIN');
  try {
    await client.query(FORWARD_SQL);
    console.log('CREATE OR REPLACE FUNCTION applied (within transaction; not yet committed).');

    const newDefRes = await client.query(
      "SELECT pg_get_functiondef('public.handle_apa_update()'::regprocedure) AS def;"
    );
    const newDef = newDefRes.rows[0].def;

    const checks = [
      { label: "primary_set marker (new)", marker: "'primary_set'" },
      { label: "primary_unset marker (new)", marker: "'primary_unset'" },
      { label: "access_toggle_changed marker (new)", marker: "'access_toggle_changed'" },
      { label: "assignment_granted marker (v11 preserved)", marker: "'assignment_granted'" },
      { label: "assignment_revoked marker (v11 preserved)", marker: "'assignment_revoked'" },
      { label: "early-return preserved (NOT v_routing_changed)", marker: "IF NOT v_routing_changed" },
      { label: "v11 reroll at NEW scope preserved", marker: "PERFORM reroll_listings_at_geo(NEW.scope" },
      { label: "v11 reroll at OLD scope preserved", marker: "PERFORM reroll_listings_at_geo(OLD.scope" }
    ];

    let allOk = true;
    for (const c of checks) {
      const present = newDef.indexOf(c.marker) !== -1;
      console.log('  ' + (present ? 'PRESENT' : 'MISSING') + ': ' + c.label);
      if (!present) allOk = false;
    }

    if (!allOk) {
      console.error('\nFAIL: post-state verification failed — one or more markers missing.');
      await client.query('ROLLBACK');
      console.log('Rolled back. handle_apa_update unchanged in production.');
      await client.end();
      process.exit(1);
    }

    await client.query('COMMIT');
    console.log('\nCOMMIT — F-APA-PRIMARY-AUDIT-GAP fix applied to production.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('\nFAIL during apply: ' + err.message);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('\nNext steps:');
  console.log('  - Re-run scripts/probe-apa-trigger-functions.js to confirm new body in production');
  console.log('  - git add scripts/r-territory-f-apa-primary-audit-gap-fix.{js,sql} ' + rollbackPath);
  console.log('  - git commit -m "feat(W-TERRITORY): F-APA-PRIMARY-AUDIT-GAP fix — audit primary_set/unset + access_toggle_changed"');
  console.log('  - git push');
  console.log('  - Then: T4a-1 UI patch (is_primary toggle in GeoAssignmentSection)');
  console.log('\nRollback (if needed): apply ' + rollbackPath + ' via Supabase SQL editor or psql.');
}

main().catch(function (err) {
  console.error('UNEXPECTED FAIL: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});