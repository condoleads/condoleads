#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 -- ASYNC HANDOFF apply-runner.
 *
 * Migration: supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_async_handoff.sql
 * Down:      supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_async_handoff_down.sql
 * Plan:      phase-lifecycle-landing-3-event4-async-recon.txt
 *
 * Pattern (mirrors Landing 2 apply-runner -- the down-snapshot variant):
 *   1. Validate DATABASE_URL (reject port 6543 transaction pooler).
 *   2. Read migration file, strip BOM, sanity-check ASCII.
 *   3. Precondition: scope CHECK must NOT yet include 'agent' AND
 *      handle_agent_deactivate body must still contain "PERFORM public.
 *      reflow_deactivated_agent" (the sync version we're replacing).
 *   4. Snapshot the pre-state handle_agent_deactivate body (the sync body)
 *      to supabase/migrations/rollback-snapshots/. The down-runner reads
 *      it to restore.
 *   5. Open one transaction, SET LOCAL statement_timeout = 0, execute the
 *      migration body. The migration's V1..V4 DO blocks RAISE EXCEPTION on
 *      any failure, auto-rolling back.
 *   6. COMMIT on success, ROLLBACK on any error.
 *   7. Post-COMMIT: re-query for scope CHECK + handle_agent_deactivate body
 *      + service_role probe that handle_agent_deactivate-equivalent path
 *      enqueues correctly.
 *
 * Usage:
 *   node scripts/apply-phase-lifecycle-landing-3-event-4-async-handoff.js
 *
 * HARD GATES:
 *   - Production-DB write.
 *   - New multi-tenant function body (the swap): tenant-isolation review
 *     applies, but the swap preserves tenant scoping (NEW.tenant_id is
 *     the agent's tenant; ON CONFLICT target is per-tenant).
 *   The migration body + this runner + the down + worker route diff +
 *   workflow YAML + smoke harness must be reviewed before this runs. See
 *   the EXECUTION PROTOCOL in docs/W-TERRITORY-MASTER-TRACKER.md.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_3_event_4_async_handoff.sql');
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots');

const FN_SWAP = 'handle_agent_deactivate';

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
    fail('DATABASE_URL points at port 6543 (transaction pooler). Switch to session pooler (5432) or direct host.');
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
}
console.log('migration: ' + migrationSql.length + ' bytes from ' + path.relative(process.cwd(), MIGRATION_PATH) + '.');

// ---------------------------------------------------------------------------
// 3. Precondition + 4. Pre-state snapshot
// ---------------------------------------------------------------------------
async function precheckAndSnapshot(client) {
  // Precondition A: scope CHECK must NOT yet include 'agent'.
  const checkRes = await client.query(`
    SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'territory_reroll_queue'
       AND c.conname = 'territory_reroll_queue_scope_check'
  `);
  if (checkRes.rows.length !== 1) {
    fail('Precondition FAIL: territory_reroll_queue_scope_check not found.');
  }
  if (checkRes.rows[0].def.includes("'agent'")) {
    fail("Precondition FAIL: scope CHECK already includes 'agent'. Run the down-migration first.");
  }
  console.log("precondition OK: scope CHECK does not yet include 'agent'.");

  // Precondition B: handle_agent_deactivate must still contain the sync PERFORM body.
  const fnRes = await client.query(`
    SELECT prosrc, pg_get_functiondef(p.oid) AS def, prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1
  `, [FN_SWAP]);
  if (fnRes.rows.length !== 1) {
    fail('Precondition FAIL: ' + FN_SWAP + ' not found.');
  }
  if (!fnRes.rows[0].prosrc.includes('PERFORM public.reflow_deactivated_agent')) {
    fail('Precondition FAIL: ' + FN_SWAP + ' body does not contain the expected sync PERFORM. Body may already be async or have been hotfixed.');
  }
  console.log('precondition OK: ' + FN_SWAP + ' body contains the sync PERFORM (about to be swapped).');

  // Snapshot the pre-state body to disk.
  const ts = isoTs();
  const snapPath = path.join(
    SNAPSHOT_DIR,
    `_phase-lifecycle-landing-3-event-4-async-handoff_${FN_SWAP}_${ts}.sql`
  );
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const banner = [
    '-- Rollback snapshot for P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF',
    `-- Captured: ${new Date().toISOString()}`,
    `-- Function: public.${FN_SWAP}()`,
    `-- pre-state prosecdef: ${fnRes.rows[0].prosecdef}`,
    '--',
    '-- This is the SYNCHRONOUS body about to be replaced by the async-handoff',
    '-- migration. The down-runner reads this file to restore the sync body if',
    '-- the async handoff needs to be reverted. Note: restoring the sync body',
    "-- re-introduces the production-path 8s statement_timeout problem for",
    "-- high-footprint agents -- the down is a recovery path, not a normal one.",
    '',
    fnRes.rows[0].def,
    ''
  ].join('\n');
  fs.writeFileSync(snapPath, banner);
  console.log('snapshot: wrote ' + path.relative(process.cwd(), snapPath));
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

  // V1: scope CHECK now includes 'agent'.
  const checkRes = await client.query(`
    SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'territory_reroll_queue'
       AND c.conname = 'territory_reroll_queue_scope_check'
  `);
  if (!checkRes.rows[0] || !checkRes.rows[0].def.includes("'agent'")) {
    fail("post-COMMIT V1 FAIL: scope CHECK does not include 'agent'.");
  }
  console.log("post-COMMIT V1 PASS: scope CHECK includes 'agent'.");

  // V2: handle_agent_deactivate body switched.
  const fnRes = await client.query(
    "SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
    [FN_SWAP]
  );
  if (!fnRes.rows[0]) fail('post-COMMIT V2 FAIL: ' + FN_SWAP + ' missing.');
  const src = fnRes.rows[0].prosrc;
  if (!src.includes('INSERT INTO public.territory_reroll_queue')) {
    fail('post-COMMIT V2 FAIL: body missing INSERT.');
  }
  if (src.includes('PERFORM public.reflow_deactivated_agent')) {
    fail('post-COMMIT V2 FAIL: body still contains synchronous PERFORM.');
  }
  console.log('post-COMMIT V2 PASS: body switched to async enqueue.');

  // V3: service_role probe -- inside an inner BEGIN/ROLLBACK, deactivate a
  // test agent under service_role and assert exactly one new pending queue
  // row appears with scope='agent'. Rolls back so the probe leaves zero
  // state. This is the trust-chain end-to-end check for service_role.
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL statement_timeout = 0');
    await client.query('SET LOCAL ROLE service_role');
    const pick = await client.query(`
      SELECT a.id, a.tenant_id
        FROM public.agents a
        JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
       WHERE a.is_active = TRUE AND a.is_selling = TRUE AND a.tenant_id IS NOT NULL
       GROUP BY a.id, a.tenant_id
       HAVING COUNT(ml.id) > 0
       LIMIT 1
    `);
    if (pick.rows.length === 0) {
      console.log('post-COMMIT V3 SKIP: no eligible test agent under service_role view.');
      await client.query('RESET ROLE');
      await client.query('ROLLBACK');
    } else {
      const { id: agentId, tenant_id: tenantId } = pick.rows[0];
      const preQ = await client.query(
        "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending'",
        [tenantId, agentId]
      );
      await client.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agentId]);
      const postQ = await client.query(
        "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending'",
        [tenantId, agentId]
      );
      if (postQ.rows[0].n !== preQ.rows[0].n + 1) {
        await client.query('RESET ROLE');
        await client.query('ROLLBACK');
        fail('post-COMMIT V3 FAIL: enqueue under service_role: ' + preQ.rows[0].n + ' -> ' + postQ.rows[0].n + ' (expected +1)');
      }
      console.log('post-COMMIT V3 PASS: service_role deactivation enqueued 1 row (rolled back).');
      await client.query('RESET ROLE');
      await client.query('ROLLBACK');
    }
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
  console.log('P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF COMMITTED + verified.');
  console.log('Trigger now enqueues into territory_reroll_queue (scope=agent).');
  console.log('Next: worker route diff + GH-Actions cron workflow (separate review).');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
