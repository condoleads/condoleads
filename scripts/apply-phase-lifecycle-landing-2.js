#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 2 apply-runner.
 *
 * Migration:  supabase/migrations/20260530_phase_lifecycle_landing_2_reresolve_in_set.sql
 * Down:       supabase/migrations/20260530_phase_lifecycle_landing_2_down.sql
 * Plan doc:   docs/W-LIFECYCLE-LANDING-2-PLAN.md
 *
 * Pattern (mirrors Landing 1 apply-runner; differences noted inline):
 *   1. Validate DATABASE_URL (reject port 6543 transaction pooler).
 *   2. Read migration file, strip BOM, sanity-check ASCII.
 *   3. Precondition: reresolve_listings_in_set must NOT yet exist (this
 *      runner is up-only; re-runs are blocked, use the down-migration
 *      first).
 *   4. Capture pre-state snapshot of reresolve_listing (full pg_get_functiondef
 *      + flags) to supabase/migrations/rollback-snapshots/.
 *   5. Open one transaction, SET LOCAL statement_timeout = 0, execute the
 *      migration body. The migration's V1..V6 DO blocks RAISE EXCEPTION on
 *      any failure, auto-rolling back. V6 may NOTICE-SKIP when no
 *      NULL-cache candidate remains; that's not a failure.
 *   6. COMMIT on success, ROLLBACK on any error.
 *   7. Post-COMMIT: re-query reresolve_listings_in_set + reresolve_listing
 *      prosecdef + proconfig + a service_role probe.
 *
 * Usage:
 *   node scripts/apply-phase-lifecycle-landing-2.js
 *
 * Operator review:
 *   The migration + this runner + the down must all be reviewed before this
 *   runs. See the EXECUTION PROTOCOL in docs/W-TERRITORY-MASTER-TRACKER.md.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_2_reresolve_in_set.sql');
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');

const FN_NEW = 'reresolve_listings_in_set';
const FN_NEW_ARGS = '(uuid[], uuid)';
const FN_PATCHED = 'reresolve_listing';
const FN_PATCHED_ARGS = '(uuid, uuid)';

function fail(msg) {
  console.error('FATAL: ' + msg);
  process.exit(1);
}

function isoTs() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ---------------------------------------------------------------------------
// 1. Env validation
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL not set in .env.local');

(function classifyUrl(u) {
  const m = u.match(/:(\d+)\//);
  if (!m) {
    console.warn('WARN: could not parse port from DATABASE_URL; proceeding.');
    return;
  }
  const port = parseInt(m[1], 10);
  if (port === 6543) {
    fail('DATABASE_URL points at port 6543 (transaction pooler). ' +
         'This breaks SET LOCAL statement_timeout. Switch to session pooler (5432) or direct host.');
  }
  console.log(`env: DATABASE_URL port = ${port} (acceptable; not transaction-pooler).`);
})(DATABASE_URL);

// ---------------------------------------------------------------------------
// 2. Read migration (BOM-strip + ASCII sanity)
// ---------------------------------------------------------------------------
let migrationSql;
try {
  migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
} catch (e) {
  fail('Could not read migration: ' + e.message);
}
if (migrationSql.charCodeAt(0) === 0xFEFF) {
  migrationSql = migrationSql.slice(1);
  console.log('migration: stripped UTF-8 BOM.');
}
const nonAscii = migrationSql.match(/[^\x00-\x7F]/g);
if (nonAscii) {
  const unique = Array.from(new Set(nonAscii));
  console.warn('WARN: migration contains non-ASCII characters: ' + unique.join(' '));
  console.warn('      (em-dashes/quotes in COMMENTs are OK; check anchors are ASCII.)');
}
console.log(`migration: ${migrationSql.length} bytes from ${path.relative(process.cwd(), MIGRATION_PATH)}.`);

// ---------------------------------------------------------------------------
// 3. Precondition + 4. Pre-state snapshot
// ---------------------------------------------------------------------------
async function precheckAndSnapshot(client) {
  // Precondition: reresolve_listings_in_set must NOT yet exist (up-only runner).
  const existsRes = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1
     ) AS e`,
    [FN_NEW]
  );
  if (existsRes.rows[0].e) {
    fail(`Precondition FAIL: ${FN_NEW} already exists in the database. ` +
         `If you need to re-apply, run the down-migration first via psql -f.`);
  }
  console.log(`precondition OK: ${FN_NEW} does not yet exist.`);

  // Snapshot the patched function's pre-state body.
  const ts = isoTs();
  const snapPath = path.join(
    SNAPSHOT_DIR,
    `_phase-lifecycle-landing-2_${FN_PATCHED}_${ts}.sql`
  );
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const snapRes = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def,
            p.prosecdef AS secdef,
            CASE WHEN p.proconfig IS NOT NULL
                 THEN array_to_string(p.proconfig, '; ')
                 ELSE NULL END AS proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [FN_PATCHED]
  );
  if (snapRes.rows.length !== 1) {
    fail(`expected exactly 1 ${FN_PATCHED} function pre-state, found ${snapRes.rows.length}`);
  }
  const row = snapRes.rows[0];
  const banner = [
    '-- Rollback snapshot for P-LIFECYCLE Landing 2',
    `-- Captured: ${new Date().toISOString()}`,
    `-- Function: public.${FN_PATCHED}${FN_PATCHED_ARGS}`,
    `-- pre-state prosecdef: ${row.secdef}`,
    `-- pre-state proconfig: ${row.proconfig || '<none>'}`,
    '--',
    '-- To restore exact pre-state: psql -f this_file. (Note: this is the',
    "-- broken body that crashes on NULL-cache rows via",
    '-- mls_listings_assigned_coupled_check; see F-RERESOLVE-COUPLED-CHECK.)',
    '-- Combined with 20260530_phase_lifecycle_landing_2_down.sql, this is',
    '-- redundant; the down-migration is the supported path.',
    '',
    row.def,
    ''
  ].join('\n');
  fs.writeFileSync(snapPath, banner);
  console.log(`snapshot: wrote ${path.relative(process.cwd(), snapPath)}`);
  console.log(`  pre-state secdef=${row.secdef}, proconfig=${row.proconfig || '<none>'}`);
}

// ---------------------------------------------------------------------------
// 5. Apply transaction
// ---------------------------------------------------------------------------
async function applyMigration(client) {
  console.log('');
  console.log('=== BEGIN; ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');

  try {
    console.log('executing migration body...');
    // pg-node may surface RAISE NOTICE lines via the 'notice' event.
    client.on('notice', (n) => console.log('  NOTICE: ' + n.message));
    await client.query(migrationSql);
    console.log('migration body executed without raised exception.');
  } catch (e) {
    console.error('MIGRATION ERROR: ' + e.message);
    if (e.detail) console.error('  detail: ' + e.detail);
    if (e.constraint) console.error('  constraint: ' + e.constraint);
    console.error('Rolling back.');
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('migration failed before COMMIT. No state changed.');
  }

  console.log('=== COMMIT; ===');
  await client.query('COMMIT');
}

// ---------------------------------------------------------------------------
// 6. Post-COMMIT verification
// ---------------------------------------------------------------------------
async function verifyPostCommit(client) {
  console.log('');
  console.log('=== post-COMMIT verification ===');

  // V1: new function exists with SECURITY DEFINER + locked search_path.
  const newFnRes = await client.query(
    `SELECT prosecdef, proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [FN_NEW]
  );
  if (newFnRes.rows.length !== 1) {
    fail(`post-COMMIT V1 FAIL: ${FN_NEW} not found after COMMIT.`);
  }
  const newFn = newFnRes.rows[0];
  console.log(`new fn ${FN_NEW}: secdef=${newFn.prosecdef}, proconfig=${(newFn.proconfig || []).join('; ')}`);
  if (newFn.prosecdef !== true) {
    fail(`post-COMMIT V1 FAIL: ${FN_NEW}.prosecdef is not true.`);
  }
  if (!newFn.proconfig || !newFn.proconfig.some(x => x.toLowerCase().includes('search_path=public, pg_temp'))) {
    fail(`post-COMMIT V1 FAIL: ${FN_NEW}.proconfig does not include locked search_path.`);
  }
  console.log('post-COMMIT V1 PASS.');

  // V2: patched reresolve_listing exists; still SECURITY INVOKER (Landing 2
  // does not change its security model).
  const patchedRes = await client.query(
    `SELECT prosecdef, proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [FN_PATCHED]
  );
  if (patchedRes.rows.length !== 1) {
    fail(`post-COMMIT V2 FAIL: ${FN_PATCHED} not found after COMMIT.`);
  }
  const patched = patchedRes.rows[0];
  console.log(`patched fn ${FN_PATCHED}: secdef=${patched.prosecdef}, proconfig=${(patched.proconfig || []).join('; ') || '<none>'}`);
  if (patched.prosecdef !== false) {
    fail(`post-COMMIT V2 FAIL: ${FN_PATCHED}.prosecdef changed (expected false).`);
  }
  console.log('post-COMMIT V2 PASS.');

  // V3: service_role probe. End-to-end fix-proof for the SECURITY DEFINER
  // trust chain. The function call itself may write mls_listings if it picks
  // an agent, so the call is wrapped in BEGIN/ROLLBACK to isolate the probe.
  //
  // IMPORTANT (Landing 2 fix vs initial-apply runner V3 bug): tenant + listing
  // ids are picked AS POSTGRES first (this connection runs as postgres), THEN
  // ROLE is switched and the function is invoked with the pre-picked values.
  // service_role does NOT query tenant_floor_pool directly (it has no grant
  // on that table -- that is precisely the problem Landing 1's SECURITY
  // DEFINER fix addressed for pick_floor_agent, and the same pattern applies
  // here). Smoke harness T5 uses this same hoist pattern.
  const pickRes = await client.query(`
    SELECT id FROM public.mls_listings
     WHERE assigned_agent_id IS NULL
       AND property_type IN ('Residential Condo & Other','Residential Freehold')
       AND municipality_id IS NOT NULL
     LIMIT 1
  `);
  if (pickRes.rows.length === 0) {
    console.log('post-COMMIT V3 SKIP: no NULL-cache routable listing remaining.');
    return;
  }
  const tenantRes = await client.query(`
    SELECT DISTINCT tfp.tenant_id
      FROM public.tenant_floor_pool tfp
     WHERE tfp.is_active
       AND NOT EXISTS (
         SELECT 1 FROM public.tenant_property_access tpa
          WHERE tpa.tenant_id = tfp.tenant_id AND tpa.is_active
       )
     LIMIT 1
  `);
  const tenantId = tenantRes.rows[0]?.tenant_id;
  const listingId = pickRes.rows[0].id;
  if (!tenantId) {
    console.log('post-COMMIT V3 SKIP: no tenant with floor pool and no TPA.');
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const probe = await client.query(
      `SELECT resolved_count, null_count
         FROM public.reresolve_listings_in_set($1::uuid[], $2::uuid)`,
      [[listingId], tenantId]
    );
    await client.query('RESET ROLE');
    const r = probe.rows[0];
    console.log(`post-COMMIT V3 PASS: service_role probe on listing ${listingId.substring(0,8)}... tenant ${tenantId.substring(0,8)}... -> (resolved=${r.resolved_count}, null=${r.null_count}).`);
    await client.query('ROLLBACK');  // No state change from this probe.
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail('post-COMMIT V3 FAIL: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('connected.');

  await precheckAndSnapshot(client);
  await applyMigration(client);
  await verifyPostCommit(client);

  await client.end();

  console.log('');
  console.log('=================================================');
  console.log('P-LIFECYCLE Landing 2 COMMITTED + verified.');
  console.log('F-RERESOLVE-COUPLED-CHECK: closed.');
  console.log('F-RESOLVE-AT-INSERT-PRIORITY: closed at the PG primitive layer.');
  console.log('  (Next-morning NULL-cache drop is BLOCKED-ON-F-NIGHTLY-SYNC-TIMEOUT-6H');
  console.log('   per plan doc section 11. Operational fix is a separate ticket.)');
  console.log('Next: wire the TypeScript hooks in lib/homes-sync/save.ts +');
  console.log('  lib/building-sync/save.ts + create lib/utils/geo-diff.ts +');
  console.log('  scripts/lib/territory-constants.ts.');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
