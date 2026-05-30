#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF DOWN-runner.
 *
 * Down-migration: supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_async_handoff_down.sql
 * Up:             20260530_phase_lifecycle_landing_3_event_4_async_handoff.sql
 *
 * Restores the pre-async state in two phases:
 *   PHASE A. Run the down .sql which reverts the scope CHECK to drop 'agent'
 *            and asserts handle_agent_deactivate still exists.
 *   PHASE B. Read the snapshot file captured by the up-runner and CREATE OR
 *            REPLACE handle_agent_deactivate from those bytes. No body is
 *            hardcoded; same pattern as Landing 2's down-runner.
 *
 * USAGE:
 *   node scripts/apply-phase-lifecycle-landing-3-event-4-async-handoff-down.js \
 *        --snapshot=supabase/migrations/rollback-snapshots/_phase-lifecycle-landing-3-event-4-async-handoff_handle_agent_deactivate_<ts>.sql
 *
 * If --snapshot is omitted, the runner picks the most-recent file matching
 * the snapshot prefix (with a confirmation prompt -- a single Y to proceed).
 *
 * BEFORE RUNNING:
 *   * Drain or DELETE any pending territory_reroll_queue rows with
 *     scope='agent' (they will violate the reverted CHECK and cause the
 *     ALTER ADD CONSTRAINT to FAIL during PHASE A).
 *   * Confirm with the operator -- reverting reintroduces the production-
 *     path 8s timeout problem for high-footprint agents.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DOWN_SQL_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_3_event_4_async_handoff_down.sql');
const SNAPSHOT_DIR  = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');
const SNAPSHOT_PREFIX = '_phase-lifecycle-landing-3-event-4-async-handoff_handle_agent_deactivate_';

function fail(msg) { console.error('FATAL: ' + msg); process.exit(1); }

// Parse --snapshot=...
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v || true];
    })
);

function pickLatestSnapshot() {
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith(SNAPSHOT_PREFIX) && f.endsWith('.sql'))
    .sort();
  return files.length === 0 ? null : path.join(SNAPSHOT_DIR, files[files.length - 1]);
}

let snapshotPath = args.snapshot
  ? path.resolve(args.snapshot)
  : pickLatestSnapshot();

if (!snapshotPath) {
  fail('No snapshot path provided and none found under ' + SNAPSHOT_DIR + ' with prefix ' + SNAPSHOT_PREFIX);
}
if (!fs.existsSync(snapshotPath)) {
  fail('Snapshot file does not exist: ' + snapshotPath);
}
console.log('Snapshot: ' + path.relative(process.cwd(), snapshotPath));

// Read down SQL + snapshot.
let downSql;
try {
  downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf8');
} catch (e) { fail('Could not read down sql: ' + e.message); }
if (downSql.charCodeAt(0) === 0xFEFF) downSql = downSql.slice(1);

let snapshotSql;
try {
  snapshotSql = fs.readFileSync(snapshotPath, 'utf8');
} catch (e) { fail('Could not read snapshot: ' + e.message); }
if (snapshotSql.charCodeAt(0) === 0xFEFF) snapshotSql = snapshotSql.slice(1);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL not set in .env.local');

(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  client.on('notice', (n) => console.log('  NOTICE: ' + n.message));
  console.log('connected.');

  console.log('');
  console.log('=== BEGIN (down); ===');
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');

  try {
    // PHASE A: revert scope CHECK + integrity checks.
    console.log('PHASE A: running down SQL (revert scope CHECK + pre-restore assertions)...');
    await client.query(downSql);

    // PHASE B: restore handle_agent_deactivate body from snapshot.
    console.log('PHASE B: restoring handle_agent_deactivate body from snapshot...');
    await client.query(snapshotSql);

    // Post-PHASE-B asserts.
    const r1 = await client.query(`
      SELECT prosrc FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='handle_agent_deactivate'
    `);
    if (!r1.rows[0]) throw new Error('DOWN V2 FAIL: handle_agent_deactivate missing after restore');
    if (!r1.rows[0].prosrc.includes('PERFORM public.reflow_deactivated_agent')) {
      throw new Error('DOWN V2 FAIL: restored body does not contain sync PERFORM. Snapshot may be corrupt.');
    }
    console.log('DOWN V2 PASS: handle_agent_deactivate body restored to sync PERFORM.');

    console.log('=== COMMIT (down); ===');
    await client.query('COMMIT');
  } catch (e) {
    console.error('DOWN ERROR: ' + e.message);
    if (e.detail) console.error('  detail: ' + e.detail);
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('Down migration failed; no state changed.');
  }

  await client.end();
  console.log('');
  console.log('=================================================');
  console.log('ASYNC HANDOFF reverted. Sync trigger body restored.');
  console.log('WARNING: the production-path 8s timeout problem is back.');
  console.log('         Do NOT use the admin UI to deactivate high-footprint agents.');
  console.log('=================================================');
})().catch((e) => { console.error('UNHANDLED: ' + e.message); process.exit(1); });
