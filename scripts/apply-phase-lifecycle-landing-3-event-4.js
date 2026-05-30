#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 apply-runner.
 *
 * Migration: supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_agent_reflow.sql
 * Down:      supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_down.sql
 * Plan:     phase-lifecycle-landing-3-event4-recon-output.txt
 *
 * Pattern (mirrors Landing 2 apply-runner; no rollback-snapshot needed because
 * this migration is purely additive -- no pre-existing function is being
 * replaced):
 *   1. Validate DATABASE_URL (reject port 6543 transaction pooler).
 *   2. Read migration file, strip BOM, sanity-check ASCII.
 *   3. Precondition: reflow_deactivated_agent must NOT yet exist.
 *   4. Open one transaction, SET LOCAL statement_timeout = 0, execute the
 *      migration body. The migration's V1..V4 DO blocks RAISE EXCEPTION on
 *      any failure, auto-rolling back.
 *   5. COMMIT on success, ROLLBACK on any error.
 *   6. Post-COMMIT: re-query for trigger + functions + a service_role probe
 *      of reflow_deactivated_agent(NULL, NULL) -> (0, 0).
 *
 * Usage:
 *   node scripts/apply-phase-lifecycle-landing-3-event-4.js
 *
 * HARD GATE: this is a production-DB write AND introduces new multi-tenant
 * functions. The migration body + this runner + the down + the smoke harness
 * must be reviewed before this runs. See the EXECUTION PROTOCOL in
 * docs/W-TERRITORY-MASTER-TRACKER.md.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_3_event_4_agent_reflow.sql');

const FN_NEW       = 'reflow_deactivated_agent';
const FN_NEW_ARGS  = '(uuid, uuid)';
const FN_HANDLER   = 'handle_agent_deactivate';
const TRG_NAME     = 'trg_agent_deactivate_reflow';

function fail(msg) {
  console.error('FATAL: ' + msg);
  process.exit(1);
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
  console.log('env: DATABASE_URL port = ' + port + ' (acceptable; not transaction-pooler).');
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
console.log('migration: ' + migrationSql.length + ' bytes from ' + path.relative(process.cwd(), MIGRATION_PATH) + '.');

// ---------------------------------------------------------------------------
// 3. Precondition
// ---------------------------------------------------------------------------
async function precheck(client) {
  const existsRes = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1) AS e",
    [FN_NEW]
  );
  if (existsRes.rows[0].e) {
    fail('Precondition FAIL: ' + FN_NEW + ' already exists. Run the down-migration first.');
  }
  console.log('precondition OK: ' + FN_NEW + ' does not yet exist.');

  const trgRes = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'agents' AND t.tgname = $1 AND NOT t.tgisinternal) AS e",
    [TRG_NAME]
  );
  if (trgRes.rows[0].e) {
    fail('Precondition FAIL: trigger ' + TRG_NAME + ' already exists on agents. Run the down-migration first.');
  }
  console.log('precondition OK: trigger ' + TRG_NAME + ' does not yet exist.');
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
// 5. Post-COMMIT verification
// ---------------------------------------------------------------------------
async function verifyPostCommit(client) {
  console.log('');
  console.log('=== post-COMMIT verification ===');

  // V1: new reflow function exists with SECURITY DEFINER + locked search_path.
  const newFnRes = await client.query(
    "SELECT prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
    [FN_NEW]
  );
  if (newFnRes.rows.length !== 1) {
    fail('post-COMMIT V1 FAIL: ' + FN_NEW + ' not found after COMMIT.');
  }
  const newFn = newFnRes.rows[0];
  console.log('new fn ' + FN_NEW + ': secdef=' + newFn.prosecdef + ', proconfig=' + (newFn.proconfig || []).join('; '));
  if (newFn.prosecdef !== true) {
    fail('post-COMMIT V1 FAIL: ' + FN_NEW + '.prosecdef is not true.');
  }
  if (!newFn.proconfig || !newFn.proconfig.some(x => x.toLowerCase().includes('search_path=public, pg_temp'))) {
    fail('post-COMMIT V1 FAIL: ' + FN_NEW + '.proconfig does not include locked search_path.');
  }
  console.log('post-COMMIT V1 PASS.');

  // V2: handler function exists.
  const handlerRes = await client.query(
    "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
    [FN_HANDLER]
  );
  if (handlerRes.rows.length !== 1) {
    fail('post-COMMIT V2 FAIL: ' + FN_HANDLER + ' not found after COMMIT.');
  }
  console.log('post-COMMIT V2 PASS: ' + FN_HANDLER + ' exists (secdef=' + handlerRes.rows[0].prosecdef + ').');

  // V3: trigger exists on agents.
  const trgRes = await client.query(
    "SELECT t.tgname, p.proname AS fn FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid WHERE c.relname = 'agents' AND t.tgname = $1 AND NOT t.tgisinternal",
    [TRG_NAME]
  );
  if (trgRes.rows.length !== 1) {
    fail('post-COMMIT V3 FAIL: trigger ' + TRG_NAME + ' not found.');
  }
  if (trgRes.rows[0].fn !== FN_HANDLER) {
    fail('post-COMMIT V3 FAIL: trigger ' + TRG_NAME + ' bound to ' + trgRes.rows[0].fn + ', expected ' + FN_HANDLER);
  }
  console.log('post-COMMIT V3 PASS: trigger ' + TRG_NAME + ' bound to ' + FN_HANDLER + '.');

  // V4: service_role probe of reflow_deactivated_agent(NULL, NULL) -> (0, 0).
  // Confirms SECURITY DEFINER trust chain works from service_role.
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const probe = await client.query(
      'SELECT reflowed_count, null_count FROM public.reflow_deactivated_agent($1::uuid, $2::uuid)',
      [null, null]
    );
    await client.query('RESET ROLE');
    const r = probe.rows[0];
    if (r.reflowed_count !== 0 || r.null_count !== 0) {
      fail('post-COMMIT V4 FAIL: NULL inputs expected (0,0), got (' + r.reflowed_count + ', ' + r.null_count + ')');
    }
    console.log('post-COMMIT V4 PASS: service_role NULL-input probe -> (0, 0).');
    await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail('post-COMMIT V4 FAIL: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('connected.');

  await precheck(client);
  await applyMigration(client);
  await verifyPostCommit(client);

  await client.end();

  console.log('');
  console.log('=================================================');
  console.log('P-LIFECYCLE Landing 3 Event 4 COMMITTED + verified.');
  console.log('Synchronous deactivation reflow live on public.agents.');
  console.log('Next: cache-first hardening TS edits (separate diff, no DB write).');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
