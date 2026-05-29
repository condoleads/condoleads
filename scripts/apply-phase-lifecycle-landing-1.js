#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 1 apply-runner.
 *
 * Migration:  supabase/migrations/20260529_phase_lifecycle_landing_1_floor_pool_grant_fix.sql
 * Down:       supabase/migrations/20260529_phase_lifecycle_landing_1_down.sql
 * Preconds:   phase-lifecycle-landing-1-precondition.txt (both PASS)
 *
 * Pattern (mirrors Phase 1 apply-runner):
 *   1. Validate DATABASE_URL (reject transaction pooler port 6543).
 *   2. Read migration file, strip BOM, sanity-check ASCII.
 *   3. Capture pre-state snapshot of pick_floor_agent (full pg_get_functiondef +
 *      prosecdef + proconfig) to supabase/migrations/rollback-snapshots/.
 *   4. Open one transaction, SET LOCAL statement_timeout = 0, execute the
 *      migration body. The migration's own V1-V5 DO blocks RAISE EXCEPTION on
 *      any failure -> automatic ROLLBACK.
 *   5. COMMIT on success, ROLLBACK on any error.
 *   6. Post-COMMIT: re-query prosecdef + proconfig + a service_role probe of
 *      pick_floor_agent to confirm the fix landed.
 *
 * Usage:
 *   node scripts/apply-phase-lifecycle-landing-1.js
 *
 * Operator review:
 *   The migration .sql + this runner + the down .sql must all be reviewed
 *   before this runs. See the Phase 1 EXECUTION PROTOCOL in the tracker.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260529_phase_lifecycle_landing_1_floor_pool_grant_fix.sql');
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');

const FN_NAME = 'pick_floor_agent';
const FN_ARGS = '(uuid, uuid, boolean, boolean)';
const FN_IDENT = `public.${FN_NAME}${FN_ARGS}`;

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
  // Reject port 6543 (transaction pooler — breaks SET LOCAL statement_timeout).
  // Session pooler on port 5432 is OK (preserves SET LOCAL).
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
// 2. Read migration file (BOM-strip + ASCII sanity)
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
  // ASCII-only is the project standard for migration anchors. Allow a small
  // allowance for em-dashes in COMMENTs but warn loudly.
  const unique = Array.from(new Set(nonAscii));
  console.warn('WARN: migration contains non-ASCII characters: ' + unique.join(' '));
  console.warn('      (em-dashes/quotes in COMMENTs are OK; check anchors are ASCII.)');
}
console.log(`migration: ${migrationSql.length} bytes from ${path.relative(process.cwd(), MIGRATION_PATH)}.`);

// ---------------------------------------------------------------------------
// 3. Pre-state snapshot
// ---------------------------------------------------------------------------
async function captureSnapshot(client) {
  const ts = isoTs();
  const snapPath = path.join(SNAPSHOT_DIR, `_phase-lifecycle-landing-1_${FN_NAME}_${ts}.sql`);
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const r = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def,
            p.prosecdef AS secdef,
            CASE WHEN p.proconfig IS NOT NULL
                 THEN array_to_string(p.proconfig, '; ')
                 ELSE NULL END AS proconfig
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname=$1`,
    [FN_NAME]
  );
  if (r.rows.length !== 1) {
    fail(`expected exactly 1 ${FN_NAME} function, found ${r.rows.length}`);
  }
  const row = r.rows[0];
  const banner = [
    '-- Rollback snapshot for P-LIFECYCLE Landing 1',
    `-- Captured: ${new Date().toISOString()}`,
    `-- Function: ${FN_IDENT}`,
    `-- pre-state prosecdef: ${row.secdef}`,
    `-- pre-state proconfig: ${row.proconfig || '<none>'}`,
    '--',
    '-- To restore exact pre-state: psql -f this_file.',
    '-- (Combined with 20260529_phase_lifecycle_landing_1_down.sql, this is',
    '--  redundant — the down-migration is the supported path.)',
    '',
    row.def,
    ''
  ].join('\n');
  fs.writeFileSync(snapPath, banner);
  console.log(`snapshot: wrote ${path.relative(process.cwd(), snapPath)}`);
  console.log(`  pre-state secdef=${row.secdef}, proconfig=${row.proconfig || '<none>'}`);
  return { secdef: row.secdef, proconfig: row.proconfig, snapPath };
}

// ---------------------------------------------------------------------------
// 4. Apply transaction
// ---------------------------------------------------------------------------
async function applyMigration(client) {
  console.log('');
  console.log('=== BEGIN; ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');

  try {
    console.log('executing migration body...');
    await client.query(migrationSql);
    console.log('migration body executed without raised exception.');
  } catch (e) {
    console.error('MIGRATION ERROR: ' + e.message);
    console.error('Rolling back.');
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('migration failed before COMMIT. No state changed.');
  }

  console.log('=== COMMIT; ===');
  await client.query('COMMIT');
}

// ---------------------------------------------------------------------------
// 5. Post-COMMIT verification
// ---------------------------------------------------------------------------
async function verifyPostCommit(client) {
  console.log('');
  console.log('=== post-COMMIT verification ===');

  // V1: prosecdef = true
  const flagRes = await client.query(
    `SELECT prosecdef, proconfig
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=$1`,
    [FN_NAME]
  );
  const post = flagRes.rows[0];
  console.log(`post-state secdef=${post.prosecdef}, proconfig=${post.proconfig ? post.proconfig.join('; ') : '<none>'}`);
  if (post.prosecdef !== true) {
    fail('post-COMMIT V1 FAIL: prosecdef is not true.');
  }
  if (!post.proconfig || !post.proconfig.some(x => x.toLowerCase().includes('search_path=public, pg_temp'))) {
    fail('post-COMMIT V2 FAIL: proconfig does not include locked search_path.');
  }
  console.log('post-COMMIT V1+V2 PASS.');

  // V3: service_role probe — the actual fix-proof.
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const probe = await client.query(
      `SELECT public.pick_floor_agent(
         '68c88ce3-21e6-4189-8a43-ac86017a8f9d'::uuid,
         'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid,
         true,
         false
       ) AS agent_id`
    );
    await client.query('RESET ROLE');
    const agent = probe.rows[0].agent_id;
    if (!agent) {
      await client.query('ROLLBACK');
      fail('post-COMMIT V3 FAIL: pick_floor_agent under service_role returned NULL.');
    }
    console.log(`post-COMMIT V3 PASS: pick_floor_agent under service_role -> ${agent} (expected Neo Smith f2ce3011-...)`);
    await client.query('ROLLBACK');  // No state change; just a probe.
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

  await captureSnapshot(client);
  await applyMigration(client);
  await verifyPostCommit(client);

  await client.end();

  console.log('');
  console.log('=================================================');
  console.log('P-LIFECYCLE Landing 1 COMMITTED + verified.');
  console.log('F-FLOOR-POOL-PERMISSION-DENIED: closed.');
  console.log('Next: P-LIFECYCLE Landing 2 (resolve-at-insert + geo-change re-resolve).');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
