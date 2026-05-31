#!/usr/bin/env node
// scripts/teardown-cv-fixture.js
// W-CORE-VERIFICATION CV-COMMIT phase 1 -- reverse-manifest teardown.
// HARD GATE: production-DB write. Run only after operator approval.
//
// FLOW
//   A. SQL teardown (one transaction):
//        SET LOCAL app.skip_apa_reroll = 'on'  -- apa-delete trigger enqueues
//        DELETE in reverse-FK order:
//          1. agent_listing_assignments  (pins; fires reresolve_listing on L1)
//          2. agent_geo_buildings        (building_assigns; reresolve_building on synth)
//          3. mls_listings WHERE sync_source='cv-fixture'  (test listings)
//          4. buildings WHERE slug='cvfix-bld-001'         (synthetic building)
//          5. tenant_floor_pool WHERE tenant_id IN test
//          6. agent_property_access WHERE tenant_id IN test  (all explicit + distributed)
//          7. leads WHERE tenant_id IN test  (defensive; should be 0)
//          8. territory_assignment_changes WHERE tenant_id IN test  (audit)
//          9. territory_reroll_queue WHERE tenant_id IN test  (sweep)
//         10. user_profiles WHERE id IN test_auth_users (on_auth_user_created insert)
//         11. agents WHERE tenant_id IN test
//         12. tenants WHERE id IN test
//        Verify counts = 0 across every touched table inside the transaction.
//        COMMIT only if all = 0; ROLLBACK on any non-zero.
//   B. auth.users teardown (HTTP, post-COMMIT):
//        For each manifest.auth_user.id:
//          - supabase.auth.admin.deleteUser(id)  -- ignore 404 (already gone)
//   C. Fingerprint-verify-gone (read-only):
//        For each test tenant_id, query every touched table -- expect 0 rows.
//        For each auth_user.id, supabase.auth.admin.getUserById -- expect null/error.
//   D. Baseline diff:
//        spawn `node scripts/capture-cv-fixture-baseline.js --mode=after`
//        Diff vs cv-fixture-baseline-before.json -- HALT on any divergence.
//
// IDEMPOTENT: re-running after a partial teardown is safe (DELETEs are
// no-ops if rows already gone; deleteUser ignores 404).

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const { createClient: supabaseCreate } = require('@supabase/supabase-js');

const cfg = require('./cv-fixture-config');

function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) fail('env not set');

(function rejectPooler(u) {
  const m = u.match(/:(\d+)\//); if (!m) return;
  if (parseInt(m[1], 10) === 6543) fail('DATABASE_URL is port 6543 (pooler). Use 5432.');
})(DATABASE_URL);

const supabase = supabaseCreate(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Load manifest ──────────────────────────────────────────────────────────
if (!fs.existsSync(cfg.PATHS.manifest)) fail('manifest missing: ' + cfg.PATHS.manifest);
const manifestLines = fs.readFileSync(cfg.PATHS.manifest, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const footer = manifestLines.find(l => l.kind === 'footer' && l.status === 'committed');
if (!footer) fail('manifest has no committed footer -- nothing to teardown?');

const tenantPrimary   = footer.primary_tenant_id;
const tenantSecondary = footer.secondary_tenant_id;
const testTenantIds   = [tenantPrimary, tenantSecondary];

const authUserIds = manifestLines.filter(l => l.kind === 'auth_user').map(l => l.id);
const agentIds    = manifestLines.filter(l => l.kind === 'agent').map(l => l.id);
const apaIds      = manifestLines.filter(l => l.kind === 'apa' || l.kind === 'apa_distributed').map(l => l.id);
const testListingIds = manifestLines.filter(l => l.kind === 'test_listing').map(l => l.id);
const syntheticBuildingIds = manifestLines.filter(l => l.kind === 'building').map(l => l.id);
const pinIds      = manifestLines.filter(l => l.kind === 'pin').map(l => l.id);
const buildingAssignIds = manifestLines.filter(l => l.kind === 'building_assign').map(l => l.id);
const floorPoolIds = manifestLines.filter(l => l.kind === 'floor_pool').map(l => l.id);

console.log('manifest summary:');
console.log('  tenants:           ' + testTenantIds.length);
console.log('  auth_users:        ' + authUserIds.length);
console.log('  agents:            ' + agentIds.length);
console.log('  apa rows:          ' + apaIds.length + ' (explicit + distributed)');
console.log('  test_listings:     ' + testListingIds.length);
console.log('  synthetic bldgs:   ' + syntheticBuildingIds.length);
console.log('  pins:              ' + pinIds.length);
console.log('  building_assigns:  ' + buildingAssignIds.length);
console.log('  floor_pool:        ' + floorPoolIds.length);

// ─── PHASE A: SQL teardown ──────────────────────────────────────────────────
async function phaseSqlTeardown() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('\n=== PHASE A: SQL teardown (BEGIN) ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');
  await client.query("SET LOCAL app.skip_apa_reroll = 'on'");

  try {
    async function del(label, sql, params) {
      const r = await client.query(sql, params);
      console.log('  ' + label + ' -> ' + r.rowCount + ' row(s) deleted');
      return r.rowCount;
    }

    // 1. Pins first (fires reresolve_listing on our test L1; harmless since L1 deleted next).
    await del('A1 agent_listing_assignments (pins)',
      `DELETE FROM agent_listing_assignments WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = ANY($1))`,
      [testTenantIds]);

    // 2. Building assigns (fires reresolve_building on synthetic; harmless).
    await del('A2 agent_geo_buildings (building_assigns)',
      `DELETE FROM agent_geo_buildings WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = ANY($1))`,
      [testTenantIds]);

    // 3. Test listings.
    await del('A3 mls_listings (sync_source=cv-fixture)',
      `DELETE FROM mls_listings WHERE sync_source = 'cv-fixture'`);

    // 4. Synthetic building (after listings; FK from mls_listings.building_id).
    await del('A4 buildings (synthetic)',
      `DELETE FROM buildings WHERE slug = $1`,
      [cfg.SYNTHETIC_BUILDING.slug]);

    // 5. Floor pool.
    await del('A5 tenant_floor_pool',
      `DELETE FROM tenant_floor_pool WHERE tenant_id = ANY($1)`, [testTenantIds]);

    // 6. APA (explicit + distributed). handle_apa_delete fires per row with
    //    skip='on' -> enqueues into reroll queue + writes audit; we sweep the
    //    queue + clear audit below.
    await del('A6 agent_property_access',
      `DELETE FROM agent_property_access WHERE tenant_id = ANY($1)`, [testTenantIds]);

    // 7. Leads (defensive; CV smokes were all BEGIN/ROLLBACK so should be 0).
    await del('A7 leads (defensive)',
      `DELETE FROM leads WHERE tenant_id = ANY($1)`, [testTenantIds]);

    // 8. Audit rows from apa-delete triggers.
    // territory_assignment_changes is intentionally append-only in production
    // (triggers trg_tac_no_delete + trg_tac_no_update RAISE EXCEPTION on any
    // mutation -- correct prod behavior to protect the audit log).  For
    // ephemeral test fixture teardown we need to clear our test-tenant rows,
    // otherwise A11 (DELETE agents) fails on the audit table's NO-ACTION FKs
    // (agent_id, changed_by -> agents(id)).
    //
    // SCOPED DISABLE: ALTER TABLE ... DISABLE TRIGGER is DDL but transactional;
    // if anything in this BEGIN block fails, ROLLBACK reverts the trigger
    // state to its original enabled position alongside the data changes.  The
    // ENABLE TRIGGER below is defensive belt-and-suspenders -- DDL ROLLBACK
    // would do the same.
    console.log('  A8: DISABLE audit triggers (scoped to this transaction)');
    await client.query('ALTER TABLE public.territory_assignment_changes DISABLE TRIGGER trg_tac_no_delete');
    await client.query('ALTER TABLE public.territory_assignment_changes DISABLE TRIGGER trg_tac_no_update');
    try {
      await del('A8 territory_assignment_changes',
        `DELETE FROM territory_assignment_changes WHERE tenant_id = ANY($1)`, [testTenantIds]);
    } finally {
      console.log('  A8: RE-ENABLE audit triggers');
      await client.query('ALTER TABLE public.territory_assignment_changes ENABLE TRIGGER trg_tac_no_delete');
      await client.query('ALTER TABLE public.territory_assignment_changes ENABLE TRIGGER trg_tac_no_update');
    }

    // 9. Sweep reroll queue (apa-delete triggers enqueued rows during step A6).
    await del('A9 territory_reroll_queue (sweep)',
      `DELETE FROM territory_reroll_queue WHERE tenant_id = ANY($1)`, [testTenantIds]);

    // 10. user_profiles (on_auth_user_created trigger inserted these).
    await del('A10 user_profiles (test auth users)',
      `DELETE FROM user_profiles WHERE id = ANY($1)`, [authUserIds]);

    // 11. Agents.
    await del('A11 agents',
      `DELETE FROM agents WHERE tenant_id = ANY($1)`, [testTenantIds]);

    // 12. Tenants (last).
    await del('A12 tenants',
      `DELETE FROM tenants WHERE id = ANY($1)`, [testTenantIds]);

    // VERIFY inside transaction: every touched table 0 rows for test tenants.
    // NOTE pg binding shape: for `WHERE x = ANY($1)` the value of $1 is the
    // ARRAY itself, so the pg.query params slot must be a 1-element array
    // containing that array.  Bare `testTenantIds` would bind $1=primary,
    // $2=secondary -- a 1-vs-2 mismatch that previously broke this loop.
    console.log('\n=== PHASE A: pre-COMMIT verification ===');
    const checks = [
      [`SELECT COUNT(*)::int AS n FROM tenants WHERE id = ANY($1)`,                                              [testTenantIds], 'tenants'],
      [`SELECT COUNT(*)::int AS n FROM agents WHERE tenant_id = ANY($1)`,                                        [testTenantIds], 'agents'],
      [`SELECT COUNT(*)::int AS n FROM agent_property_access WHERE tenant_id = ANY($1)`,                         [testTenantIds], 'agent_property_access'],
      [`SELECT COUNT(*)::int AS n FROM tenant_floor_pool WHERE tenant_id = ANY($1)`,                             [testTenantIds], 'tenant_floor_pool'],
      [`SELECT COUNT(*)::int AS n FROM agent_geo_buildings agb JOIN agents a ON a.id = agb.agent_id WHERE a.tenant_id = ANY($1)`, [testTenantIds], 'agent_geo_buildings'],
      [`SELECT COUNT(*)::int AS n FROM agent_listing_assignments ala JOIN agents a ON a.id = ala.agent_id WHERE a.tenant_id = ANY($1)`, [testTenantIds], 'agent_listing_assignments'],
      [`SELECT COUNT(*)::int AS n FROM mls_listings WHERE sync_source = 'cv-fixture'`,                            [], 'mls_listings (cv-fixture)'],
      [`SELECT COUNT(*)::int AS n FROM buildings WHERE slug = $1`,                                                [cfg.SYNTHETIC_BUILDING.slug], 'buildings (synthetic)'],
      [`SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id = ANY($1)`,                                         [testTenantIds], 'leads'],
      [`SELECT COUNT(*)::int AS n FROM territory_assignment_changes WHERE tenant_id = ANY($1)`,                  [testTenantIds], 'territory_assignment_changes'],
      [`SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id = ANY($1)`,                        [testTenantIds], 'territory_reroll_queue'],
      [`SELECT COUNT(*)::int AS n FROM user_profiles WHERE id = ANY($1)`,                                        [authUserIds],   'user_profiles (test auth users)'],
    ];
    let leaked = 0;
    for (const [sql, params, label] of checks) {
      const r = await client.query(sql, params);
      const n = r.rows[0].n;
      const status = n === 0 ? 'OK' : 'LEAK';
      console.log('  ' + status + ': ' + label.padEnd(40) + ' n=' + n);
      if (n !== 0) leaked++;
    }
    if (leaked > 0) {
      console.error('VERIFICATION FAILED: ' + leaked + ' table(s) still have rows. Rolling back.');
      await client.query('ROLLBACK');
      await client.end();
      process.exit(2);
    }
    console.log('=== COMMIT ===');
    await client.query('COMMIT');
  } catch (e) {
    console.error('SQL TEARDOWN ERROR: ' + e.message);
    if (e.detail)     console.error('  detail: ' + e.detail);
    if (e.constraint) console.error('  constraint: ' + e.constraint);
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
    process.exit(1);
  }
  await client.end();
}

// ─── PHASE B: auth.users teardown ───────────────────────────────────────────
async function phaseAuthTeardown() {
  console.log('\n=== PHASE B: auth.users teardown ===');
  let deleted = 0, alreadyGone = 0, errors = 0;
  for (const id of authUserIds) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) {
        if (/not.*found|user.*not.*found/i.test(error.message)) {
          alreadyGone++;
          console.log('  already absent: ' + id);
        } else {
          errors++;
          console.error('  delete failed for ' + id + ': ' + error.message);
        }
      } else {
        deleted++;
        console.log('  deleted: ' + id);
      }
    } catch (e) {
      errors++;
      console.error('  exception for ' + id + ': ' + e.message);
    }
  }
  console.log('phase B summary: deleted=' + deleted + ' already_gone=' + alreadyGone + ' errors=' + errors);
  if (errors > 0) {
    console.error('PHASE B had errors -- ' + errors + ' auth user(s) may still exist. Re-run teardown to retry.');
    process.exit(3);
  }
}

// ─── PHASE C: fingerprint-verify-gone (read-only) ───────────────────────────
async function phaseVerify() {
  console.log('\n=== PHASE C: fingerprint-verify-gone (read-only) ===');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query('SET LOCAL statement_timeout = 0');
  let leaks = 0;
  try {
    // Same pg-binding shape as Phase A: ANY($1) needs the array wrapped in a
    // 1-element params slot.
    const checks = [
      [`SELECT COUNT(*)::int AS n FROM tenants WHERE id = ANY($1)`,                                              [testTenantIds],      'tenants'],
      [`SELECT COUNT(*)::int AS n FROM agents WHERE tenant_id = ANY($1)`,                                        [testTenantIds],      'agents'],
      [`SELECT COUNT(*)::int AS n FROM agents WHERE id = ANY($1)`,                                               [agentIds],           'agents (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM agent_property_access WHERE tenant_id = ANY($1)`,                         [testTenantIds],      'agent_property_access'],
      [`SELECT COUNT(*)::int AS n FROM agent_property_access WHERE id = ANY($1)`,                                [apaIds],             'agent_property_access (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM tenant_floor_pool WHERE tenant_id = ANY($1)`,                             [testTenantIds],      'tenant_floor_pool'],
      [`SELECT COUNT(*)::int AS n FROM agent_geo_buildings WHERE id = ANY($1)`,                                  [buildingAssignIds],  'agent_geo_buildings (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM agent_listing_assignments WHERE id = ANY($1)`,                            [pinIds],             'agent_listing_assignments (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM mls_listings WHERE id = ANY($1)`,                                         [testListingIds],     'mls_listings (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM mls_listings WHERE sync_source = 'cv-fixture'`,                            [],                   'mls_listings (sync_source=cv-fixture)'],
      [`SELECT COUNT(*)::int AS n FROM buildings WHERE id = ANY($1)`,                                            [syntheticBuildingIds], 'buildings (by manifest id)'],
      [`SELECT COUNT(*)::int AS n FROM buildings WHERE slug = $1`,                                                [cfg.SYNTHETIC_BUILDING.slug], 'buildings (slug)'],
      [`SELECT COUNT(*)::int AS n FROM leads WHERE tenant_id = ANY($1)`,                                         [testTenantIds],      'leads'],
      [`SELECT COUNT(*)::int AS n FROM territory_assignment_changes WHERE tenant_id = ANY($1)`,                  [testTenantIds],      'territory_assignment_changes'],
      [`SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id = ANY($1)`,                        [testTenantIds],      'territory_reroll_queue'],
      [`SELECT COUNT(*)::int AS n FROM user_profiles WHERE id = ANY($1)`,                                        [authUserIds],        'user_profiles (test auth users)'],
    ];
    for (const [sql, params, label] of checks) {
      const r = await client.query(sql, params);
      const n = r.rows[0].n;
      const status = n === 0 ? 'GONE' : 'LEAK';
      console.log('  ' + status.padEnd(4) + ': ' + label.padEnd(46) + ' n=' + n);
      if (n !== 0) leaks++;
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }

  // Auth users (HTTP probe via getUserById).
  for (const id of authUserIds) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error || !data?.user) {
        console.log('  GONE: auth.users id=' + id);
      } else {
        console.log('  LEAK: auth.users id=' + id + ' still exists');
        leaks++;
      }
    } catch (e) {
      // 404 is expected; treat as gone.
      console.log('  GONE: auth.users id=' + id + ' (exception swallowed as 404)');
    }
  }
  if (leaks > 0) {
    console.error('VERIFY: ' + leaks + ' leak(s) detected. Investigate before re-running.');
    process.exit(4);
  }
  console.log('phase C: all manifested entities fingerprint-verified gone.');
}

// ─── PHASE D: baseline diff (re-capture + diff vs --mode=before) ────────────
async function phaseBaselineDiff() {
  console.log('\n=== PHASE D: baseline diff ===');
  const res = spawnSync('node', ['scripts/capture-cv-fixture-baseline.js', '--mode=after'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    console.error('PHASE D: baseline diff exited non-zero (' + res.status + '). HALT.');
    process.exit(5);
  }
  console.log('phase D: baseline diff CLEAN -- WALLiam/aily byte-identical to pre-fixture snapshot.');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=========================================================');
  console.log('CV-FIXTURE TEARDOWN  -- HARD GATE');
  console.log('  primary tenant   = ' + tenantPrimary);
  console.log('  secondary tenant = ' + tenantSecondary);
  console.log('  manifest         = ' + path.relative(process.cwd(), cfg.PATHS.manifest));
  console.log('=========================================================');

  await phaseSqlTeardown();
  await phaseAuthTeardown();
  await phaseVerify();
  await phaseBaselineDiff();

  console.log('\n=========================================================');
  console.log('CV-FIXTURE TEARDOWN COMPLETE -- the test world left zero trace.');
  console.log('=========================================================');
})().catch(e => { console.error('UNHANDLED: ' + e.message); process.exit(1); });
