#!/usr/bin/env node
/**
 * W-TERRITORY-MASTER P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF SECDEF FIX
 * apply-runner.
 *
 * Migration: supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_async_handoff_secdef_fix.sql
 * Down:      supabase/migrations/20260530_phase_lifecycle_landing_3_event_4_async_handoff_secdef_fix_down.sql
 *
 * Why this runner exists:
 *   The prior async-handoff migration (20260530_..._async_handoff.sql) was
 *   incorrectly authored with handle_agent_deactivate as SECURITY INVOKER.
 *   The function's INSERT into territory_reroll_queue fails when the
 *   trigger is fired by service_role (the admin route's calling role)
 *   because service_role has no grants on the queue. This runner applies
 *   the one-line ALTER FUNCTION fix and verifies the production path now
 *   succeeds under service_role.
 *
 * LESSON BAKED IN (PART 6, per F-APPLY-RUNNER-V3-SERVICE-ROLE-PROBE-PATTERN):
 *   Post-COMMIT verification must NOT SELECT restricted tables under
 *   SET LOCAL ROLE service_role. The pattern used here:
 *     1. Read pre-state under postgres (the default tx role).
 *     2. SET LOCAL ROLE service_role.
 *     3. UPDATE agents -> fires trigger -> tests the production path.
 *     4. RESET ROLE.
 *     5. Read post-state under postgres.
 *     6. Assert and ROLLBACK.
 *   The prior runner's V3 did the role switch BEFORE the pre-state read,
 *   which is why "permission denied for table territory_reroll_queue" came
 *   from the verification itself rather than from the production path. The
 *   underlying production-path bug was ALSO real, but the failure-shape
 *   from the bad probe made it look like only a probe bug.
 *
 * HARD GATES:
 *   - Production-DB write.
 *   - Trigger function security model change (INVOKER -> DEFINER). Tenant-
 *     isolation review applies (see migration header for the analysis).
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations',
  '20260530_phase_lifecycle_landing_3_event_4_async_handoff_secdef_fix.sql');

const FN_FIXED = 'handle_agent_deactivate';

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
  console.warn('WARN: migration contains non-ASCII characters: ' + Array.from(new Set(nonAscii)).join(' '));
}
console.log('migration: ' + migrationSql.length + ' bytes from ' + path.relative(process.cwd(), MIGRATION_PATH));

// ---------------------------------------------------------------------------
// 3. Precondition: handle_agent_deactivate must currently be SECURITY INVOKER
// ---------------------------------------------------------------------------
async function precheck(client) {
  const r = await client.query(`
    SELECT prosecdef, proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname=$1
  `, [FN_FIXED]);
  if (r.rows.length !== 1) {
    fail('Precondition FAIL: ' + FN_FIXED + ' not found.');
  }
  if (r.rows[0].prosecdef !== false) {
    fail("Precondition FAIL: " + FN_FIXED + ".prosecdef is already TRUE. Fix may already be applied; run down first to re-apply, or skip.");
  }
  console.log('precondition OK: ' + FN_FIXED + ' is currently SECURITY INVOKER (about to flip to DEFINER).');
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
    await client.query('ROLLBACK');
    console.log('=== ROLLBACK; ===');
    fail('migration failed before COMMIT. No state changed.');
  }

  console.log('=== COMMIT; ===');
  await client.query('COMMIT');
}

// ---------------------------------------------------------------------------
// 5. Post-COMMIT verification.
//   V1 (postgres-only): prosecdef + proconfig.
//   V2 (service_role production-path): the LESSON pattern -- pre-state read
//     under postgres, role switch, UPDATE, RESET ROLE, post-state read under
//     postgres, assert, ROLLBACK. Mirrors the migration's in-tx V2.
// ---------------------------------------------------------------------------
async function verifyPostCommit(client) {
  console.log('');
  console.log('=== post-COMMIT verification ===');

  // V1: function metadata.
  const r1 = await client.query(`
    SELECT prosecdef, proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname=$1
  `, [FN_FIXED]);
  if (!r1.rows[0]) fail('post-COMMIT V1 FAIL: ' + FN_FIXED + ' missing.');
  console.log('post-COMMIT V1 ' + FN_FIXED + ': secdef=' + r1.rows[0].prosecdef + ', proconfig=' + (r1.rows[0].proconfig || []).join('; '));
  if (r1.rows[0].prosecdef !== true) fail('post-COMMIT V1 FAIL: prosecdef not true.');
  const hasLocked = (r1.rows[0].proconfig || []).some(x => x.toLowerCase().includes('search_path=public, pg_temp'));
  if (!hasLocked) fail('post-COMMIT V1 FAIL: proconfig missing locked search_path.');
  console.log('post-COMMIT V1 PASS.');

  // V2: end-to-end production-path test. The CORRECT pattern.
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL statement_timeout = 0');

    // POSTGRES: pick test agent + read pre-queue.
    const pick = await client.query(`
      SELECT a.id, a.tenant_id FROM public.agents a
      JOIN public.mls_listings ml ON ml.assigned_agent_id = a.id
      WHERE a.is_active=TRUE AND a.is_selling=TRUE AND a.tenant_id IS NOT NULL
      GROUP BY a.id, a.tenant_id HAVING COUNT(ml.id) > 0
      ORDER BY COUNT(ml.id) DESC
      LIMIT 1
    `);
    if (pick.rows.length === 0) {
      console.log('post-COMMIT V2 SKIP: no eligible test agent.');
      await client.query('ROLLBACK');
      return;
    }
    const { id: agentId, tenant_id: tenantId } = pick.rows[0];
    const preQ = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending'",
      [tenantId, agentId]
    )).rows[0].n;

    // SERVICE_ROLE: only the trigger-firing UPDATE.
    await client.query('SET LOCAL ROLE service_role');
    let updateOk = false;
    let updateErr = null;
    try {
      await client.query('UPDATE public.agents SET is_active = FALSE WHERE id = $1', [agentId]);
      updateOk = true;
    } catch (e) {
      updateErr = e.message;
    }
    // RESET ROLE before any reads. The lesson.
    await client.query('RESET ROLE');

    if (!updateOk) {
      await client.query('ROLLBACK');
      fail('post-COMMIT V2 FAIL: service_role UPDATE raised "' + updateErr + '". DEFINER flip did NOT close the production-path bug.');
    }

    // POSTGRES: read post-queue.
    const postQ = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.territory_reroll_queue WHERE tenant_id=$1 AND scope='agent' AND scope_id=$2 AND status='pending'",
      [tenantId, agentId]
    )).rows[0].n;

    if (postQ !== preQ + 1) {
      await client.query('ROLLBACK');
      fail('post-COMMIT V2 FAIL: service_role UPDATE succeeded but queue did not grow by 1: ' + preQ + ' -> ' + postQ);
    }
    console.log('post-COMMIT V2 PASS: service_role UPDATE on agent ' + agentId.substring(0,8) + '... fired trigger; queue grew by 1 (rolled back).');
    await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail('post-COMMIT V2 FAIL: ' + e.message);
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
  console.log('SECDEF FIX COMMITTED + verified.');
  console.log('handle_agent_deactivate now SECURITY DEFINER + locked search_path.');
  console.log('Production path under service_role: enqueue succeeds.');
  console.log('F-EVENT-4-ASYNC-PERMISSION-DENIED: closed.');
  console.log('=================================================');
})().catch((e) => {
  console.error('UNHANDLED: ' + e.message);
  process.exit(1);
});
